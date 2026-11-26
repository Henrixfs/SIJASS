// Desde la raíz: node docs/diseno/evidencia/premium-2026/capturar-ingreso.cjs antes|despues
// Inspección de una página pública con el navegador instalado. Solo admite GET y HEAD.
const { chromium } = require('../../../../tecnologia/e2e/node_modules/playwright');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

async function capturar() {
  const etapa = process.argv[2];
  if (!['antes', 'despues'].includes(etapa)) throw new Error('Indique antes o despues.');
  const destino = path.join(__dirname, etapa);
  await mkdir(destino, { recursive: true });
  const navegador = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const mediciones = [];
    for (const ancho of [320, 360, 390, 768, 1024, 1440, 1920]) {
      const alto = ancho < 768 ? 844 : 900;
      const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto }, serviceWorkers: 'block' });
      await pagina.route('**/*', ruta => {
        const req = ruta.request();
        return ['GET', 'HEAD'].includes(req.method()) && new URL(req.url()).origin === 'http://127.0.0.1:5174'
          ? ruta.continue() : ruta.abort();
      });
      await pagina.addInitScript(() => {
        window.medidasIngreso = { cls: 0, lcp: null };
        new PerformanceObserver(lista => {
          for (const entrada of lista.getEntries()) if (!entrada.hadRecentInput) window.medidasIngreso.cls += entrada.value;
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(lista => {
          for (const entrada of lista.getEntries()) window.medidasIngreso.lcp = entrada.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      await pagina.goto('http://127.0.0.1:5174/ingresar', { waitUntil: 'networkidle' });
      await pagina.getByRole('heading', { name: 'Ingresar a SIJASS' }).waitFor();
      await pagina.evaluate(() => document.fonts.ready);
      await pagina.screenshot({ path: path.join(destino, 'ingreso-' + ancho + '.png'), fullPage: true });
      mediciones.push(await pagina.evaluate(() => ({
        ancho: innerWidth, contenido: document.documentElement.scrollWidth,
        boton: document.querySelector('button[type=submit]').getBoundingClientRect().height,
        ...window.medidasIngreso
      })));
      if (etapa === 'despues') {
        const orden = [];
        for (let paso = 0; paso < 4; paso++) {
          await pagina.keyboard.press('Tab');
          orden.push(await pagina.evaluate(() => {
            const activo = document.activeElement;
            return activo.getAttribute('name') || activo.getAttribute('aria-label') || activo.textContent.trim();
          }));
        }
        await pagina.emulateMedia({ reducedMotion: 'reduce' });
        const contraste = await pagina.evaluate(() => {
          const luminancia = color => {
            const rgb = color.match(/\d+/g).slice(0, 3).map(v => Number(v) / 255)
              .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
          };
          const razon = (a, b) => {
            const valores = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
            return Number(((valores[0] + .05) / (valores[1] + .05)).toFixed(2));
          };
          const accion = getComputedStyle(document.querySelector('button[type=submit]'));
          const fondo = getComputedStyle(document.querySelector('.ingreso')).backgroundColor;
          const clave = document.querySelector('.ver-clave').getBoundingClientRect();
          return {
            accion: razon(accion.color, accion.backgroundColor),
            secundario: razon(getComputedStyle(document.querySelector('.descripcion-ingreso')).color, fondo),
            borde: razon(getComputedStyle(document.querySelector('input')).borderColor, fondo),
            alturaVerClave: clave.height, transicionReducida: accion.transitionDuration
          };
        });
        Object.assign(mediciones[mediciones.length - 1], { orden, contraste });
      }
      await pagina.close();
    }
    await writeFile(path.join(destino, 'mediciones.json'), JSON.stringify(mediciones, null, 2));
    console.log(mediciones);
  } finally {
    await navegador.close();
  }
}
capturar().catch(error => { console.error(error); process.exitCode = 1; });
