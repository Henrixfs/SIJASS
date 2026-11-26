import { test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { crearPool, obtenerDatabaseUrl, sembrarEscenario } from './entorno.js';

test('el entorno exige DATABASE_URL y lo informa con un error claro', () => {
  const original = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;
    assert.throws(() => obtenerDatabaseUrl(), /Falta DATABASE_URL/);
    process.env.DATABASE_URL = '   ';
    assert.throws(() => obtenerDatabaseUrl(), /Falta DATABASE_URL/);
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});

test('el entorno se conecta a la base migrada y siembra una JASS con su reservorio', async () => {
  const pool = crearPool();
  try {
    const { jassId, reservorioId } = await sembrarEscenario(pool);
    const { rows } = await pool.query('SELECT jass_id FROM reservorio WHERE id = $1', [reservorioId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].jass_id, jassId);
  } finally {
    await pool.end();
  }
});
