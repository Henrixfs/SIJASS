import type pg from 'pg';
import type { ContextoTransaccion, DecoradorRepositoriosAcceso, RepositoriosAcceso, UnidadDeTrabajoAcceso } from '../../dominio/puertos-acceso.js';
import { aplicarContextoDeFilas } from './contexto-filas.js';
import {
  AsociadosPostgres,
  AuditoriaPostgres,
  CuotasPostgres,
  JassPostgres,
  MembresiasPostgres,
  PagosPostgres,
  ReservoriosJassPostgres,
  SesionesPostgres,
  UsuariosPostgres,
} from './acceso-postgres.js';
import type { Consultable } from './consultable.js';

export function repositoriosAccesoPostgres(db: Consultable): RepositoriosAcceso {
  return {
    jass: new JassPostgres(db),
    reservorios: new ReservoriosJassPostgres(db),
    usuarios: new UsuariosPostgres(db),
    membresias: new MembresiasPostgres(db),
    sesiones: new SesionesPostgres(db),
    asociados: new AsociadosPostgres(db),
    cuotas: new CuotasPostgres(db),
    pagos: new PagosPostgres(db),
    auditoria: new AuditoriaPostgres(db),
  };
}

/**
 * `UnidadDeTrabajoAcceso` sobre PostgreSQL: una transacción `READ COMMITTED` por invocación.
 * Confirma si `trabajo` se resuelve y revierte si lanza, propagando el error.
 */
export class UnidadDeTrabajoAccesoPostgres implements UnidadDeTrabajoAcceso {
  constructor(
    private readonly pool: pg.Pool,
    /** Costura de pruebas; en producción no se usa. */
    private readonly decorar?: DecoradorRepositoriosAcceso,
  ) {}

  async ejecutar<T>(trabajo: (repos: RepositoriosAcceso) => Promise<T>, contexto: ContextoTransaccion): Promise<T> {
    const cliente = await this.pool.connect();
    let conexionDanada: Error | undefined;
    try {
      await cliente.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await aplicarContextoDeFilas(cliente, contexto);
      const repos = repositoriosAccesoPostgres(cliente);
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
