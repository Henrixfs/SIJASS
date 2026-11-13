import { randomUUID } from 'node:crypto';
import type { GeneradorIds, Reloj } from '../dominio/puertos.js';

/** Reloj real del servidor. */
export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}

/** Identificadores UUID v4 aleatorios. */
export class GeneradorIdsAleatorio implements GeneradorIds {
  nuevo(): string {
    return randomUUID();
  }
}
