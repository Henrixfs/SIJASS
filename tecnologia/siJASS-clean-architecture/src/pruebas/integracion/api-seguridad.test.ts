/**
 * Seguridad de la API (tareas 4.1, 4.5 y 4.6): arranque sin secreto, secretos fuera de la
 * bitácora y de la base, errores internos sin detalles y órdenes de plataforma.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { CLAVE, nuevoDni, SECRETO_PRUEBAS } from '../entorno-acceso.js';
import { crearPool, obtenerDatabaseUrl } from './entorno.js';
import { crearMundo, type Mundo } from './entorno-api.js';

const dist = (archivo: string) => fileURLToPath(new URL(`../../api/${archivo}`, import.meta.url));

function ejecutar(archivo: string, args: string[], env: Record<string, string | undefined>) {
  const entorno: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env };
  return spawnSync(process.execPath, [dist(archivo), ...args], { env: entorno, encoding: 'utf8', timeout: 20000 });
}

describe('API — arranque y órdenes de plataforma (procesos reales)', () => {
  test('la API no arranca sin JWT_SECRET ni con uno de menos de 32 bytes', () => {
    for (const JWT_SECRET of [undefined, '', 'corto', 'x'.repeat(31)]) {
      const r = ejecutar('main.js', [], { JWT_SECRET, DATABASE_URL: obtenerDatabaseUrl(), PORT: '0' });
      assert.notEqual(r.status, 0, `JWT_SECRET=${String(JWT_SECRET)} no debía arrancar`);
      assert.match(r.stderr, /JWT_SECRET/);
    }
  });

  test('la API no arranca sin DATABASE_URL', () => {
    const r = ejecutar('main.js', [], { JWT_SECRET: SECRETO_PRUEBAS, PORT: '0' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /DATABASE_URL/);
  });

  test('crear-jass termina con código 1 y explica que falta SIJASS_CLAVE_INICIAL', () => {
    const r = ejecutar('cli.js', ['crear-jass', 'JASS Sin Clave', 'sin.clave@prueba.pe'], { DATABASE_URL: obtenerDatabaseUrl() });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SIJASS_CLAVE_INICIAL/);
  });

  test('crear-plataforma crea la cuenta sin JASS con la clave derivada, sin imprimirla, y exige SIJASS_CLAVE_INICIAL', async () => {
    const sinClave = ejecutar('cli.js', ['crear-plataforma', nuevoDni(), 'Equipo'], { DATABASE_URL: obtenerDatabaseUrl() });
    assert.equal(sinClave.status, 1);
    assert.match(sinClave.stderr, /SIJASS_CLAVE_INICIAL/);
    const documento = nuevoDni();
    const r = ejecutar('cli.js', ['crear-plataforma', documento, 'Equipo SIJASS'], { DATABASE_URL: obtenerDatabaseUrl(), SIJASS_CLAVE_INICIAL: CLAVE });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes(CLAVE) && !r.stderr.includes(CLAVE), 'la contraseña no debe imprimirse');
    const pool = crearPool(2);
    try {
      const { rows } = await pool.query(
        'SELECT u.hash_contrasena, u.debe_cambiar_contrasena, m.perfil, m.jass_id FROM usuario u JOIN membresia m ON m.usuario_id = u.id WHERE u.documento = $1',
        [documento],
      );
      assert.equal(rows[0].perfil, 'plataforma');
      assert.equal(rows[0].jass_id, null);
      assert.equal(rows[0].debe_cambiar_contrasena, true);
      assert.ok(!rows[0].hash_contrasena.includes(CLAVE));
    } finally {
      await pool.end();
    }
  });

  test('asignar-documento da DNI y nombre a una cuenta anterior que solo tenía correo', async () => {
    const pool = crearPool(2);
    const correo = `vieja.${Date.now()}@prueba.pe`;
    const documento = nuevoDni();
    try {
      const jassId = randomUUID();
      const usuarioId = randomUUID();
      await pool.query('INSERT INTO jass (id, nombre) VALUES ($1, $2)', [jassId, `JASS vieja ${jassId}`]);
      await pool.query('INSERT INTO usuario (id, correo, hash_contrasena) VALUES ($1, $2, $3)', [usuarioId, correo, 'scrypt$32768$8$1$c2Fs$aGFzaA']);
      await pool.query("INSERT INTO membresia (id, usuario_id, jass_id, perfil, rol) VALUES ($1, $2, $3, 'personal', 'tesorero')", [randomUUID(), usuarioId, jassId]);
      const r = ejecutar('cli.js', ['asignar-documento', correo, documento, 'Tesorero Antiguo'], { DATABASE_URL: obtenerDatabaseUrl() });
      assert.equal(r.status, 0, r.stderr);
      const { rows } = await pool.query('SELECT documento, nombre FROM usuario WHERE id = $1', [usuarioId]);
      assert.deepEqual(rows[0], { documento, nombre: 'Tesorero Antiguo' });
      const otra = ejecutar('cli.js', ['asignar-documento', 'nadie@prueba.pe', nuevoDni(), 'Nadie'], { DATABASE_URL: obtenerDatabaseUrl() });
      assert.equal(otra.status, 1);
      assert.match(otra.stderr, /cuenta-inexistente/);
    } finally {
      await pool.end();
    }
  });

  test('sembrar-demo se niega sin SIJASS_PERMITIR_DEMO=1', () => {
    const r = ejecutar('cli.js', ['sembrar-demo'], { DATABASE_URL: obtenerDatabaseUrl(), SIJASS_CLAVE_DEMO: CLAVE });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SIJASS_PERMITIR_DEMO/);
  });

  test('crear-jass crea la JASS y el consejo en PostgreSQL, y la contraseña no queda en claro', async () => {
    const documento = nuevoDni();
    const r = ejecutar('cli.js', ['crear-jass', `JASS CLI ${Date.now()}`, documento, 'Consejo CLI'], { DATABASE_URL: obtenerDatabaseUrl(), SIJASS_CLAVE_INICIAL: CLAVE });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes(CLAVE) && !r.stderr.includes(CLAVE), 'la contraseña no debe imprimirse');
    const pool = crearPool(2);
    try {
      const { rows } = await pool.query('SELECT u.hash_contrasena, m.rol FROM usuario u JOIN membresia m ON m.usuario_id = u.id WHERE u.documento = $1', [documento]);
      assert.equal(rows[0].rol, 'consejo');
      assert.ok(rows[0].hash_contrasena.startsWith('scrypt$32768$8$1$'), 'parámetros de producción');
      assert.ok(!rows[0].hash_contrasena.includes(CLAVE));
    } finally {
      await pool.end();
    }
  });
});

describe('API — secretos fuera de la bitácora y de la base; errores sin detalles', () => {
  const pool = crearPool();
  let m: Mundo;
  const secretos: string[] = [];

  before(async () => {
    m = await crearMundo(pool);
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  test('inicios de sesión fallidos, correctos y renovaciones no dejan contraseñas ni tokens en la auditoría', async () => {
    secretos.push(CLAVE, 'mala-contrasena-1', 'otra-mala-clave-2', SECRETO_PRUEBAS);
    for (const contrasena of ['mala-contrasena-1', 'otra-mala-clave-2']) {
      await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { documento: m.esc.operadorA.documento, contrasena } });
      await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { documento: '88888888', contrasena } });
    }
    const s = await m.api.iniciarSesion(m.esc.tesoreroA.documento);
    secretos.push(s.tokenAcceso, s.tokenRefresco);
    const r2 = await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: s.tokenRefresco } });
    secretos.push(r2.cuerpo.tokenAcceso, r2.cuerpo.tokenRefresco);
    await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: s.tokenRefresco } }); // reutilización
    for (const t of Object.values(m.token)) secretos.push(t);
    await m.api.peticion('GET', '/v1/asociados', { token: m.token.asociadoA1 }); // 403

    const { rows } = await pool.query('SELECT * FROM evento_auditoria WHERE jass_id = ANY($1) OR jass_id IS NULL', [[m.esc.jassA, m.esc.jassB]]);
    assert.ok(rows.length > 10);
    const texto = JSON.stringify(rows);
    for (const secreto of secretos) assert.ok(!texto.includes(secreto), `la auditoría contiene un secreto (${secreto.slice(0, 8)}…)`);
    assert.ok(!texto.includes('88888888'), 'el correo de una cuenta inexistente no se almacena');
    assert.ok(rows.some((f) => f.accion === 'sesion.fallida'));
    assert.ok(rows.some((f) => f.accion === 'sesion.reutilizada'));
  });

  test('la base no guarda contraseñas ni tokens en claro; el refresco solo existe como SHA-256', async () => {
    const s = await m.api.iniciarSesion(m.esc.consejoA.documento);
    const { rows: usuarios } = await pool.query('SELECT hash_contrasena FROM usuario WHERE documento = $1', [m.esc.consejoA.documento]);
    assert.ok(!usuarios[0].hash_contrasena.includes(CLAVE));
    const { rows: sesiones } = await pool.query('SELECT refresh_hash FROM sesion WHERE refresh_hash = ANY($1)', [[s.tokenRefresco, createHash('sha256').update(s.tokenRefresco).digest('hex')]]);
    assert.equal(sesiones.length, 1);
    assert.equal(sesiones[0].refresh_hash, createHash('sha256').update(s.tokenRefresco).digest('hex'));
    // Dos cuentas con la misma contraseña tienen derivaciones y sales distintas.
    const { rows: dos } = await pool.query('SELECT hash_contrasena FROM usuario WHERE documento = ANY($1)', [[m.esc.consejoA.documento, m.esc.tesoreroA.documento]]);
    assert.equal(dos.length, 2);
    assert.notEqual(dos[0].hash_contrasena, dos[1].hash_contrasena);
  });

  test('un fallo interno responde 500 genérico, sin SQL, trazas ni nombres internos', async () => {
    const rota = await crearMundo(pool, (repos) => ({
      ...repos,
      auditoria: {
        ...repos.auditoria,
        registrar: async (e) => {
          if (e.accion === 'cuotas.generadas') throw new Error('SELECT * FROM tabla_secreta WHERE clave = 12345 -- fallo interno');
          return repos.auditoria.registrar(e);
        },
        listarPorJass: repos.auditoria.listarPorJass,
        listarSinJass: repos.auditoria.listarSinJass,
      },
    }));
    try {
      const r = await rota.api.peticion('POST', '/v1/cuotas/generar', { token: rota.token.tesoreroA, cuerpo: { periodo: '2026-11', importeCentimos: 100 } });
      assert.equal(r.estado, 500);
      assert.deepEqual(r.cuerpo, { codigo: 'error-interno', mensaje: 'Error interno' });
      assert.ok(!/SELECT|tabla_secreta|12345|node_modules|\.js:/.test(r.texto));
      // Atomicidad: el fallo del evento revirtió las cuotas.
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM cuota WHERE jass_id = $1', [rota.esc.jassA]);
      assert.equal(rows[0].n, 0);
    } finally {
      await rota.api.cerrar();
    }
  });

  test('el cuerpo de un error de validación no repite datos sensibles del cliente', async () => {
    const r = await m.api.peticion('POST', '/v1/asociados', { token: m.token.tesoreroA, cuerpo: { nombre: 'Rosa', documento: '<script>alert(1)</script>' } });
    assert.equal(r.estado, 422);
    assert.ok(!r.texto.includes('<script>'));
  });
});
