import { expect, test, type Browser, type Page } from '@playwright/test';
import { CLAVE_E2E, CORREO_CONSEJO_B } from '../preparar.js';

const CONSEJO = 'consejo@demo.sijass.pe';
const OPERADOR = 'operador@demo.sijass.pe';
const TESORERO = 'tesorero@demo.sijass.pe';
const NOMBRE_RESERVORIO = 'Reservorio E2E';

async function persona(browser: Browser, correo: string) {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByLabel('Contraseña').fill(CLAVE_E2E);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/(personal|portal)$/);
  return { contexto, page };
}

async function abrirMediciones(page: Page) {
  // Todos los roles de personal tienen la pestaña; `click` espera a que aparezca.
  await page.getByRole('button', { name: 'Mediciones' }).click();
  await expect(page.getByRole('heading', { name: 'Mediciones de cloro residual' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('el consejo crea un reservorio, el operador registra una medición y la ve en el historial, y el consejo la consulta sin formulario', async ({ browser }) => {
  const consejo = await persona(browser, CONSEJO);
  await abrirMediciones(consejo.page);
  await consejo.page.getByLabel('Nuevo reservorio').fill(NOMBRE_RESERVORIO);
  await consejo.page.getByRole('button', { name: 'Crear reservorio' }).click();
  await expect(consejo.page.getByText('Reservorio creado.')).toBeVisible();

  // El operador entra directo a Mediciones (no tiene padrón) y registra la lectura.
  const operador = await persona(browser, OPERADOR);
  await expect(operador.page.getByRole('button', { name: 'Asociados' })).toHaveCount(0);
  await expect(operador.page.getByRole('heading', { name: 'Mediciones de cloro residual' })).toBeVisible();
  await expect(operador.page.getByTestId('aviso-no-dictamen')).toContainText('no dictamina la calidad del agua');
  await operador.page.locator('select[name="reservorio"]').selectOption({ label: NOMBRE_RESERVORIO });
  await operador.page.getByLabel('Método').selectOption('comparador-dpd');
  await operador.page.getByLabel('Cloro residual (mg/L)').fill('0,65');
  await operador.page.getByRole('button', { name: 'Registrar lectura' }).click();
  await expect(operador.page.getByText('Lectura de 0,65 mg/L registrada.')).toBeVisible();
  const filaOperador = operador.page.getByTestId('tabla-mediciones').getByRole('row').nth(1);
  await expect(filaOperador).toContainText('0,65 mg/L');
  await expect(filaOperador).toContainText('Comparador de color con reactivo DPD');
  await expect(filaOperador).toContainText('Vigente');

  // El consejo, en su navegador, selecciona el reservorio y consulta; no ve el formulario de registro.
  await consejo.page.reload();
  await abrirMediciones(consejo.page);
  await consejo.page.locator('select[name="reservorio"]').selectOption({ label: NOMBRE_RESERVORIO });
  await expect(consejo.page.getByTestId('tabla-mediciones')).toContainText('0,65 mg/L');
  await expect(consejo.page.getByRole('form', { name: 'Registrar medición' })).toHaveCount(0);

  // El tesorero también consulta, sin formulario ni alta de reservorios.
  const tesorero = await persona(browser, TESORERO);
  await abrirMediciones(tesorero.page);
  await tesorero.page.locator('select[name="reservorio"]').selectOption({ label: NOMBRE_RESERVORIO });
  await expect(tesorero.page.getByTestId('tabla-mediciones')).toContainText('0,65 mg/L');
  await expect(tesorero.page.getByRole('form', { name: 'Registrar medición' })).toHaveCount(0);
  await expect(tesorero.page.getByRole('form', { name: 'Crear reservorio' })).toHaveCount(0);

  for (const p of [consejo, operador, tesorero]) await p.contexto.close();
});

test('el consejo de otra JASS no ve reservorios ni mediciones, y el servidor le niega el historial aunque conozca el identificador', async ({ browser }) => {
  const consejo = await persona(browser, CONSEJO);
  const idReservorio = await consejo.page.evaluate(async () => {
    const refresco = sessionStorage.getItem('sijass.refresco');
    const s = await (await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenRefresco: refresco }) })).json();
    const l = await (await fetch('/v1/reservorios', { headers: { Authorization: `Bearer ${s.tokenAcceso}` } })).json();
    return l.reservorios[0].id as string;
  });

  const otra = await persona(browser, CORREO_CONSEJO_B);
  await abrirMediciones(otra.page);
  await expect(otra.page.getByTestId('sin-reservorios')).toBeVisible();
  expect(await otra.page.textContent('body')).not.toContain(NOMBRE_RESERVORIO);
  expect(await otra.page.textContent('body')).not.toContain('0,65');

  const respuestas = await otra.page.evaluate(async (id) => {
    const refresco = sessionStorage.getItem('sijass.refresco');
    const s = await (await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenRefresco: refresco }) })).json();
    const h = { Authorization: `Bearer ${s.tokenAcceso}` };
    const historial = await fetch(`/v1/reservorios/${id}/mediciones`, { headers: h });
    const registro = await fetch('/v1/mediciones', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ reservorioId: id, metodo: 'comparador-dpd', valor: 1, unidad: 'mg/L', tomadaEn: '2026-01-01T00:00:00-05:00' }),
    });
    return { historial: [historial.status, await historial.text()], registro: [registro.status, await registro.text()] };
  }, idReservorio);
  for (const [estado, texto] of [respuestas.historial, respuestas.registro]) {
    expect(estado).toBe(403);
    expect(texto).not.toContain('0.65');
    expect(texto).not.toContain(NOMBRE_RESERVORIO);
  }
  await consejo.contexto.close();
  await otra.contexto.close();
});
