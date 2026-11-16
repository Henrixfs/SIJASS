import { esMetodoDelCatalogo, UNIDAD_MEDICION, type CodigoMetodo, type UnidadMedicion } from './catalogo.js';
import { ErrorValidacion } from './errores.js';
import { normalizarInstante } from './instante.js';

export type Origen = 'en-linea' | 'sincronizada';
export type EstadoMedicion = 'vigente' | 'anulada';

/**
 * Medición manual de cloro residual (diseño interno §4). SIJASS registra la lectura
 * obtenida en campo; nunca la estima a partir de una imagen ni la certifica.
 */
export interface Medicion {
  readonly id: string;
  readonly jassId: string;
  readonly reservorioId: string;
  readonly metodo: CodigoMetodo;
  readonly valor: number;
  readonly unidad: UnidadMedicion;
  /** Instante de la toma declarado por el operador, normalizado a UTC con milisegundos. */
  readonly tomadaEn: string;
  /** Instante de recepción fijado por el reloj del servidor, en UTC con milisegundos. */
  readonly registradaEn: string;
  readonly registradoPor: string;
  readonly origen: Origen;
  /** Solo presente cuando el comando aporta evidencia; nunca sustituye el valor. */
  readonly evidenciaId?: string;
  readonly estado: EstadoMedicion;
  /** Empieza en 1; se incrementará con cada corrección (RF08, fuera de este cambio). */
  readonly revision: number;
}

/** Comando del cliente. No contiene JASS, autor, hora de recepción, estado ni revisión. */
export interface ComandoRegistrarMedicion {
  readonly operationId: string;
  readonly reservorioId: string;
  readonly metodo: string;
  readonly valor: number;
  readonly unidad: string;
  readonly tomadaEn: string;
  readonly evidenciaId?: string;
}

/** Datos que aporta el servidor, nunca el comando (design.md D2 y D3). */
export interface DatosServidorMedicion {
  readonly jassId: string;
  readonly usuarioId: string;
  readonly origen: Origen;
  readonly id: string;
  readonly registradaEn: Date;
  readonly toleranciaMs: number;
}

/** Tolerancia por defecto entre la hora de toma y la de recepción (desfase del reloj). */
export const TOLERANCIA_TOMA_MS_POR_DEFECTO = 5 * 60_000;

/** Claves admitidas en el comando; cualquier otra da `campo-no-permitido`. */
export const CAMPOS_COMANDO_REGISTRAR = Object.freeze([
  'operationId',
  'reservorioId',
  'metodo',
  'valor',
  'unidad',
  'tomadaEn',
  'evidenciaId',
] as const);

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

/** Campos del comando que contienen UUID y se normalizan a minúsculas (design.md D1). */
const CAMPOS_UUID = ['operationId', 'reservorioId', 'evidenciaId'] as const;

/**
 * Devuelve una copia del comando con `operationId`, `reservorioId` y `evidenciaId` en
 * minúsculas cuando ya son UUID válidos; los demás campos (incluidos los no permitidos)
 * se conservan tal cual. Se aplica antes de calcular el hash y antes de guardar.
 */
export function normalizarIdentificadores(comando: ComandoRegistrarMedicion): ComandoRegistrarMedicion {
  const copia: Record<string, unknown> = { ...(comando as unknown as Record<string, unknown>) };
  for (const campo of CAMPOS_UUID) {
    const valor = copia[campo];
    if (esUuid(valor)) copia[campo] = valor.toLowerCase();
  }
  return copia as unknown as ComandoRegistrarMedicion;
}

/**
 * Valida el comando con reglas puras y construye una medición congelada. Las reglas se
 * comprueban en un orden fijo (design.md D1) y se informa la primera incumplida:
 * campos, identificadores, valor, unidad, método, fecha y tolerancia. La pertenencia del
 * reservorio a la JASS la comprueba la capa de aplicación, porque requiere un puerto.
 */
export function crearMedicion(comando: ComandoRegistrarMedicion, datos: DatosServidorMedicion): Medicion {
  const entrada = normalizarIdentificadores(comando) as unknown as Readonly<Record<string, unknown>>;

  for (const clave of Object.keys(entrada)) {
    if (!(CAMPOS_COMANDO_REGISTRAR as readonly string[]).includes(clave)) {
      throw new ErrorValidacion('campo-no-permitido', clave);
    }
  }

  if (!esUuid(entrada.reservorioId)) throw new ErrorValidacion('identificador-invalido', 'reservorioId');
  const evidenciaId = entrada.evidenciaId;
  if (evidenciaId !== undefined && !esUuid(evidenciaId)) {
    throw new ErrorValidacion('identificador-invalido', 'evidenciaId');
  }

  const valor = entrada.valor;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
    throw new ErrorValidacion('valor-invalido');
  }

  if (entrada.unidad !== UNIDAD_MEDICION) throw new ErrorValidacion('unidad-invalida');

  const metodo = entrada.metodo;
  if (!esMetodoDelCatalogo(metodo)) throw new ErrorValidacion('metodo-desconocido');

  const tomadaEn = normalizarInstante(entrada.tomadaEn);
  const registradaEn = datos.registradaEn.toISOString();
  if (Date.parse(tomadaEn) > datos.registradaEn.getTime() + datos.toleranciaMs) {
    throw new ErrorValidacion('toma-posterior-a-recepcion');
  }

  return Object.freeze({
    id: datos.id,
    jassId: datos.jassId,
    reservorioId: entrada.reservorioId,
    metodo,
    valor: valor === 0 ? 0 : valor, // normaliza -0 a 0
    unidad: UNIDAD_MEDICION,
    tomadaEn,
    registradaEn,
    registradoPor: datos.usuarioId,
    origen: datos.origen,
    ...(evidenciaId === undefined ? {} : { evidenciaId }),
    estado: 'vigente',
    revision: 1,
  });
}
