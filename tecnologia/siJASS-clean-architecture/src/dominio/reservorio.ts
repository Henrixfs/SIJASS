import { ErrorDatoInvalido } from './errores.js';

export interface Reservorio {
  readonly id: string;
  readonly jassId: string;
  readonly nombre: string;
}

/** Nombre de 1 a 80 caracteres, sin espacios en los extremos (igual que la restricción de la base). */
export function validarNombreReservorio(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  if (nombre.length === 0 || nombre.length > 80) throw new ErrorDatoInvalido('nombre-invalido', '1 a 80 caracteres');
  return nombre;
}
