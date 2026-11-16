import type { RepositorioReservorios } from '../../dominio/puertos.js';
import type { Consultable } from './consultable.js';

/** Implementación PostgreSQL de `RepositorioReservorios`. */
export class ReservoriosPostgres implements RepositorioReservorios {
  constructor(private readonly db: Consultable) {}

  async existeEnJass(jassId: string, reservorioId: string): Promise<boolean> {
    const { rows } = await this.db.query('SELECT 1 FROM reservorio WHERE id = $1 AND jass_id = $2', [reservorioId, jassId]);
    return rows.length > 0;
  }
}
