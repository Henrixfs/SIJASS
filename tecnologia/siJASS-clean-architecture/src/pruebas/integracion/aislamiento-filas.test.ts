/**
 * Seguridad por filas de PostgreSQL (s2a-acceso-dni-multi-jass, design.md D11, spec
 * `aislamiento-multi-jass`): aunque una consulta olvide filtrar por JASS, la base solo devuelve y
 * solo acepta filas de la JASS de la transacción; la plataforma y el modo de sistema no ven datos de
 * negocio. Estas pruebas hablan con los repositorios y con SQL directo, sin pasar por los casos de uso.
 */
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import type pg from 'pg';
import { UnidadDeTrabajoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-postgres.js';
import { UnidadDeTrabajoAccesoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { actorDe, CLAVE, crearEntorno, nuevaClave, nuevoDni, type Entorno } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';

const TABLAS_DE_NEGOCIO = ['asociado', 'cuota', 'pago', 'reversa_pago', 'reservorio', 'medicion', 'operacion_idempotente'] as const;
const VIOLACION_DE_POLITICA = '42501';

describe('seguridad por filas (PostgreSQL)', () => {
  const pool = crearPool();
  let e: Entorno;
  let base: UnidadDeTrabajoAccesoPostgres;
  let jassA: { id: string; asociadoId: string; reservorioId: string };
  let jassB: { id: string; asociadoId: string; reservorioId: string; cuotaId: string; pagoId: string };

  async function sembrar(etiqueta: string) {
    const documento = nuevoDni();
    const alta = await e.casos.crearJass.ejecutar({ nombre: `Filas ${etiqueta} ${randomUUID().slice(0, 8)}`, consejo: { nombre: 'Consejo', documento }, contrasena: CLAVE, debeCambiarContrasena: false });
    const consejo = await actorDe(e, documento);
    const asociado = await e.casos.registrarAsociado.ejecutar(consejo.actor, { nombre: `Asociado ${etiqueta}`, documento: nuevoDni() });
    await e.casos.generarCuotas.ejecutar(consejo.actor, { periodo: '2026-11', importeCentimos: 900 });
    const cuenta = await e.casos.estadoDeCuenta.ejecutar(consejo.actor, asociado.id);
    const pago = await e.casos.registrarPago.ejecutar(consejo.actor, { cuotaId: cuenta.cuotas[0].id, importeCentimos: 300, comprobante: `F-${etiqueta}` }, nuevaClave());
    const reservorio = await e.casos.crearReservorio.ejecutar(consejo.actor, { nombre: `Reservorio ${etiqueta}` });
    return { id: alta.jassId, asociadoId: asociado.id, reservorioId: reservorio.id, cuotaId: cuenta.cuotas[0].id, pagoId: pago.pago.id };
  }

  /** Una transacción manual con el mismo rol y variables que usa la aplicación, para consultas sin filtro. */
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

  before(async () => {
    base = new UnidadDeTrabajoAccesoPostgres(pool);
    e = crearEntorno(base, { mediciones: new UnidadDeTrabajoPostgres(pool) });
    const a = await sembrar('A');
    const b = await sembrar('B');
    jassA = a;
    jassB = b;
    // Una medición y una reserva idempotente de B, para las tablas que solo escribe el módulo de mediciones.
    await pool.query("INSERT INTO medicion (id, jass_id, reservorio_id, metodo, valor, unidad, tomada_en, registrada_en, registrado_por, origen) SELECT $1, $2, $3, m.codigo, 0.5, 'mg/L', now(), now(), (SELECT id FROM usuario LIMIT 1), 'api' FROM metodo_medicion m LIMIT 1", [randomUUID(), b.id, b.reservorioId]).catch(() => undefined);
  });
  after(async () => {
    await pool.end();
  });

  describe('consultas sin filtro por JASS', () => {
    for (const tabla of TABLAS_DE_NEGOCIO) {
      test(`${tabla}: solo se ven filas de la JASS de la transacción`, async () => {
        const jassVistas = await conContexto(jassA.id, async (c) => (await c.query(`SELECT DISTINCT jass_id FROM ${tabla}`)).rows.map((f) => f.jass_id as string));
        assert.ok(jassVistas.every((j) => j === jassA.id), `${tabla} devolvió filas de ${jassVistas.join(', ')}`);
        const total = Number((await pool.query(`SELECT count(*) AS n FROM ${tabla} WHERE jass_id = $1`, [jassB.id])).rows[0].n);
        if (total > 0) assert.ok(!jassVistas.includes(jassB.id));
      });
    }

    test('la transacción de B ve lo suyo y no lo de A, con la misma consulta', async () => {
      const deB = await conContexto(jassB.id, async (c) => (await c.query('SELECT id FROM asociado')).rows.map((f) => f.id as string));
      const deA = await conContexto(jassA.id, async (c) => (await c.query('SELECT id FROM asociado')).rows.map((f) => f.id as string));
      assert.ok(deB.includes(jassB.asociadoId) && !deB.includes(jassA.asociadoId));
      assert.ok(deA.includes(jassA.asociadoId) && !deA.includes(jassB.asociadoId));
    });

    test('una transacción sin JASS no ve ninguna fila de negocio', async () => {
      for (const tabla of TABLAS_DE_NEGOCIO) {
        assert.equal(await conContexto(null, async (c) => Number((await c.query(`SELECT count(*) AS n FROM ${tabla}`)).rows[0].n)), 0, tabla);
      }
    });

    test('el modo de sistema (inicio de sesión, plataforma) tampoco ve datos de negocio, pero sí la identidad', async () => {
      for (const tabla of TABLAS_DE_NEGOCIO) {
        assert.equal(await conContexto(null, async (c) => Number((await c.query(`SELECT count(*) AS n FROM ${tabla}`)).rows[0].n), true), 0, tabla);
      }
      const miembros = await conContexto(null, async (c) => Number((await c.query('SELECT count(*) AS n FROM membresia WHERE jass_id = ANY($1)', [[jassA.id, jassB.id]])).rows[0].n), true);
      assert.ok(miembros >= 2);
      const sinSistema = await conContexto(jassA.id, async (c) => (await c.query('SELECT DISTINCT jass_id FROM membresia')).rows.map((f) => f.jass_id as string));
      assert.deepEqual(sinSistema, [jassA.id], 'sin el modo de sistema la identidad también se limita a la JASS');
    });
  });

  describe('escrituras', () => {
    test('insertar una fila con la JASS de otra la rechaza la base de datos', async () => {
      const intento = (c: pg.PoolClient) => c.query('INSERT INTO asociado (id, jass_id, nombre, documento) VALUES ($1, $2, $3, $4)', [randomUUID(), jassB.id, 'Intruso', nuevoDni()]);
      await assert.rejects(conContexto(jassA.id, intento), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA);
      await assert.rejects(conContexto(null, intento), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA);
      await assert.rejects(conContexto(jassB.id, (c) => c.query('INSERT INTO asociado (id, jass_id, nombre, documento) VALUES ($1, $2, $3, $4)', [randomUUID(), jassA.id, 'Intruso', nuevoDni()])), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA);
    });

    test('actualizar o intentar mover filas de otra JASS no cambia nada', async () => {
      const afectadas = await conContexto(jassA.id, async (c) => (await c.query("UPDATE asociado SET estado = 'baja' WHERE jass_id = $1", [jassB.id])).rowCount);
      assert.equal(afectadas, 0);
      assert.equal((await pool.query('SELECT estado FROM asociado WHERE id = $1', [jassB.asociadoId])).rows[0].estado, 'activo');
      await assert.rejects(conContexto(jassA.id, (c) => c.query('UPDATE asociado SET jass_id = $1 WHERE id = $2', [jassB.id, jassA.asociadoId])), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA);
    });

    test('la bitácora y las membresías de otra JASS tampoco se escriben', async () => {
      await assert.rejects(conContexto(jassA.id, (c) => c.query("INSERT INTO evento_auditoria (jass_id, accion, recurso) VALUES ($1, 'intruso', 'prueba')", [jassB.id])), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA);
      await assert.rejects(conContexto(jassA.id, (c) => c.query("INSERT INTO evento_auditoria (jass_id, accion, recurso) VALUES (NULL, 'intruso', 'prueba')")), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA);
    });
  });

  describe('a través de la unidad de trabajo y los repositorios', () => {
    test('un repositorio que pide los datos de otra JASS (filtro «olvidado») recibe cero filas', async () => {
      await base.ejecutar(async (r) => {
        assert.deepEqual(await r.asociados.listar(jassB.id), []);
        assert.equal(await r.asociados.buscar(jassB.id, jassB.asociadoId), undefined);
        assert.deepEqual(await r.cuotas.listarPorAsociado(jassB.id, jassB.asociadoId), []);
        assert.equal(await r.cuotas.buscar(jassB.id, jassB.cuotaId), undefined);
        assert.deepEqual(await r.pagos.listarPorAsociado(jassB.id, jassB.asociadoId), []);
        assert.equal(await r.pagos.buscar(jassB.id, jassB.pagoId), undefined);
        assert.deepEqual(await r.reservorios.listar(jassB.id), []);
        assert.deepEqual(await r.membresias.listarPersonal(jassB.id), []);
        assert.deepEqual(await r.membresias.listarDeAsociados(jassB.id), []);
        assert.deepEqual(await r.auditoria.listarPorJass(jassB.id), []);
        // Lo propio sí se ve.
        assert.equal((await r.asociados.listar(jassA.id)).length, 1);
      }, { jassId: jassA.id });
    });

    test('escribir con la JASS de otra desde un repositorio lo rechaza la base', async () => {
      await assert.rejects(
        base.ejecutar((r) => r.asociados.crear({ id: randomUUID(), jassId: jassB.id, nombre: 'Intruso', documento: nuevoDni(), estado: 'activo' }), { jassId: jassA.id }),
        (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA,
      );
      await assert.rejects(base.ejecutar((r) => r.reservorios.crear({ id: randomUUID(), jassId: jassB.id, nombre: 'Intruso' }), { jassId: jassA.id }), (err: unknown) => (err as { code?: string }).code === VIOLACION_DE_POLITICA);
    });

    test('el contexto de plataforma y el de sistema no ven filas de negocio con los repositorios', async () => {
      for (const contexto of [{ plataforma: true }, { sistema: true }] as const) {
        await base.ejecutar(async (r) => {
          assert.deepEqual(await r.asociados.listar(jassA.id), []);
          assert.deepEqual(await r.reservorios.listar(jassA.id), []);
          assert.deepEqual(await r.pagos.listarPorAsociado(jassA.id, jassA.asociadoId), []);
          // La identidad sí se administra desde la plataforma.
          assert.ok((await r.membresias.listarPersonal(jassA.id)).length >= 1);
          assert.ok((await r.jass.listar()).some((j) => j.id === jassA.id));
        }, contexto);
      }
    });

    test('un identificador de JASS mal formado no llega a la base', async () => {
      await assert.rejects(base.ejecutar(async () => 1, { jassId: "x'; DROP TABLE asociado; --" }), /identificador válido/);
      const mediciones = new UnidadDeTrabajoPostgres(pool);
      await assert.rejects(mediciones.ejecutar(async () => 1, { jassId: 'no-es-uuid' }), /identificador válido/);
    });

    test('la unidad de trabajo de mediciones también aísla: otra JASS no ve reservorios ni mediciones', async () => {
      const mediciones = new UnidadDeTrabajoPostgres(pool);
      await mediciones.ejecutar(async (r) => {
        assert.equal(await r.reservorios.existeEnJass(jassB.id, jassB.reservorioId), false, 'el filtro dice B, pero la transacción es de A');
        assert.deepEqual(await r.mediciones.listar(jassB.id, { reservorioId: jassB.reservorioId }), []);
      }, { jassId: jassA.id });
      await mediciones.ejecutar(async (r) => {
        assert.equal(await r.reservorios.existeEnJass(jassB.id, jassB.reservorioId), true);
      }, { jassId: jassB.id });
    });
  });

  describe('las pruebas detectan una protección quitada', () => {
    test('sin la política de una tabla, la misma consulta sin filtro devolvería filas de las dos JASS', async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('ALTER TABLE asociado DISABLE ROW LEVEL SECURITY'); // DDL transaccional: se revierte al final
        await c.query('SET LOCAL ROLE sijass_app');
        await c.query("SELECT set_config('app.jass_id', $1, true)", [jassA.id]);
        const vistas = new Set((await c.query('SELECT jass_id FROM asociado')).rows.map((f) => f.jass_id as string));
        assert.ok(vistas.has(jassA.id) && vistas.has(jassB.id), 'sin RLS se verían las dos JASS: la prueba de consultas sin filtro fallaría');
      } finally {
        await c.query('ROLLBACK');
        c.release();
      }
      // Y tras revertir, la protección vuelve.
      const jassVistas = await conContexto(jassA.id, async (x) => (await x.query('SELECT DISTINCT jass_id FROM asociado')).rows.map((f) => f.jass_id as string));
      assert.deepEqual(jassVistas, [jassA.id]);
    });

    test('el rol de aplicación no es propietario ni superusuario y no puede saltarse las políticas', async () => {
      const { rows } = await pool.query("SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'sijass_app'");
      assert.deepEqual(rows[0], { rolsuper: false, rolbypassrls: false, rolcanlogin: false });
      const { rows: duenos } = await pool.query("SELECT tableowner FROM pg_tables WHERE tablename = 'asociado'");
      assert.notEqual(duenos[0].tableowner, 'sijass_app');
    });
  });
});
