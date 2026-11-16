import { createHash } from 'node:crypto';
import { contenidoCanonico } from '../dominio/contenido-canonico.js';
import type { TipoOperacion } from '../dominio/puertos.js';

/**
 * SHA-256 en hexadecimal del contenido canónico de la operación, calculado siempre por
 * el servidor; nunca se acepta un hash del cliente (design.md D5).
 */
export function hashOperacion(tipo: TipoOperacion, comando: object): string {
  return createHash('sha256').update(contenidoCanonico(tipo, comando), 'utf8').digest('hex');
}
