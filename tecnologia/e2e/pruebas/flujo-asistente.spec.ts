import { expect, test, type Browser } from '@playwright/test';
import { ANA, OPERADOR } from '../datos.js';
import { ingresar, persona as entrar, tokenDe } from '../ayudas.js';

async function persona(browser: Browser, cuenta: typeof OPERADOR) {
  const { contexto, page } = await entrar(browser, cuenta);
  await page.getByRole('link', { name: 'Asistente' }).click();
  await expect(page.getByRole('heading', { name: 'Asistente técnico' })).toBeVisible();
  return { contexto, page };
}

test('el operador consulta al asistente: citas con documento, versión y página, abstención y fuera de alcance, con el aviso de corpus de ejemplo', async ({ browser }) => {
  const { contexto, page } = await persona(browser, OPERADOR);
  await expect(page.getByTestId('aviso-corpus-ejemplo')).toContainText('Documentos de EJEMPLO');

  await page.getByLabel('Su pregunta').fill('¿Cómo se hace la lectura con el comparador DPD?');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByTestId('respuesta')).toHaveAttribute('data-estado', 'respondida');
  const primera = page.getByTestId('citas').getByRole('listitem').first();
  await expect(primera).toContainText('EJEMPLO — Guía de lectura de cloro residual con comparador DPD');
  await expect(primera).toContainText('versión 0.1-ejemplo · página 2');
  await expect(primera).toContainText('comparador DPD');

  await page.getByLabel('Su pregunta').fill('¿Cuál es la capital de Francia?');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByTestId('respuesta')).toHaveAttribute('data-estado', 'sin-evidencia');
  await expect(page.getByTestId('mensaje-asistente')).toContainText('No se encontró evidencia');
  await expect(page.getByTestId('citas')).toHaveCount(0);

  await page.getByLabel('Su pregunta').fill('¿Cuánto hipoclorito debo agregar al reservorio?');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByTestId('respuesta')).toHaveAttribute('data-estado', 'fuera-de-alcance');
  await expect(page.getByTestId('mensaje-asistente')).toContainText('protocolo validado');
  await expect(page.getByTestId('citas')).toHaveCount(0);
  expect(await page.textContent('body')).not.toMatch(/\d+\s?(g|gramos|ml|litros)\b/i);

  await contexto.close();
});

test('el asociado no ve el asistente y el servidor le niega la consulta', async ({ browser }) => {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, ANA);
  await page.waitForURL(/\/portal$/);
  await expect(page.getByRole('link', { name: 'Asistente' })).toHaveCount(0);
  const token = await tokenDe(page);
  const estado = await page.evaluate(async (t) => {
    const r = await fetch('/v1/asistente/consultas', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: '¿cómo se toma la muestra?' }) });
    return r.status;
  }, token);
  expect(estado).toBe(403);
  await contexto.close();
});
