/** Dobles de prueba deterministas de los puertos `Reloj` y `GeneradorIds` (design.md D3). */
import type { GeneradorIds, Reloj } from '../dominio/puertos.js';

/** Reloj detenido en un instante configurable; solo avanza cuando la prueba lo pide. */
export class RelojFijo implements Reloj {
  private instanteMs: number;

  constructor(instante: Date | string) {
    this.instanteMs = new Date(instante).getTime();
    if (!Number.isFinite(this.instanteMs)) throw new RangeError(`instante inválido: ${String(instante)}`);
  }

  ahora(): Date {
    return new Date(this.instanteMs); // copia: quien la reciba no puede mover el reloj
  }

  avanzar(milisegundos: number): void {
    this.instanteMs += milisegundos;
  }
}

/** UUID v4 válidos y predecibles: `00000000-0000-4000-8000-000000000001`, `…002`, … */
export class GeneradorIdsSecuencial implements GeneradorIds {
  private siguiente = 1;

  nuevo(): string {
    return `00000000-0000-4000-8000-${String(this.siguiente++).padStart(12, '0')}`;
  }
}
