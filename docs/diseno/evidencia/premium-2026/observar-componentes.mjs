// Setup opcional de Vitest. Captura únicamente DOM de fixtures ya renderizados.
import '../../../../tecnologia/sijass-web/src/pruebas/preparar.ts';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const destino = process.env.SIJASS_CAPTURAS_UNITARIAS;
if (!destino || !path.resolve(destino).startsWith(path.resolve(tmpdir()) + path.sep)) {
  throw new Error('Se necesita una carpeta temporal para las muestras de componentes.');
}
mkdirSync(destino, { recursive: true });
const muestras = {
  panel: '.panel-inicio', perfil: '.permisos-perfil', padron: '.tabla-padron .nombre-padron',
  cuenta: 'form[aria-label="Registrar pago"]', cuotas: 'form[aria-label="Generar cuotas del periodo"]',
  portal: '#portal-inicio .saldo-grande', detalle: 'dialog .ficha-pago', reversa: 'dialog .referencia-pago',
  mediciones: '.tabla-campo .insignia', campo: 'form[aria-label="Registrar medición"]',
  reservorios: '.catalogo-agua', asistente: '[data-testid="citas"]'
};
let observador;
beforeEach(() => {
  observador = new MutationObserver(() => {
    for (const [nombre, selector] of Object.entries(muestras)) {
      if (nombre === 'mediciones' && location.pathname === '/personal/campo') continue;
      if (nombre === 'campo' && (location.pathname !== '/personal/campo' || !document.querySelector('.tabla-campo .insignia'))) continue;
      if (nombre === 'cuotas' && !document.querySelector('.pagina-personal select')) continue;
      const archivo = path.join(destino, nombre + '.html');
      if (!document.querySelector(selector) || existsSync(archivo)) continue;
      const copia = document.body.cloneNode(true);
      copia.querySelectorAll('input[type=password],input[type=email]').forEach(control => control.removeAttribute('value'));
      const textos = document.body.querySelectorAll('textarea');
      copia.querySelectorAll('textarea').forEach((control, i) => { control.textContent = textos[i].value; });
      const originales = document.body.querySelectorAll('select');
      copia.querySelectorAll('select').forEach((select, i) => {
        [...select.options].forEach(opcion => opcion.toggleAttribute('selected', opcion.value === originales[i].value));
      });
      writeFileSync(archivo, copia.innerHTML);
    }
  });
  observador.observe(document.body, { subtree: true, childList: true });
});
afterEach(() => observador.disconnect());
