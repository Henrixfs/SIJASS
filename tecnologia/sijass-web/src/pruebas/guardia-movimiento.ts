/**
 * Guardia del presupuesto de movimiento (openspec `ui-movimiento-panel-plegable`, spec
 * `movimiento-de-interfaz`). Recorre el texto de las hojas de estilo y devuelve cada incumplimiento
 * como una frase; una lista vacía significa que el presupuesto se respeta. Es una función pura:
 * la prueba `movimiento.test.ts` la aplica a las hojas reales y a casos buenos y malos.
 */
export interface HojaCss {
  readonly nombre: string;
  readonly css: string;
}

export interface OpcionesGuardia {
  /** Hojas donde todo `:hover` debe ir dentro de `@media (hover: hover)` (solo puntero fino). */
  readonly hoverControlado?: readonly string[];
}

/** Propiedades que pueden animarse; la columna del panel es la única excepción de diseño documentada. */
const ANIMABLES = new Set(['transform', 'opacity', 'color', 'background-color', 'border-color']);
const SOLO_EN_KEYFRAMES = new Set(['transform', 'opacity']);
const COLUMNA_DEL_PANEL = 'grid-template-columns';
const MAXIMO_MS = 300;
const MINIMO_CICLO_MS = 2000;

const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Posición del `}` que cierra la llave abierta justo antes de `desde`. */
function cierre(css: string, desde: number): number {
  let profundidad = 1;
  for (let i = desde; i < css.length; i++) {
    if (css[i] === '{') profundidad++;
    else if (css[i] === '}' && --profundidad === 0) return i;
  }
  return css.length;
}

function partirPorComas(valor: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let actual = '';
  for (const c of valor) {
    if (c === '(') profundidad++;
    if (c === ')') profundidad--;
    if (c === ',' && profundidad === 0) {
      partes.push(actual.trim());
      actual = '';
    } else actual += c;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

function mapaDeVariables(hojas: readonly HojaCss[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const { css } of hojas) {
    for (const m of sinComentarios(css).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
      const lista = mapa.get(m[1]!) ?? [];
      lista.push(m[2]!.trim());
      mapa.set(m[1]!, lista);
    }
  }
  return mapa;
}

/** Sustituye `var(--x)` por todos los valores que `--x` toma en las hojas (conservador: se revisan todos). */
function expandir(valor: string, variables: Map<string, string[]>, nivel = 0): string[] {
  const m = /var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/.exec(valor);
  if (!m || nivel > 4) return [valor];
  const definidos = variables.get(m[1]!) ?? [''];
  return definidos.flatMap((d) => expandir(valor.replace(m[0], d), variables, nivel + 1));
}

function milisegundos(valor: string): number[] {
  return [...valor.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/g)].map((m) => Number(m[1]) * (m[2] === 's' ? 1000 : 1));
}

/** Una animación con `infinite` o con 2 o más repeticiones es ambiente o carga, no una transición de interfaz. */
function esAmbiente(valor: string): boolean {
  return /\binfinite\b/.test(valor) || valor.split(/\s+/).some((t) => /^\d+$/.test(t) && Number(t) >= 2);
}

export function revisarMovimiento(hojas: readonly HojaCss[], opciones: OpcionesGuardia = {}): string[] {
  const problemas: string[] = [];
  const variables = mapaDeVariables(hojas);

  for (const { nombre, css: crudo } of hojas) {
    const css = sinComentarios(crudo);
    const marca = (m: string) => problemas.push(`${nombre}: ${m}`);
    let hayMovimiento = false;

    // Declaraciones `animation`, `transition` y sus `-duration`.
    for (const m of css.matchAll(/(?<![\w-])(animation|transition)(-duration)?\s*:\s*([^;}]+)/g)) {
      const propiedad = m[1]! + (m[2] ?? '');
      const valor = m[3]!.replace(/!important/g, '').trim();
      if (valor !== 'none' && valor !== '0s' && valor !== '0ms') hayMovimiento = true;

      if (m[1] === 'transition' && !m[2]) {
        for (const parte of partirPorComas(valor)) {
          const nombrePropiedad = parte.split(/\s+/)[0]!;
          if (nombrePropiedad === 'none' || nombrePropiedad.startsWith('var(') || /^[\d.]/.test(nombrePropiedad)) continue;
          if (nombrePropiedad === 'all') marca(`transition: all en «${propiedad}: ${valor}»; nombra las propiedades`);
          else if (nombrePropiedad === COLUMNA_DEL_PANEL) {
            if (!/personal/.test(nombre)) marca(`la columna ${COLUMNA_DEL_PANEL} solo puede animarse en el panel del personal`);
          } else if (!ANIMABLES.has(nombrePropiedad)) marca(`se anima «${nombrePropiedad}»; solo transform, opacity y colores`);
        }
      }

      const ambiente = m[1] === 'animation' && esAmbiente(valor);
      for (const candidato of expandir(valor, variables)) {
        const tiempos = milisegundos(candidato);
        if (ambiente) {
          if (/\binfinite\b/.test(candidato) && tiempos.some((t) => t < MINIMO_CICLO_MS)) marca(`ciclo infinito de menos de ${MINIMO_CICLO_MS} ms en «${propiedad}: ${valor}»`);
          continue;
        }
        const largo = tiempos.find((t) => t > MAXIMO_MS);
        if (largo !== undefined) marca(`${largo} ms supera ${MAXIMO_MS} ms en «${propiedad}: ${valor}»`);
      }
    }

    for (const m of css.matchAll(/(?<![\w-])transition-property\s*:\s*([^;}]+)/g)) {
      hayMovimiento = true;
      if (/\ball\b/.test(m[1]!)) marca('transition-property: all; nombra las propiedades');
    }

    // Curvas y escalas prohibidas.
    if (/(?<![\w-])ease-in(?![\w-])/.test(css)) marca('usa «ease-in»; usa una salida fuerte o ease-in-out');
    if (/scale(?:3d|X|Y)?\(\s*0(?:\.0*)?\s*[,)]/.test(css)) marca('parte de scale(0); empieza en 0,9 a 0,97 con opacidad');

    // Los fotogramas solo mueven transform y opacity.
    for (const k of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      hayMovimiento = true;
      const cuerpo = css.slice(k.index + k[0].length, cierre(css, k.index + k[0].length));
      for (const d of cuerpo.matchAll(/([a-z-]+)\s*:/g)) {
        const propiedad = d[1]!;
        if (propiedad === 'animation-timing-function') continue;
        if (!SOLO_EN_KEYFRAMES.has(propiedad)) marca(`@keyframes ${k[1]} anima «${propiedad}»; solo transform y opacity`);
      }
    }

    // Todo archivo con movimiento declara qué hace con «reducir movimiento».
    if (hayMovimiento && !/prefers-reduced-motion/.test(css)) marca('tiene movimiento pero no tiene regla para prefers-reduced-motion');

    // Colores de «pasar el puntero» solo con puntero fino.
    if (opciones.hoverControlado?.includes(nombre)) {
      let resto = css;
      for (let m = /@media[^{]*\(\s*hover\s*:\s*hover\s*\)[^{]*\{/.exec(resto); m; m = /@media[^{]*\(\s*hover\s*:\s*hover\s*\)[^{]*\{/.exec(resto)) {
        resto = resto.slice(0, m.index) + resto.slice(cierre(resto, m.index + m[0].length) + 1);
      }
      for (const suelto of resto.matchAll(/([^{}]*:hover[^{]*)\{/g)) marca(`«${suelto[1]!.trim()}» usa :hover fuera de @media (hover: hover)`);
    }
  }
  return problemas;
}
