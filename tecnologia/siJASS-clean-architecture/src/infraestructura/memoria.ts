import { ErrorMedicionDuplicada } from '../dominio/errores.js';
import type { Medicion } from '../dominio/medicion.js';
import type {
  DecoradorRepositorios,
  FiltroMediciones,
  RepositoriosTransaccion,
  RepositorioMediciones,
  RepositorioOperaciones,
  RepositorioReservorios,
  Reserva,
  ResultadoRegistro,
  TipoOperacion,
  UnidadDeTrabajo,
} from '../dominio/puertos.js';

const clave = (jassId: string, id: string) => `${jassId}:${id}`;

/** Orden del contrato: `tomadaEn` descendente y, ante empate, `id` ascendente. */
function compararParaListado(a: Medicion, b: Medicion): number {
  if (a.tomadaEn !== b.tomadaEn) return a.tomadaEn < b.tomadaEn ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Implementación en memoria de `RepositorioMediciones`, con clave (jassId, id). */
export class MedicionesMemoria implements RepositorioMediciones {
  constructor(private readonly items: Map<string, Medicion> = new Map()) {}

  async guardar(medicion: Medicion): Promise<void> {
    const k = clave(medicion.jassId, medicion.id);
    if (this.items.has(k)) throw new ErrorMedicionDuplicada(medicion.jassId, medicion.id);
    this.items.set(k, medicion);
  }

  async buscar(jassId: string, id: string): Promise<Medicion | undefined> {
    return this.items.get(clave(jassId, id));
  }

  async listar(jassId: string, filtro: FiltroMediciones): Promise<Medicion[]> {
    return [...this.items.values()]
      .filter((m) => m.jassId === jassId && m.reservorioId === filtro.reservorioId)
      .sort(compararParaListado);
  }
}

/** Implementación en memoria de `RepositorioReservorios`. */
export class ReservoriosMemoria implements RepositorioReservorios {
  constructor(private readonly items: Set<string> = new Set()) {}

  /** Siembra un reservorio de una JASS (datos de prueba). */
  agregar(jassId: string, reservorioId: string): void {
    this.items.add(clave(jassId, reservorioId));
  }

  async existeEnJass(jassId: string, reservorioId: string): Promise<boolean> {
    return this.items.has(clave(jassId, reservorioId));
  }
}

/** Fila de `operacion_idempotente` en memoria. */
export interface OperacionAlmacenada {
  readonly tipo: TipoOperacion;
  readonly payloadHash: string;
  readonly resultado?: ResultadoRegistro;
}

/** Implementación en memoria de `RepositorioOperaciones`, con clave (jassId, operationId). */
export class OperacionesMemoria implements RepositorioOperaciones {
  constructor(private readonly items: Map<string, OperacionAlmacenada> = new Map()) {}

  async reservar(jassId: string, operationId: string, payloadHash: string, tipo: TipoOperacion): Promise<Reserva> {
    const existente = this.items.get(clave(jassId, operationId));
    if (existente) {
      // Igual que en PostgreSQL (design.md D7): una reserva visible sin resultado es un error interno.
      if (!existente.resultado) throw new Error(`reserva sin resultado: ${jassId}/${operationId}`);
      return { nueva: false, payloadHash: existente.payloadHash, resultado: existente.resultado };
    }
    this.items.set(clave(jassId, operationId), Object.freeze({ tipo, payloadHash }));
    return { nueva: true };
  }

  async registrarResultado(jassId: string, operationId: string, resultado: ResultadoRegistro): Promise<void> {
    const k = clave(jassId, operationId);
    const existente = this.items.get(k);
    if (!existente) throw new Error(`operación no reservada: ${jassId}/${operationId}`);
    this.items.set(k, Object.freeze({ ...existente, resultado: Object.freeze({ ...resultado }) }));
  }
}

/** Estado confirmado de la base en memoria. Los valores guardados son inmutables. */
export interface EstadoMemoria {
  mediciones: Map<string, Medicion>;
  operaciones: Map<string, OperacionAlmacenada>;
  reservorios: Set<string>;
}

/**
 * Almacén compartido por todas las unidades de trabajo en memoria de una misma "base":
 * contiene el estado confirmado y la cola que serializa las transacciones.
 */
export class AlmacenMemoria {
  estado: EstadoMemoria = { mediciones: new Map(), operaciones: new Map(), reservorios: new Set() };
  /** Cola de transacciones (mutex): cada una espera a que termine la anterior. */
  cola: Promise<unknown> = Promise.resolve();

  /** Siembra un reservorio confirmado (datos de prueba). */
  agregarReservorio(jassId: string, reservorioId: string): void {
    this.estado.reservorios.add(clave(jassId, reservorioId));
  }

  buscarOperacion(jassId: string, operationId: string): OperacionAlmacenada | undefined {
    return this.estado.operaciones.get(clave(jassId, operationId));
  }
}

/**
 * `UnidadDeTrabajo` en memoria (design.md D6): un mutex serializa las transacciones y
 * cada una trabaja sobre una copia del estado, que solo se publica al confirmar.
 */
export class UnidadDeTrabajoMemoria implements UnidadDeTrabajo {
  constructor(
    readonly almacen: AlmacenMemoria = new AlmacenMemoria(),
    private readonly decorar?: DecoradorRepositorios,
  ) {}

  ejecutar<T>(trabajo: (repos: RepositoriosTransaccion) => Promise<T>): Promise<T> {
    const resultado = this.almacen.cola.then(() => this.ejecutarEnSerie(trabajo));
    this.almacen.cola = resultado.catch(() => undefined);
    return resultado;
  }

  private async ejecutarEnSerie<T>(trabajo: (repos: RepositoriosTransaccion) => Promise<T>): Promise<T> {
    const confirmado = this.almacen.estado;
    const copia: EstadoMemoria = {
      mediciones: new Map(confirmado.mediciones),
      operaciones: new Map(confirmado.operaciones),
      reservorios: new Set(confirmado.reservorios),
    };
    const repos: RepositoriosTransaccion = {
      mediciones: new MedicionesMemoria(copia.mediciones),
      operaciones: new OperacionesMemoria(copia.operaciones),
      reservorios: new ReservoriosMemoria(copia.reservorios),
    };
    const valor = await trabajo(this.decorar ? this.decorar(repos) : repos);
    this.almacen.estado = copia; // confirmar; si `trabajo` lanzó, la copia se descarta
    return valor;
  }
}
