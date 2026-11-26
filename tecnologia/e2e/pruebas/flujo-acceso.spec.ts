import { expect, test, type Page } from '@playwright/test';
import { CLAVE_E2E, CONSEJO, PLATAFORMA, ROSA, TESORERO, type Cuenta } from '../datos.js';
import { consultar, ingresar, persona, tokenPorApi } from '../ayudas.js';

// Cuentas que estas pruebas crean desde la propia interfaz (DNI ficticios, solo en la base desechable).
const TESORERA: Cuenta = { documento: '30000001', nombre: 'Elena Tesorera E2E', tipo: 'administrador' };
const MARCELINA: Cuenta = { documento: '40000001', nombre: 'Marcelina Soto E2E', tipo: 'asociado' };
const RUFINO: Cuenta = { documento: '50000001', nombre: 'Rufino Paredes E2E', tipo: 'administrador' };
const NOMBRE_JASS_NUEVA = 'JASS Nueva E2E';
const CLAVE_TESORERA = 'mi casa tiene tres ventanas';
const CLAVE_RUFINO = 'agua limpia para todos';

/** Las claves generadas son tres palabras en minúsculas separadas por guiones. */
const TRES_PALABRAS = /^[a-z]+-[a-z]+-[a-z]+$/;

const estado: { claveTesorera: string; claveMarcelina: string; claveRufino: string } = { claveTesorera: '', claveMarcelina: '', claveRufino: '' };

test.describe.configure({ mode: 'serial' });

/** Lee la clave temporal del cuadro de entrega, la comprueba y lo cierra con «Listo». */
async function recibirClave(page: Page, titulo: string): Promise<string> {
  const entrega = page.getByRole('dialog', { name: titulo });
  await expect(entrega).toBeVisible();
  const clave = (await entrega.getByTestId('clave-temporal').textContent())?.trim() ?? '';
  expect(clave).toMatch(TRES_PALABRAS);
  await expect(entrega.getByText('no se podrá ver de nuevo')).toBeVisible();
  await entrega.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByTestId('clave-temporal')).toHaveCount(0);
  expect(await page.textContent('body')).not.toContain(clave);
  // La clave nunca queda en el almacenamiento del navegador.
  const guardado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(guardado).not.toContain(clave);
  return clave;
}

async function irA(page: Page, seccion: string) {
  await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: seccion, exact: true }).click();
}

/** Primer ingreso del personal: cambia la clave recibida por una elegida. */
async function elegirClave(page: Page, recibida: string, nueva: string) {
  await expect(page.getByRole('heading', { name: 'Elige tu clave' })).toBeVisible();
  await page.getByLabel('Clave que te entregaron').fill(recibida);
  await page.getByLabel('Clave nueva', { exact: true }).fill(nueva);
  await page.getByLabel('Repite la clave nueva').fill(nueva);
  await page.getByRole('button', { name: 'Guardar mi clave' }).click();
  await page.waitForURL(/\/personal$/);
}

test('tipo de acceso equivocado: se explica sin dar sesión y el otro botón entra', async ({ browser }) => {
  // Una asociada que pulsa «Soy administrador».
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, ROSA, CLAVE_E2E, 'administrador');
  const error = page.getByTestId('error-ingreso');
  await expect(error).toContainText('Elegiste el otro botón');
  await expect(error).toContainText('Tu cuenta es de asociado');
  expect(await page.evaluate(() => sessionStorage.getItem('sijass.refresco'))).toBeNull();
  await expect(page).toHaveURL(/\/ingresar$/);
  await page.getByRole('button', { name: 'Usar «Soy asociado»' }).click();
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/\/portal$/);
  await contexto.close();

  // Un administrador que pulsa «Soy asociado».
  const otro = await browser.newContext();
  const pagina = await otro.newPage();
  await ingresar(pagina, CONSEJO, CLAVE_E2E, 'asociado');
  await expect(pagina.getByTestId('error-ingreso')).toContainText('Tu cuenta es de administración');
  expect(await pagina.evaluate(() => sessionStorage.getItem('sijass.refresco'))).toBeNull();
  await otro.close();
});

test('el Consejo crea a Tesorería, que entra con la clave recibida, la cambia y vuelve a entrar con la nueva', async ({ browser }) => {
  const consejo = await persona(browser, CONSEJO);
  await expect(consejo.page.getByTestId('nombre-jass')).toHaveText('JASS Demostración');
  await irA(consejo.page, 'Equipo');
  await consejo.page.getByLabel('Nombre completo').fill(TESORERA.nombre);
  await consejo.page.getByLabel('Número de DNI').fill(TESORERA.documento);
  await consejo.page.getByLabel('Rol').selectOption('tesorero');
  await consejo.page.getByRole('button', { name: 'Agregar' }).click();
  estado.claveTesorera = await recibirClave(consejo.page, 'Acceso creado');
  const fila = consejo.page.getByTestId(`fila-equipo-${TESORERA.nombre}`);
  await expect(fila).toContainText('Tesorería');
  await expect(fila).toContainText('Activo');
  // El DNI de la lista va enmascarado: solo los 3 últimos dígitos.
  await expect(fila).not.toContainText(TESORERA.documento);
  await expect(fila).toContainText('001');

  // Primer ingreso de la tesorera, escribiendo la clave en mayúsculas y con espacios.
  const escrita = estado.claveTesorera.toUpperCase().replaceAll('-', ' ');
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  const token = await tokenPorApi(page, TESORERA, estado.claveTesorera);
  const bloqueada = await consultar(page, token, '/v1/asociados');
  expect(bloqueada.estado).toBe(403);
  expect(bloqueada.cuerpo).toContain('cambio-de-clave-pendiente');

  await ingresar(page, TESORERA, escrita);
  await elegirClave(page, escrita, CLAVE_TESORERA);
  await expect(page.getByTestId('nombre-jass')).toHaveText('JASS Demostración');
  await expect(page.getByRole('heading', { name: 'Elige tu clave' })).toHaveCount(0);

  // La clave entregada ya no sirve; la elegida sí.
  const otro = await browser.newContext();
  const pagina = await otro.newPage();
  await ingresar(pagina, TESORERA, estado.claveTesorera);
  await expect(pagina.getByTestId('error-ingreso')).toContainText('Datos de acceso incorrectos');
  await ingresar(pagina, TESORERA, CLAVE_TESORERA);
  await pagina.waitForURL(/\/personal$/);
  await expect(pagina.getByRole('heading', { name: 'Elige tu clave' })).toHaveCount(0);

  for (const c of [consejo.contexto, contexto, otro]) await c.close();
});

test('Tesorería crea el acceso de una asociada, que entra con la clave generada y ve su cuenta', async ({ browser }) => {
  const tesorera = await persona(browser, TESORERA, CLAVE_TESORERA);
  await irA(tesorera.page, 'Asociados');
  await tesorera.page.locator('input[name="nombre"]').fill(MARCELINA.nombre);
  await tesorera.page.locator('input[name="documento"]').fill(MARCELINA.documento);
  await tesorera.page.getByRole('button', { name: 'Registrar asociado' }).click();
  const fila = tesorera.page.getByTestId(`fila-${MARCELINA.documento}`);
  await expect(fila).toContainText('Sin acceso');
  await fila.getByRole('button', { name: 'Crear acceso' }).click();
  await tesorera.page.getByRole('dialog').getByRole('button', { name: 'Crear acceso' }).click();
  estado.claveMarcelina = await recibirClave(tesorera.page, 'Acceso creado');
  await expect(fila).toContainText('Con acceso');

  const marcelina = await persona(browser, MARCELINA, estado.claveMarcelina);
  await expect(marcelina.page).toHaveURL(/\/portal$/);
  await expect(marcelina.page.getByTestId('portal-jass')).toContainText('JASS Demostración');
  // Una familia no pasa por «Elige tu clave»: usa la clave generada.
  await expect(marcelina.page.getByRole('heading', { name: 'Elige tu clave' })).toHaveCount(0);
  const token = await tokenPorApi(marcelina.page, MARCELINA, estado.claveMarcelina);
  expect((await consultar(marcelina.page, token, '/v1/asociados')).estado).toBe(403);
  expect((await consultar(marcelina.page, token, '/v1/equipo')).estado).toBe(403);

  await marcelina.contexto.close();
  await tesorera.contexto.close();
});

test('tras el bloqueo por intentos fallidos, Tesorería restablece la clave y la asociada vuelve a entrar', async ({ browser }) => {
  const anterior = await persona(browser, MARCELINA, estado.claveMarcelina);

  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, MARCELINA, 'clave-equivocada-uno');
  await expect(page.getByTestId('error-ingreso')).toContainText('Datos de acceso incorrectos');
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('Clave', { exact: true }).fill('clave-equivocada-uno');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByTestId('error-ingreso')).toBeVisible();
  }
  await page.getByLabel('Clave', { exact: true }).fill(estado.claveMarcelina);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByTestId('error-ingreso')).toContainText('Acceso temporalmente bloqueado');

  const tesorera = await persona(browser, TESORERA, CLAVE_TESORERA);
  await irA(tesorera.page, 'Asociados');
  const fila = tesorera.page.getByTestId(`fila-${MARCELINA.documento}`);
  await fila.getByRole('button', { name: 'Restablecer clave' }).click();
  await tesorera.page.getByRole('dialog').getByRole('button', { name: 'Restablecer clave' }).click();
  const nueva = await recibirClave(tesorera.page, 'Clave restablecida');
  expect(nueva).not.toBe(estado.claveMarcelina);

  // La clave anterior ya no sirve, la nueva entra aunque la cuenta estuviera bloqueada.
  await page.getByLabel('Clave', { exact: true }).fill(estado.claveMarcelina);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByTestId('error-ingreso')).toContainText('Datos de acceso incorrectos');
  await page.getByLabel('Clave', { exact: true }).fill(nueva);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/\/portal$/);
  estado.claveMarcelina = nueva;

  // La sesión que tenía abierta antes del restablecimiento deja de renovarse.
  await anterior.page.reload();
  await expect(anterior.page).toHaveURL(/\/ingresar$/);

  for (const c of [anterior.contexto, contexto, tesorera.contexto]) await c.close();
});

test('la plataforma crea una JASS y su Consejo solo ve lo suyo; al suspenderla, deja de entrar', async ({ browser }) => {
  const plataforma = await persona(browser, PLATAFORMA);
  await expect(plataforma.page).toHaveURL(/\/plataforma$/);
  await expect(plataforma.page.getByTestId('tabla-jass')).toContainText('JASS Demostración');
  // La plataforma no ve datos de negocio.
  expect(await plataforma.page.textContent('body')).not.toContain('Rosa Quispe');

  await plataforma.page.getByRole('button', { name: 'Nueva JASS' }).click();
  const formulario = plataforma.page.getByRole('dialog', { name: 'Nueva JASS' });
  await formulario.getByLabel('Nombre de la JASS').fill(NOMBRE_JASS_NUEVA);
  await formulario.getByLabel('Departamento').fill('Ayacucho');
  await formulario.getByLabel('Nombre completo').fill(RUFINO.nombre);
  await formulario.getByLabel('Número de DNI').fill(RUFINO.documento);
  await formulario.getByRole('button', { name: 'Crear JASS' }).click();
  estado.claveRufino = await recibirClave(plataforma.page, 'JASS creada');
  const filaJass = plataforma.page.getByTestId(`fila-jass-${NOMBRE_JASS_NUEVA}`);
  await expect(filaJass).toContainText('Activa');
  await expect(filaJass).toContainText('Ayacucho');

  const tokenPlataforma = await tokenPorApi(plataforma.page, PLATAFORMA);
  for (const ruta of ['/v1/asociados', '/v1/reservorios', '/v1/equipo']) expect((await consultar(plataforma.page, tokenPlataforma, ruta)).estado).toBe(403);

  // El Consejo de la JASS nueva entra, elige su clave y ve solo su JASS vacía.
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, RUFINO, estado.claveRufino);
  await elegirClave(page, estado.claveRufino, CLAVE_RUFINO);
  await expect(page.getByTestId('nombre-jass')).toHaveText(NOMBRE_JASS_NUEVA);
  await irA(page, 'Asociados');
  await expect(page.getByText('Aún no hay asociados registrados.')).toBeVisible();
  expect(await page.textContent('body')).not.toMatch(/Rosa Quispe|Luis Huamán|Ana Ccori|Marcelina/);
  await irA(page, 'Reservorios');
  expect(await page.textContent('body')).not.toContain('Reservorio E2E');
  await irA(page, 'Equipo');
  await expect(page.getByTestId('tabla-equipo')).not.toContainText(TESORERA.nombre);

  // Aunque conozca identificadores de otra JASS, el servidor se los niega.
  const tokenTesorero = await tokenPorApi(page, TESORERO);
  const padron = JSON.parse((await consultar(page, tokenTesorero, '/v1/asociados')).cuerpo) as { asociados: Array<{ id: string }> };
  const tokenRufino = await tokenPorApi(page, RUFINO, CLAVE_RUFINO);
  expect((await consultar(page, tokenRufino, `/v1/asociados/${padron.asociados[0].id}/estado-de-cuenta`)).estado).toBe(403);
  const lista = JSON.parse((await consultar(page, tokenRufino, '/v1/asociados')).cuerpo) as { asociados: unknown[] };
  expect(lista.asociados).toEqual([]);

  // Suspensión: sus cuentas no entran, y al reactivarla vuelven a entrar con la misma clave.
  await filaJass.getByRole('button', { name: 'Suspender' }).click();
  await plataforma.page.getByRole('dialog').getByRole('button', { name: 'Suspender la JASS' }).click();
  await expect(plataforma.page.getByText(`${NOMBRE_JASS_NUEVA} quedó suspendida`)).toBeVisible();
  const suspendida = await browser.newContext();
  const paginaSuspendida = await suspendida.newPage();
  await ingresar(paginaSuspendida, RUFINO, CLAVE_RUFINO);
  await expect(paginaSuspendida.getByTestId('error-ingreso')).toContainText('Tu JASS está suspendida');
  await filaJass.getByRole('button', { name: 'Reactivar' }).click();
  await plataforma.page.getByRole('dialog').getByRole('button', { name: 'Reactivar la JASS' }).click();
  await expect(plataforma.page.getByText(`${NOMBRE_JASS_NUEVA} volvió a estar activa`)).toBeVisible();
  await paginaSuspendida.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await paginaSuspendida.waitForURL(/\/personal$/);

  for (const c of [plataforma.contexto, contexto, suspendida]) await c.close();
});
