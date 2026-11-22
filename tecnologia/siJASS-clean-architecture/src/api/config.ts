/**
 * Configuración de la API leída del entorno (design.md D2). La API **no arranca** sin un
 * `JWT_SECRET` de al menos 32 bytes ni sin `DATABASE_URL`: no hay valores por defecto.
 */
export interface ConfiguracionApi {
  readonly jwtSecret: string;
  readonly databaseUrl: string;
  readonly puerto: number;
  /** Orígenes autorizados para CORS; vacío = sin CORS (misma procedencia o proxy). */
  readonly origenesPermitidos: readonly string[];
  /** Directorio de la interfaz construida para servirla desde la API; `undefined` = no se sirve. */
  readonly directorioWeb: string | undefined;
}

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): ConfiguracionApi {
  const jwtSecret = env.JWT_SECRET ?? '';
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('Falta JWT_SECRET o tiene menos de 32 bytes: la API no arranca sin un secreto de firma suficiente.');
  }
  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (databaseUrl === '') throw new Error('Falta DATABASE_URL: la API no arranca sin base de datos.');
  const puerto = env.PORT === undefined || env.PORT === '' ? 3000 : Number(env.PORT);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) throw new Error(`PORT inválido: ${String(env.PORT)}`);
  const origenesPermitidos = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
  const directorioWeb = (env.WEB_DIR ?? '').trim() || undefined;
  return { jwtSecret, databaseUrl, puerto, origenesPermitidos, directorioWeb };
}
