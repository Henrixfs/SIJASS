/**
 * Corpus del asistente documental (s1d, design.md D5): tipos y validación estricta del
 * manifiesto. El asistente solo sirve texto de un corpus que haya superado esta validación.
 */

export type EstadoDocumento = 'aprobado' | 'ejemplo';
export type EstadoCorpus = EstadoDocumento;

export interface PaginaCorpus {
  readonly numero: number;
  readonly texto: string;
}

export interface DocumentoCorpus {
  readonly id: string;
  readonly titulo: string;
  readonly version: string;
  readonly estado: EstadoDocumento;
  readonly responsable: string;
  readonly paginas: readonly PaginaCorpus[];
}

export interface Corpus {
  readonly nombre: string;
  readonly documentos: readonly DocumentoCorpus[];
  /** `ejemplo` si algún documento es de ejemplo; `aprobado` solo si todos lo están. */
  readonly estado: EstadoCorpus;
}

/** El manifiesto no cumple el formato; el mensaje nombra el documento y el problema. */
export class ErrorCorpus extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCorpus';
  }
}

export const PREFIJO_EJEMPLO = 'EJEMPLO';

const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** @throws ErrorCorpus con el documento y el problema si el manifiesto no es válido. */
export function validarManifiesto(manifiesto: unknown): Corpus {
  if (!objeto(manifiesto)) throw new ErrorCorpus('manifiesto: debe ser un objeto JSON');
  const cabecera = manifiesto.corpus;
  if (!objeto(cabecera) || !texto(cabecera.nombre)) throw new ErrorCorpus('manifiesto: falta corpus.nombre');
  if (!Array.isArray(manifiesto.documentos) || manifiesto.documentos.length === 0) throw new ErrorCorpus('manifiesto: debe incluir al menos un documento');

  const ids = new Set<string>();
  const documentos: DocumentoCorpus[] = manifiesto.documentos.map((d: unknown, i: number) => {
    if (!objeto(d)) throw new ErrorCorpus(`documento #${i + 1}: debe ser un objeto`);
    const etiqueta = texto(d.id) ? `documento «${d.id}»` : `documento #${i + 1}`;
    for (const campo of ['id', 'titulo', 'version', 'responsable'] as const) {
      if (!texto(d[campo])) throw new ErrorCorpus(`${etiqueta}: falta ${campo}`);
    }
    const id = d.id as string;
    if (ids.has(id)) throw new ErrorCorpus(`${etiqueta}: identificador repetido`);
    ids.add(id);
    if (d.estado !== 'aprobado' && d.estado !== 'ejemplo') throw new ErrorCorpus(`${etiqueta}: estado desconocido (use «aprobado» o «ejemplo»)`);
    const titulo = (d.titulo as string).trim();
    if (d.estado === 'ejemplo' && !titulo.startsWith(PREFIJO_EJEMPLO)) {
      throw new ErrorCorpus(`${etiqueta}: un documento de ejemplo debe llevar el prefijo «${PREFIJO_EJEMPLO}» en su título`);
    }
    if (!Array.isArray(d.paginas) || d.paginas.length === 0) throw new ErrorCorpus(`${etiqueta}: debe tener al menos una página`);
    const paginas: PaginaCorpus[] = d.paginas.map((p: unknown, j: number) => {
      if (!objeto(p) || !Number.isInteger(p.numero)) throw new ErrorCorpus(`${etiqueta}: la página #${j + 1} no tiene un número entero`);
      if (p.numero !== j + 1) throw new ErrorCorpus(`${etiqueta}: las páginas deben numerarse desde 1 sin repetirse ni saltarse (la #${j + 1} dice ${String(p.numero)})`);
      if (!texto(p.texto)) throw new ErrorCorpus(`${etiqueta}: la página ${j + 1} está vacía`);
      return { numero: p.numero as number, texto: p.texto };
    });
    return { id, titulo, version: (d.version as string).trim(), estado: d.estado, responsable: (d.responsable as string).trim(), paginas };
  });

  const estado: EstadoCorpus = documentos.some((d) => d.estado === 'ejemplo') ? 'ejemplo' : 'aprobado';
  return { nombre: (cabecera.nombre as string).trim(), documentos, estado };
}
