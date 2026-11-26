import type pg from 'pg';
import type { ContextoJass, DecoradorRepositorios, RepositoriosTransaccion, UnidadDeTrabajo } from '../../dominio/puertos.js';
import { aplicarContextoDeFilas } from './contexto-filas.js';
import { MedicionesPostgres } from './mediciones-postgres.js';
import { OperacionesPostgres } from './operaciones-postgres.js';
import { ReservoriosPostgres } from './reservorios-postgres.js';

/**
 * `UnidadDeTrabajo` sobre PostgreSQL (design.md D7): una transacción `READ COMMITTED` por
 * invocación. Confirma si `trabajo` se resuelve y revierte si lanza, propagando el error.
 */
export class UnidadDeTrabajoPostgres implements UnidadDeTrabajo {
  constructor(
    private readonly pool: pg.Pool,
    /** Costura de pruebas (design.md D6); en producción no se usa. */
    private readonly decorar?: DecoradorRepositorios,
  ) {}

  async ejecutar<T>(trabajo: (repos: RepositoriosTransaccion) => Promise<T>, contexto: ContextoJass): Promise<T> {
    const cliente = await this.pool.connect();
    // Si falla el ROLLBACK la conexión queda en un estado desconocido: se destruye en vez
    // de devolverla al pool.
    let conexionDanada: Error | undefined;
    try {
      await cliente.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await aplicarContextoDeFilas(cliente, contexto);
      const repos: RepositoriosTransaccion = {
        mediciones: new MedicionesPostgres(cliente),
        operaciones: new OperacionesPostgres(cliente),
        reservorios: new ReservoriosPostgres(cliente),
      };
      const valor = await trabajo(this.decorar ? this.decorar(repos) : repos);
      await cliente.query('COMMIT');
      return valor;
    } catch (error) {
      try {
        await cliente.query('ROLLBACK');
      } catch (errorRollback) {
        conexionDanada = errorRollback instanceof Error ? errorRollback : new Error(String(errorRollback));
      }
      throw error;
    } finally {
      cliente.release(conexionDanada);
    }
  }
}
