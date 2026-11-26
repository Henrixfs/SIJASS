/**
 * Restricciones del esquema `0001` comprobadas por SQL directo, sin pasar por el dominio
 * (spec `persistencia-mediciones`: «Restricciones de integridad en la base», «Esquema
 * versionado y reversible» y «Catálogo de métodos coherente con el dominio»).
 */
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import type pg from 'pg';
import { METODOS_MEDICION } from '../../dominio/catalogo.js';
import { crearPool, sembrarEscenario, sembrarReservorio } from './entorno.js';

/** SQLSTATE de PostgreSQL. */
const VERIFICACION = '23514';
const CLAVE_FORANEA = '23503';
const DUPLICADO = '23505';

type Fila = Record<string, unknown>;

/** Medición válida por SQL; `cambios` sobrescribe columnas para provocar cada violación. */
function filaMedicion(jassId: string, reservorioId: string, cambios: Fila = {}): Fila {
  return {
    jass_id: jassId,
    id: randomUUID(),
    reservorio_id: reservorioId,
    metodo: 'comparador-dpd',
    valor: '0.65',
    unidad: 'mg/L',
    tomada_en: '2026-10-12T13:00:00.000Z',
    registrada_en: '2026-10-12T13:05:00.000Z',
    registrado_por: randomUUID(),
    origen: 'en-linea',
    estado: 'vigente',
    revision: 1,
    ...cambios,
  };
}

describe('esquema 0001 — restricciones de integridad (PostgreSQL)', () => {
  let pool: pg.Pool;
  let jassId: string;
  let reservorioId: string;

  before(async () => {
    pool = crearPool();
    ({ jassId, reservorioId } = await sembrarEscenario(pool));
  });

  after(async () => {
    await pool.end();
  });

  async function insertar(tabla: string, fila: Fila): Promise<void> {
    const columnas = Object.keys(fila);
    const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores})`, Object.values(fila));
  }

  /** Comprueba que la inserción falla con ese SQLSTATE y, si se indica, esa restricción. */
  async function rechaza(tabla: string, fila: Fila, sqlstate: string, restriccion?: string): Promise<void> {
    await assert.rejects(insertar(tabla, fila), (error: unknown) => {
      const e = error as { code?: string; constraint?: string };
      assert.equal(e.code, sqlstate, `SQLSTATE esperado ${sqlstate}, recibido ${String(e.code)}`);
      if (restriccion !== undefined) assert.equal(e.constraint, restriccion);
      return true;
    });
  }

  test('una medición válida insertada por SQL se acepta (línea base de los casos negativos)', async () => {
    await insertar('medicion', filaMedicion(jassId, reservorioId));
  });

  for (const valor of ['-1', 'NaN', 'Infinity', '-Infinity']) {
    test(`valor ${valor} insertado directamente → 23514 (medicion_valor_check)`, async () => {
      await rechaza('medicion', filaMedicion(jassId, reservorioId, { valor }), VERIFICACION, 'medicion_valor_check');
    });
  }

  test('unidad ppm → 23514 (medicion_unidad_check)', async () => {
    await rechaza('medicion', filaMedicion(jassId, reservorioId, { unidad: 'ppm' }), VERIFICACION, 'medicion_unidad_check');
  });

  test('método ausente de metodo_medicion → 23503 (medicion_metodo_fkey)', async () => {
    await rechaza('medicion', filaMedicion(jassId, reservorioId, { metodo: 'estimacion-imagen' }), CLAVE_FORANEA, 'medicion_metodo_fkey');
  });

  test('reservorio de otra JASS → 23503 (medicion_reservorio_fkey)', async () => {
    const otra = await sembrarEscenario(pool);
    // El reservorio de la JASS B referenciado desde la JASS A.
    await rechaza('medicion', filaMedicion(jassId, otra.reservorioId), CLAVE_FORANEA, 'medicion_reservorio_fkey');
  });

  test('estado fuera de dominio → 23514 (medicion_estado_check)', async () => {
    await rechaza('medicion', filaMedicion(jassId, reservorioId, { estado: 'borrada' }), VERIFICACION, 'medicion_estado_check');
  });

  test('origen fuera de dominio → 23514 (medicion_origen_check)', async () => {
    await rechaza('medicion', filaMedicion(jassId, reservorioId, { origen: 'manual' }), VERIFICACION, 'medicion_origen_check');
  });

  test('revisión menor que 1 → 23514 (medicion_revision_check)', async () => {
    await rechaza('medicion', filaMedicion(jassId, reservorioId, { revision: 0 }), VERIFICACION, 'medicion_revision_check');
  });

  test('(JASS, id) repetido → 23505 (medicion_pkey)', async () => {
    const fila = filaMedicion(jassId, reservorioId);
    await insertar('medicion', fila);
    await rechaza('medicion', fila, DUPLICADO, 'medicion_pkey');
  });

  test('el mismo id en dos JASS distintas es válido', async () => {
    const otra = await sembrarEscenario(pool);
    const id = randomUUID();
    await insertar('medicion', filaMedicion(jassId, reservorioId, { id }));
    await insertar('medicion', filaMedicion(otra.jassId, otra.reservorioId, { id }));
  });

  describe('operacion_idempotente', () => {
    const hash = 'a'.repeat(64);

    test('reserva duplicada (JASS, operationId) → 23505 (operacion_idempotente_pkey)', async () => {
      const fila = { jass_id: jassId, operation_id: randomUUID(), tipo: 'registrar-medicion', payload_hash: hash };
      await insertar('operacion_idempotente', fila);
      await rechaza('operacion_idempotente', fila, DUPLICADO, 'operacion_idempotente_pkey');
    });

    test('el mismo operationId en dos JASS distintas es válido', async () => {
      const otra = await sembrarEscenario(pool);
      const operationId = randomUUID();
      const base = { operation_id: operationId, tipo: 'registrar-medicion', payload_hash: hash };
      await insertar('operacion_idempotente', { jass_id: jassId, ...base });
      await insertar('operacion_idempotente', { jass_id: otra.jassId, ...base });
    });

    test('hash que no es SHA-256 hexadecimal en minúsculas → 23514', async () => {
      for (const malo of ['abc', 'A'.repeat(64), 'g'.repeat(64)]) {
        await rechaza(
          'operacion_idempotente',
          { jass_id: jassId, operation_id: randomUUID(), tipo: 'registrar-medicion', payload_hash: malo },
          VERIFICACION,
          'operacion_idempotente_hash_check',
        );
      }
    });

    test('tipo de operación desconocido → 23514', async () => {
      await rechaza(
        'operacion_idempotente',
        { jass_id: jassId, operation_id: randomUUID(), tipo: 'corregir-medicion', payload_hash: hash },
        VERIFICACION,
        'operacion_idempotente_tipo_check',
      );
    });

    test('JASS inexistente → 23503', async () => {
      await rechaza(
        'operacion_idempotente',
        { jass_id: randomUUID(), operation_id: randomUUID(), tipo: 'registrar-medicion', payload_hash: hash },
        CLAVE_FORANEA,
        'operacion_idempotente_jass_fkey',
      );
    });
  });
});

describe('esquema 0001 — estructura (pg_catalog)', () => {
  let pool: pg.Pool;

  before(() => {
    pool = crearPool();
  });

  after(async () => {
    await pool.end();
  });

  test('la migración 0001 está registrada y existen las cinco tablas', async () => {
    const migraciones = await pool.query<{ name: string }>('SELECT name FROM pgmigrations');
    assert.ok(migraciones.rows.some((f) => f.name === '0001_esquema-mediciones'));

    const tablas = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)",
      [['jass', 'reservorio', 'metodo_medicion', 'medicion', 'operacion_idempotente']],
    );
    assert.deepEqual(tablas.rows.map((f) => f.tablename).sort(), [
      'jass',
      'medicion',
      'metodo_medicion',
      'operacion_idempotente',
      'reservorio',
    ]);
  });

  for (const [restriccion, tabla] of [
    ['medicion_pkey', 'medicion'],
    ['operacion_idempotente_pkey', 'operacion_idempotente'],
  ] as const) {
    test(`la clave primaria de ${tabla} comienza por jass_id`, async () => {
      const { rows } = await pool.query<{ definicion: string }>(
        'SELECT pg_get_constraintdef(oid) AS definicion FROM pg_constraint WHERE conname = $1 AND contype = $2',
        [restriccion, 'p'],
      );
      assert.equal(rows.length, 1, `no existe la clave primaria ${restriccion}`);
      assert.match(rows[0].definicion, /^PRIMARY KEY \(jass_id, /);
    });
  }

  test('existe el índice (jass_id, reservorio_id, tomada_en) sobre medicion', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'medicion'",
    );
    assert.ok(
      rows.some((f) => f.indexdef.includes('(jass_id, reservorio_id, tomada_en)')),
      `índices de medicion: ${rows.map((f) => f.indexdef).join(' | ')}`,
    );
  });

  test('el catálogo metodo_medicion tiene exactamente los códigos de METODOS_MEDICION', async () => {
    const { rows } = await pool.query<{ codigo: string }>('SELECT codigo FROM metodo_medicion');
    assert.deepEqual(rows.map((f) => f.codigo).sort(), [...METODOS_MEDICION].sort());
  });

  test('sembrarReservorio acepta una JASS ya existente', async () => {
    const jassId = randomUUID();
    await sembrarReservorio(pool, jassId, randomUUID());
    await sembrarReservorio(pool, jassId, randomUUID());
  });
});
