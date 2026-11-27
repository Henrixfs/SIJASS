import { expect, test, type Page } from '@playwright/test';
import { CONSEJO, CONSEJO_B, OPERADOR, TESORERO } from '../datos.js';
import { irA, persona, tokenDe } from '../ayudas.js';

const NOMBRE_RESERVORIO = 'Reservorio E2E';

/** «El agua» y, si se indica, el reservorio elegido en su lista con foto. */
async function abrirAgua(page: Page, reservorio?: string) {
  await irA(page, 'El agua');
  await expect(page.getByRole('heading', { name: 'El agua', level: 1 })).toBeVisible();
  if (reservorio) await page.getByRole('group', { name: 'Reservorios' }).getByRole('button', { name: new RegExp(reservorio) }).click();
}

test.describe.configure({ mode: 'serial' });

test('el consejo crea un reservorio, el operador registra una medición y la ve en el historial, y el consejo la consulta sin formulario', async ({ browser }) => {
  const consejo = await persona(browser, CONSEJO);
  await abrirAgua(consejo.page);
  await consejo.page.getByRole('button', { name: 'Nuevo reservorio' }).click();
  const alta = consejo.page.getByRole('dialog', { name: 'Nuevo reservorio' });
  await alta.getByLabel('Nombre del reservorio').fill(NOMBRE_RESERVORIO);
  await alta.getByRole('button', { name: 'Crear reservorio' }).click();
  await expect(consejo.page.getByTestId('aviso-ok')).toHaveText(`${NOMBRE_RESERVORIO} quedó creado`);

  // El operador no tiene padrón; en «El agua» elige el reservorio y anota la lectura.
  const operador = await persona(browser, OPERADOR);
  await expect(operador.page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Asociados' })).toHaveCount(0);
  await abrirAgua(operador.page, NOMBRE_RESERVORIO);
  await expect(operador.page.getByTestId('aviso-no-dictamen')).toContainText('no dictamina la calidad del agua');
  await operador.page.getByRole('button', { name: 'Registrar lectura' }).click();
  const lectura = operador.page.getByRole('dialog', { name: 'Nueva lectura' });
  await expect(lectura.getByRole('button', { name: NOMBRE_RESERVORIO })).toHaveAttribute('aria-pressed', 'true');
  await lectura.getByRole('button', { name: 'Comparador de color con reactivo DPD' }).click();
  await lectura.getByLabel('Cloro residual (mg/L)').fill('0,65');
  await lectura.getByRole('button', { name: 'Guardar lectura' }).click();
  await expect(operador.page.getByTestId('aviso-ok')).toHaveText('Lectura guardada');
  const filaOperador = operador.page.getByTestId('tabla-mediciones').locator('.fam').first();
  await expect(filaOperador).toContainText('0.65 mg/L');
  await expect(filaOperador).toContainText('Comparador DPD');
  await expect(filaOperador).toContainText('Vigente');
  await expect(operador.page.getByTestId('aviso-no-dictamen')).toContainText('no califica el agua');

  // El consejo, en su navegador, consulta el reservorio; no puede registrar lecturas.
  await consejo.page.reload();
  await abrirAgua(consejo.page, NOMBRE_RESERVORIO);
  await expect(consejo.page.getByTestId('tabla-mediciones')).toContainText('0.65 mg/L');
  await expect(consejo.page.getByRole('button', { name: 'Registrar lectura' })).toHaveCount(0);

  // El tesorero también consulta, sin registrar ni crear reservorios.
  const tesorero = await persona(browser, TESORERO);
  await abrirAgua(tesorero.page, NOMBRE_RESERVORIO);
  await expect(tesorero.page.getByTestId('tabla-mediciones')).toContainText('0.65 mg/L');
  await expect(tesorero.page.getByRole('button', { name: 'Registrar lectura' })).toHaveCount(0);
  await expect(tesorero.page.getByRole('button', { name: 'Nuevo reservorio' })).toHaveCount(0);

  for (const p of [consejo, operador, tesorero]) await p.contexto.close();
});

test('el consejo de otra JASS no ve reservorios ni mediciones, y el servidor le niega el historial aunque conozca el identificador', async ({ browser }) => {
  const consejo = await persona(browser, CONSEJO);
  const tokenConsejo = await tokenDe(consejo.page);
  const idReservorio = await consejo.page.evaluate(async (token) => {
    const l = await (await fetch('/v1/reservorios', { headers: { Authorization: `Bearer ${token}` } })).json();
    return l.reservorios[0].id as string;
  }, tokenConsejo);

  const otra = await persona(browser, CONSEJO_B);
  await abrirAgua(otra.page);
  await expect(otra.page.getByTestId('sin-reservorios')).toBeVisible();
  const cuerpo = await otra.page.textContent('body');
  expect(cuerpo).not.toContain(NOMBRE_RESERVORIO);
  expect(cuerpo).not.toMatch(/0[.,]65/);

  const tokenOtra = await tokenDe(otra.page);
  const respuestas = await otra.page.evaluate(async ({ id, token }) => {
    const h = { Authorization: `Bearer ${token}` };
    const historial = await fetch(`/v1/reservorios/${id}/mediciones`, { headers: h });
    const registro = await fetch('/v1/mediciones', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ reservorioId: id, metodo: 'comparador-dpd', valor: 1, unidad: 'mg/L', tomadaEn: '2026-01-01T00:00:00-05:00' }),
    });
    return { historial: [historial.status, await historial.text()], registro: [registro.status, await registro.text()] };
  }, { id: idReservorio, token: tokenOtra });
  for (const [estado, texto] of [respuestas.historial, respuestas.registro]) {
    expect(estado).toBe(403);
    expect(texto).not.toContain('0.65');
    expect(texto).not.toContain(NOMBRE_RESERVORIO);
  }
  await consejo.contexto.close();
  await otra.contexto.close();
});
