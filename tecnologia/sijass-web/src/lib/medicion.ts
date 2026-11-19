/** Conversión de lo que escribe la persona a lo que espera la API de mediciones (s1c, D6). */

/** Desplazamiento de Lima respecto de UTC; el Perú no usa horario de verano. */
const DESPLAZAMIENTO_LIMA = '-05:00';

/**
 * Valor en mg/L: hasta 3 enteros y 3 decimales, con punto o coma (`0.65`, `0,5`, `1`).
 * Devuelve `null` si no es un número no negativo con ese formato.
 */
export function parsearValor(texto: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,3}))?$/.exec(texto.trim());
  if (!m) return null;
  return Number(`${m[1]}.${m[2] ?? '0'}`);
}

/** `2026-11-19T09:30` (hora de Lima, de un `datetime-local`) → `2026-11-19T09:30:00-05:00`. */
export function tomadaEnLima(local: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00${DESPLAZAMIENTO_LIMA}` : null;
}

/** Instante → `AAAA-MM-DDTHH:mm` en hora de Lima, para precargar un `datetime-local`. */
export function ahoraEnLima(ahora: Date): string {
  return new Date(ahora.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** Instante ISO → texto corto en hora de Lima. */
export function formatearInstante(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
}

export const METODOS_TEXTO: Record<string, string> = {
  'comparador-dpd': 'Comparador de color DPD',
  colorimetro: 'Colorímetro',
};
