import type { Medicion } from './medicion.js';

export type { Origen } from './medicion.js';

/**
 * Quién actúa. Lo construye la capa confiable del servidor (en la Etapa 2, la sesión);
 * nunca se toma del comando del cliente (design.md D2).
 */
export interface ContextoActor {
  readonly jassId: string;
  readonly usuarioId: string;
}

/** Reloj del servidor; fija `registradaEn` (design.md D3). */
export interface Reloj {
  ahora(): Date;
}

/** Asigna identificadores UUID a las mediciones (design.md D3). */
export interface GeneradorIds {
  nuevo(): string;
}

export interface FiltroMediciones {
  readonly reservorioId: string;
}

/**
 * Persistencia de mediciones. Toda implementación debe superar la batería de
 * `src/pruebas/contrato/repositorio-mediciones.ts`.
 */
export interface RepositorioMediciones {
  /**
   * Guarda una medición nueva.
   *
   * Precondición: `medicion.reservorioId` existe y pertenece a `medicion.jassId`. La
   * garantiza el caso de uso; PostgreSQL además la impone con una clave foránea.
   *
   * @throws ErrorMedicionDuplicada si ya existe una medición con el mismo par
   *   (`jassId`, `id`); la medición existente no se modifica. El mismo `id` en otra JASS
   *   no es un duplicado.
   */
  guardar(medicion: Medicion): Promise<void>;

  /** Devuelve la medición de esa JASS, o `undefined` si no existe en ella. */
  buscar(jassId: string, id: string): Promise<Medicion | undefined>;

  /**
   * Mediciones de un reservorio dentro de la JASS, de la toma más reciente a la más
   * antigua y, ante igual `tomadaEn`, por `id` ascendente. Un reservorio de otra JASS
   * produce una lista vacía.
   */
  listar(jassId: string, filtro: FiltroMediciones): Promise<Medicion[]>;
}

/** Consulta de reservorios de una JASS. */
export interface RepositorioReservorios {
  /** `true` solo si el reservorio existe y pertenece a esa JASS. */
  existeEnJass(jassId: string, reservorioId: string): Promise<boolean>;
}

export type TipoOperacion = 'registrar-medicion';

/** Resultado almacenado de una operación aceptada; se devuelve igual en `duplicate`. */
export interface ResultadoRegistro {
  readonly medicionId: string;
  readonly revision: number;
  readonly registradaEn: string;
}

/** Resultado de reservar (jassId, operationId). */
export type Reserva =
  | { readonly nueva: true }
  | { readonly nueva: false; readonly payloadHash: string; readonly resultado: ResultadoRegistro };

/** Registro de operaciones idempotentes (ADR-005, diseño interno §5.3). */
export interface RepositorioOperaciones {
  /**
   * Reserva la clave (jassId, operationId). Si ya existía, no la modifica y devuelve el
   * hash y el resultado almacenados. Solo es atómica dentro de una `UnidadDeTrabajo`.
   */
  reservar(jassId: string, operationId: string, payloadHash: string, tipo: TipoOperacion): Promise<Reserva>;

  /** Guarda el resultado de una operación reservada en esta misma unidad de trabajo. */
  registrarResultado(jassId: string, operationId: string, resultado: ResultadoRegistro): Promise<void>;
}

/** Repositorios vinculados a una única transacción. */
export interface RepositoriosTransaccion {
  readonly mediciones: RepositorioMediciones;
  readonly operaciones: RepositorioOperaciones;
  readonly reservorios: RepositorioReservorios;
}

/**
 * Ejecuta `trabajo` en una transacción: confirma todas sus escrituras si la promesa se
 * resuelve y las revierte todas si lanza, propagando el error.
 */
export interface UnidadDeTrabajo {
  ejecutar<T>(trabajo: (repos: RepositoriosTransaccion) => Promise<T>): Promise<T>;
}
