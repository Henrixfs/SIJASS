import { ErrorMedicionDuplicada } from '../dominio/errores.js';
import type { Medicion } from '../dominio/medicion.js';
import type { FiltroMediciones, RepositorioMediciones, RepositorioReservorios } from '../dominio/puertos.js';

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
