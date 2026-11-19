/**
 * Catálogo de métodos de medición. PROVISIONAL: pendiente de validación con las JASS
 * piloto (roadmap §7). Debe coincidir con la tabla `metodo_medicion` (design.md D4).
 */
export const METODOS_MEDICION = Object.freeze(['comparador-dpd', 'colorimetro'] as const);

export type CodigoMetodo = (typeof METODOS_MEDICION)[number];

/** Única unidad admitida para el cloro residual. */
export const UNIDAD_MEDICION = 'mg/L';

export type UnidadMedicion = typeof UNIDAD_MEDICION;

export function esMetodoDelCatalogo(valor: unknown): valor is CodigoMetodo {
  return typeof valor === 'string' && (METODOS_MEDICION as readonly string[]).includes(valor);
}

/** Descripción de cada método; debe coincidir con `metodo_medicion.descripcion` (migración 0001). */
export const DESCRIPCION_METODOS: Readonly<Record<CodigoMetodo, string>> = Object.freeze({
  'comparador-dpd': 'Comparador de color con reactivo DPD',
  colorimetro: 'Colorímetro',
});
