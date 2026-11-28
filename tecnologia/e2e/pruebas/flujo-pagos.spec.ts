import { expect, test } from '@playwright/test';
import { ANA, CLAVE_E2E, CONSEJO_B, OPERADOR, ROSA, TESORERO } from '../datos.js';
import { abrirCuenta, ingresar, irA, persona, tokenDe } from '../ayudas.js';

test.describe.configure({ mode: 'serial' });

test('el tesorero cobra y el asociado, en otro navegador, ve su saldo actualizado; la reversa lo restaura', async ({ browser }) => {
  const ana = await persona(browser, ANA);
  await expect(ana.page).toHaveURL(/\/portal$/);
  await expect(ana.page.getByTestId('nombre-asociado')).toHaveText('Ana');
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 45.00');
  await expect(ana.page.getByText('Tienes 3 cuotas por pagar')).toBeVisible();

  const tesorero = await persona(browser, TESORERO);
  await expect(tesorero.page).toHaveURL(/\/personal$/);
  let cuenta = await abrirCuenta(tesorero.page, '70000003', 'Ana Ccori');
  await expect(cuenta.getByTestId('saldo-asociado')).toHaveText('S/ 45.00');

  // Desde la cuenta se cobra: Ana ya está elegida y la primera cuota pendiente también.
  await cuenta.getByRole('button', { name: 'Registrar pago' }).click();
  const pago = tesorero.page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(pago.getByRole('button', { name: 'Ana Ccori' })).toHaveAttribute('aria-pressed', 'true');
  await pago.getByLabel('Importe (S/)').fill('5.00');
  await pago.getByLabel('Número de comprobante').fill('REC-E2E-001');
  await pago.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(pago.getByRole('heading', { name: 'Pago registrado', level: 3 })).toBeVisible();
  await expect(pago).toContainText('quedan S/ 40.00');
  await pago.getByRole('button', { name: 'Listo' }).click();
  cuenta = await abrirCuenta(tesorero.page, '70000003', 'Ana Ccori');
  await expect(cuenta.getByTestId('saldo-asociado')).toHaveText('S/ 40.00');

  // La asociada (otro navegador) vuelve a abrir su portal y ve el cambio.
  await ana.page.reload();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 40.00');
  await ana.page.getByRole('navigation', { name: 'Secciones del portal' }).getByRole('link', { name: 'Pagos' }).click();
  const pagoAna = ana.page.getByTestId('portal-pago-REC-E2E-001');
  await expect(pagoAna).toContainText('S/ 5.00');
  await expect(pagoAna).not.toContainText('revertido');

  // Reversa con motivo, desde la cuenta.
  await cuenta.getByTestId('pago-REC-E2E-001').getByRole('button', { name: 'Revertir' }).click();
  const reversa = tesorero.page.getByRole('dialog', { name: 'Revertir un pago' });
  await reversa.getByLabel('Motivo (obligatorio)').fill('Error de digitación');
  await reversa.getByRole('button', { name: 'Revertir pago' }).click();
  await expect(tesorero.page.getByTestId('aviso-ok')).toHaveText('Pago revertido.');
  cuenta = await abrirCuenta(tesorero.page, '70000003', 'Ana Ccori');
  await expect(cuenta.getByTestId('saldo-asociado')).toHaveText('S/ 45.00');
  await expect(cuenta.getByTestId('pago-REC-E2E-001')).toContainText('Revertido');
  await cuenta.getByRole('button', { name: 'Motivo de la reversa del pago REC-E2E-001' }).click();
  await expect(cuenta.getByRole('region', { name: 'Reversa del pago' })).toContainText('Error de digitación');
  await ana.page.reload();
  await expect(ana.page.getByTestId('portal-pago-REC-E2E-001')).toContainText('revertido');
  await ana.page.getByRole('navigation', { name: 'Secciones del portal' }).getByRole('link', { name: 'Inicio' }).click();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 45.00');

  await ana.contexto.close();
  await tesorero.contexto.close();
});

test('el asociado no puede abrir pantallas del personal ni ve datos de otros asociados', async ({ browser }) => {
  const ana = await persona(browser, ANA);
  await expect(ana.page).toHaveURL(/\/portal$/);
  for (const ruta of ['/personal', '/personal/asociados/00000000-0000-4000-8000-000000000000']) {
    await ana.page.goto(ruta);
    await expect(ana.page).toHaveURL(/\/portal$/);
    await expect(ana.page.getByRole('navigation', { name: 'Secciones del personal' })).toHaveCount(0);
    await expect(ana.page.getByTestId('tabla-asociados')).toHaveCount(0);
  }
  const contenido = (await ana.page.content()) + (await ana.page.textContent('body'));
  expect(contenido).not.toContain('Rosa Quispe');
  expect(contenido).not.toContain('Luis Huamán');

  // Aun forzando la API desde el navegador, el servidor responde 403 sin datos.
  const tokenAna = await tokenDe(ana.page);
  const respuesta = await ana.page.evaluate(async (token) => {
    const r = await fetch('/v1/asociados', { headers: { Authorization: `Bearer ${token}` } });
    return { estado: r.status, texto: await r.text() };
  }, tokenAna);
  expect(respuesta.estado).toBe(403);
  expect(respuesta.texto).not.toContain('Rosa');
  await ana.contexto.close();
});

test('el personal no entra al portal y un consejo de otra JASS no ve el padrón ajeno', async ({ browser }) => {
  const tesorero = await persona(browser, TESORERO);
  await tesorero.page.goto('/portal');
  await expect(tesorero.page).toHaveURL(/\/personal$/);
  await expect(tesorero.page.getByTestId('rol-actual')).toHaveText('Tesorería');

  const otra = await persona(browser, CONSEJO_B);
  await expect(otra.page).toHaveURL(/\/personal$/);
  await irA(otra.page, 'Asociados');
  await expect(otra.page.getByText('Aún no hay asociados registrados.')).toBeVisible();
  expect(await otra.page.textContent('body')).not.toContain('Rosa Quispe');
  // Y no puede abrir la cuenta de un asociado de la JASS demostración, aunque conozca el identificador.
  const tokenTesorero = await tokenDe(tesorero.page);
  const id = await tesorero.page.evaluate(async (token) => {
    const l = await (await fetch('/v1/asociados', { headers: { Authorization: `Bearer ${token}` } })).json();
    return l.asociados[0].id as string;
  }, tokenTesorero);
  await otra.page.goto(`/personal/asociados/${id}`);
  await expect(otra.page.getByTestId('sin-permiso')).toBeVisible(); // el servidor respondió 403
  await expect(otra.page.getByRole('dialog', { name: 'Rosa Quispe' })).toHaveCount(0);
  await tesorero.contexto.close();
  await otra.contexto.close();
});

test('un operador no tiene padrón ni caja: entra a «Mi jornada» y no ve datos de asociados', async ({ browser }) => {
  const operador = await persona(browser, OPERADOR);
  await expect(operador.page.getByRole('link', { name: 'Mi jornada' })).toHaveAttribute('aria-current', 'page');
  await expect(operador.page.getByTestId('rol-actual')).toHaveText('Operación');
  await expect(operador.page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Asociados' })).toHaveCount(0);
  await expect(operador.page.getByTestId('tabla-asociados')).toHaveCount(0);
  expect(await operador.page.textContent('body')).not.toContain('Rosa Quispe');
  await operador.contexto.close();
});

test('credenciales incorrectas se rechazan y el bloqueo aparece tras 5 intentos', async ({ browser }) => {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, ROSA, 'clave-equivocada-uno');
  await expect(page.getByTestId('error-ingreso')).toContainText('Datos de acceso incorrectos');
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('Clave', { exact: true }).fill('clave-equivocada-uno');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByTestId('error-ingreso')).toBeVisible();
  }
  await page.getByLabel('Clave', { exact: true }).fill(CLAVE_E2E);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByTestId('error-ingreso')).toContainText('Acceso temporalmente bloqueado');
  await expect(page).toHaveURL(/\/ingresar$/);
  await contexto.close();
});
