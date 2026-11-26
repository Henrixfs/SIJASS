const formato = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const ESPACIO_DURO = new RegExp(String.fromCharCode(160), 'g');

/** Muestra céntimos enteros como soles con dos decimales: `1500` → `S/ 15.00`. */
export function formatearSoles(centimos: number): string {
  return formato.format(centimos / 100).replace(ESPACIO_DURO, ' ');
}

export function fechaPago(fecha: string) {
  return new Date(fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' });
}

/**
 * Convierte el texto que escribe una persona (`15`, `15.5`, `15,50`) en céntimos enteros sin
 * pasar por coma flotante. Devuelve `null` si no es un monto válido y positivo.
 */
export function parsearSoles(texto: string): number | null {
  const m = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  const centimos = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return centimos > 0 && centimos <= 1_000_000_000 ? centimos : null;
}
