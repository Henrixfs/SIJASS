// Presentación estática de muestras Vitest. Chrome no tiene acceso a la API.
const { chromium } = require('../../../../tecnologia/e2e/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

async function renderizar() {
  const muestras = process.env.SIJASS_CAPTURAS_UNITARIAS;
  const dist = path.resolve(__dirname, '../../../../tecnologia/sijass-web/dist');
  const destino = path.join(__dirname, 'componentes');
  await fs.mkdir(destino, { recursive: true });
  const css = (await fs.readdir(path.join(dist, 'assets'))).find(s => s.endsWith('.css'));
  const navegador = await chromium.launch({ channel: 'chrome' });
  const medidas = [];
  try {
    const pagina = await navegador.newPage();
    await pagina.route('**/*', async ruta => {
      const url = new URL(ruta.request().url());
      if (url.origin !== 'https://muestra.invalid' || !/^\/(assets\/[\w.-]+|cuenca-compacta\.webp)$/.test(url.pathname)) return ruta.abort();
      await ruta.fulfill({ path: path.join(dist, url.pathname.slice(1)), headers: { 'access-control-allow-origin': '*' } });
    });
    for (const archivo of (await fs.readdir(muestras)).filter(s => s.endsWith('.html')).sort()) {
      const nombre = path.basename(archivo, '.html');
      const html = await fs.readFile(path.join(muestras, archivo), 'utf8');
      await pagina.setContent('<html lang="es"><head><base href="https://muestra.invalid/"><link rel="stylesheet" href="assets/' + css + '"></head><body>' + html + '</body></html>');
      await pagina.evaluate(async () => {
        await document.fonts.ready;
        const dialogo = document.querySelector('dialog[open]');
        if (dialogo) { dialogo.close(); dialogo.showModal(); }
      });
      for (const ancho of [320,360,390,768,1024,1440,1920]) {
        await pagina.setViewportSize({ width: ancho, height: ancho < 768 ? 844 : 900 });
        const real = await pagina.evaluate(() => document.documentElement.scrollWidth);
        medidas.push({ modulo: nombre, ancho, contenido: real });
        if ([390,1440].includes(ancho)) {
          await pagina.screenshot({ path: path.join(destino, nombre + '-' + ancho + '.png'), animations: 'disabled' });
          if (nombre === 'detalle') {
            await pagina.locator('dialog').evaluate(dialogo => dialogo.close());
            const pagos = pagina.locator('[aria-label="Historial de pagos"]');
            await pagos.screenshot({ path: path.join(destino, 'historial-' + ancho + '.png'), animations: 'disabled' });
            await pagina.evaluate(() => {
              window.scrollTo(0, 0);
              document.querySelector('dialog').showModal();
            });
          }
        }
      }
    }
    await fs.writeFile(path.join(destino, 'anchos.json'), JSON.stringify(medidas, null, 2));
    console.log(medidas.length, 'observaciones', medidas.filter(m => m.contenido > m.ancho));
  } finally { await navegador.close(); }
}
renderizar().catch(error => { console.error(error); process.exitCode = 1; });
