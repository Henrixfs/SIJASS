import { randomInt } from 'node:crypto';
import { generarClaveDePalabras, PALABRAS_POR_CLAVE } from '../../dominio/claves/claves.js';
import type { GeneradorClaves } from '../../dominio/puertos-acceso.js';

/**
 * Genera claves temporales de palabras con una fuente criptográfica (`crypto.randomInt`).
 * `palabras` sale de `SIJASS_PALABRAS_CLAVE` (por defecto 3); con 4 la clave sube de 33 a 44 bits.
 */
export class GeneradorClavesAleatorio implements GeneradorClaves {
  constructor(private readonly palabras: number = PALABRAS_POR_CLAVE) {
    if (!Number.isInteger(palabras) || palabras < 3 || palabras > 6) throw new Error('SIJASS_PALABRAS_CLAVE debe estar entre 3 y 6');
  }

  generar(): string {
    return generarClaveDePalabras((maximo) => randomInt(maximo), this.palabras);
  }
}

/** Lee la cantidad de palabras del entorno; vacío equivale al valor por defecto. */
export function palabrasDeClaveDeEntorno(env: NodeJS.ProcessEnv): number {
  const valor = (env.SIJASS_PALABRAS_CLAVE ?? '').trim();
  return valor === '' ? PALABRAS_POR_CLAVE : Number(valor);
}
