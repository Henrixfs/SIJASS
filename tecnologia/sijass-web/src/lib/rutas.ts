export type Perfil = 'personal' | 'asociado' | 'plataforma';

export const RUTA_INGRESO = '/ingresar';
export const RUTA_PERSONAL = '/personal';
export const RUTA_PORTAL = '/portal';
export const RUTA_PLATAFORMA = '/plataforma';

const INICIO: Record<Perfil, string> = { personal: RUTA_PERSONAL, asociado: RUTA_PORTAL, plataforma: RUTA_PLATAFORMA };

/** Pantalla de inicio de cada perfil. */
export function inicioDe(perfil: Perfil): string {
  return INICIO[perfil];
}

/**
 * Guardia de pantallas: devuelve la ruta que se debe mostrar. Quien no inició sesión va al
 * ingreso; cada perfil solo ve las pantallas suyas y es redirigido a su inicio si pide otra.
 * (Es una comodidad de la interfaz: la autorización real la hace siempre el servidor.)
 */
export function destinoPara(perfil: Perfil | null, ruta: string): string {
  if (perfil === null) return RUTA_INGRESO;
  const propia = INICIO[perfil];
  if (ruta === propia || ruta.startsWith(`${propia}/`)) return ruta;
  return propia;
}
