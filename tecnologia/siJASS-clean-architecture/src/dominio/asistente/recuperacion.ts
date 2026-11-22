/**
 * Recuperación léxica y extractiva sobre el corpus (s1d, design.md D1–D3). Es determinista:
 * sin red, sin modelo y sin aleatoriedad. Prefiere abstenerse a citar algo no relacionado.
 */
import type { Corpus } from './corpus.js';
import { contieneContenidoSanitarioRestringido, normalizar, referenciaSanitariaPermitida } from './guarda.js';

/** Máximo de citas por respuesta. */
export const MAX_CITAS = 3;
/** Puntuación mínima de una página para contar como evidencia. */
export const PUNTUACION_MINIMA = 1.0;
/** Largo máximo de un fragmento citado. */
export const MAX_FRAGMENTO = 300;
/** Largo máximo de una pregunta. */
export const MAX_PREGUNTA = 500;

const PALABRAS_VACIAS = new Set(
  ('que con por para del los las una uno unos unas como cual cuales cuando donde quien hay debe deben puede pueden hacer sobre entre sin mas muy ' +
    'esta este esto estos estas ese esa eso tiene tienen desde hasta cada todo toda todos todas ser son fue han les sus mis nos mismo misma parte ' +
    'sistema favor quiero necesito saber dime explica explicame dame').split(' '),
);

/** Términos distintos y relevantes de un texto: 3 o más caracteres y fuera de las palabras vacías. */
export function terminos(texto: string): string[] {
  const vistos = new Set<string>();
  for (const t of normalizar(texto).split(' ')) if (t.length >= 3 && !PALABRAS_VACIAS.has(t)) vistos.add(t);
  return [...vistos];
}

export interface Cita {
  readonly documentoId: string;
  readonly documento: string;
  readonly version: string;
  readonly pagina: number;
  readonly fragmento: string;
}

interface PaginaIndexada {
  readonly documentoId: string;
  readonly documento: string;
  readonly version: string;
  readonly numero: number;
  readonly texto: string;
  readonly frecuencias: Map<string, number>;
}

/** Índice de páginas con la frecuencia de cada término; se construye una vez por corpus. */
export class Indice {
  private readonly paginas: PaginaIndexada[] = [];
  private readonly df = new Map<string, number>();

  constructor(corpus: Corpus) {
    for (const d of corpus.documentos) {
      if (!referenciaSanitariaPermitida(d)) continue;
      for (const p of d.paginas) {
        // Se revisa la página completa antes de que una extracción o un recorte pierda el contexto.
        if (contieneContenidoSanitarioRestringido(p.texto)) continue;
        const frecuencias = new Map<string, number>();
        for (const t of normalizar(p.texto).split(' ')) {
          if (t.length < 3 || PALABRAS_VACIAS.has(t)) continue;
          frecuencias.set(t, (frecuencias.get(t) ?? 0) + 1);
        }
        for (const t of frecuencias.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
        this.paginas.push({ documentoId: d.id, documento: d.titulo, version: d.version, numero: p.numero, texto: p.texto, frecuencias });
      }
    }
  }

  /**
   * Hasta `MAX_CITAS` páginas con evidencia suficiente, de mayor a menor puntuación (empate:
   * documento y página ascendentes). Una página es evidencia si coincide con al menos 2 términos
   * de la pregunta (con todos si es uno solo), con al menos la mitad de ellos, y alcanza la
   * puntuación mínima. Lista vacía = el asistente debe abstenerse.
   */
  buscar(pregunta: string): Cita[] {
    const q = terminos(pregunta);
    if (q.length === 0) return [];
    const necesarios = Math.max(Math.min(2, q.length), Math.ceil(q.length / 2));
    const n = this.paginas.length;

    const candidatas: Array<{ pagina: PaginaIndexada; puntuacion: number; coincidentes: string[] }> = [];
    for (const pagina of this.paginas) {
      const coincidentes = q.filter((t) => pagina.frecuencias.has(t));
      if (coincidentes.length < necesarios) continue;
      let puntuacion = 0;
      for (const t of coincidentes) puntuacion += (1 + Math.log(pagina.frecuencias.get(t)!)) * Math.log(1 + n / (this.df.get(t) ?? 1));
      if (puntuacion < PUNTUACION_MINIMA) continue;
      candidatas.push({ pagina, puntuacion, coincidentes });
    }
    candidatas.sort((a, b) => b.puntuacion - a.puntuacion || (a.pagina.documentoId < b.pagina.documentoId ? -1 : a.pagina.documentoId > b.pagina.documentoId ? 1 : a.pagina.numero - b.pagina.numero));

    const citas: Cita[] = [];
    for (const { pagina, coincidentes } of candidatas) {
      const { documentoId, documento, version } = pagina;
      const fragmento = mejorFragmento(pagina.texto, coincidentes);
      if (contieneContenidoSanitarioRestringido(`${documentoId} ${documento} ${version} ${fragmento}`)) continue;
      citas.push({ documentoId, documento, version, pagina: pagina.numero, fragmento });
      if (citas.length === MAX_CITAS) break;
    }
    return citas;
  }
}

/**
 * La frase de la página con más términos coincidentes (la primera en caso de empate). Es una
 * subcadena literal de la página; solo si se recorta por largo se añade «…» al final.
 */
export function mejorFragmento(textoPagina: string, coincidentes: readonly string[]): string {
  const frases = textoPagina.split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter((f) => f.length > 0);
  let mejor = frases[0] ?? textoPagina.trim();
  let mejorPuntos = -1;
  for (const frase of frases) {
    const terminosFrase = new Set(normalizar(frase).split(' '));
    const puntos = coincidentes.filter((t) => terminosFrase.has(t)).length;
    if (puntos > mejorPuntos) {
      mejor = frase;
      mejorPuntos = puntos;
    }
  }
  if (mejor.length <= MAX_FRAGMENTO) return mejor;
  const corte = mejor.lastIndexOf(' ', MAX_FRAGMENTO);
  return `${mejor.slice(0, corte > 0 ? corte : MAX_FRAGMENTO)}…`;
}

/** Texto de la respuesta: solo fragmentos citados, nunca texto generado. */
export function componerRespuesta(citas: readonly Cita[]): string {
  return citas.map((c) => `Según «${c.documento}» (versión ${c.version}, p. ${c.pagina}): ${c.fragmento}`).join('\n');
}
