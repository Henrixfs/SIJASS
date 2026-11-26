import { expect, test } from '@playwright/test';
import { ANA, CLAVE_E2E, CONSEJO_B, OPERADOR, ROSA, TESORERO } from '../datos.js';
import { ingresar, persona, tokenDe } from '../ayudas.js';

test.describe.configure({ mode: 'serial' });

test('el tesorero registra un pago y el asociado, en otro navegador, ve su saldo actualizado; la reversa lo restaura', async ({ browser }) => {
  const ana = await persona(browser, ANA);
  await expect(ana.page).toHaveURL(/\/portal$/);
  await expect(ana.page.getByTestId('nombre-asociado')).toHaveText('Ana');
  await ana.page.getByRole('navigation', { name: 'Secciones del portal' }).getByRole('link', { name: 'Pagos' }).click();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 45.00');

  const tesorero = await persona(browser, TESORERO);
  await expect(tesorero.page).toHaveURL(/\/personal$/);
  await tesorero.page.getByTestId('fila-70000003').getByRole('button', { name: 'Ver cuenta' }).click();
  await expect(tesorero.page.getByRole('heading', { name: 'Ana Ccori' })).toBeVisible();
  await expect(tesorero.page.getByTestId('saldo-asociado')).toContainText('S/ 45.00');

  const cuota = tesorero.page.getByRole('form', { name: 'Registrar pago' }).getByRole('combobox', { name: 'Cuota' });
  await cuota.selectOption({ index: 1 });
  await tesorero.page.getByLabel('Importe (S/)').fill('5.00');
  await tesorero.page.getByLabel('Comprobante').fill('REC-E2E-001');
  await tesorero.page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(tesorero.page.getByText('Pago de S/ 5.00 registrado.')).toBeVisible();
  await expect(tesorero.page.getByTestId('saldo-asociado')).toContainText('S/ 40.00');

  // El asociado (otro navegador) actualiza y ve el cambio.
  await ana.page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 40.00');
  await ana.page.getByRole('link', { name: 'Ver historial' }).click();
  const pagoAna = ana.page.getByTestId('portal-pago-REC-E2E-001');
  await expect(pagoAna).toContainText('S/ 5.00');
  await expect(pagoAna).toContainText('Vigente');
  await ana.page.getByRole('link', { name: 'Volver a pagos' }).click();
  // Tras recargar la página la sesión se restaura y el saldo sigue igual.
  await ana.page.reload();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 40.00');

  // Reversa con motivo.
  await tesorero.page.getByTestId('pago-REC-E2E-001').getByRole('button', { name: 'Reversar' }).click();
  const reversa = tesorero.page.getByRole('dialog', { name: 'Reversar pago' });
  await reversa.getByLabel('Motivo de la reversa').fill('Error de digitación');
  await reversa.getByRole('button', { name: 'Confirmar reversa' }).click();
  await expect(tesorero.page.getByText('Pago revertido.')).toBeVisible();
  await expect(tesorero.page.getByTestId('saldo-asociado')).toContainText('S/ 45.00');
  await ana.page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 45.00');
  await ana.page.getByRole('link', { name: 'Ver historial' }).click();
  await expect(ana.page.getByTestId('portal-pago-REC-E2E-001')).toContainText('Revertido');

  await ana.contexto.close();
  await tesorero.contexto.close();
});

test('el asociado no puede abrir pantallas del personal ni ve datos de otros asociados', async ({ browser }) => {
  const ana = await persona(browser, ANA);
  await expect(ana.page).toHaveURL(/\/portal$/);
  for (const ruta of ['/personal', '/personal/asociados/00000000-0000-4000-8000-000000000000']) {
    await ana.page.goto(ruta);
    await expect(ana.page).toHaveURL(/\/portal$/);
    await expect(ana.page.getByRole('heading', { name: 'Asociados' })).toHaveCount(0);
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
  await expect(tesorero.page.getByTestId('fila-70000001')).toBeVisible();

  const otra = await persona(browser, CONSEJO_B);
  await expect(otra.page).toHaveURL(/\/personal$/);
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
  await expect(otra.page.getByRole('heading', { name: 'Rosa Quispe' })).toHaveCount(0);
  await tesorero.contexto.close();
  await otra.contexto.close();
});

test('un operador no tiene padrón: entra a Mediciones y no ve datos de asociados', async ({ browser }) => {
  const operador = await persona(browser, OPERADOR);
  await expect(operador.page.getByRole('heading', { name: 'Mediciones de cloro residual' })).toBeVisible();
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
