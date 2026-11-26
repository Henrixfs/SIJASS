/**
 * Claves generadas de tres palabras (s2a-acceso-dni-multi-jass, design.md D4).
 *
 * El dominio no sortea nada: el azar lo pone un `GeneradorClaves` (infraestructura). Aquí solo
 * viven el formato y la canonicalización con la que se aceptan las claves generadas.
 */
import { PALABRAS_CLAVE } from './palabras.js';

export { PALABRAS_CLAVE };

/** Palabras de una clave generada por defecto. */
export const PALABRAS_POR_CLAVE = 3;

/** Sorteo de enteros en `[0, maximo)`; lo implementa la infraestructura con una fuente criptográfica. */
export type Sorteo = (maximo: number) => number;

/** Genera una clave temporal con `cantidad` palabras al azar, unidas con guiones. */
export function generarClaveDePalabras(sorteo: Sorteo, cantidad: number = PALABRAS_POR_CLAVE): string {
  const palabras: string[] = [];
  for (let i = 0; i < cantidad; i += 1) palabras.push(PALABRAS_CLAVE[sorteo(PALABRAS_CLAVE.length)]);
  return palabras.join('-');
}

/**
 * Forma canónica con la que se compara una clave generada: minúsculas, sin tildes y con los
 * separadores (espacios o guiones, repetidos o sobrantes) reducidos a un solo guion.
 * `" Río  LUNA-maíz "` → `"rio-luna-maiz"`.
 */
export function canonicalizarClave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((parte) => parte.length > 0)
    .join('-');
}
