import type { RepositorioOperaciones, Reserva, ResultadoRegistro, TipoOperacion } from '../../dominio/puertos.js';
import type { Consultable } from './consultable.js';

/**
 * Implementación PostgreSQL de `RepositorioOperaciones` (design.md D7).
 *
 * La serialización de dos reservas simultáneas de la misma clave la hace el índice único
 * de la base, no la aplicación: la segunda transacción espera en el `INSERT` hasta que la
 * primera confirma (entonces no inserta y lee la fila ya visible) o revierte (entonces
 * procede). Por eso hay que usarla dentro de una transacción en `READ COMMITTED`.
 */
export class OperacionesPostgres implements RepositorioOperaciones {
  constructor(private readonly db: Consultable) {}

  async reservar(jassId: string, operationId: string, payloadHash: string, tipo: TipoOperacion): Promise<Reserva> {
    const insertada = await this.db.query(
      `INSERT INTO operacion_idempotente (jass_id, operation_id, tipo, payload_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (jass_id, operation_id) DO NOTHING
       RETURNING operation_id`,
      [jassId, operationId, tipo, payloadHash],
    );
    if (insertada.rows.length > 0) return { nueva: true };

    // En READ COMMITTED esta lectura ya ve la fila que acaba de confirmar la otra transacción.
    const { rows } = await this.db.query<{ payload_hash: string; resultado: ResultadoRegistro | null }>(
      'SELECT payload_hash, resultado FROM operacion_idempotente WHERE jass_id = $1 AND operation_id = $2',
      [jassId, operationId],
    );
    // Una fila confirmada siempre tiene `resultado` (se escribe antes del COMMIT). Si no, es
    // un error interno: nunca se devuelve un `accepted` inventado.
    if (rows.length === 0 || rows[0].resultado === null) {
      throw new Error(`reserva sin resultado: ${jassId}/${operationId}`);
    }
    return { nueva: false, payloadHash: rows[0].payload_hash, resultado: Object.freeze({ ...rows[0].resultado }) };
  }

  async registrarResultado(jassId: string, operationId: string, resultado: ResultadoRegistro): Promise<void> {
    const { rowCount } = await this.db.query(
      'UPDATE operacion_idempotente SET resultado = $3::jsonb WHERE jass_id = $1 AND operation_id = $2',
      [jassId, operationId, JSON.stringify(resultado)],
    );
    if (rowCount !== 1) throw new Error(`operación no reservada: ${jassId}/${operationId}`);
  }
}
