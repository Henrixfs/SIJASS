import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NOMBRE_BASE } from './playwright.config.js';

export const CLAVE_E2E = 'Clave-E2E-segura-123';
export const CORREO_CONSEJO_B = 'consejo@otra-jass.pe';

/**
 * Deja una base nueva `sijass_e2e` con el esquema migrado, la JASS de demostración
 * (tesorero, operador, tres asociados con cuenta) y una segunda JASS con su consejo.
 */
export default async function preparar(): Promise<void> {
  const admin = process.env.ADMIN_DATABASE_URL;
  if (!admin) throw new Error('Falta ADMIN_DATABASE_URL (conexión con permiso para crear la base sijass_e2e).');

  const cliente = new pg.Client({ connectionString: admin });
  await cliente.connect();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS ${NOMBRE_BASE} WITH (FORCE)`);
    await cliente.query(`CREATE DATABASE ${NOMBRE_BASE}`);
  } finally {
    await cliente.end();
  }

  const url = new URL(admin);
  url.pathname = `/${NOMBRE_BASE}`;
  const dirApi = fileURLToPath(new URL('../siJASS-clean-architecture/', import.meta.url));
  const entorno = { ...process.env, DATABASE_URL: url.toString() };
  const ejecutar = (args: string[], extra: Record<string, string> = {}) => {
    const r = spawnSync(process.execPath, args, { cwd: dirApi, env: { ...entorno, ...extra }, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Falló «node ${args.join(' ')}»:\n${r.stdout}\n${r.stderr}`);
  };

  ejecutar(['node_modules/node-pg-migrate/bin/node-pg-migrate.js', 'up', '-m', 'migraciones']);
  ejecutar(['dist/api/cli.js', 'sembrar-demo'], { SIJASS_PERMITIR_DEMO: '1', SIJASS_CLAVE_DEMO: CLAVE_E2E });
  ejecutar(['dist/api/cli.js', 'crear-jass', 'Otra JASS', CORREO_CONSEJO_B], { SIJASS_CLAVE_INICIAL: CLAVE_E2E });
}
