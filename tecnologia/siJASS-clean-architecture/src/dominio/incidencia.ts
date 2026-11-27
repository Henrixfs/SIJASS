/**
 * Incidencias de servicio reportadas por las familias (s1f-backend-incidencias).
 * Reglas puras: validación del reporte, ciclo de atención, matriz de prioridad y foto.
 * La sugerencia de prioridad organiza el trabajo; no es un diagnóstico sanitario.
 */
import { ErrorCargaExcesiva, ErrorConflicto, ErrorDatoInvalido, ErrorTipoNoAdmitido, ErrorValidacion } from './errores.js';
import { normalizarInstante } from './instante.js';

export const CATEGORIAS_INCIDENCIA = ['fuga', 'interrupcion', 'averia', 'presion', 'calidad-observada', 'otra'] as const;
export type CategoriaIncidencia = (typeof CATEGORIAS_INCIDENCIA)[number];

/** Declaración de quien reporta, nunca una afectación verificada. */
export const ALCANCES_REPORTADOS = ['individual', 'varias-viviendas', 'general', 'desconocido'] as const;
export type AlcanceReportado = (typeof ALCANCES_REPORTADOS)[number];

export const PRIORIDADES = ['baja', 'media', 'alta'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const ESTADOS_INCIDENCIA = ['registrada', 'en-atencion', 'cerrada'] as const;
export type EstadoIncidencia = (typeof ESTADOS_INCIDENCIA)[number];

/** Una prioridad por cada combinación exacta de categoría y alcance (24 en total). */
export type MatrizPrioridad = Readonly<Record<CategoriaIncidencia, Readonly<Record<AlcanceReportado, Prioridad>>>>;

const fila = (individual: Prioridad, varias: Prioridad, general: Prioridad, desconocido: Prioridad) =>
  Object.freeze({ individual, 'varias-viviendas': varias, general, desconocido });

/** Matriz por defecto, versión 0 (design.md, «Reglas de prioridad propuestas»). */
export const MATRIZ_POR_DEFECTO: MatrizPrioridad = Object.freeze({
  fuga: fila('media', 'alta', 'alta', 'media'),
  interrupcion: fila('media', 'alta', 'alta', 'media'),
  averia: fila('media', 'media', 'alta', 'media'),
  presion: fila('baja', 'media', 'alta', 'media'),
  'calidad-observada': fila('media', 'alta', 'alta', 'media'),
  otra: fila('baja', 'media', 'alta', 'baja'),
});

export interface ReglasPrioridad {
  readonly version: number;
  readonly reglas: MatrizPrioridad;
}

export const REGLAS_POR_DEFECTO: ReglasPrioridad = Object.freeze({ version: 0, reglas: MATRIZ_POR_DEFECTO });

export interface Sugerencia {
  readonly prioridad: Prioridad;
  /** `categoria:<valor>/alcance:<valor>` */
  readonly regla: string;
  readonly version: number;
}

export function sugerirPrioridad(categoria: CategoriaIncidencia, alcance: AlcanceReportado, vigentes: ReglasPrioridad): Sugerencia {
  return { prioridad: vigentes.reglas[categoria][alcance], regla: `categoria:${categoria}/alcance:${alcance}`, version: vigentes.version };
}

const esDe = <T extends string>(lista: readonly T[], valor: unknown): valor is T => typeof valor === 'string' && (lista as readonly string[]).includes(valor);

/**
 * Valida una matriz completa enviada por el Consejo: exactamente las 6 categorías y los 4 alcances,
 * sin claves de más, con valores del catálogo. Devuelve una copia congelada.
 */
export function validarMatriz(valor: unknown): MatrizPrioridad {
  const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!objeto(valor)) throw new ErrorDatoInvalido('reglas-invalidas', 'se espera un objeto por categoría');
  const categorias = Object.keys(valor);
  if (categorias.length !== CATEGORIAS_INCIDENCIA.length || !categorias.every((c) => esDe(CATEGORIAS_INCIDENCIA, c))) {
    throw new ErrorDatoInvalido('reglas-invalidas', 'deben estar las 6 categorías y solo ellas');
  }
  const salida: Partial<Record<CategoriaIncidencia, Readonly<Record<AlcanceReportado, Prioridad>>>> = {};
  for (const categoria of CATEGORIAS_INCIDENCIA) {
    const porAlcance = valor[categoria];
    if (!objeto(porAlcance)) throw new ErrorDatoInvalido('reglas-invalidas', `${categoria}: se espera un objeto por alcance`);
    const alcances = Object.keys(porAlcance);
    if (alcances.length !== ALCANCES_REPORTADOS.length || !alcances.every((a) => esDe(ALCANCES_REPORTADOS, a))) {
      throw new ErrorDatoInvalido('reglas-invalidas', `${categoria}: deben estar los 4 alcances y solo ellos`);
    }
    for (const alcance of ALCANCES_REPORTADOS) {
      if (!esDe(PRIORIDADES, porAlcance[alcance])) throw new ErrorDatoInvalido('reglas-invalidas', `${categoria}/${alcance}: prioridad inválida`);
    }
    salida[categoria] = Object.freeze(Object.fromEntries(ALCANCES_REPORTADOS.map((a) => [a, porAlcance[a]])) as Record<AlcanceReportado, Prioridad>);
  }
  return Object.freeze(salida as MatrizPrioridad);
}

export interface Incidencia {
  readonly id: string;
  readonly jassId: string;
  /** Cuenta del asociado que reporta. */
  readonly autorId: string;
  readonly asociadoId: string;
  readonly categoria: CategoriaIncidencia;
  readonly alcanceReportado: AlcanceReportado;
  readonly descripcion: string;
  readonly observadaEn: string;
  readonly ubicacion: string;
  readonly estado: EstadoIncidencia;
  readonly sugerencia: Sugerencia;
  /** Decisión humana; nula hasta que Consejo u Operación la confirma o corrige. */
  readonly prioridadConfirmada: Prioridad | null;
  readonly responsableId: string | null;
  /** Fecha de recepción del servidor. */
  readonly creadaEn: string;
  readonly revision: number;
  readonly claveIdempotencia: string;
  readonly payloadHash: string;
  readonly tieneFoto: boolean;
}

/** Contenido del reporte, ya validado: es lo que entra en el hash canónico de la creación. */
export interface ContenidoReporte {
  readonly categoria: CategoriaIncidencia;
  readonly alcanceReportado: AlcanceReportado;
  readonly descripcion: string;
  readonly observadaEn: string;
  readonly ubicacion: string;
}

export const TOLERANCIA_OBSERVACION_MS = 5 * 60 * 1000;
const CAMPOS_REPORTE = new Set(['categoria', 'alcanceReportado', 'descripcion', 'observadaEn', 'ubicacion']);

/** Texto recortado, no vacío y de longitud acotada. */
export function validarTexto(valor: unknown, codigo: string, maximo: number): string {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (texto.length === 0 || texto.length > maximo) throw new ErrorDatoInvalido(codigo, `de 1 a ${maximo} caracteres`);
  return texto;
}

/**
 * Valida el cuerpo de un reporte. Un campo de más (por ejemplo `jassId` o `estado`) se rechaza:
 * la JASS, el autor, la fecha de recepción y la prioridad los pone el servidor.
 */
export function validarReporte(cuerpo: Readonly<Record<string, unknown>>, recepcion: Date): ContenidoReporte {
  const extra = Object.keys(cuerpo).find((k) => !CAMPOS_REPORTE.has(k));
  if (extra !== undefined) throw new ErrorDatoInvalido('campo-no-permitido', extra);
  if (!esDe(CATEGORIAS_INCIDENCIA, cuerpo.categoria)) throw new ErrorDatoInvalido('categoria-invalida');
  if (!esDe(ALCANCES_REPORTADOS, cuerpo.alcanceReportado)) throw new ErrorDatoInvalido('alcance-invalido');
  const descripcion = validarTexto(cuerpo.descripcion, 'descripcion-invalida', 2000);
  const ubicacion = validarTexto(cuerpo.ubicacion, 'ubicacion-invalida', 300);
  let observadaEn: string;
  try {
    observadaEn = normalizarInstante(cuerpo.observadaEn);
  } catch (e) {
    if (e instanceof ErrorValidacion) throw new ErrorDatoInvalido('fecha-invalida', 'ISO 8601 con zona horaria');
    throw e;
  }
  if (new Date(observadaEn).getTime() > recepcion.getTime() + TOLERANCIA_OBSERVACION_MS) {
    throw new ErrorDatoInvalido('fecha-invalida', 'la observación no puede ser posterior a la recepción');
  }
  return { categoria: cuerpo.categoria, alcanceReportado: cuerpo.alcanceReportado, descripcion, observadaEn, ubicacion };
}

/** Transiciones admitidas: el resto se rechaza sin cambios. */
const TRANSICIONES: Readonly<Record<EstadoIncidencia, readonly EstadoIncidencia[]>> = {
  registrada: ['en-atencion'],
  'en-atencion': ['cerrada'],
  cerrada: ['en-atencion'],
};

/**
 * Comprueba un cambio de estado. El cierre exige la acción realizada y la reapertura (de cerrada a
 * en atención) exige el motivo: ambos llegan en `detalle`. Devuelve el detalle recortado o `null`.
 */
export function validarTransicion(actual: EstadoIncidencia, destino: unknown, detalle: unknown): { estado: EstadoIncidencia; detalle: string | null } {
  if (!esDe(ESTADOS_INCIDENCIA, destino)) throw new ErrorDatoInvalido('estado-invalido');
  if (!TRANSICIONES[actual].includes(destino)) throw new ErrorConflicto('transicion-invalida', `${actual} → ${destino}`);
  if (destino === 'cerrada') return { estado: destino, detalle: validarTexto(detalle, 'accion-requerida', 2000) };
  if (actual === 'cerrada') return { estado: destino, detalle: validarTexto(detalle, 'motivo-requerido', 2000) };
  const texto = typeof detalle === 'string' && detalle.trim() !== '' ? validarTexto(detalle, 'detalle-invalido', 2000) : null;
  return { estado: destino, detalle: texto };
}

/** Prioridad confirmada: si difiere de la sugerida exige motivo. */
export function validarPrioridad(sugerida: Prioridad, prioridad: unknown, motivo: unknown): { prioridad: Prioridad; motivo: string | null } {
  if (!esDe(PRIORIDADES, prioridad)) throw new ErrorDatoInvalido('prioridad-invalida');
  if (prioridad === sugerida) {
    const texto = typeof motivo === 'string' && motivo.trim() !== '' ? validarTexto(motivo, 'motivo-invalido', 300) : null;
    return { prioridad, motivo: texto };
  }
  return { prioridad, motivo: validarTexto(motivo, 'motivo-requerido', 300) };
}

export const VISIBILIDADES = ['publica', 'interna'] as const;
export type Visibilidad = (typeof VISIBILIDADES)[number];

export function validarVisibilidad(valor: unknown): Visibilidad {
  if (!esDe(VISIBILIDADES, valor)) throw new ErrorDatoInvalido('visibilidad-invalida');
  return valor;
}

/** Revisión optimista enviada por el cliente: entero positivo. */
export function validarRevision(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) throw new ErrorDatoInvalido('revision-invalida');
  return valor;
}

/** Evento del historial de una incidencia (solo inserción). */
export interface EventoIncidencia {
  readonly id: string;
  readonly jassId: string;
  readonly incidenciaId: string;
  readonly tipo: TipoEventoIncidencia;
  readonly actorId: string;
  /** `false` para notas y decisiones internas del personal. */
  readonly publico: boolean;
  readonly detalle: Readonly<Record<string, string | number | null>>;
  readonly creadoEn: string;
}

export type TipoEventoIncidencia =
  | 'creada'
  | 'estado'
  | 'prioridad'
  | 'responsable'
  | 'accion'
  | 'foto';

// ---------------------------------------------------------------------------
// Foto opcional (JPEG o PNG, hasta 5 MiB) sin metadatos.
// ---------------------------------------------------------------------------

export const LIMITE_FOTO_BYTES = 5 * 1024 * 1024;
export type TipoFoto = 'image/jpeg' | 'image/png';

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Tipo según la firma real del contenido, no según la extensión ni la cabecera. */
export function tipoDeFoto(bytes: Uint8Array): TipoFoto | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(FIRMA_PNG)) return 'image/png';
  return null;
}

/** Quita los segmentos APP1 (EXIF, XMP) de un JPEG. Lanza si la estructura no es válida. */
function jpegSinMetadatos(bytes: Buffer): Buffer {
  const partes: Buffer[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new ErrorDatoInvalido('foto-invalida', 'JPEG mal formado');
    const marcador = bytes[i + 1];
    // Inicio de la imagen comprimida: el resto se copia tal cual.
    if (marcador === 0xda) {
      partes.push(bytes.subarray(i));
      return Buffer.concat(partes);
    }
    if (marcador === 0xd9) {
      partes.push(bytes.subarray(i, i + 2));
      return Buffer.concat(partes);
    }
    if (i + 4 > bytes.length) throw new ErrorDatoInvalido('foto-invalida', 'JPEG truncado');
    const largo = bytes.readUInt16BE(i + 2);
    if (largo < 2 || i + 2 + largo > bytes.length) throw new ErrorDatoInvalido('foto-invalida', 'JPEG truncado');
    if (marcador !== 0xe1) partes.push(bytes.subarray(i, i + 2 + largo));
    i += 2 + largo;
  }
  throw new ErrorDatoInvalido('foto-invalida', 'JPEG sin datos de imagen');
}

const FRAGMENTOS_PNG_DESCARTADOS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);

/** Quita los fragmentos de texto y EXIF de un PNG. Lanza si la estructura no es válida. */
function pngSinMetadatos(bytes: Buffer): Buffer {
  const partes: Buffer[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const largo = bytes.readUInt32BE(i);
    const tipo = bytes.toString('latin1', i + 4, i + 8);
    const fin = i + 12 + largo;
    if (fin > bytes.length) throw new ErrorDatoInvalido('foto-invalida', 'PNG truncado');
    if (!FRAGMENTOS_PNG_DESCARTADOS.has(tipo)) partes.push(bytes.subarray(i, fin));
    i = fin;
    if (tipo === 'IEND') return Buffer.concat(partes);
  }
  throw new ErrorDatoInvalido('foto-invalida', 'PNG sin fragmento final');
}

export interface FotoLimpia {
  readonly tipo: TipoFoto;
  readonly bytes: Buffer;
}

/**
 * Valida la foto (tamaño, firma y que el tipo declarado coincida) y la devuelve sin metadatos.
 * Un formato no admitido o distinto del declarado: `ErrorTipoNoAdmitido` (415); más de 5 MiB: `ErrorCargaExcesiva` (413).
 */
export function limpiarFoto(entrada: Uint8Array, tipoDeclarado: string | undefined): FotoLimpia {
  if (entrada.length === 0) throw new ErrorDatoInvalido('foto-invalida', 'vacía');
  if (entrada.length > LIMITE_FOTO_BYTES) throw new ErrorCargaExcesiva('la foto admite hasta 5 MiB');
  const tipo = tipoDeFoto(entrada);
  const declarado = (tipoDeclarado ?? '').split(';')[0].trim().toLowerCase();
  if (tipo === null || declarado !== tipo) throw new ErrorTipoNoAdmitido();
  const bytes = Buffer.from(entrada);
  return { tipo, bytes: tipo === 'image/jpeg' ? jpegSinMetadatos(bytes) : pngSinMetadatos(bytes) };
}
