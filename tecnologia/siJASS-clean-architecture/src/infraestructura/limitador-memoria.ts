import { MAX_INTENTOS_POR_ORIGEN, VENTANA_ORIGEN_MS } from '../dominio/acceso.js';
import type { LimitadorDeIntentos } from '../dominio/puertos-acceso.js';

/**
 * Ventana deslizante en memoria: como máximo `maximo` intentos fallidos por origen en `ventanaMs`
 * (s2a, design.md D9). Se reinicia con el proceso y no se comparte entre instancias; con una
 * sola instancia basta, y el bloqueo por cuenta sigue protegiendo en la base de datos.
 */
export class LimitadorDeIntentosMemoria implements LimitadorDeIntentos {
  private readonly intentos = new Map<string, number[]>();

  constructor(
    private readonly maximo: number = MAX_INTENTOS_POR_ORIGEN,
    private readonly ventanaMs: number = VENTANA_ORIGEN_MS,
    /** Tope de orígenes recordados: evita que la memoria crezca sin límite. */
    private readonly maxOrigenes = 10_000,
  ) {}

  excedido(origen: string, ahora: Date): boolean {
    const t = ahora.getTime();
    return (this.intentos.get(origen) ?? []).filter((x) => t - x < this.ventanaMs).length >= this.maximo;
  }

  registrarFallo(origen: string, ahora: Date): void {
    const t = ahora.getTime();
    const vigentes = (this.intentos.get(origen) ?? []).filter((x) => t - x < this.ventanaMs);
    vigentes.push(t);
    this.intentos.delete(origen); // reinserta al final: los más recientes sobreviven a la poda
    this.intentos.set(origen, vigentes);
    if (this.intentos.size > this.maxOrigenes) {
      const masAntiguo = this.intentos.keys().next().value;
      if (masAntiguo !== undefined) this.intentos.delete(masAntiguo);
    }
  }
}
