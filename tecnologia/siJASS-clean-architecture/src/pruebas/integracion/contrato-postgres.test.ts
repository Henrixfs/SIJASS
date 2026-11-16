/**
 * Ejecuta, SIN modificarlas, las mismas baterías de contrato que `npm test` ejecuta
 * contra la memoria (spec `persistencia-mediciones`: «Batería de contrato común»). Si una
 * implementación se comporta distinto, falla la batería, no se adapta el caso.
 *
 * Reversión (PT11) y concurrencia se repiten 10 veces, con un pool de al menos 10
 * conexiones, y las aserciones revisan las filas reales de `medicion` y
 * `operacion_idempotente` (design.md D10).
 */
import type pg from 'pg';
import { MedicionesPostgres } from '../../infraestructura/postgres/mediciones-postgres.js';
import { UnidadDeTrabajoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-postgres.js';
import { probarContratoRegistroIdempotente } from '../contrato/registro-idempotente.js';
import { probarContratoRepositorioMediciones } from '../contrato/repositorio-mediciones.js';
import { crearPool, sembrarReservorio } from './entorno.js';

/** Al menos tantas conexiones como envíos simultáneos de la prueba de concurrencia (10). */
const CONEXIONES_DEL_POOL = 12;
const REPETICIONES = 10;

async function contar(pool: pg.Pool, tabla: 'medicion' | 'operacion_idempotente', jassId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(`SELECT count(*) AS total FROM ${tabla} WHERE jass_id = $1`, [jassId]);
  return Number(rows[0].total); // `count(*)` llega como texto (bigint)
}

probarContratoRepositorioMediciones('PostgreSQL', async () => {
  const pool = crearPool(CONEXIONES_DEL_POOL);
  return {
    repositorio: new MedicionesPostgres(pool),
    sembrarReservorio: (jassId, reservorioId) => sembrarReservorio(pool, jassId, reservorioId),
    cerrar: () => pool.end(),
  };
});

probarContratoRegistroIdempotente(
  'PostgreSQL',
  async () => {
    const pool = crearPool(CONEXIONES_DEL_POOL);
    const mediciones = new MedicionesPostgres(pool);
    return {
      crearUnidadDeTrabajo: (decorar) => new UnidadDeTrabajoPostgres(pool, decorar),
      sembrarReservorio: (jassId, reservorioId) => sembrarReservorio(pool, jassId, reservorioId),
      buscarMedicion: (jassId, id) => mediciones.buscar(jassId, id),
      contarMediciones: (jassId) => contar(pool, 'medicion', jassId),
      contarReservas: (jassId) => contar(pool, 'operacion_idempotente', jassId),
      existeReserva: async (jassId, operationId) => {
        const { rows } = await pool.query('SELECT 1 FROM operacion_idempotente WHERE jass_id = $1 AND operation_id = $2', [
          jassId,
          operationId,
        ]);
        return rows.length > 0;
      },
      cerrar: () => pool.end(),
    };
  },
  { repeticiones: REPETICIONES },
);
