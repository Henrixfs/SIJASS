export type Perfil = 'personal' | 'asociado';

export const RUTA_INGRESO = '/ingresar';
export const RUTA_PERSONAL = '/personal';
export const RUTA_PORTAL = '/portal';

/** Pantalla de inicio de cada perfil. */
export function inicioDe(perfil: Perfil): string {
  return perfil === 'personal' ? RUTA_PERSONAL : RUTA_PORTAL;
}

/**
 * Guardia de pantallas: devuelve la ruta que se debe mostrar. Quien no inició sesión va al
 * ingreso; cada perfil solo ve las pantallas suyas y es redirigido a su inicio si pide otra.
 * (Es una comodidad de la interfaz: la autorización real la hace siempre el servidor.)
 */
export function destinoPara(perfil: Perfil | null, ruta: string): string {
  if (perfil === null) return RUTA_INGRESO;
  const propia = perfil === 'personal' ? RUTA_PERSONAL : RUTA_PORTAL;
  if (ruta === propia || ruta.startsWith(`${propia}/`)) return ruta;
  return propia;
}
