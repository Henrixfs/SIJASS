import { expect, test, type Page } from '@playwright/test';

type Rol = 'consejo' | 'tesorero' | 'operador' | null;
const asociado = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Elena Quispe de la comunidad San Miguel', documento: '70000001', estado: 'activo' };
const cuota = { id: '22222222-2222-4222-8222-222222222222', periodo: '2026-11', importeCentimos: 1500, pagadoCentimos: 500, pendienteCentimos: 1000, estado: 'parcial' };
const pago = { id: '33333333-3333-4333-8333-333333333333', periodo: cuota.periodo, cuotaId: cuota.id, importeCentimos: 500, pagadoEn: '2026-11-19T15:00:00Z', comprobante: 'REC-12345678901234567890123456789012345678901234567890123456', estado: 'vigente' };
const reservorio = { id: '44444444-4444-4444-8444-444444444444', nombre: 'Reservorio principal de la comunidad' };

async function preparar(page: Page, rol: Rol) {
  let reversas = 0;
  let motivo = '';
  const llamadas: string[] = [];
  await page.route('**/v1/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const metodo = route.request().method();
    llamadas.push(`${metodo} ${pathname}`);
    const saldoCentimos = reversas ? 1500 : 1000;
    const pagos = [{ ...pago, estado: reversas ? 'revertido' : 'vigente' }];
    const cuotas = [{ ...cuota, estado: reversas ? 'pendiente' : 'parcial', pagadoCentimos: reversas ? 0 : 500, pendienteCentimos: saldoCentimos }];
    const sesion = { perfil: rol ? 'personal' : 'asociado', rol, debeCambiarContrasena: false };
    const quien = { ...sesion, nombre: rol ? 'Ana Morales' : 'Elena Quispe', documento: '•••••001', jass: { nombre: 'JASS San Miguel' } };
    const respuestas: Record<string, unknown> = {
      'POST /v1/auth/login': { ...sesion, tokenAcceso: 'prueba-navegador', tokenRefresco: 'prueba-refresco' },
      'POST /v1/auth/refresh': { ...sesion, tokenAcceso: 'prueba-navegador-renovada', tokenRefresco: 'prueba-refresco-renovado' },
      'GET /v1/yo': quien,
      'GET /v1/asociados': { asociados: [{ ...asociado, saldoCentimos }] },
      [`GET /v1/asociados/${asociado.id}/estado-de-cuenta`]: { asociado, saldoCentimos, periodoActual: cuota.periodo, pagos, cuotas },
      [`GET /v1/pagos/${pago.id}`]: { ...pagos[0], reversa: reversas ? { motivo, creadaEn: '2026-11-21T15:00:00Z' } : null },
      'GET /v1/portal/saldo': { asociado, saldoCentimos, periodoActual: cuota.periodo },
      'GET /v1/portal/cuotas': { cuotas },
      'GET /v1/portal/pagos': { pagos },
      'GET /v1/reservorios': { reservorios: [reservorio] },
      'GET /v1/mediciones/catalogo': { unidad: 'mg/L', metodos: [{ codigo: 'dpd', descripcion: 'Comparador DPD' }] },
      [`GET /v1/reservorios/${reservorio.id}/mediciones`]: { mediciones: [] },
      'GET /v1/asistente/documentos': { corpus: 'ejemplo', nombre: 'Ejemplo', documentos: [] },
    };
    if (metodo === 'POST' && pathname === `/v1/pagos/${pago.id}/reversa`) {
      reversas++;
      motivo = route.request().postDataJSON().motivo;
      await route.fulfill({ json: { pagoId: pago.id } });
    } else if (pathname === '/v1/auth/logout') {
      await route.fulfill({ status: 204 });
    } else {
      const respuesta = respuestas[`${metodo} ${pathname}`];
      if (respuesta) await route.fulfill({ json: respuesta });
      else await route.fulfill({ status: 404, json: { codigo: 'no-encontrado', mensaje: 'Ruta fuera de esta prueba' } });
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: rol ? 'Soy administrador' : 'Soy asociado' }).click();
  await page.getByLabel('Número de DNI').fill('12345678');
  await page.getByLabel('Clave', { exact: true }).fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  return { llamadas, reversas: () => reversas };
}

async function sinDesborde(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function navegar(page: Page, nombre: string) {
  const menu = page.getByRole('button', { name: 'Menú' });
  const navegacion = page.getByRole('navigation', { name: 'Secciones del personal' });
  // La pantalla del personal se carga bajo demanda: se espera su navegación (o el botón de menú en móvil).
  await expect(menu.or(navegacion)).toBeVisible();
  if (await menu.isVisible() && (await menu.getAttribute('aria-expanded')) === 'false') await menu.click();
  await navegacion.getByRole('link', { name: nombre, exact: true }).click();
}

for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`cuenta y reversa de Tesorería a ${width} px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 820 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errores: string[] = [];
    page.on('pageerror', (error) => errores.push(error.message));
    const { reversas } = await preparar(page, 'tesorero');
    const botonCuenta = page.getByRole('button', { name: 'Ver cuenta' });
    await expect(botonCuenta).toBeVisible();
    await sinDesborde(page);
    await botonCuenta.click();
    const fila = page.getByTestId(`pago-${pago.comprobante}`);
    const abrir = fila.getByRole('button', { name: 'Ver detalle' });
    await expect(abrir).toBeVisible();
    expect((await abrir.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await sinDesborde(page);
    await expect(page.getByTestId('tabla-pagos')).toHaveCSS('display', width < 1100 ? 'grid' : 'table');
    if (width === 360 || width === 1440) await page.screenshot({ path: info.outputPath(`cuenta-${width}.png`), fullPage: true });
    await abrir.focus();
    await page.keyboard.press('Enter');
    const detalle = page.getByRole('dialog', { name: 'Detalle del pago' });
    await expect(detalle.getByText(pago.comprobante, { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(detalle.getByRole('button', { name: 'Volver al historial' })).toBeFocused();
    const rect = await detalle.boundingBox();
    expect(rect && rect.x >= 0 && rect.x + rect.width <= width).toBe(true);
    await page.keyboard.press('Escape');
    await expect(detalle).toHaveCount(0);
    await expect(abrir).toBeFocused();
    await abrir.click();
    await detalle.getByRole('button', { name: 'Reversar pago' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Reversar pago' });
    await expect(dialogo.getByRole('heading')).toBeFocused();
    const textarea = dialogo.getByRole('textbox', { name: 'Motivo de la reversa' });
    await textarea.fill('  ');
    const confirmar = dialogo.getByRole('button', { name: 'Confirmar reversa' });
    await confirmar.click();
    await expect(dialogo.getByRole('alert')).toContainText('1 a 300 caracteres');
    expect(reversas()).toBe(0);
    if (width === 390) await page.screenshot({ path: info.outputPath('reversa-390.png') });
    await textarea.fill('Registro duplicado');
    await confirmar.click();
    await expect(page.getByTestId('aviso-ok')).toHaveText('Pago revertido.');
    await expect(fila).toContainText('Revertido');
    await expect(page.getByTestId('saldo-asociado')).toContainText('S/ 15.00');
    expect(reversas()).toBe(1);
    await navegar(page, 'Mi perfil');
    await expect(page.getByText('Información de sesión')).toBeVisible();
    await sinDesborde(page);
    await page.getByRole('link', { name: '← Volver' }).click();
    await expect(fila).toBeVisible();
    expect(errores).toEqual([]);
  });
}

test('Consejo, Operador y Asociado tienen recorridos separados', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  const operador = await preparar(page, 'operador');
  const menu = page.getByRole('button', { name: 'Menú' });
  await menu.click();
  await page.getByRole('link', { name: 'Operaciones de campo' }).focus();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await navegar(page, 'Operaciones de campo');
  await page.getByLabel('Reservorio').selectOption(reservorio.id);
  await expect(page.getByRole('form', { name: 'Registrar medición' })).toBeVisible();
  await page.goto(`/personal/asociados/${asociado.id}`);
  await expect(page.getByTestId('sin-permiso')).toBeVisible();
  expect(operador.llamadas.some((ruta) => ruta.startsWith('GET /v1/asociados'))).toBe(false);
  await sinDesborde(page);

  const consejo = await browser.newPage({ viewport: { width: 768, height: 900 } });
  await preparar(consejo, 'consejo');
  await navegar(consejo, 'Resumen');
  await expect(consejo.getByRole('heading', { name: 'Dashboard general' })).toBeVisible();
  await navegar(consejo, 'Reservorios');
  await expect(consejo.getByRole('form', { name: 'Crear reservorio' })).toBeVisible();
  await expect(consejo.getByText(reservorio.nombre, { exact: true })).toBeVisible();
  await navegar(consejo, 'Asistente');
  await expect(consejo.getByRole('form', { name: 'Consultar al asistente' })).toBeVisible();
  await sinDesborde(consejo);
  await consejo.close();

  const familias = await browser.newPage({ viewport: { width: 360, height: 820 } });
  const familia = await preparar(familias, null);
  await familias.getByRole('navigation', { name: 'Secciones del portal' }).getByRole('link', { name: 'Pagos' }).click();
  await expect(familias.getByTestId('saldo')).toHaveText('S/ 10.00');
  await expect(familias.getByTestId('portal-cuotas')).toBeVisible();
  await familias.goto('/personal/campo');
  await expect(familias).toHaveURL(/\/portal$/);
  await expect(familias.getByRole('navigation', { name: 'Secciones del personal' })).toHaveCount(0);
  expect(familia.llamadas.some((ruta) => ruta.startsWith('GET /v1/reservorios'))).toBe(false);
  await sinDesborde(familias);
  await familias.close();
});

test('la compilación carga fuentes locales y alcanza el contraste de los controles de ingreso', async ({ page }) => {
  await page.goto('/');
  const medir = (s: { texto: string; fondo: string; borde?: string }) =>
    page.evaluate((selectores) => {
      const luminancia = (color: string) => {
        const rgb = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
        return rgb.reduce((suma, canal, indice) => {
          const srgb = canal / 255;
          return suma + [0.2126, 0.7152, 0.0722][indice] * (srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4);
        }, 0);
      };
      const contraste = (a: string, b: string) => {
        const valores = [luminancia(a), luminancia(b)];
        return (Math.max(...valores) + 0.05) / (Math.min(...valores) + 0.05);
      };
      const texto = getComputedStyle(document.querySelector(selectores.texto)!);
      const fondo = getComputedStyle(document.querySelector(selectores.fondo)!);
      const borde = selectores.borde ? getComputedStyle(document.querySelector(selectores.borde)!) : null;
      return { texto: contraste(texto.color, fondo.backgroundColor), borde: borde ? contraste(borde.borderColor, fondo.backgroundColor) : null };
    }, s);
  const fuentes = await page.evaluate(async () => {
    const familias = await Promise.all([
      document.fonts.load('800 32px Manrope', 'Iniciar sesión'),
      document.fonts.load('400 16px "Inter Tight"', 'Cuotas, pagos y medición'),
    ]);
    return familias.map((f) => f.length);
  });
  expect(fuentes).toEqual([1, 1]);

  // Paso 1: los dos botones grandes y el título.
  const titulo = await medir({ texto: 'h1', fondo: 'form' });
  const tipo = await medir({ texto: '.tipo-acceso strong', fondo: '.tipo-acceso', borde: '.tipo-acceso' });
  expect(titulo.texto).toBeGreaterThanOrEqual(4.5);
  expect(tipo.texto).toBeGreaterThanOrEqual(4.5);
  expect(tipo.borde).toBeGreaterThanOrEqual(3);

  // Paso 2: el campo del DNI y el botón principal.
  await page.getByRole('button', { name: 'Soy administrador' }).click();
  const campo = await medir({ texto: '#documento-ingreso', fondo: 'form', borde: '#documento-ingreso' });
  const boton = await medir({ texto: '.boton-ingreso', fondo: '.boton-ingreso' });
  expect(campo.texto).toBeGreaterThanOrEqual(4.5);
  expect(campo.borde).toBeGreaterThanOrEqual(3);
  expect(boton.texto).toBeGreaterThanOrEqual(4.5);
});
