import type { ContextoJass } from '../../dominio/puertos.js';
import type { ContextoTransaccion } from '../../dominio/puertos-acceso.js';
import type { Consultable } from './consultable.js';

/** Rol sin privilegios de propietario bajo el que corre cada transacción (migración `0005`). */
export const ROL_APLICACION = 'sijass_app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Prepara la transacción en curso para la seguridad por filas (s2a, design.md D11): baja los
 * privilegios al rol de aplicación y fija la JASS de la solicitud o el modo de sistema. Todo es
 * local a la transacción: al confirmar o revertir, la conexión vuelve a su estado normal.
 *
 * - `{ jassId }`: solo se ven y se escriben filas de esa JASS (un identificador mal formado no
 *   llega a la base: se rechaza aquí).
 * - `{ sistema }` y `{ plataforma }`: identidad y administración, sin JASS. Las tablas de negocio
 *   no tienen salida para este modo, así que no ven ninguna fila.
 */
export async function aplicarContextoDeFilas(db: Consultable, contexto: ContextoTransaccion | ContextoJass): Promise<void> {
  await db.query(`SET LOCAL ROLE ${ROL_APLICACION}`);
  if ('jassId' in contexto) {
    if (!UUID.test(contexto.jassId)) throw new Error('contexto de transacción: la JASS no es un identificador válido');
    await db.query("SELECT set_config('app.jass_id', $1, true)", [contexto.jassId.toLowerCase()]);
    await db.query("SELECT set_config('app.sistema', 'off', true)");
    return;
  }
  await db.query("SELECT set_config('app.jass_id', '', true)");
  await db.query("SELECT set_config('app.sistema', 'on', true)");
}
