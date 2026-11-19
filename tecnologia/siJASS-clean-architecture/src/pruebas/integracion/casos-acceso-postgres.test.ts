/**
 * Las mismas baterías de acceso, padrón, cuotas, pagos y portal que corren en memoria
 * (`npm test`), ahora sobre PostgreSQL real (tareas 3.2 y 3.3).
 */
import { after, describe } from 'node:test';
import { UnidadDeTrabajoAccesoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { suiteAcceso } from '../contrato/casos-acceso.js';
import { suitePadron } from '../contrato/casos-padron.js';
import { suiteReservorios } from '../contrato/casos-reservorios.js';
import { crearPool } from './entorno.js';

describe('acceso y padrón (PostgreSQL)', () => {
  const pool = crearPool();
  after(async () => {
    await pool.end();
  });
  const fabrica = (decorar?: ConstructorParameters<typeof UnidadDeTrabajoAccesoPostgres>[1]) => new UnidadDeTrabajoAccesoPostgres(pool, decorar);

  describe('acceso', () => suiteAcceso(fabrica));
  describe('padrón, cuotas, pagos y portal', () => suitePadron(fabrica));
  describe('reservorios (s1c)', () => suiteReservorios(fabrica));
});
