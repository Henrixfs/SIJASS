import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * s2a — tarea 8.3: ingreso, cambio de clave y entrega de clave a 320, 360, 390, 768 y 1440 px.
 * Mide, con el navegador real, que no hay desbordamiento horizontal, que cada control mide al
 * menos 44 px, que el texto alcanza el contraste y que todo se recorre con el teclado.
 * La API está simulada; con `GUARDAR_EVIDENCIA=1` guarda capturas y medidas en `docs/diseno/evidencia/s2a-acceso`.
 */
const GUARDAR = process.env.GUARDAR_EVIDENCIA === '1';
const CARPETA = fileURLToPath(new URL('../../../docs/diseno/evidencia/s2a-acceso/', import.meta.url));
const CLAVE_ENTREGADA = 'cima-tela-pozo';

interface Medida { pantalla: string; ancho: number; [dato: string]: unknown }
const medidas: Medida[] = [];

const personal = { perfil: 'personal', rol: 'consejo', debeCambiarContrasena: false };
const quien = (extra: Record<string, unknown> = {}) => ({ ...personal, nombre: 'Ana Morales', documento: '•••••001', jass: { nombre: 'JASS Demostración de San Miguel' }, ...extra });

async function simular(page: Page, opciones: { debeCambiar?: boolean } = {}) {
  const debeCambiarContrasena = opciones.debeCambiar ?? false;
  await page.route('**/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const metodo = route.request().method();
    const sesion = { ...personal, debeCambiarContrasena };
    const respuestas: Record<string, { estado?: number; json?: unknown }> = {
      'POST /v1/auth/login': { json: { ...sesion, tokenAcceso: 'acceso', tokenRefresco: 'refresco' } },
      'POST /v1/auth/refresh': { json: { ...sesion, tokenAcceso: 'acceso-2', tokenRefresco: 'refresco-2' } },
      'GET /v1/yo': { json: quien({ debeCambiarContrasena }) },
      'GET /v1/equipo': { json: { equipo: [
        { usuarioId: 'a', nombre: 'Ana Morales', documento: '•••••001', rol: 'consejo', estado: 'activo' },
        { usuarioId: 'b', nombre: 'Carlos Rojas Villanueva', documento: '•••••002', rol: 'tesorero', estado: 'activo' },
      ] } },
      'POST /v1/equipo': { estado: 201, json: { usuarioId: 'c', claveTemporal: CLAVE_ENTREGADA } },
      'POST /v1/auth/cambiar-contrasena': { estado: 204 },
      'GET /v1/asociados': { json: { asociados: [] } },
      'GET /v1/reservorios': { json: { reservorios: [] } },
    };
    const r = respuestas[`${metodo} ${pathname}`];
    if (pathname === '/v1/auth/logout') await route.fulfill({ status: 204 });
    else if (r?.estado === 204) await route.fulfill({ status: 204 });
    else if (r) await route.fulfill({ status: r.estado ?? 200, json: r.json });
    else await route.fulfill({ status: 404, json: { codigo: 'no-encontrado', mensaje: 'Ruta fuera de esta prueba' } });
  });
}

async function sinDesborde(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

/** Controles visibles dentro de `raiz` que miden menos de 44 px en alto o ancho. */
async function controlesPequenos(page: Page, raiz: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const nodo = document.querySelector(selector);
    if (!nodo) return [`no existe ${selector}`];
    const pequenos: string[] = [];
    for (const el of nodo.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="button"]')) {
      const caja = el.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) continue;
      if (el.closest('[hidden], [inert]')) continue;
      if (caja.height < 43.5 || caja.width < 43.5) pequenos.push(`${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('name') ?? '').trim().slice(0, 40)}» ${Math.round(caja.width)}×${Math.round(caja.height)}`);
    }
    return pequenos;
  }, raiz);
}

/** Contraste de texto (WCAG) contra el fondo opaco más cercano; devuelve la razón por selector. */
async function contrastes(page: Page, selectores: string[]): Promise<Record<string, number>> {
  return page.evaluate((lista) => {
    const canales = (color: string) => (color.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    const luminancia = ([r, g, b]: number[]) => [r, g, b].reduce((suma, canal, i) => {
      const c = canal / 255;
      return suma + [0.2126, 0.7152, 0.0722][i] * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    }, 0);
    // Las capas semitransparentes se mezclan con las de atrás; una foto o degradado sin color de
    // respaldo cuenta como negro (el peor caso para el texto oscuro de estas pantallas).
    const fondoDe = (el: Element): number[] | null => {
      const capas: number[][] = [];
      for (let nodo: Element | null = el; nodo; nodo = nodo.parentElement) {
        const estilo = getComputedStyle(nodo);
        const [r, g, b, a] = canales(estilo.backgroundColor);
        const alfa = a ?? 1;
        if (alfa > 0.99) { capas.push([r, g, b, 1]); break; }
        if (alfa > 0) capas.push([r, g, b, alfa]);
        else if (estilo.backgroundImage !== 'none') { capas.push([0, 0, 0, 1]); break; }
      }
      if (!capas.length || capas.at(-1)![3] < 1) capas.push([255, 255, 255, 1]);
      return capas.reverse().reduce((abajo, [r, g, b, a]) => [r * a + abajo[0] * (1 - a), g * a + abajo[1] * (1 - a), b * a + abajo[2] * (1 - a)], [0, 0, 0]);
    };
    const resultado: Record<string, number> = {};
    for (const selector of lista) {
      const el = document.querySelector(selector);
      if (!el) { resultado[selector] = -1; continue; }
      const fondo = fondoDe(el);
      if (!fondo) { resultado[selector] = 0; continue; }
      const [r, g, b] = canales(getComputedStyle(el).color);
      const valores = [luminancia([r, g, b]), luminancia(fondo)];
      resultado[selector] = Math.round(((Math.max(...valores) + 0.05) / (Math.min(...valores) + 0.05)) * 100) / 100;
    }
    return resultado;
  }, selectores);
}

function exigirContraste(resultado: Record<string, number>, minimo = 4.5) {
  for (const [selector, razon] of Object.entries(resultado)) {
    expect(razon, `contraste de ${selector}`).toBeGreaterThanOrEqual(minimo);
  }
}

async function enfocado(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    return (el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? document.querySelector(`label[for="${el.id}"]`)?.textContent ?? el.textContent ?? el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
  });
}

async function captura(page: Page, nombre: string, ancho: number, completa = true) {
  if (GUARDAR) {
    mkdirSync(CARPETA, { recursive: true });
    await page.screenshot({ path: `${CARPETA}${nombre}-${ancho}px.png`, fullPage: completa });
  }
}

for (const ancho of [320, 360, 390, 768, 1440]) {
  test(`ingreso por DNI a ${ancho} px: dos botones, campos, error, teclado y contraste`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 820 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await simular(page);
    await page.goto('/');

    // Paso 1: los dos botones grandes.
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await sinDesborde(page);
    const botones = page.locator('.tipo-acceso');
    await expect(botones).toHaveCount(2);
    const cajas = await botones.evaluateAll((els) => els.map((el) => { const c = el.getBoundingClientRect(); return { ancho: Math.round(c.width), alto: Math.round(c.height) }; }));
    for (const c of cajas) expect(Math.min(c.ancho, c.alto)).toBeGreaterThanOrEqual(56);
    expect(await controlesPequenos(page, 'form')).toEqual([]);
    const paso1 = await contrastes(page, ['h1', '.cristal .q', '.tipo-acceso strong', '.tipo-acceso small', '.cristal .ayuda']);
    exigirContraste(paso1);
    await captura(page, 'ingreso-1-elegir', ancho);

    // Teclado: Tab llega a «Soy asociado», Enter lo elige y el foco pasa al DNI.
    for (let i = 0; i < 8 && !(await enfocado(page)).startsWith('Soy asociado'); i++) await page.keyboard.press('Tab');
    expect(await enfocado(page)).toMatch(/^Soy asociado/);
    await page.keyboard.press('Tab');
    expect(await enfocado(page)).toMatch(/^Soy administrador/);
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Número de DNI')).toBeFocused();

    // Paso 2: DNI, clave y botón; todo por teclado.
    await page.keyboard.type('12345678');
    await page.keyboard.press('Tab');
    expect(await enfocado(page)).toBe('Clave');
    await page.keyboard.type('clave-de-prueba');
    await page.keyboard.press('Tab');
    expect(await enfocado(page)).toBe('Mostrar clave');
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Clave', { exact: true })).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Ocultar clave' })).toBeVisible();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    expect(await enfocado(page)).toBe('Ingresar');
    expect(await controlesPequenos(page, 'form')).toEqual([]);
    const paso2 = await contrastes(page, ['label[for="documento-ingreso"]', '#documento-ingreso', '.ayuda-c', '[data-testid="tipo-elegido"]', '.boton-ingreso']);
    exigirContraste(paso2);
    await sinDesborde(page);
    await captura(page, 'ingreso-2-datos', ancho);

    // Error: DNI incompleto, con el mensaje junto al campo y foco en él.
    await page.getByLabel('Número de DNI').fill('1234');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('8 números');
    await expect(page.getByLabel('Número de DNI')).toBeFocused();
    const mensaje = await contrastes(page, ['.error-campo']);
    exigirContraste(mensaje);
    await sinDesborde(page);
    await captura(page, 'ingreso-3-error', ancho);

    // «Cambiar» vuelve a los dos botones y el tamaño sigue siendo cómodo.
    const cambiar = page.getByRole('button', { name: 'Cambiar' });
    expect((await cambiar.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(errores).toEqual([]);
    medidas.push({ pantalla: 'ingreso', ancho, botonesTipo: cajas, contrastes: { ...paso1, ...paso2, ...mensaje }, desborde: false, controlesMenoresDe44: 0, teclado: ['Soy asociado', 'Soy administrador', 'DNI', 'Clave', 'Mostrar clave', 'Ingresar'] });
  });

  test(`cambio obligatorio de clave a ${ancho} px: campos, errores, teclado y contraste`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 820 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await simular(page, { debeCambiar: true });
    await page.goto('/');
    await page.getByRole('button', { name: 'Soy administrador' }).click();
    await page.getByLabel('Número de DNI').fill('10000002');
    await page.getByLabel('Clave', { exact: true }).fill(CLAVE_ENTREGADA);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Elige tu clave' })).toBeVisible();
    await sinDesborde(page);
    expect(await controlesPequenos(page, 'main')).toEqual([]);
    const cambio = await contrastes(page, ['h1', '.tarjeta-clave .suave', '.formulario-clave label', '.formulario-clave .ayuda-campo', '.pie-formulario-clave .primario', '.mostrar-claves', '.salir-clave']);
    exigirContraste(cambio);
    await captura(page, 'cambio-1-primer-ingreso', ancho);

    // Teclado: el orden es el de la pantalla y Enter envía.
    const orden: string[] = [];
    await page.getByLabel('Clave que te entregaron').focus();
    for (let i = 0; i < 6; i++) {
      orden.push(await enfocado(page));
      await page.keyboard.press('Tab');
    }
    expect(orden).toEqual(['Clave que te entregaron', 'Clave nueva', 'Repite la clave nueva', 'Mostrar las claves', 'Guardar mi clave', 'Salir']);

    // Errores en lenguaje común, junto a cada campo, con el foco en el primero.
    await page.getByRole('button', { name: 'Guardar mi clave' }).click();
    await expect(page.getByLabel('Clave que te entregaron')).toBeFocused();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await page.getByLabel('Clave que te entregaron').fill(CLAVE_ENTREGADA);
    await page.getByLabel('Clave nueva', { exact: true }).fill('mi casa tiene tres ventanas');
    await page.getByLabel('Repite la clave nueva').fill('mi casa tiene tres puertas');
    await page.getByRole('button', { name: 'Guardar mi clave' }).click();
    await expect(page.getByText('Las dos claves no son iguales.')).toBeVisible();
    const errorCambio = await contrastes(page, ['.error-campo']);
    exigirContraste(errorCambio);
    await sinDesborde(page);
    await captura(page, 'cambio-2-error', ancho);

    // Con todo correcto entra a su espacio.
    await page.getByLabel('Repite la clave nueva').fill('mi casa tiene tres ventanas');
    await page.getByRole('button', { name: 'Guardar mi clave' }).click();
    await page.waitForURL(/\/personal$/);
    expect(errores).toEqual([]);
    medidas.push({ pantalla: 'cambio-de-clave', ancho, desborde: false, controlesMenoresDe44: 0, contrastes: { ...cambio, ...errorCambio }, teclado: orden });
  });

  test(`entrega de la clave temporal a ${ancho} px: cuadro, copia, impresión, foco y contraste`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 820 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await simular(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Soy administrador' }).click();
    await page.getByLabel('Número de DNI').fill('10000001');
    await page.getByLabel('Clave', { exact: true }).fill('clave-de-prueba');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL(/\/personal$/);
    // La pantalla del personal se carga bajo demanda: se espera su navegación (o el botón de menú en móvil).
    const menu = page.getByRole('button', { name: 'Menú', exact: true });
    await expect(menu.or(page.getByRole('navigation', { name: 'Secciones del personal' })).first()).toBeVisible();
    if (await menu.isVisible() && (await menu.getAttribute('aria-expanded')) === 'false') await menu.click();
    await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Equipo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Equipo', exact: true })).toBeVisible();
    await sinDesborde(page);
    await captura(page, 'equipo-1-lista', ancho);

    await page.getByRole('button', { name: 'Agregar persona' }).click();
    const formulario = page.getByRole('dialog', { name: 'Agregar persona' });
    await formulario.getByLabel('Nombre completo').fill('Elena Tesorera de la comunidad San Miguel');
    await formulario.getByLabel('Número de DNI').fill('30000001');
    const agregar = formulario.getByRole('button', { name: 'Agregar', exact: true });
    expect((await agregar.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await agregar.click();

    const dialogo = page.getByRole('dialog', { name: 'Acceso creado' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByTestId('clave-temporal')).toHaveText(CLAVE_ENTREGADA);
    await expect(dialogo.getByRole('heading', { name: 'Acceso creado' })).toBeFocused();
    const caja = await dialogo.boundingBox();
    expect(caja && caja.x >= 0 && caja.x + caja.width <= ancho).toBe(true);
    await sinDesborde(page);
    expect(await controlesPequenos(page, 'dialog[open]')).toEqual([]);
    const tamano = await dialogo.getByTestId('clave-temporal').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(tamano).toBeGreaterThanOrEqual(24);
    const entrega = await contrastes(page, ['dialog[open] .clave-v3 .palabras span', 'dialog[open] .clave-v3 .nota', 'dialog[open] h2']);
    exigirContraste(entrega);
    await captura(page, 'entrega-clave', ancho, false);

    // Teclado: el foco nunca llega a la página de atrás (dentro del cuadro, o fuera del documento) y Escape lo cierra.
    const recorrido: string[] = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      recorrido.push(await enfocado(page));
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('dialog'))).toBe(true);
    }
    expect(recorrido).toEqual(expect.arrayContaining(['Copiar', 'Imprimir tarjeta', 'Listo']));
    await dialogo.getByRole('button', { name: 'Copiar' }).click();
    await expect(dialogo.getByText(/Clave copiada|No se pudo copiar/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    expect(await page.textContent('body')).not.toContain(CLAVE_ENTREGADA);
    expect(errores).toEqual([]);
    medidas.push({ pantalla: 'entrega-de-clave', ancho, desborde: false, controlesMenoresDe44: 0, tamanoClavePx: tamano, contrastes: entrega, recorridoTeclado: recorrido });
  });
}

test.afterAll(() => {
  if (!GUARDAR || medidas.length === 0) return;
  mkdirSync(CARPETA, { recursive: true });
  const ordenadas = [...medidas].sort((a, b) => a.pantalla.localeCompare(b.pantalla) || a.ancho - b.ancho);
  writeFileSync(`${CARPETA}medidas.json`, `${JSON.stringify({ generado: new Date().toISOString(), navegador: 'Chrome (Playwright)', medidas: ordenadas }, null, 2)}\n`, 'utf8');
});
