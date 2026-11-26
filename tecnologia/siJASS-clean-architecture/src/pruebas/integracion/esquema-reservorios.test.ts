/** Restricciones del esquema `0003` por SQL directo (tarea 1.1 de s1c). */
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import type pg from 'pg';
import { crearPool } from './entorno.js';

describe('esquema 0003 — reservorios únicos por JASS (PostgreSQL)', () => {
  let pool: pg.Pool;
  let jassA: string;
  let jassB: string;

  const insertar = (jassId: string, nombre: string) =>
    pool.query('INSERT INTO reservorio (id, jass_id, nombre) VALUES ($1, $2, $3)', [randomUUID(), jassId, nombre]);

  before(async () => {
    pool = crearPool();
    jassA = randomUUID();
    jassB = randomUUID();
    for (const j of [jassA, jassB]) await pool.query('INSERT INTO jass (id, nombre) VALUES ($1, $2)', [j, `jass-${j}`]);
  });
  after(async () => {
    await pool.end();
  });

  test('un reservorio válido se acepta', async () => {
    await insertar(jassA, 'Reservorio Central');
  });

  test('el mismo nombre en la misma JASS → 23505, también cambiando mayúsculas', async () => {
    for (const nombre of ['Reservorio Central', 'RESERVORIO CENTRAL', 'reservorio central']) {
      await assert.rejects(insertar(jassA, nombre), (e: unknown) => {
        assert.equal((e as { code?: string }).code, '23505');
        assert.equal((e as { constraint?: string }).constraint, 'reservorio_jass_nombre_key');
        return true;
      });
    }
  });

  test('el mismo nombre en otra JASS se admite', async () => {
    await insertar(jassB, 'Reservorio Central');
  });

  test('nombre vacío, solo espacios o de más de 80 caracteres → 23514', async () => {
    for (const nombre of ['', '   ', 'x'.repeat(81)]) {
      await assert.rejects(insertar(jassA, nombre), (e: unknown) => {
        assert.equal((e as { code?: string }).code, '23514');
        assert.equal((e as { constraint?: string }).constraint, 'reservorio_nombre_check');
        return true;
      });
    }
    await insertar(jassA, 'x'.repeat(80));
  });
});
