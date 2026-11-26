import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { revisarMovimiento, type HojaCss } from './guardia-movimiento';

const REDUCIR = '@media (prefers-reduced-motion: reduce) { :root { --paso-escalon: 0ms; } }';
const hoja = (css: string, nombre = 'prueba.css'): HojaCss[] => [{ nombre, css }];

describe('guardia del presupuesto de movimiento: lo que rechaza', () => {
  const malos: Array<[string, string, RegExp, string?]> = [
    ['transition: all', `.a { transition: all 120ms ease; } ${REDUCIR}`, /all/],
    ['transition-property: all', `.a { transition-property: all; transition-duration: 120ms; } ${REDUCIR}`, /transition-property: all/],
    ['una escala que parte de cero', `.a { transform: scale(0); } ${REDUCIR}`, /scale\(0\)/],
    ['ease-in', `.a { transition: transform 120ms ease-in; } ${REDUCIR}`, /ease-in/],
    ['más de 300 ms', `.a { animation: x 400ms ease; } @keyframes x { from { opacity: 0; } } ${REDUCIR}`, /400 ms supera 300 ms/],
    ['más de 300 ms escondido en una variable', `:root { --d: 500ms; } .a { transition: opacity var(--d); } ${REDUCIR}`, /500 ms supera 300 ms/],
    ['una propiedad de diseño', `.a { transition: width 120ms; } ${REDUCIR}`, /«width»/],
    ['fotogramas que animan el diseño', `@keyframes x { from { height: 0; } } ${REDUCIR}`, /anima «height»/],
    ['movimiento sin regla de movimiento reducido', '.a { transition: opacity 100ms; }', /prefers-reduced-motion/],
    ['la columna del panel fuera del panel', `.a { transition: grid-template-columns 200ms; } ${REDUCIR}`, /solo puede animarse en el panel/],
    ['un ciclo infinito corto', `.a { animation: x 500ms infinite; } @keyframes x { to { opacity: .5; } } ${REDUCIR}`, /ciclo infinito/],
  ];
  test.each(malos)('%s', (_nombre, css, esperado) => {
    const problemas = revisarMovimiento(hoja(css));
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas.join('\n')).toMatch(esperado);
  });

  test(':hover fuera de @media (hover: hover) en una hoja controlada', () => {
    const problemas = revisarMovimiento(hoja(`.a:hover { color: red; } ${REDUCIR}`), { hoverControlado: ['prueba.css'] });
    expect(problemas.join('\n')).toMatch(/:hover fuera de @media \(hover: hover\)/);
  });
});

describe('guardia del presupuesto de movimiento: lo que permite', () => {
  test('transform, opacity, colores, ease-in-out y duraciones por variable de 300 ms o menos', () => {
    const css = `:root { --d: 220ms; } .a { transition: transform var(--d) cubic-bezier(0.77, 0, 0.175, 1), opacity 120ms ease, background-color 140ms ease-in-out; }
      @keyframes k { from { opacity: 0; transform: translateY(4px); } } ${REDUCIR}`;
    expect(revisarMovimiento(hoja(css))).toEqual([]);
  });

  test('la columna del panel del personal', () => {
    expect(revisarMovimiento(hoja(`.m { transition: grid-template-columns 220ms ease; } ${REDUCIR}`, 'personal.css'))).toEqual([]);
  });

  test('ambiente muy lento y carga con repeticiones', () => {
    const css = `.o { animation: deriva 18s ease-in-out infinite alternate; } .e { animation: cargar 950ms ease-in-out 2 alternate; }
      @keyframes deriva { from { transform: translateX(-20px); } to { transform: translateX(20px); } } @keyframes cargar { to { opacity: .35; } } ${REDUCIR}`;
    expect(revisarMovimiento(hoja(css))).toEqual([]);
  });

  test(':hover dentro de @media (hover: hover) y (pointer: fine)', () => {
    const css = `@media (hover: hover) and (pointer: fine) { .a:hover { color: red; } } ${REDUCIR}`;
    expect(revisarMovimiento(hoja(css), { hoverControlado: ['prueba.css'] })).toEqual([]);
  });
});

describe('las hojas de estilo reales respetan el presupuesto', () => {
  // `new URL` es la de jsdom en este entorno; se parte de la cadena `file:` de este archivo.
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const hojas = readdirSync(raiz, { recursive: true, encoding: 'utf8' })
    .filter((ruta) => ruta.endsWith('.css'))
    .map((ruta) => ({ nombre: basename(ruta), css: readFileSync(join(raiz, ruta), 'utf8') }));

  test('hay hojas que revisar', () => {
    expect(hojas.map((h) => h.nombre)).toEqual(expect.arrayContaining(['estilos.css', 'premium.css', 'personal.css', 'ingreso.css', 'portal.css']));
  });

  test('sin incumplimientos', () => {
    const problemas = revisarMovimiento(hojas, { hoverControlado: ['personal.css', 'ingreso.css', 'portal.css'] });
    expect(problemas, problemas.join('\n')).toEqual([]);
  });
});
