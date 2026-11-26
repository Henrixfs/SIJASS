/**
 * Restricciones del esquema `0004` (s2a-acceso-dni-multi-jass) comprobadas por SQL directo, sin
 * pasar por el dominio: DNI único y de 8 dígitos, correo opcional, estado y ubicación de la JASS y
 * membresía de plataforma.
 */
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import type pg from 'pg';
import { crearPool } from './entorno.js';

const VERIFICACION = '23514';
const DUPLICADO = '23505';
const SCRYPT = 'scrypt$32768$8$1$c2Fs$aGFzaA';

type Fila = Record<string, unknown>;

describe('esquema 0004 — identidad por documento (PostgreSQL)', () => {
  let pool: pg.Pool;
  let jassId: string;

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

  const dni = () => String(30_000_000 + Math.floor(Math.random() * 60_000_000));
  const usuario = (cambios: Fila = {}): Fila => ({ id: randomUUID(), documento: dni(), nombre: 'Persona', hash_contrasena: SCRYPT, ...cambios });
  const jass = (cambios: Fila = {}): Fila => ({ id: randomUUID(), nombre: `jass-${randomUUID()}`, ...cambios });

  before(async () => {
    pool = crearPool();
    jassId = randomUUID();
    await insertar('jass', jass({ id: jassId }));
  });
  after(async () => {
    await pool.end();
  });

  describe('usuario', () => {
    test('el correo es opcional y varias cuentas pueden no tenerlo', async () => {
      await insertar('usuario', usuario());
      await insertar('usuario', usuario({ correo: null }));
    });

    test('el documento debe tener exactamente 8 dígitos → 23514', async () => {
      for (const documento of ['1234567', '123456789', 'ABCDEFGH', '1234 567', '']) {
        await rechaza('usuario', usuario({ documento }), VERIFICACION, 'usuario_documento_check');
      }
    });

    test('el documento es único en todo el sistema → 23505', async () => {
      const documento = dni();
      await insertar('usuario', usuario({ documento }));
      await rechaza('usuario', usuario({ documento }), DUPLICADO, 'usuario_documento_key');
    });

    test('una cuenta sin documento sigue siendo válida (cuentas anteriores a s2a)', async () => {
      await insertar('usuario', usuario({ documento: null, nombre: null, correo: `${randomUUID()}@prueba.pe` }));
    });

    test('el nombre no puede ser vacío ni pasar de 120 caracteres → 23514', async () => {
      await rechaza('usuario', usuario({ nombre: '   ' }), VERIFICACION, 'usuario_nombre_check');
      await rechaza('usuario', usuario({ nombre: 'x'.repeat(121) }), VERIFICACION, 'usuario_nombre_check');
    });

    test('las banderas de clave empiezan en falso', async () => {
      const id = randomUUID();
      await insertar('usuario', usuario({ id }));
      const { rows } = await pool.query('SELECT clave_generada, debe_cambiar_contrasena FROM usuario WHERE id = $1', [id]);
      assert.deepEqual(rows[0], { clave_generada: false, debe_cambiar_contrasena: false });
    });
  });

  describe('jass', () => {
    test('el estado solo admite activa o suspendida → 23514; por defecto es activa', async () => {
      await rechaza('jass', jass({ estado: 'cerrada' }), VERIFICACION, 'jass_estado_check');
      const id = randomUUID();
      await insertar('jass', jass({ id }));
      assert.equal((await pool.query('SELECT estado FROM jass WHERE id = $1', [id])).rows[0].estado, 'activa');
    });

    test('mismo nombre y misma ubicación, sin distinguir mayúsculas → 23505; otro centro poblado es otra JASS', async () => {
      const nombre = `Rio ${randomUUID().slice(0, 8)}`;
      await insertar('jass', jass({ nombre, distrito: 'Huamanga', centro_poblado: 'Pacaycasa' }));
      await rechaza('jass', jass({ nombre: nombre.toUpperCase(), distrito: 'HUAMANGA', centro_poblado: 'PACAYCASA' }), DUPLICADO, 'jass_nombre_ubicacion_key');
      await insertar('jass', jass({ nombre, distrito: 'Huamanga', centro_poblado: 'Quinua' }));
      await insertar('jass', jass({ nombre }));
    });
  });

  describe('membresia', () => {
    const membresia = (usuarioId: string, cambios: Fila = {}): Fila => ({ id: randomUUID(), usuario_id: usuarioId, jass_id: jassId, perfil: 'personal', rol: 'operador', ...cambios });

    test('la plataforma es una membresía sin JASS, sin rol y sin asociado', async () => {
      const u = randomUUID();
      await insertar('usuario', usuario({ id: u }));
      await insertar('membresia', membresia(u, { perfil: 'plataforma', jass_id: null, rol: null }));
    });

    test('la plataforma con JASS o con rol → 23514', async () => {
      for (const cambios of [{ perfil: 'plataforma', jass_id: jassId, rol: null }, { perfil: 'plataforma', jass_id: null, rol: 'consejo' }]) {
        const u = randomUUID();
        await insertar('usuario', usuario({ id: u }));
        await rechaza('membresia', membresia(u, cambios), VERIFICACION, 'membresia_coherencia_check');
      }
    });

    test('el personal y el asociado siguen exigiendo JASS → 23514; un perfil desconocido → 23514', async () => {
      for (const [cambios, restriccion] of [
        [{ perfil: 'personal', jass_id: null, rol: 'operador' }, 'membresia_coherencia_check'],
        [{ perfil: 'asociado', jass_id: null, rol: null, asociado_id: randomUUID() }, 'membresia_coherencia_check'],
        // Un perfil desconocido incumple a la vez la lista de perfiles y la coherencia; PostgreSQL informa la primera.
        [{ perfil: 'invitado', rol: null }, 'membresia_coherencia_check'],
      ] as const) {
        const u = randomUUID();
        await insertar('usuario', usuario({ id: u }));
        await rechaza('membresia', membresia(u, cambios), VERIFICACION, restriccion);
      }
    });

    test('una cuenta sigue admitiendo una sola membresía activa → 23505', async () => {
      const u = randomUUID();
      await insertar('usuario', usuario({ id: u }));
      await insertar('membresia', membresia(u));
      await rechaza('membresia', membresia(u, { rol: 'tesorero' }), DUPLICADO, 'membresia_usuario_activa_key');
    });
  });
});
