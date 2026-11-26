import { ErrorDatoInvalido } from './errores.js';

/** DNI peruano: exactamente 8 dígitos. Es el identificador de acceso de toda cuenta (s2a, design.md D1). */
const DNI = /^[0-9]{8}$/;

export function esDni(valor: unknown): valor is string {
  return typeof valor === 'string' && DNI.test(valor);
}

/**
 * Valida y devuelve el DNI sin espacios en los extremos.
 * @throws ErrorDatoInvalido('documento-no-es-dni') si no tiene exactamente 8 dígitos.
 */
export function validarDni(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!DNI.test(texto)) throw new ErrorDatoInvalido('documento-no-es-dni', 'el DNI tiene 8 dígitos');
  return texto;
}

/** `12345678` → `•••••678`: solo se muestran los 3 últimos dígitos. */
export function enmascararDocumento(documento: string | null): string | null {
  if (documento === null) return null;
  return `${'•'.repeat(Math.max(0, documento.length - 3))}${documento.slice(-3)}`;
}
