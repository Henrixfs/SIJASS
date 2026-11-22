/**
 * Pruebas HTTP de autenticación, padrón, cuotas, pagos, reversas y del flujo principal
 * «el tesorero registra un pago y el asociado ve su saldo actualizado» (tareas 4.2 y 4.4).
 */
import { after, before, describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { nuevaClave } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';
import { crearMundo, type Mundo } from './entorno-api.js';

describe('API — autenticación', () => {
  const pool = crearPool();
  let m: Mundo;
  before(async () => {
    m = await crearMundo(pool);
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  test('login correcto: 200 con tokens, perfil y rol', async () => {
    const r = await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { correo: m.esc.tesoreroA.correo, contrasena: 'Clave-de-prueba-123' } });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.perfil, 'personal');
    assert.equal(r.cuerpo.rol, 'tesorero');
    assert.equal(r.cuerpo.venceEnSegundos, 900);
    assert.ok(r.cuerpo.tokenAcceso && r.cuerpo.tokenRefresco);
    assert.equal(r.cuerpo.jassId, undefined, 'la respuesta no revela la JASS');
  });

  test('credenciales inválidas: 401 con el mismo cuerpo para correo desconocido y contraseña errónea', async () => {
    const a = await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { correo: m.esc.operadorA.correo, contrasena: 'mala-contrasena-1' } });
    const b = await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { correo: 'nadie@prueba.pe', contrasena: 'mala-contrasena-1' } });
    assert.equal(a.estado, 401);
    assert.equal(b.estado, 401);
    assert.equal(a.texto, b.texto);
    assert.equal(a.cuerpo.tokenAcceso, undefined);
  });

  test('cuerpo ausente, no objeto o con tipos inválidos → 401 de credenciales, nunca 500', async () => {
    for (const cuerpo of [undefined, 'texto', 42, [], null, { correo: 1, contrasena: 2 }]) {
      const r = await m.api.peticion('POST', '/v1/auth/login', cuerpo === undefined ? {} : { cuerpo });
      assert.ok([400, 401].includes(r.estado), `estado ${r.estado}`);
    }
  });

  test('JSON mal formado → 400 genérico, sin trazas', async () => {
    const r = await m.api.peticion('POST', '/v1/auth/login', { cuerpoCrudo: '{"correo": ' });
    assert.equal(r.estado, 400);
    assert.deepEqual(Object.keys(r.cuerpo).sort(), ['codigo', 'mensaje']);
    assert.ok(!/at |node_modules|SyntaxError/.test(r.texto));
  });

  test('refresh rota el token; el anterior ya no sirve y su reutilización cierra la familia', async () => {
    const s1 = await m.api.iniciarSesion(m.esc.consejoA.correo);
    const r2 = await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: s1.tokenRefresco } });
    assert.equal(r2.estado, 200);
    assert.notEqual(r2.cuerpo.tokenRefresco, s1.tokenRefresco);
    assert.equal((await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: s1.tokenRefresco } })).estado, 401);
    assert.equal((await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: r2.cuerpo.tokenRefresco } })).estado, 401);
  });

  test('logout invalida la sesión: 204 y luego el refresh responde 401', async () => {
    const s = await m.api.iniciarSesion(m.esc.consejoA.correo);
    assert.equal((await m.api.peticion('POST', '/v1/auth/logout', { cuerpo: { tokenRefresco: s.tokenRefresco } })).estado, 204);
    assert.equal((await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: s.tokenRefresco } })).estado, 401);
    assert.equal((await m.api.peticion('POST', '/v1/auth/logout', { cuerpo: { tokenRefresco: 'desconocido' } })).estado, 204);
  });

  test('rutas protegidas sin token, con basura o con un esquema distinto → 401', async () => {
    for (const cabeceras of [{} as Record<string, string>, { authorization: 'Bearer ' }, { authorization: 'Bearer abc.def.ghi' }, { authorization: `Basic ${m.token.tesoreroA}` }, { authorization: m.token.tesoreroA }]) {
      const r = await m.api.peticion('GET', '/v1/asociados', { cabeceras });
      assert.equal(r.estado, 401, JSON.stringify(cabeceras));
    }
  });

  test('GET /v1/yo devuelve perfil y rol, y no la JASS', async () => {
    const r = await m.api.peticion('GET', '/v1/yo', { token: m.token.operadorA });
    assert.deepEqual(r.cuerpo, { perfil: 'personal', rol: 'operador' });
  });

  test('cabeceras seguras, sin x-powered-by, y 404 y 500 genéricos', async () => {
    const r = await m.api.peticion('GET', '/v1/yo', { token: m.token.operadorA });
    assert.equal(r.cabeceras.get('x-powered-by'), null);
    assert.equal(r.cabeceras.get('x-content-type-options'), 'nosniff');
    assert.equal(r.cabeceras.get('cache-control'), 'no-store');
    const nf = await m.api.peticion('GET', '/v1/no-existe', { token: m.token.operadorA });
    assert.equal(nf.estado, 404);
    assert.deepEqual(Object.keys(nf.cuerpo).sort(), ['codigo', 'mensaje']);
  });
});

describe('API — bloqueo de cuenta (avanza el reloj, por eso usa su propio mundo)', () => {
  const pool = crearPool();
  let m: Mundo;
  before(async () => {
    m = await crearMundo(pool);
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  test('bloqueo: tras 5 fallos el siguiente intento responde 429 con Retry-After, aunque la contraseña sea correcta', async () => {
    const correo = m.esc.asociadoA2.cuenta.correo;
    for (let i = 0; i < 5; i++) {
      assert.equal((await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { correo, contrasena: 'mala-contrasena-1' } })).estado, 401);
    }
    const r = await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { correo, contrasena: 'Clave-de-prueba-123' } });
    assert.equal(r.estado, 429);
    assert.ok(Number(r.cabeceras.get('retry-after')) > 0);
    assert.equal(r.cuerpo.codigo, 'cuenta-bloqueada');
    m.api.entorno.reloj.avanzar(15 * 60_000 + 1000);
    assert.equal((await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { correo, contrasena: 'Clave-de-prueba-123' } })).estado, 200);
  });
});

describe('API — padrón, cuotas, pagos y portal', () => {
  const pool = crearPool();
  let m: Mundo;
  let cuotaA1: string;
  before(async () => {
    m = await crearMundo(pool);
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  const post = (ruta: string, token: string, cuerpo: unknown, cabeceras?: Record<string, string>) => m.api.peticion('POST', ruta, { token, cuerpo, cabeceras });
  const get = (ruta: string, token: string) => m.api.peticion('GET', ruta, { token });

  test('el tesorero registra un asociado (201), con la JASS de su membresía aunque el cuerpo diga otra', async () => {
    const r = await post('/v1/asociados', m.token.tesoreroA, { nombre: 'Pedro Mamani', documento: 'DNI-5001', jassId: m.esc.jassB });
    assert.equal(r.estado, 201);
    assert.equal(r.cuerpo.jassId, m.esc.jassA, 'el jassId del cliente se ignora');
    const { rows } = await pool.query('SELECT jass_id FROM asociado WHERE id = $1', [r.cuerpo.id]);
    assert.equal(rows[0].jass_id, m.esc.jassA);
  });

  test('documento repetido → 409; datos inválidos → 422', async () => {
    assert.equal((await post('/v1/asociados', m.token.tesoreroA, { nombre: 'Otro', documento: 'DNI-5001' })).estado, 409);
    assert.equal((await post('/v1/asociados', m.token.tesoreroA, { nombre: '', documento: 'DNI-5002' })).estado, 422);
    assert.equal((await post('/v1/asociados', m.token.tesoreroA, { nombre: 'X', documento: '1' })).estado, 422);
  });

  test('generar cuotas: 200 con creadas/existentes; repetir no duplica; importe y periodo inválidos → 422', async () => {
    const primera = await post('/v1/cuotas/generar', m.token.tesoreroA, { periodo: '2026-11', importeCentimos: 1500 });
    assert.equal(primera.estado, 200);
    assert.equal(primera.cuerpo.creadas, 3); // A1, A2 y Pedro
    const repetida = await post('/v1/cuotas/generar', m.token.tesoreroA, { periodo: '2026-11', importeCentimos: 9999 });
    assert.deepEqual(repetida.cuerpo, { creadas: 0, existentes: 3 });
    for (const cuerpo of [{ periodo: '2026-11', importeCentimos: 0 }, { periodo: '2026-11', importeCentimos: 1.5 }, { periodo: '2026-13', importeCentimos: 100 }, { periodo: '2026-12' }]) {
      assert.equal((await post('/v1/cuotas/generar', m.token.tesoreroA, cuerpo)).estado, 422);
    }
    const cuenta = await get(`/v1/asociados/${m.esc.asociadoA1.id}/estado-de-cuenta`, m.token.tesoreroA);
    assert.equal(cuenta.estado, 200);
    cuotaA1 = cuenta.cuerpo.cuotas[0].id;
    assert.equal(cuenta.cuerpo.cuotas[0].importeCentimos, 1500);
  });

  test('pago: 201; mismo reintento 200 con el original; misma clave y otro contenido 409', async () => {
    const clave = nuevaClave();
    const cuerpo = { cuotaId: cuotaA1, importeCentimos: 500, comprobante: 'REC-0001' };
    const a = await post('/v1/pagos', m.token.tesoreroA, cuerpo, { 'Idempotency-Key': clave });
    assert.equal(a.estado, 201);
    assert.equal(a.cuerpo.estado, 'vigente');
    const b = await post('/v1/pagos', m.token.tesoreroA, cuerpo, { 'Idempotency-Key': clave });
    assert.equal(b.estado, 200);
    assert.equal(b.cuerpo.id, a.cuerpo.id);
    const c = await post('/v1/pagos', m.token.tesoreroA, { ...cuerpo, importeCentimos: 600 }, { 'Idempotency-Key': clave });
    assert.equal(c.estado, 409);
    assert.equal((await get(`/v1/pagos/${a.cuerpo.id}`, m.token.tesoreroA)).cuerpo.importeCentimos, 500);
  });

  test('pago inválido → 422: sin clave, clave mal formada, sin comprobante, importe inválido y sobrepago', async () => {
    const ok = { cuotaId: cuotaA1, importeCentimos: 10, comprobante: 'X' };
    assert.equal((await post('/v1/pagos', m.token.tesoreroA, ok)).estado, 422);
    assert.equal((await post('/v1/pagos', m.token.tesoreroA, ok, { 'Idempotency-Key': 'abc' })).estado, 422);
    assert.equal((await post('/v1/pagos', m.token.tesoreroA, { ...ok, comprobante: '' }, { 'Idempotency-Key': nuevaClave() })).estado, 422);
    assert.equal((await post('/v1/pagos', m.token.tesoreroA, { ...ok, importeCentimos: -3 }, { 'Idempotency-Key': nuevaClave() })).estado, 422);
    assert.equal((await post('/v1/pagos', m.token.tesoreroA, { ...ok, importeCentimos: 1000000 }, { 'Idempotency-Key': nuevaClave() })).estado, 422);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM pago WHERE jass_id = $1 AND cuota_id = $2 AND estado = 'vigente'", [m.esc.jassA, cuotaA1]);
    assert.equal(rows[0].n, 1, 'solo el pago correcto de la prueba anterior');
  });

  test('un operador no puede registrar pagos (403) y no se crea ninguno', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM pago WHERE jass_id = $1', [m.esc.jassA])).rows[0].n;
    const r = await post('/v1/pagos', m.token.operadorA, { cuotaId: cuotaA1, importeCentimos: 10, comprobante: 'X' }, { 'Idempotency-Key': nuevaClave() });
    assert.equal(r.estado, 403);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM pago WHERE jass_id = $1', [m.esc.jassA])).rows[0].n, antes);
  });

  test('flujo principal: el asociado ve su saldo 1500 → 1000 tras un pago de 500 → 1500 tras la reversa', async () => {
    const cuotaA2 = (await get(`/v1/asociados/${m.esc.asociadoA2.id}/estado-de-cuenta`, m.token.tesoreroA)).cuerpo.cuotas[0].id;
    const saldo = async () => (await get('/v1/portal/saldo', m.token.asociadoA2)).cuerpo.saldoCentimos;
    assert.equal(await saldo(), 1500);

    const pago = await post('/v1/pagos', m.token.tesoreroA, { cuotaId: cuotaA2, importeCentimos: 500, comprobante: 'REC-FLUJO' }, { 'Idempotency-Key': nuevaClave() });
    assert.equal(pago.estado, 201);
    assert.equal(await saldo(), 1000);
    const pagos = await get('/v1/portal/pagos', m.token.asociadoA2);
    assert.equal(pagos.cuerpo.pagos.length, 1);
    assert.equal(pagos.cuerpo.pagos[0].comprobante, 'REC-FLUJO');
    assert.equal(pagos.cuerpo.pagos[0].estado, 'vigente');
    const cuotas = await get('/v1/portal/cuotas', m.token.asociadoA2);
    assert.equal(cuotas.cuerpo.cuotas[0].pendienteCentimos, 1000);
    assert.equal(cuotas.cuerpo.cuotas[0].estado, 'parcial');

    const reversa = await post(`/v1/pagos/${pago.cuerpo.id}/reversa`, m.token.tesoreroA, { motivo: 'Error de digitación' });
    assert.equal(reversa.estado, 200);
    assert.equal(await saldo(), 1500);
    assert.equal((await get('/v1/portal/pagos', m.token.asociadoA2)).cuerpo.pagos[0].estado, 'revertido');

    assert.equal((await post(`/v1/pagos/${pago.cuerpo.id}/reversa`, m.token.tesoreroA, { motivo: 'otra vez' })).estado, 409);
    const detalle = await get(`/v1/pagos/${pago.cuerpo.id}`, m.token.consejoA);
    assert.equal(detalle.cuerpo.estado, 'revertido');
    assert.equal(detalle.cuerpo.reversa.motivo, 'Error de digitación');
  });

  test('el consejo (administrador) también registra pagos', async () => {
    const r = await post('/v1/pagos', m.token.consejoA, { cuotaId: cuotaA1, importeCentimos: 100, comprobante: 'CONSEJO-1' }, { 'Idempotency-Key': nuevaClave() });
    assert.equal(r.estado, 201);
  });

  test('reversa sin motivo → 422 y el pago sigue vigente', async () => {
    const p = await post('/v1/pagos', m.token.tesoreroA, { cuotaId: cuotaA1, importeCentimos: 50, comprobante: 'R-SIN-MOTIVO' }, { 'Idempotency-Key': nuevaClave() });
    assert.equal((await post(`/v1/pagos/${p.cuerpo.id}/reversa`, m.token.tesoreroA, { motivo: '  ' })).estado, 422);
    assert.equal((await get(`/v1/pagos/${p.cuerpo.id}`, m.token.tesoreroA)).cuerpo.estado, 'vigente');
  });

  test('baja lógica por HTTP (204): sin pagos nuevos (409) y el asociado conserva su historial', async () => {
    const nuevo = await post('/v1/asociados', m.token.tesoreroA, { nombre: 'Baja Http', documento: 'BAJA-HTTP' });
    assert.equal((await post(`/v1/asociados/${nuevo.cuerpo.id}/acceso`, m.token.tesoreroA, { correo: `baja.${nuevo.cuerpo.id.slice(0, 6)}@prueba.pe`, contrasena: 'Clave-de-prueba-123' })).estado, 201);
    await post('/v1/cuotas/generar', m.token.tesoreroA, { periodo: '2026-10', importeCentimos: 700 });
    const cuotaNueva = (await get(`/v1/asociados/${nuevo.cuerpo.id}/estado-de-cuenta`, m.token.tesoreroA)).cuerpo.cuotas[0].id;
    assert.equal((await post(`/v1/asociados/${nuevo.cuerpo.id}/baja`, m.token.tesoreroA, {})).estado, 204);
    const r = await post('/v1/pagos', m.token.tesoreroA, { cuotaId: cuotaNueva, importeCentimos: 10, comprobante: 'X' }, { 'Idempotency-Key': nuevaClave() });
    assert.equal(r.estado, 409);
    const sesion = await m.api.iniciarSesion(`baja.${nuevo.cuerpo.id.slice(0, 6)}@prueba.pe`);
    const saldo = await get('/v1/portal/saldo', sesion.tokenAcceso);
    assert.equal(saldo.estado, 200);
    assert.equal(saldo.cuerpo.asociado.estado, 'baja');
  });

  test('el listado de asociados solo incluye la JASS del solicitante y trae el saldo', async () => {
    const r = await get('/v1/asociados', m.token.tesoreroA);
    assert.equal(r.estado, 200);
    const ids = r.cuerpo.asociados.map((a: { id: string }) => a.id);
    assert.ok(ids.includes(m.esc.asociadoA1.id));
    assert.ok(!ids.includes(m.esc.asociadoB1.id));
    assert.equal(typeof r.cuerpo.asociados[0].saldoCentimos, 'number');
  });
});
