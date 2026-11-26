/**
 * Restricciones del esquema `0002` comprobadas por SQL directo, sin pasar por el dominio
 * (specs `acceso-por-perfiles`, `cuotas-y-pagos` y `auditoria-eventos`; tarea 1.1).
 */
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import type pg from 'pg';
import { crearPool } from './entorno.js';

const VERIFICACION = '23514';
const CLAVE_FORANEA = '23503';
const DUPLICADO = '23505';
const INTEGRIDAD = '23000';

const HASH = 'a'.repeat(64);
const SCRYPT = 'scrypt$32768$8$1$c2Fs$aGFzaA';

type Fila = Record<string, unknown>;

describe('esquema 0002 — restricciones de integridad (PostgreSQL)', () => {
  let pool: pg.Pool;
  let jassA: string;
  let jassB: string;
  let asociadoA: string;
  let asociadoB: string;
  let usuarioId: string;
  let cuotaA: string;

  async function insertar(tabla: string, fila: Fila): Promise<void> {
    const columnas = Object.keys(fila);
    const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores})`, Object.values(fila));
  }

  async function rechaza(tabla: string, fila: Fila, sqlstate: string, restriccion?: string): Promise<void> {
    await assert.rejects(insertar(tabla, fila), (error: unknown) => {
      const e = error as { code?: string; constraint?: string };
      assert.equal(e.code, sqlstate, `SQLSTATE esperado ${sqlstate}, recibido ${String(e.code)}`);
      if (restriccion !== undefined) assert.equal(e.constraint, restriccion);
      return true;
    });
  }

  const usuario = (cambios: Fila = {}): Fila => ({
    id: randomUUID(),
    correo: `${randomUUID()}@prueba.pe`,
    hash_contrasena: SCRYPT,
    ...cambios,
  });
  const asociado = (jassId: string, cambios: Fila = {}): Fila => ({
    id: randomUUID(),
    jass_id: jassId,
    nombre: 'Rosa Quispe',
    documento: randomUUID().slice(0, 12),
    ...cambios,
  });
  const cuota = (jassId: string, asociadoId: string, cambios: Fila = {}): Fila => ({
    id: randomUUID(),
    jass_id: jassId,
    asociado_id: asociadoId,
    periodo: '2026-11',
    importe_centimos: 1500,
    ...cambios,
  });
  const pago = (jassId: string, cuotaId: string, cambios: Fila = {}): Fila => ({
    id: randomUUID(),
    jass_id: jassId,
    cuota_id: cuotaId,
    importe_centimos: 500,
    pagado_en: '2026-11-19T15:00:00.000Z',
    comprobante: 'REC-0001',
    clave_idempotencia: randomUUID(),
    payload_hash: HASH,
    registrado_por: usuarioId,
    ...cambios,
  });

  before(async () => {
    pool = crearPool();
    jassA = randomUUID();
    jassB = randomUUID();
    for (const j of [jassA, jassB]) await insertar('jass', { id: j, nombre: `jass-${j}` });
    usuarioId = randomUUID();
    await insertar('usuario', usuario({ id: usuarioId }));
    asociadoA = randomUUID();
    asociadoB = randomUUID();
    await insertar('asociado', asociado(jassA, { id: asociadoA }));
    await insertar('asociado', asociado(jassB, { id: asociadoB }));
    cuotaA = randomUUID();
    await insertar('cuota', cuota(jassA, asociadoA, { id: cuotaA }));
  });

  after(async () => {
    await pool.end();
  });

  describe('usuario', () => {
    test('correo en mayúsculas → 23514', async () => {
      await rechaza('usuario', usuario({ correo: 'Mayus@Prueba.pe' }), VERIFICACION, 'usuario_correo_minusculas_check');
    });
    test('correo repetido → 23505', async () => {
      const correo = `${randomUUID()}@prueba.pe`;
      await insertar('usuario', usuario({ correo }));
      await rechaza('usuario', usuario({ correo }), DUPLICADO, 'usuario_correo_key');
    });
    test('contraseña en claro (sin prefijo scrypt) → 23514', async () => {
      await rechaza('usuario', usuario({ hash_contrasena: 'secreto123' }), VERIFICACION, 'usuario_hash_check');
    });
  });

  describe('asociado', () => {
    test('documento repetido en la misma JASS → 23505; en otra JASS se admite', async () => {
      const documento = `D${randomUUID().slice(0, 8)}`;
      await insertar('asociado', asociado(jassA, { documento }));
      await rechaza('asociado', asociado(jassA, { documento }), DUPLICADO, 'asociado_documento_key');
      await insertar('asociado', asociado(jassB, { documento }));
    });
    test('estado inválido → 23514', async () => {
      await rechaza('asociado', asociado(jassA, { estado: 'borrado' }), VERIFICACION, 'asociado_estado_check');
    });
  });

  describe('membresía', () => {
    const membresia = (usuario_id: string, jass_id: string, cambios: Fila = {}): Fila => ({
      id: randomUUID(),
      usuario_id,
      jass_id,
      perfil: 'personal',
      rol: 'tesorero',
      ...cambios,
    });

    test('segunda membresía activa de la misma cuenta → 23505', async () => {
      const u = randomUUID();
      await insertar('usuario', usuario({ id: u }));
      await insertar('membresia', membresia(u, jassA));
      await rechaza('membresia', membresia(u, jassB), DUPLICADO, 'membresia_usuario_activa_key');
    });
    test('una membresía inactiva no impide activar otra', async () => {
      const u = randomUUID();
      await insertar('usuario', usuario({ id: u }));
      await insertar('membresia', membresia(u, jassA, { estado: 'inactiva' }));
      await insertar('membresia', membresia(u, jassB));
    });
    test('membresía de asociado que apunta a un asociado de otra JASS → 23503', async () => {
      const u = randomUUID();
      await insertar('usuario', usuario({ id: u }));
      await rechaza(
        'membresia',
        membresia(u, jassA, { perfil: 'asociado', rol: null, asociado_id: asociadoB }),
        CLAVE_FORANEA,
        'membresia_asociado_fkey',
      );
    });
    test('perfil asociado con rol, o personal sin rol o con asociado → 23514', async () => {
      const u = randomUUID();
      await insertar('usuario', usuario({ id: u }));
      await rechaza('membresia', membresia(u, jassA, { perfil: 'asociado', rol: 'tesorero', asociado_id: asociadoA }), VERIFICACION, 'membresia_coherencia_check');
      await rechaza('membresia', membresia(u, jassA, { rol: null }), VERIFICACION, 'membresia_coherencia_check');
      await rechaza('membresia', membresia(u, jassA, { asociado_id: asociadoA }), VERIFICACION, 'membresia_coherencia_check');
    });
    test('dos cuentas activas para el mismo asociado → 23505', async () => {
      const a = randomUUID();
      await insertar('asociado', asociado(jassA, { id: a }));
      const u1 = randomUUID();
      const u2 = randomUUID();
      await insertar('usuario', usuario({ id: u1 }));
      await insertar('usuario', usuario({ id: u2 }));
      await insertar('membresia', membresia(u1, jassA, { perfil: 'asociado', rol: null, asociado_id: a }));
      await rechaza('membresia', membresia(u2, jassA, { perfil: 'asociado', rol: null, asociado_id: a }), DUPLICADO, 'membresia_asociado_activa_key');
    });
    test('rol desconocido → 23514', async () => {
      const u = randomUUID();
      await insertar('usuario', usuario({ id: u }));
      await rechaza('membresia', membresia(u, jassA, { rol: 'superusuario' }), VERIFICACION, 'membresia_rol_check');
    });
  });

  describe('cuota', () => {
    for (const importe of [0, -5]) {
      test(`importe ${importe} → 23514`, async () => {
        await rechaza('cuota', cuota(jassA, asociadoA, { periodo: '2026-01', importe_centimos: importe }), VERIFICACION, 'cuota_importe_check');
      });
    }
    for (const periodo of ['2026-13', '2026-00', '26-11', '2026/11', '2026-1']) {
      test(`periodo ${periodo} → 23514`, async () => {
        await rechaza('cuota', cuota(jassA, asociadoA, { periodo }), VERIFICACION, 'cuota_periodo_check');
      });
    }
    test('cuota duplicada por (asociado, periodo) → 23505', async () => {
      await rechaza('cuota', cuota(jassA, asociadoA), DUPLICADO, 'cuota_periodo_key');
    });
    test('cuota con asociado de otra JASS → 23503', async () => {
      await rechaza('cuota', cuota(jassA, asociadoB, { periodo: '2026-02' }), CLAVE_FORANEA, 'cuota_asociado_fkey');
    });
  });

  describe('pago y reversa', () => {
    test('pago válido (línea base)', async () => {
      await insertar('pago', pago(jassA, cuotaA));
    });
    test('importe 0 → 23514', async () => {
      await rechaza('pago', pago(jassA, cuotaA, { importe_centimos: 0 }), VERIFICACION, 'pago_importe_check');
    });
    test('comprobante vacío → 23514', async () => {
      await rechaza('pago', pago(jassA, cuotaA, { comprobante: '   ' }), VERIFICACION, 'pago_comprobante_check');
    });
    test('estado inválido → 23514', async () => {
      await rechaza('pago', pago(jassA, cuotaA, { estado: 'borrado' }), VERIFICACION, 'pago_estado_check');
    });
    test('pago sobre una cuota de otra JASS → 23503', async () => {
      await rechaza('pago', pago(jassB, cuotaA), CLAVE_FORANEA, 'pago_cuota_fkey');
    });
    test('misma clave de idempotencia en la misma JASS → 23505; en otra JASS se admite', async () => {
      const clave = randomUUID();
      await insertar('pago', pago(jassA, cuotaA, { clave_idempotencia: clave }));
      await rechaza('pago', pago(jassA, cuotaA, { clave_idempotencia: clave }), DUPLICADO, 'pago_clave_key');
      const cuotaB = randomUUID();
      await insertar('cuota', cuota(jassB, asociadoB, { id: cuotaB }));
      await insertar('pago', pago(jassB, cuotaB, { clave_idempotencia: clave }));
    });
    test('un pago se reversa una sola vez → 23505', async () => {
      const id = randomUUID();
      await insertar('pago', pago(jassA, cuotaA, { id }));
      const reversa = (): Fila => ({ id: randomUUID(), jass_id: jassA, pago_id: id, motivo: 'Error de digitación', actor_id: usuarioId, creada_en: '2026-11-19T16:00:00.000Z' });
      await insertar('reversa_pago', reversa());
      await rechaza('reversa_pago', reversa(), DUPLICADO, 'reversa_pago_pago_key');
    });
    test('reversa sin motivo → 23514', async () => {
      const id = randomUUID();
      await insertar('pago', pago(jassA, cuotaA, { id }));
      await rechaza('reversa_pago', { id: randomUUID(), jass_id: jassA, pago_id: id, motivo: ' ', actor_id: usuarioId, creada_en: '2026-11-19T16:00:00.000Z' }, VERIFICACION, 'reversa_pago_motivo_check');
    });
  });

  describe('evento_auditoria (solo inserción)', () => {
    let eventoId: string;
    before(async () => {
      eventoId = randomUUID();
      await insertar('evento_auditoria', { id: eventoId, jass_id: jassA, actor_id: usuarioId, accion: 'prueba.insertar', recurso: 'prueba' });
    });

    test('UPDATE → rechazado', async () => {
      await assert.rejects(pool.query("UPDATE evento_auditoria SET accion = 'otra' WHERE id = $1", [eventoId]), (e: unknown) => {
        assert.equal((e as { code?: string }).code, INTEGRIDAD);
        return true;
      });
    });
    test('DELETE → rechazado', async () => {
      await assert.rejects(pool.query('DELETE FROM evento_auditoria WHERE id = $1', [eventoId]), (e: unknown) => {
        assert.equal((e as { code?: string }).code, INTEGRIDAD);
        return true;
      });
    });
    test('TRUNCATE → rechazado', async () => {
      await assert.rejects(pool.query('TRUNCATE evento_auditoria'), (e: unknown) => {
        assert.equal((e as { code?: string }).code, INTEGRIDAD);
        return true;
      });
    });
    test('el evento sigue intacto', async () => {
      const { rows } = await pool.query('SELECT accion FROM evento_auditoria WHERE id = $1', [eventoId]);
      assert.equal(rows[0].accion, 'prueba.insertar');
    });
  });

  describe('migración reversible', () => {
    test('las tablas de 0002 existen', async () => {
      const { rows } = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)",
        [['usuario', 'asociado', 'membresia', 'sesion', 'cuota', 'pago', 'reversa_pago', 'evento_auditoria']],
      );
      assert.equal(rows.length, 8);
    });
  });
});
