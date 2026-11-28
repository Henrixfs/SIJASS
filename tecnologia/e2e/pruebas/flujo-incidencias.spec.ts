import { expect, test } from '@playwright/test';
import { ANA, OPERADOR, TESORERO } from '../datos.js';
import { persona } from '../ayudas.js';

test.describe.configure({ mode: 'serial' });

/**
 * Incidencias de punta a punta con la API real (s1f y s2b): la asociada reporta desde su portal,
 * Operación lo atiende en el panel, Tesorería solo lo consulta y la asociada ve el avance.
 */
test('la asociada reporta un problema, Operación lo atiende y ella ve que fue atendido', async ({ browser }) => {
  const ana = await persona(browser, ANA);
  await ana.page.getByRole('link', { name: /Reportar un problema/ }).click();
  await ana.page.getByRole('button', { name: /Fuga de agua/ }).click();
  await ana.page.getByRole('button', { name: /Varias casas/ }).click();
  await ana.page.getByRole('button', { name: 'Cerca de la escuela' }).click();
  await ana.page.getByRole('button', { name: 'Sale agua de una tubería' }).click();
  await ana.page.getByRole('button', { name: /Enviar a mi JASS/ }).click();
  await expect(ana.page.getByRole('heading', { name: '¡Enviado a tu JASS!' })).toBeVisible();
  await ana.page.getByRole('link', { name: 'Ver mi reporte' }).click();
  await expect(ana.page.getByRole('list', { name: 'Avance: Enviado' }).first()).toBeVisible();

  const operador = await persona(browser, OPERADOR);
  const menu = operador.page.getByRole('navigation', { name: 'Secciones del personal' });
  await menu.getByRole('link', { name: /^Reportes/ }).click();
  const ficha = operador.page.getByTestId('ficha-reporte');
  await expect(ficha).toContainText('Ana Ccori');
  await expect(ficha).toContainText('Varias casas');
  await expect(ficha).toContainText('sugerida: alta');
  await ficha.getByRole('button', { name: /Empezar a atender/ }).click();
  await expect(ficha).toContainText('En atención');
  await ficha.getByLabel('¿Qué se hizo?').fill('Se cambió la unión de la tubería');
  await ficha.getByRole('button', { name: /Cerrar reporte/ }).click();
  await expect(ficha).toContainText('Cerrada');
  await expect(ficha.getByText('Cerrado: Se cambió la unión de la tubería')).toBeVisible();

  const tesoreria = await persona(browser, TESORERO);
  const menuT = tesoreria.page.getByRole('navigation', { name: 'Secciones del personal' });
  await menuT.getByRole('link', { name: /^Reportes/ }).click();
  await expect(tesoreria.page.getByTestId('ficha-reporte')).toContainText('Tesorería solo puede consultar los reportes.');
  await expect(tesoreria.page.getByRole('button', { name: /Cerrar reporte|Empezar a atender/ })).toHaveCount(0);

  // Ana sigue en «Mis reportes»; al volver a abrirlo ve el avance nuevo.
  await expect(ana.page).toHaveURL(/\/portal\/reportes$/);
  await ana.page.reload();
  await expect(ana.page.getByRole('list', { name: 'Avance: Atendido' }).first()).toBeVisible();
  await expect(ana.page.getByText('Atendido: Se cambió la unión de la tubería').first()).toBeVisible();
  for (const p of [ana, operador, tesoreria]) await p.contexto.close();
});
