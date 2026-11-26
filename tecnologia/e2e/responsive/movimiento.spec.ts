/**
 * Movimiento de la interfaz en Chrome real (openspec `ui-movimiento-panel-plegable`, spec
 * `movimiento-de-interfaz`). La API va simulada; lo que se mide es lo que el navegador APLICA:
 * nombres, duraciones, retardos y propiedades de cada animación (`document.getAnimations()`).
 * `GUARDAR_EVIDENCIA=1` guarda además capturas en docs/diseno/evidencia/movimiento.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Registro {
  nombre: string;
  duracion: number;
  retardo: number;
  iteraciones: number;
  propiedades: string[];
  elemento: string;
}
type ConRegistro = typeof globalThis & { __movimiento: Registro[] };

const asociado = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Elena Quispe de la comunidad San Miguel', documento: '70000001', estado: 'activo' };
const reservorio = { id: '44444444-4444-4444-8444-444444444444', nombre: 'Reservorio principal de la comunidad' };
const EVIDENCIA = process.env.GUARDAR_EVIDENCIA === '1';
const carpetaEvidencia = fileURLToPath(new URL('../../../docs/diseno/evidencia/movimiento/', import.meta.url));

/** Registra cada animación CSS que el navegador crea, con lo que realmente aplica. */
const REGISTRADOR = `(() => {
  window.__movimiento = [];
  const vistos = new WeakSet();
  const ajenas = ['offset', 'easing', 'composite', 'computedOffset'];
  const registrar = () => {
    for (const a of document.getAnimations()) {
      if (vistos.has(a) || !a.animationName) continue;
      vistos.add(a);
      const t = a.effect.getComputedTiming();
      const propiedades = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((p) => !ajenas.includes(p)))];
      const destino = a.effect.target;
      window.__movimiento.push({ nombre: a.animationName, duracion: t.duration, retardo: t.delay, iteraciones: t.iterations, propiedades, elemento: String((destino && (destino.className.baseVal ?? destino.className)) || '') });
    }
  };
  // Se observa \`document\`: al inyectarse este script todavía no existe \`document.documentElement\`.
  new MutationObserver(registrar).observe(document, { childList: true, subtree: true, attributes: true });
  window.addEventListener('animationstart', registrar, true);
  document.addEventListener('DOMContentLoaded', registrar);
})();`;

const registro = (page: Page) => page.evaluate(() => (globalThis as ConRegistro).__movimiento);
const de = (lista: Registro[], nombre: string) => lista.filter((r) => r.nombre === nombre);

async function simular(page: Page) {
  await page.addInitScript(REGISTRADOR);
  await page.route('**/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const metodo = route.request().method();
    const sesion = { perfil: 'personal', rol: 'consejo', debeCambiarContrasena: false };
    const respuestas: Record<string, unknown> = {
      'POST /v1/auth/login': { ...sesion, tokenAcceso: 'prueba', tokenRefresco: 'prueba-refresco' },
      'POST /v1/auth/refresh': { ...sesion, tokenAcceso: 'prueba-2', tokenRefresco: 'prueba-refresco-2' },
      'GET /v1/yo': { ...sesion, nombre: 'Ana Morales', documento: '•••••001', jass: { nombre: 'JASS San Miguel' } },
      'GET /v1/asociados': { asociados: [{ ...asociado, saldoCentimos: 1000 }] },
      'GET /v1/reservorios': { reservorios: [reservorio] },
      'GET /v1/mediciones/catalogo': { unidad: 'mg/L', metodos: [{ codigo: 'dpd', descripcion: 'Comparador DPD' }] },
      [`GET /v1/reservorios/${reservorio.id}/mediciones`]: { mediciones: [] },
    };
    if (pathname === '/v1/auth/logout') return route.fulfill({ status: 204 });
    const respuesta = respuestas[`${metodo} ${pathname}`];
    if (respuesta) return route.fulfill({ json: respuesta });
    return route.fulfill({ status: 404, json: { codigo: 'no-encontrado', mensaje: 'Ruta fuera de esta prueba' } });
  });
}

async function ingresar(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Soy administrador' }).click();
  await page.getByLabel('Número de DNI').fill('12345678');
  await page.getByLabel('Clave', { exact: true }).fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Secciones del personal' })).toBeVisible();
}

const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
const enlacesDelPanel = (page: Page) => page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link');
const anchoDelPanel = (page: Page) => async () => (await page.locator('.lateral').boundingBox())!.width;
const capturar = async (page: Page, nombre: string) => {
  if (!EVIDENCIA) return;
  // La evidencia muestra el estado final: se espera a que terminen las entradas (la más larga dura 520 ms).
  await page.waitForTimeout(800);
  mkdirSync(carpetaEvidencia, { recursive: true });
  await page.screenshot({ path: `${carpetaEvidencia}${nombre}.png` });
};

test.describe('panel lateral plegable', () => {
  for (const ancho of [1024, 1280, 1440]) {
    test(`se pliega y se despliega a ${ancho} px sin perder nombres, objetivos de 44 px ni ancho útil`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await simular(page);
      await ingresar(page);
      await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Resumen', exact: true }).click();
      const medir = anchoDelPanel(page);
      expect(await medir()).toBeGreaterThan(230);
      const nombres = await enlacesDelPanel(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()));
      const anchoPrincipal = (await page.locator('main').boundingBox())!.width;
      await sinDesborde(page);
      await capturar(page, `panel-desplegado-${ancho}`);

      await page.getByRole('button', { name: 'Plegar panel lateral' }).click();
      // Un cuadro a mitad de la transición (para revisar a ojo que nada salta ni se corta).
      if (EVIDENCIA && ancho === 1440) {
        await page.waitForTimeout(110);
        mkdirSync(carpetaEvidencia, { recursive: true });
        await page.screenshot({ path: `${carpetaEvidencia}panel-transicion-${ancho}.png` });
      }
      await expect.poll(medir).toBeLessThanOrEqual(80);
      await expect(page.getByRole('button', { name: 'Desplegar panel lateral' })).toHaveAttribute('aria-expanded', 'false');
      expect((await page.locator('main').boundingBox())!.width).toBeGreaterThan(anchoPrincipal + 140);
      const enlaces = enlacesDelPanel(page);
      expect(await enlaces.count()).toBe(nombres.length);
      for (let i = 0; i < nombres.length; i++) {
        const caja = (await enlaces.nth(i).boundingBox())!;
        expect(caja.height, `alto de «${nombres[i]}»`).toBeGreaterThanOrEqual(44);
        expect(caja.width, `ancho de «${nombres[i]}»`).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Resumen', exact: true })).toBeVisible();
      await sinDesborde(page);
      await capturar(page, `panel-plegado-${ancho}`);

      await page.getByRole('button', { name: 'Desplegar panel lateral' }).click();
      await expect.poll(medir).toBeGreaterThan(230);
      await sinDesborde(page);
    });
  }

  test('la transición del panel dura 220 ms con la curva de movimiento y solo sobre la columna', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await ingresar(page);
    await expect(page.locator('.marco-personal')).toHaveAttribute('data-listo', 'true');
    const transicion = await page.locator('.marco-personal').evaluate((el) => {
      const e = getComputedStyle(el);
      return { propiedad: e.transitionProperty, duracion: e.transitionDuration, curva: e.transitionTimingFunction };
    });
    expect(transicion.propiedad).toBe('grid-template-columns');
    expect(transicion.duracion).toBe('0.22s');
    expect(transicion.curva).toContain('cubic-bezier(0.77, 0, 0.175, 1)');
  });

  test('la elección se recuerda y la página abre ya plegada, sin animar el cambio de ancho', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await ingresar(page);
    await page.getByRole('button', { name: 'Plegar panel lateral' }).click();
    await expect.poll(anchoDelPanel(page)).toBeLessThanOrEqual(80);
    await page.addInitScript(`(() => {
      window.__anchos = [];
      const t0 = performance.now();
      (function muestrear() {
        const el = document.querySelector('.lateral');
        if (el) window.__anchos.push(Math.round(el.getBoundingClientRect().width));
        if (performance.now() - t0 < 2500) requestAnimationFrame(muestrear);
      })();
    })();`);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Desplegar panel lateral' })).toBeVisible();
    await page.waitForTimeout(600);
    const anchos = await page.evaluate(() => (globalThis as unknown as { __anchos: number[] }).__anchos);
    expect(anchos.length).toBeGreaterThan(3);
    expect(Math.max(...anchos), `anchos observados: ${[...new Set(anchos)].join(', ')}`).toBeLessThanOrEqual(80);
  });

  test('por debajo de 1024 px no hay botón de plegar y el menú móvil sigue funcionando', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await simular(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Soy administrador' }).click();
    await page.getByLabel('Número de DNI').fill('12345678');
    await page.getByLabel('Clave', { exact: true }).fill('clave-de-prueba');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    const menu = page.getByRole('button', { name: 'Menú' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plegar panel lateral' })).toBeHidden();
    await menu.click();
    await expect(page.getByRole('navigation', { name: 'Secciones del personal' })).toBeVisible();
    await sinDesborde(page);
  });
});

test.describe('con movimiento normal', () => {
  test('el Resumen entra escalonado: 40 ms entre bloques, 6 pasos como máximo y todo termina antes de 600 ms (y sin errores en la consola)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    page.on('console', (mensaje) => {
      // Las rutas que esta prueba no simula responden 404: ese ruido de red no es un error de la interfaz.
      if (mensaje.type() === 'error' && !/Failed to load resource/.test(mensaje.text())) errores.push(mensaje.text());
    });
    await simular(page);
    await ingresar(page);
    await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Resumen', exact: true }).click();
    await expect.poll(async () => de(await registro(page), 'entrar-tarjeta').length).toBeGreaterThanOrEqual(6);
    const tarjetas = de(await registro(page), 'entrar-tarjeta');
    const retardos = [...new Set(tarjetas.map((t) => t.retardo))].sort((a, b) => a - b);
    expect(retardos[0]).toBe(0);
    for (const r of retardos) expect(r % 40, `retardo ${r}`).toBe(0);
    expect(Math.max(...retardos)).toBeLessThanOrEqual(240);
    for (const t of tarjetas) {
      expect(t.duracion).toBeLessThanOrEqual(300);
      expect(t.retardo + t.duracion).toBeLessThan(600);
      expect(t.propiedades.sort()).toEqual(['opacity', 'transform']);
    }
    // Una sola entrada por contenedor: la página del Resumen no se anima, lo hacen sus tarjetas.
    expect(await page.locator('.pagina-inicio').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await capturar(page, 'resumen-1440');
    expect(errores, 'errores en la consola').toEqual([]);
  });

  test('cada sección entra en 180 ms con 4 px y sin animación de salida', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await ingresar(page);
    await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Mi perfil' }).first().click();
    await expect.poll(async () => de(await registro(page), 'entrar-pagina').length).toBeGreaterThan(0);
    const entradas = de(await registro(page), 'entrar-pagina');
    for (const e of entradas) {
      expect(e.duracion).toBe(180);
      expect(e.propiedades.sort()).toEqual(['opacity', 'transform']);
    }
    // La navegación no espera nada: el título de la nueva sección ya está en pantalla al terminar de hacer clic.
    await expect(page.getByRole('heading', { name: /Mi perfil/ })).toBeVisible();
  });

  test('ambiente del Resumen: ondas de 18 s y punto de estado de 2,4 s, solo transform y opacity', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await ingresar(page);
    await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Resumen', exact: true }).click();
    const delHeroe = async () => de(await registro(page), 'deriva').find((r) => r.elemento.includes('hero-ondas'));
    await expect.poll(async () => (await delHeroe()) !== undefined).toBe(true);
    const ondas = (await delHeroe())!;
    expect(ondas.duracion).toBe(18000);
    expect(ondas.iteraciones).toBe(Infinity);
    expect(ondas.propiedades).toEqual(['transform']);
    const latido = de(await registro(page), 'latido')[0]!;
    expect(latido.duracion).toBe(2400);
    expect(latido.propiedades).toEqual(['opacity']);
  });

  test('el ingreso: tarjeta de 280 ms, ondas de 16 s y pasos que entran hacia adelante (220 ms) y hacia atrás', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Soy asociado' })).toBeVisible();
    let lista = await registro(page);
    expect(de(lista, 'entrar-ingreso')[0]).toMatchObject({ duracion: 280, propiedades: expect.arrayContaining(['opacity', 'transform']) });
    // El primer paso no se anima al cargar (ya entra con la tarjeta): solo los cambios de paso.
    expect(de(lista, 'paso-adelante')).toHaveLength(0);
    expect(de(lista, 'deriva')[0]).toMatchObject({ duracion: 16000, iteraciones: Infinity, propiedades: ['transform'] });
    await capturar(page, 'ingreso-1440');

    await page.getByRole('button', { name: 'Soy asociado' }).click();
    await expect(page.getByLabel('Número de DNI')).toBeFocused();
    lista = await registro(page);
    expect(de(lista, 'paso-adelante').at(-1)).toMatchObject({ duracion: 220 });
    expect(de(lista, 'paso-adelante').at(-1)!.propiedades).toContain('transform');

    await page.getByRole('button', { name: 'Cambiar' }).click();
    await expect.poll(async () => de(await registro(page), 'paso-atras').length).toBeGreaterThan(0);
    expect(de(await registro(page), 'paso-atras').at(-1)).toMatchObject({ duracion: 220 });
    await expect(page.getByRole('button', { name: 'Soy administrador' })).toBeVisible();
  });

  test('un botón habilitado se hunde a 0,97 al pulsarlo y vuelve al soltar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await ingresar(page);
    const boton = page.getByRole('button', { name: 'Salir' });
    const caja = (await boton.boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await expect.poll(() => boton.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
    await page.mouse.move(5, 5);
    await page.mouse.up();
    await expect.poll(() => boton.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });
});

test.describe('con «reducir movimiento»', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('el Resumen y las secciones solo se desvanecen: sin desplazamiento, escala, escalonado ni ambiente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await ingresar(page);
    await page.getByRole('navigation', { name: 'Secciones del personal' }).getByRole('link', { name: 'Resumen', exact: true }).click();
    await expect.poll(async () => de(await registro(page), 'entrar-tarjeta').length).toBeGreaterThanOrEqual(6);
    const lista = (await registro(page)).filter((r) => r.nombre !== 'cargar');
    expect(lista.length, 'el registrador debe haber visto animaciones').toBeGreaterThan(6);
    for (const r of lista) {
      expect(r.propiedades, `«${r.nombre}» no debe mover ni escalar`).not.toContain('transform');
      expect(r.duracion, `«${r.nombre}» debe durar 120 ms como máximo`).toBeLessThanOrEqual(120);
      expect(r.retardo, `«${r.nombre}» no se escalona`).toBe(0);
    }
    expect(de(lista, 'deriva')).toHaveLength(0);
    expect(de(lista, 'latido')).toHaveLength(0);
  });

  test('el panel cambia de ancho sin transición y el botón no cambia de escala', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await ingresar(page);
    await expect(page.locator('.marco-personal')).toHaveAttribute('data-listo', 'true');
    expect(await page.locator('.marco-personal').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await page.getByRole('button', { name: 'Plegar panel lateral' }).click();
    await expect.poll(anchoDelPanel(page)).toBeLessThanOrEqual(80);
    const boton = page.getByRole('button', { name: 'Salir' });
    // Los cambios de color se conservan; lo que desaparece es el movimiento.
    const propiedades = await boton.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(propiedades).toContain('background-color');
    expect(propiedades).not.toContain('transform');
    const caja = (await boton.boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    expect(await boton.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await page.mouse.move(5, 5);
    await page.mouse.up();
  });

  test('el ingreso: las ondas no se mueven y los pasos solo se desvanecen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await simular(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Soy asociado' }).click();
    await expect(page.getByLabel('Número de DNI')).toBeFocused();
    expect(await page.locator('.ondas').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    const lista = (await registro(page)).filter((r) => r.nombre !== 'cargar');
    expect(de(lista, 'entrar-ingreso').length + de(lista, 'paso-adelante').length, 'el registrador debe haber visto el ingreso').toBeGreaterThanOrEqual(2);
    for (const r of lista) {
      expect(r.propiedades, `«${r.nombre}» no debe mover`).not.toContain('transform');
      expect(r.duracion).toBeLessThanOrEqual(120);
    }
    expect(de(lista, 'deriva')).toHaveLength(0);
  });
});
