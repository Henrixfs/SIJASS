/**
 * Incidencias sobre PostgreSQL (s1f, tareas 2.1, 2.2 y 2.4): concurrencia real, historial de solo
 * inserción, restricciones y seguridad por filas de las tablas nuevas.
 */
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import type pg from 'pg';
import { MATRIZ_POR_DEFECTO } from '../../dominio/incidencia.js';
import { ErrorConflicto } from '../../dominio/errores.js';
import { UnidadDeTrabajoAccesoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { crearEntorno, nuevaClave, sembrarEscenario, type Entorno, type Escenario } from '../entorno-acceso.js';
import { jpegConExif } from '../fotos-prueba.js';
import { crearPool } from './entorno.js';

const TABLAS = ['incidencia', 'incidencia_evento', 'incidencia_reglas', 'incidencia_foto', 'incidencia_foto_operacion'] as const;
const VIOLACION_DE_POLITICA = '42501';
const reporte = (extra: Record<string, unknown> = {}) => ({
  categoria: 'fuga', alcanceReportado: 'individual', descripcion: 'Concurrencia', observadaEn: '2026-11-19T08:00:00-05:00', ubicacion: 'Mi casa', ...extra,
});
const conflicto = (e: unknown) => e instanceof ErrorConflicto;

describe('incidencias (PostgreSQL)', () => {
  const pool = crearPool(24);
  let e: Entorno;
  let esc: Escenario;
  let incidenciaA: string;

  before(async () => {
    e = crearEntorno(new UnidadDeTrabajoAccesoPostgres(pool));
    esc = await sembrarEscenario(e);
    incidenciaA = (await e.casos.registrarIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, reporte({ descripcion: 'Semilla A' }), nuevaClave())).incidencia.id;
    await e.casos.registrarAccionIncidencia.ejecutar(esc.consejoA.actor, incidenciaA, { revision: 1, descripcion: 'Nota', visibilidad: 'interna' });
    await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidenciaA, jpegConExif(), 'image/jpeg', nuevaClave(), '2');
    const vigentes = await e.casos.reglasPrioridad.ejecutar(esc.consejoA.actor);
    await e.casos.actualizarReglasPrioridad.ejecutar(esc.consejoA.actor, { version: vigentes.version, reglas: MATRIZ_POR_DEFECTO });
  });
  after(async () => {
    await pool.end();
  });

  async function conContexto<T>(jassId: string | null, trabajo: (c: pg.PoolClient) => Promise<T>, sistema = false): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE sijass_app');
      await c.query("SELECT set_config('app.jass_id', $1, true)", [jassId ?? '']);
      await c.query("SELECT set_config('app.sistema', $1, true)", [sistema ? 'on' : 'off']);
      return await trabajo(c);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  }

  describe('concurrencia', () => {
    test('diez creaciones simultáneas con la misma clave dejan una sola incidencia y todas la identifican', async () => {
      const clave = nuevaClave();
      const resultados = await Promise.all(Array.from({ length: 10 }, () => e.casos.registrarIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, reporte({ descripcion: 'Diez a la vez' }), clave)));
      const ids = new Set(resultados.map((r) => r.incidencia.id));
      assert.equal(ids.size, 1);
      assert.equal(resultados.filter((r) => !r.duplicado).length, 1);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM incidencia WHERE jass_id = $1 AND clave_idempotencia = $2', [esc.jassA, clave]);
      assert.equal(rows[0].n, 1);
      const eventos = await pool.query("SELECT count(*)::int AS n FROM incidencia_evento WHERE incidencia_id = $1 AND tipo = 'creada'", [[...ids][0]]);
      assert.equal(eventos.rows[0].n, 1);
    });

    test('dos modificaciones simultáneas de la misma revisión: una se confirma y la otra recibe 409', async () => {
      const { incidencia } = await e.casos.registrarIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, reporte({ descripcion: 'Carrera' }), nuevaClave());
      const intentos = await Promise.allSettled([
        e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined }),
        e.casos.registrarAccionIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 1, descripcion: 'A la vez', visibilidad: 'interna' }),
      ]);
      assert.equal(intentos.filter((r) => r.status === 'fulfilled').length, 1);
      const rechazo = intentos.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      assert.ok(conflicto(rechazo.reason), String(rechazo.reason));
      const { rows } = await pool.query('SELECT revision FROM incidencia WHERE id = $1', [incidencia.id]);
      assert.equal(rows[0].revision, 2);
      const eventos = await pool.query('SELECT count(*)::int AS n FROM incidencia_evento WHERE incidencia_id = $1', [incidencia.id]);
      assert.equal(eventos.rows[0].n, 2);
    });

    test('dos actualizaciones simultáneas de la misma versión de reglas: solo una se confirma', async () => {
      const vigentes = await e.casos.reglasPrioridad.ejecutar(esc.consejoA.actor);
      const intentos = await Promise.allSettled([0, 1].map(() => e.casos.actualizarReglasPrioridad.ejecutar(esc.consejoA.actor, { version: vigentes.version, reglas: MATRIZ_POR_DEFECTO })));
      assert.equal(intentos.filter((r) => r.status === 'fulfilled').length, 1);
      assert.ok(conflicto((intentos.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason));
      assert.equal((await e.casos.reglasPrioridad.ejecutar(esc.consejoA.actor)).version, vigentes.version + 1);
    });

    test('cinco cargas simultáneas de la misma foto con la misma clave guardan una sola vez', async () => {
      const { incidencia } = await e.casos.registrarIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, reporte({ descripcion: 'Foto a la vez' }), nuevaClave());
      const clave = nuevaClave();
      const resultados = await Promise.all(Array.from({ length: 5 }, () => e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', clave, '1')));
      assert.equal(resultados.filter((r) => !r.duplicado).length, 1);
      assert.equal(new Set(resultados.map((r) => r.resultado.sha256)).size, 1);
      const { rows } = await pool.query('SELECT revision FROM incidencia WHERE id = $1', [incidencia.id]);
      assert.equal(rows[0].revision, 2);
    });
  });

  describe('esquema', () => {
    test('el historial es de solo inserción, también para el propietario', async () => {
      await assert.rejects(pool.query("UPDATE incidencia_evento SET publico = true WHERE incidencia_id = $1", [incidenciaA]), /solo inserción/);
      await assert.rejects(pool.query('DELETE FROM incidencia_evento WHERE incidencia_id = $1', [incidenciaA]), /solo inserción/);
      await assert.rejects(pool.query('TRUNCATE incidencia_evento CASCADE'), /solo inserción/);
    });

    test('el rol de la aplicación no puede modificar ni el historial ni las reglas guardadas', async () => {
      for (const sql of ['UPDATE incidencia_evento SET publico = true', 'UPDATE incidencia_reglas SET version = version']) {
        await assert.rejects(conContexto(esc.jassA, (c) => c.query(sql)), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA, sql);
      }
    });

    test('las restricciones rechazan catálogos y textos inválidos', async () => {
      const insertar = (cambios: Record<string, unknown>) =>
        pool.query(
          `INSERT INTO incidencia (id, jass_id, autor_id, asociado_id, categoria, alcance_reportado, descripcion, observada_en, ubicacion,
             sugerencia_prioridad, sugerencia_regla, sugerencia_version, creada_en, clave_idempotencia, payload_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, 'r', 0, now(), $10, $11)`,
          [randomUUID(), esc.jassA, esc.asociadoA1.cuenta.usuarioId, esc.asociadoA1.id, cambios.categoria ?? 'fuga', cambios.alcance ?? 'general', cambios.descripcion ?? 'x', cambios.ubicacion ?? 'y', cambios.prioridad ?? 'alta', randomUUID(), cambios.hash ?? 'a'.repeat(64)],
        );
      for (const cambios of [{ categoria: 'lluvia' }, { alcance: 'barrio' }, { descripcion: '  ' }, { ubicacion: '' }, { prioridad: 'urgente' }, { hash: 'abc' }]) {
        await assert.rejects(insertar(cambios), (err: unknown) => (err as { code?: string }).code === '23514', JSON.stringify(cambios));
      }
    });

    test('la foto guarda solo JPEG o PNG y su tamaño coincide con los bytes', async () => {
      await assert.rejects(
        pool.query("INSERT INTO incidencia_foto (incidencia_id, jass_id, tipo, tamano, sha256, bytes, actor_id, guardada_en) VALUES ($1, $2, 'image/gif', 3, $3, '\\x010203', $4, now()) ON CONFLICT (incidencia_id) DO UPDATE SET tipo = EXCLUDED.tipo", [incidenciaA, esc.jassA, 'a'.repeat(64), esc.consejoA.usuarioId]),
        (err: unknown) => (err as { code?: string }).code === '23514',
      );
    });
  });

  describe('seguridad por filas de las tablas nuevas', () => {
    test('con la JASS B fijada no se ve ninguna fila de A en ninguna tabla de incidencias', async () => {
      for (const tabla of TABLAS) {
        const { rows } = await conContexto(esc.jassB, (c) => c.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE jass_id = $1`, [esc.jassA]));
        assert.equal(rows[0].n, 0, tabla);
        const propias = await conContexto(esc.jassA, (c) => c.query(`SELECT count(*)::int AS n FROM ${tabla}`));
        assert.ok(propias.rows[0].n > 0, `${tabla}: A debería ver sus filas`);
      }
    });

    test('el modo de sistema y la plataforma no ven datos de incidencias', async () => {
      for (const tabla of TABLAS) {
        const { rows } = await conContexto(null, (c) => c.query(`SELECT count(*)::int AS n FROM ${tabla}`), true);
        assert.equal(rows[0].n, 0, tabla);
      }
    });

    test('con la JASS B fijada no se puede escribir una fila de A', async () => {
      await assert.rejects(
        conContexto(esc.jassB, (c) => c.query("INSERT INTO incidencia_reglas (jass_id, version, reglas, actor_id, creada_en) VALUES ($1, 999, '{}'::jsonb, $2, now())", [esc.jassA, esc.consejoA.usuarioId])),
        (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA,
      );
      const { rowCount } = await conContexto(esc.jassB, (c) => c.query("UPDATE incidencia SET estado = 'cerrada' WHERE id = $1", [incidenciaA]));
      assert.equal(rowCount, 0);
    });
  });
});
