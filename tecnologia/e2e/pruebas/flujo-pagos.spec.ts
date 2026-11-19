import { expect, test, type Browser, type Page } from '@playwright/test';
import { CLAVE_E2E, CORREO_CONSEJO_B } from '../preparar.js';

const TESORERO = 'tesorero@demo.sijass.pe';
const OPERADOR = 'operador@demo.sijass.pe';
const ANA = 'ana.ccori@demo.sijass.pe'; // morosa: 3 cuotas de S/ 15.00 sin pagos
const ROSA = 'rosa.quispe@demo.sijass.pe'; // al día

async function ingresar(page: Page, correo: string, contrasena = CLAVE_E2E) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Cada persona usa su propio contexto de navegador, como en la vida real. */
async function persona(browser: Browser, correo: string) {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, correo);
  // Sin esperar el ingreso, una navegación inmediata cortaría la solicitud de inicio de sesión.
  await page.waitForURL(/\/(personal|portal)$/);
  return { contexto, page };
}

test.describe.configure({ mode: 'serial' });

test('el tesorero registra un pago y el asociado, en otro navegador, ve su saldo actualizado; la reversa lo restaura', async ({ browser }) => {
  const ana = await persona(browser, ANA);
  await expect(ana.page).toHaveURL(/\/portal$/);
  await expect(ana.page.getByTestId('nombre-asociado')).toHaveText('Ana Ccori');
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 45.00');

  const tesorero = await persona(browser, TESORERO);
  await expect(tesorero.page).toHaveURL(/\/personal$/);
  await tesorero.page.getByTestId('fila-70000003').getByRole('button', { name: 'Ver cuenta' }).click();
  await expect(tesorero.page.getByRole('heading', { name: 'Ana Ccori' })).toBeVisible();
  await expect(tesorero.page.getByTestId('saldo-asociado')).toContainText('S/ 45.00');

  const cuota = tesorero.page.getByLabel('Cuota');
  await cuota.selectOption({ index: 1 });
  await tesorero.page.getByLabel('Importe (S/)').fill('5.00');
  await tesorero.page.getByLabel('Comprobante').fill('REC-E2E-001');
  await tesorero.page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(tesorero.page.getByText('Pago de S/ 5.00 registrado.')).toBeVisible();
  await expect(tesorero.page.getByTestId('saldo-asociado')).toContainText('S/ 40.00');

  // El asociado (otro navegador) actualiza y ve el cambio.
  await ana.page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 40.00');
  const pagoAna = ana.page.getByTestId('portal-pago-REC-E2E-001');
  await expect(pagoAna).toContainText('S/ 5.00');
  await expect(pagoAna).toContainText('Vigente');
  // Tras recargar la página la sesión se restaura y el saldo sigue igual.
  await ana.page.reload();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 40.00');

  // Reversa con motivo.
  tesorero.page.once('dialog', (d) => void d.accept('Error de digitación'));
  await tesorero.page.getByTestId('pago-REC-E2E-001').getByRole('button', { name: 'Reversar' }).click();
  await expect(tesorero.page.getByText('Pago revertido.')).toBeVisible();
  await expect(tesorero.page.getByTestId('saldo-asociado')).toContainText('S/ 45.00');
  await ana.page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(ana.page.getByTestId('saldo')).toHaveText('S/ 45.00');
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
  const respuesta = await ana.page.evaluate(async () => {
    const refresco = sessionStorage.getItem('sijass.refresco');
    const sesion = await (await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenRefresco: refresco }) })).json();
    const r = await fetch('/v1/asociados', { headers: { Authorization: `Bearer ${sesion.tokenAcceso}` } });
    return { estado: r.status, texto: await r.text() };
  });
  expect(respuesta.estado).toBe(403);
  expect(respuesta.texto).not.toContain('Rosa');
  await ana.contexto.close();
});

test('el personal no entra al portal y un consejo de otra JASS no ve el padrón ajeno', async ({ browser }) => {
  const tesorero = await persona(browser, TESORERO);
  await tesorero.page.goto('/portal');
  await expect(tesorero.page).toHaveURL(/\/personal$/);
  await expect(tesorero.page.getByTestId('fila-70000001')).toBeVisible();

  const otra = await persona(browser, CORREO_CONSEJO_B);
  await expect(otra.page).toHaveURL(/\/personal$/);
  await expect(otra.page.getByText('Aún no hay asociados registrados.')).toBeVisible();
  expect(await otra.page.textContent('body')).not.toContain('Rosa Quispe');
  // Y no puede abrir la cuenta de un asociado de la JASS demostración, aunque conozca el identificador.
  const id = await tesorero.page.evaluate(async () => {
    const refresco = sessionStorage.getItem('sijass.refresco');
    const s = await (await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenRefresco: refresco }) })).json();
    const l = await (await fetch('/v1/asociados', { headers: { Authorization: `Bearer ${s.tokenAcceso}` } })).json();
    return l.asociados[0].id as string;
  });
  await otra.page.goto(`/personal/asociados/${id}`);
  await expect(otra.page.getByTestId('sin-permiso')).toBeVisible(); // el servidor respondió 403
  await expect(otra.page.getByRole('heading', { name: 'Rosa Quispe' })).toHaveCount(0);
  await tesorero.contexto.close();
  await otra.contexto.close();
});

test('un operador sin permiso sobre el padrón ve un aviso, no datos', async ({ browser }) => {
  const operador = await persona(browser, OPERADOR);
  await expect(operador.page.getByTestId('sin-permiso')).toBeVisible();
  await expect(operador.page.getByTestId('tabla-asociados')).toHaveCount(0);
  await operador.contexto.close();
});

test('credenciales incorrectas se rechazan y el bloqueo aparece tras 5 intentos', async ({ browser }) => {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, ROSA, 'contraseña-equivocada-1');
  await expect(page.getByTestId('error-ingreso')).toHaveText('Correo o contraseña incorrectos.');
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('Contraseña').fill('contraseña-equivocada-1');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByTestId('error-ingreso')).toBeVisible();
  }
  await page.getByLabel('Contraseña').fill(CLAVE_E2E);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByTestId('error-ingreso')).toContainText('Demasiados intentos fallidos');
  await expect(page).toHaveURL(/\/ingresar$/);
  await contexto.close();
});
