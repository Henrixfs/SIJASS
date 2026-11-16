import type pg from 'pg';

/**
 * Lo mínimo que los repositorios PostgreSQL necesitan de la conexión: lo cumplen tanto
 * `pg.Pool` (consultas sueltas) como `pg.PoolClient` (dentro de una transacción).
 */
export interface Consultable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(texto: string, valores?: unknown[]): Promise<pg.QueryResult<R>>;
}
