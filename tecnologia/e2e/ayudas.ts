import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { CLAVE_E2E, type Cuenta, type TipoDeAcceso } from './datos.js';

const NOMBRE_BOTON: Record<TipoDeAcceso, string> = { asociado: 'Soy asociado', administrador: 'Soy administrador' };

/**
 * Entra como lo hace una persona: elige «Soy asociado» o «Soy administrador», escribe el DNI y la
 * clave y pulsa «Ingresar». No espera la pantalla de destino: eso depende de la cuenta.
 */
export async function ingresar(page: Page, cuenta: Pick<Cuenta, 'documento' | 'tipo'>, clave: string = CLAVE_E2E, tipo: TipoDeAcceso = cuenta.tipo): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: NOMBRE_BOTON[tipo] }).click();
  await page.getByLabel('Número de DNI').fill(cuenta.documento);
  await page.getByLabel('Clave', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}

/** Cada persona usa su propio contexto de navegador, como en la vida real. */
export async function persona(browser: Browser, cuenta: Pick<Cuenta, 'documento' | 'tipo'>, clave: string = CLAVE_E2E) {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, cuenta, clave);
  // Sin esperar el ingreso, una navegación inmediata cortaría la solicitud de inicio de sesión.
  await page.waitForURL(/\/(personal|portal|plataforma)$/);
  return { contexto, page };
}

/** Abre una sección del menú del personal (el menú se abre al pasar el puntero). */
export async function irA(page: Page, seccion: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: seccion, exact: true }).click();
  await page.mouse.move(900, 400);
}

/** Abre la cuenta de un asociado desde el padrón: un cajón con su nombre. */
export async function abrirCuenta(page: Page, documento: string, nombre: string): Promise<Locator> {
  await irA(page, 'Asociados');
  await page.getByTestId(`fila-${documento}`).getByRole('button', { name: 'Ver cuenta' }).click();
  const cajon = page.getByRole('dialog', { name: nombre });
  await expect(cajon).toBeVisible();
  return cajon;
}

/** Lee un token de acceso nuevo desde la sesión del navegador, para probar la API como lo haría un cliente. */
export async function tokenDe(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const refresco = sessionStorage.getItem('sijass.refresco');
    const sesion = await (await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenRefresco: refresco }) })).json();
    return sesion.tokenAcceso as string;
  });
}

/** Inicia sesión por la API (sin tocar el navegador) y devuelve un token de acceso para probar respuestas del servidor. */
export async function tokenPorApi(page: Page, cuenta: Pick<Cuenta, 'documento'>, clave: string = CLAVE_E2E): Promise<string> {
  const r = await page.request.post('/v1/auth/login', { data: { documento: cuenta.documento, contrasena: clave } });
  if (!r.ok()) throw new Error(`El ingreso por API de ${cuenta.documento} falló con ${r.status()}`);
  return ((await r.json()) as { tokenAcceso: string }).tokenAcceso;
}

/** Llamada autenticada a la API desde las pruebas. */
export async function consultar(page: Page, token: string, ruta: string, metodo: 'GET' | 'POST' = 'GET'): Promise<{ estado: number; cuerpo: string }> {
  const r = await page.request.fetch(ruta, { method: metodo, headers: { Authorization: `Bearer ${token}` } });
  return { estado: r.status(), cuerpo: await r.text() };
}
