/**
 * Entorno compartido de las pruebas de integración contra PostgreSQL (design.md D10).
 *
 * Cada prueba siembra su propia JASS y su propio reservorio con UUID aleatorios, así que
 * no se trunca nada entre pruebas y pueden repetirse sin interferencia.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Lee `DATABASE_URL` y lanza un error claro si falta. `npm run test:integration` ya lo
 * comprueba antes de arrancar; esta segunda comprobación cubre la invocación directa de
 * `node --test dist/pruebas/integracion/*.test.js`, para que nunca se omita en silencio.
 */
export function obtenerDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'Falta DATABASE_URL: las pruebas de integración exigen un PostgreSQL migrado (docker compose up -d --wait; npm run migrar).',
    );
  }
  return url;
}

/** Pool para las pruebas. `max` debe ser al menos el número de envíos concurrentes (D10). */
export function crearPool(max = 12): pg.Pool {
  return new pg.Pool({ connectionString: obtenerDatabaseUrl(), max });
}

/** Crea la JASS (si no existe) y un reservorio suyo, ya confirmados. */
export async function sembrarReservorio(
  pool: pg.Pool,
  jassId: string,
  reservorioId: string,
): Promise<void> {
  await pool.query('INSERT INTO jass (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
    jassId,
    `jass-${jassId}`,
  ]);
  await pool.query('INSERT INTO reservorio (id, jass_id, nombre) VALUES ($1, $2, $3)', [
    reservorioId,
    jassId,
    `reservorio-${reservorioId}`,
  ]);
}

/** JASS y reservorio nuevos, con UUID aleatorios, ya sembrados. */
export async function sembrarEscenario(pool: pg.Pool): Promise<{ jassId: string; reservorioId: string }> {
  const jassId = randomUUID();
  const reservorioId = randomUUID();
  await sembrarReservorio(pool, jassId, reservorioId);
  return { jassId, reservorioId };
}
