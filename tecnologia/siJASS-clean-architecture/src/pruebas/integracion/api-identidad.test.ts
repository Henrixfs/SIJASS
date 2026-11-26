/**
 * Pruebas HTTP de `s2a-acceso-dni-multi-jass`: tipo de acceso, cambio de clave obligatorio,
 * equipo del Consejo, plataforma, JASS suspendida y límite por origen, con la API real sobre
 * PostgreSQL.
 */
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { CLAVE, nuevoDni } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';
import { crearMundo, type Mundo } from './entorno-api.js';

const sufijo = () => Math.random().toString(36).slice(2, 10);

describe('API — identidad por DNI', () => {
  const pool = crearPool();
  let m: Mundo;
  let tokenPlataforma: string;

  const get = (ruta: string, token: string) => m.api.peticion('GET', ruta, { token });
  const post = (ruta: string, token: string, cuerpo: unknown = {}) => m.api.peticion('POST', ruta, { token, cuerpo });
  const login = (cuerpo: Record<string, unknown>, cabeceras?: Record<string, string>) => m.api.peticion('POST', '/v1/auth/login', { cuerpo, cabeceras });

  before(async () => {
    m = await crearMundo(pool);
    const documento = nuevoDni();
    await m.api.entorno.casos.crearPlataforma.ejecutar({ nombre: 'Equipo SIJASS', documento, contrasena: CLAVE, debeCambiarContrasena: false });
    tokenPlataforma = (await m.api.iniciarSesion(documento)).tokenAcceso;
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  test('login por DNI: el tipo coincidente entra; el distinto responde 409 con el tipo real y sin tokens', async () => {
    const bien = await login({ documento: m.esc.consejoA.documento, contrasena: CLAVE, tipo: 'administrador' });
    assert.equal(bien.estado, 200);
    assert.equal(bien.cuerpo.rol, 'consejo');
    assert.equal(bien.cuerpo.debeCambiarContrasena, false);
    const mal = await login({ documento: m.esc.asociadoA1.cuenta.documento, contrasena: CLAVE, tipo: 'administrador' });
    assert.equal(mal.estado, 409);
    assert.deepEqual(mal.cuerpo, { codigo: 'tipo-de-acceso-distinto', mensaje: 'El tipo de acceso elegido no corresponde a esta cuenta', tipoReal: 'asociado' });
    assert.ok(!('tokenAcceso' in mal.cuerpo));
    assert.equal((await login({ documento: m.esc.tesoreroA.documento, contrasena: CLAVE, tipo: 'asociado' })).cuerpo.tipoReal, 'administrador');
    const claveMala = await login({ documento: m.esc.asociadoA1.cuenta.documento, contrasena: 'incorrecta-123', tipo: 'administrador' });
    assert.equal(claveMala.estado, 401);
    assert.ok(!JSON.stringify(claveMala.cuerpo).includes('tipoReal'));
    assert.equal((await login({ documento: m.esc.consejoA.documento, contrasena: CLAVE, tipo: 'otro' })).estado, 422);
  });

  test('un DNI inexistente, mal formado o con clave errónea responde igual: 401 con el mismo cuerpo', async () => {
    const respuestas = [
      await login({ documento: '99999991', contrasena: CLAVE }),
      await login({ documento: m.esc.operadorA.documento, contrasena: 'incorrecta-123' }),
      await login({ documento: '123', contrasena: CLAVE }),
      await login({ contrasena: CLAVE }),
    ];
    for (const r of respuestas) {
      assert.equal(r.estado, 401);
      assert.deepEqual(r.cuerpo, { codigo: 'credenciales-invalidas', mensaje: 'Credenciales inválidas' });
    }
  });

  test('personal con cambio pendiente: solo cambia la clave, consulta yo o cierra sesión; el resto es 403 cambio-de-clave-pendiente', async () => {
    const alta = await post('/v1/equipo', m.token.consejoA, { nombre: 'Tesorera Nueva', documento: nuevoDni(), rol: 'tesorero' });
    assert.equal(alta.estado, 201);
    const doc = (await m.api.entorno.dependencias.unidadDeTrabajo.ejecutar((r) => r.usuarios.buscarPorId(alta.cuerpo.usuarioId), { sistema: true }))?.documento as string;
    const entrada = await login({ documento: doc, contrasena: alta.cuerpo.claveTemporal, tipo: 'administrador' });
    assert.equal(entrada.estado, 200);
    assert.equal(entrada.cuerpo.debeCambiarContrasena, true);
    const t = entrada.cuerpo.tokenAcceso as string;
    for (const [metodo, ruta] of [['GET', '/v1/asociados'], ['GET', '/v1/equipo'], ['POST', '/v1/cuotas/generar'], ['GET', '/v1/reservorios'], ['GET', '/v1/asistente/documentos']] as const) {
      const r = await m.api.peticion(metodo, ruta, { token: t, cuerpo: metodo === 'POST' ? {} : undefined });
      assert.equal(r.estado, 403, `${metodo} ${ruta}`);
      assert.equal(r.cuerpo.codigo, 'cambio-de-clave-pendiente');
    }
    const yo = await get('/v1/yo', t);
    assert.equal(yo.estado, 200);
    assert.equal(yo.cuerpo.debeCambiarContrasena, true);
    const cambio = await post('/v1/auth/cambiar-contrasena', t, { contrasenaActual: alta.cuerpo.claveTemporal, contrasenaNueva: 'Tesorera-nueva-2026' });
    assert.equal(cambio.estado, 200);
    assert.equal(cambio.cuerpo.debeCambiarContrasena, false);
    assert.equal((await get('/v1/asociados', cambio.cuerpo.tokenAcceso)).estado, 200, 'con la clave cambiada usa su rol');
    assert.equal((await get('/v1/asociados', t)).estado, 200, 'el token de acceso previo sigue vigente hasta vencer, pero ya no tiene el cambio pendiente');
    assert.equal((await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: entrada.cuerpo.tokenRefresco } })).estado, 401, 'el refresco anterior se cerró');
  });

  test('un asociado con clave generada entra directo al portal, sin cambio pendiente', async () => {
    const dni = nuevoDni();
    const nuevo = await post('/v1/asociados', m.token.tesoreroA, { nombre: 'Familia Directa', documento: dni });
    const acceso = await post(`/v1/asociados/${nuevo.cuerpo.id}/acceso`, m.token.tesoreroA);
    assert.equal(acceso.estado, 201);
    assert.match(acceso.cuerpo.claveTemporal, /^[a-z]+-[a-z]+-[a-z]+$/);
    const entrada = await login({ documento: dni, contrasena: acceso.cuerpo.claveTemporal.toUpperCase().replaceAll('-', ' '), tipo: 'asociado' });
    assert.equal(entrada.estado, 200);
    assert.equal(entrada.cuerpo.debeCambiarContrasena, false);
    assert.equal((await get('/v1/portal/saldo', entrada.cuerpo.tokenAcceso)).estado, 200);
    const reset = await post(`/v1/asociados/${nuevo.cuerpo.id}/acceso/restablecer`, m.token.tesoreroA);
    assert.equal(reset.estado, 200);
    assert.notEqual(reset.cuerpo.claveTemporal, acceso.cuerpo.claveTemporal);
    assert.equal((await post(`/v1/asociados/${nuevo.cuerpo.id}/acceso/restablecer`, m.token.operadorA)).estado, 403);
    assert.equal((await post(`/v1/asociados/${nuevo.cuerpo.id}/acceso/restablecer`, m.token.tesoreroB)).estado, 403);
  });

  test('equipo: solo el Consejo; roles no permitidos 422; no a sí mismo; cuentas de otra JASS como inexistentes', async () => {
    for (const token of [m.token.tesoreroA, m.token.operadorA, m.token.asociadoA1]) {
      assert.equal((await get('/v1/equipo', token)).estado, 403);
      assert.equal((await post('/v1/equipo', token, { nombre: 'X', documento: nuevoDni(), rol: 'operador' })).estado, 403);
    }
    const lista = await get('/v1/equipo', m.token.consejoA);
    assert.equal(lista.estado, 200);
    assert.ok(lista.cuerpo.equipo.every((f: { documento: string }) => /^•+\d{3}$/.test(f.documento)));
    assert.equal((await post('/v1/equipo', m.token.consejoA, { nombre: 'X', documento: nuevoDni(), rol: 'consejo' })).estado, 422);
    assert.equal((await post('/v1/equipo', m.token.consejoA, { nombre: 'X', documento: m.esc.tesoreroB.documento, rol: 'operador' })).estado, 409);
    assert.equal((await post(`/v1/equipo/${m.esc.consejoA.usuarioId}/desactivar`, m.token.consejoA)).estado, 409);
    assert.equal((await post(`/v1/equipo/${m.esc.tesoreroB.usuarioId}/desactivar`, m.token.consejoA)).estado, 403);
    assert.equal((await post(`/v1/equipo/${m.esc.tesoreroB.usuarioId}/restablecer-clave`, m.token.consejoA)).estado, 403);
    const operador = await post('/v1/equipo', m.token.consejoA, { nombre: 'Operador Temporal', documento: nuevoDni(), rol: 'operador' });
    assert.equal((await post(`/v1/equipo/${operador.cuerpo.usuarioId}/desactivar`, m.token.consejoA)).estado, 204);
    assert.equal((await post(`/v1/equipo/${operador.cuerpo.usuarioId}/restablecer-clave`, m.token.consejoA)).estado, 403, 'una cuenta desactivada ya no es gestionable');
  });

  test('plataforma: crea JASS y entrega la clave del Consejo; las cuentas de las JASS reciben 403; la plataforma no ve datos de negocio', async () => {
    const dni = nuevoDni();
    const nombre = `Plataforma ${sufijo()}`;
    const alta = await post('/v1/plataforma/jass', tokenPlataforma, { nombre, ubicacion: { departamento: 'Ayacucho', distrito: 'Quinua' }, consejo: { nombre: 'Consejo Nuevo', documento: dni } });
    assert.equal(alta.estado, 201);
    assert.match(alta.cuerpo.claveTemporal, /^[a-z]+-[a-z]+-[a-z]+$/);
    const lista = await get('/v1/plataforma/jass', tokenPlataforma);
    assert.equal(lista.estado, 200);
    const fila = lista.cuerpo.jass.find((j: { id: string }) => j.id === alta.cuerpo.jassId);
    assert.equal(fila.nombre, nombre);
    assert.equal(fila.cuentasActivas, 1);
    assert.deepEqual(Object.keys(fila).sort(), ['cuentasActivas', 'estado', 'id', 'nombre', 'ubicacion']);

    for (const token of [m.token.consejoA, m.token.tesoreroA, m.token.operadorA, m.token.asociadoA1]) {
      assert.equal((await get('/v1/plataforma/jass', token)).estado, 403);
      assert.equal((await post('/v1/plataforma/jass', token, { nombre: 'X', consejo: { nombre: 'Y', documento: nuevoDni() } })).estado, 403);
      assert.equal((await post(`/v1/plataforma/jass/${m.esc.jassA}/suspender`, token)).estado, 403);
    }
    for (const [metodo, ruta] of [
      ['GET', '/v1/asociados'], ['GET', `/v1/asociados/${m.esc.asociadoA1.id}/estado-de-cuenta`], ['POST', '/v1/cuotas/generar'], ['GET', '/v1/reservorios'],
      ['GET', '/v1/mediciones/catalogo'], ['GET', '/v1/asistente/documentos'], ['GET', '/v1/portal/saldo'], ['GET', '/v1/equipo'],
    ] as const) {
      const r = await m.api.peticion(metodo, ruta, { token: tokenPlataforma, cuerpo: metodo === 'POST' ? {} : undefined });
      assert.equal(r.estado, 403, `${metodo} ${ruta}`);
    }
    const yo = await get('/v1/yo', tokenPlataforma);
    assert.equal(yo.cuerpo.perfil, 'plataforma');
    assert.equal(yo.cuerpo.jass, null);
  });

  test('plataforma: suspender bloquea login, renovación y solicitudes con el token vigente; reactivar lo restablece', async () => {
    const dni = nuevoDni();
    const alta = await post('/v1/plataforma/jass', tokenPlataforma, { nombre: `Suspensión ${sufijo()}`, consejo: { nombre: 'Consejo S', documento: dni } });
    const cambio = await login({ documento: dni, contrasena: alta.cuerpo.claveTemporal });
    const fin = await post('/v1/auth/cambiar-contrasena', cambio.cuerpo.tokenAcceso, { contrasenaActual: alta.cuerpo.claveTemporal, contrasenaNueva: 'Consejo-sus-2026-ok' });
    assert.equal(fin.estado, 200);
    assert.equal((await get('/v1/asociados', fin.cuerpo.tokenAcceso)).estado, 200);

    assert.equal((await post(`/v1/plataforma/jass/${alta.cuerpo.jassId}/suspender`, tokenPlataforma)).estado, 204);
    const r1 = await login({ documento: dni, contrasena: 'Consejo-sus-2026-ok' });
    assert.deepEqual([r1.estado, r1.cuerpo.codigo], [403, 'jass-suspendida']);
    const r2 = await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: fin.cuerpo.tokenRefresco } });
    assert.deepEqual([r2.estado, r2.cuerpo.codigo], [403, 'jass-suspendida']);
    const r3 = await get('/v1/asociados', fin.cuerpo.tokenAcceso);
    assert.deepEqual([r3.estado, r3.cuerpo.codigo], [403, 'jass-suspendida']);

    assert.equal((await post(`/v1/plataforma/jass/${alta.cuerpo.jassId}/reactivar`, tokenPlataforma)).estado, 204);
    assert.equal((await login({ documento: dni, contrasena: 'Consejo-sus-2026-ok' })).estado, 200);
    assert.equal((await m.api.peticion('POST', '/v1/auth/refresh', { cuerpo: { tokenRefresco: fin.cuerpo.tokenRefresco } })).estado, 200, 'el refresco no se consumió');
    assert.equal((await post('/v1/plataforma/jass/no-es-uuid/suspender', tokenPlataforma)).estado, 422);
    assert.equal((await post('/v1/plataforma/jass/80000000-0000-4000-8000-000000000001/suspender', tokenPlataforma)).estado, 422);
  });

  test('plataforma: restablece la clave del Consejo; JASS sin Consejo activo → 409', async () => {
    const dni = nuevoDni();
    const alta = await post('/v1/plataforma/jass', tokenPlataforma, { nombre: `Restablecer ${sufijo()}`, consejo: { nombre: 'Consejo R', documento: dni } });
    const r = await post(`/v1/plataforma/jass/${alta.cuerpo.jassId}/consejo/restablecer-clave`, tokenPlataforma);
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.documento, `•••••${dni.slice(-3)}`);
    assert.equal((await login({ documento: dni, contrasena: r.cuerpo.claveTemporal })).cuerpo.debeCambiarContrasena, true);
    assert.equal((await post(`/v1/plataforma/jass/${alta.cuerpo.jassId}/consejo/restablecer-clave`, tokenPlataforma, { usuarioId: '80000000-0000-4000-8000-000000000002' })).estado, 409);
    for (const token of [m.token.consejoA, m.token.tesoreroA]) assert.equal((await post(`/v1/plataforma/jass/${alta.cuerpo.jassId}/consejo/restablecer-clave`, token)).estado, 403);
  });

  test('el cambio de clave exige la actual, valida la nueva y los 5 fallos bloquean la cuenta', async () => {
    const dni = nuevoDni();
    const alta = await post('/v1/equipo', m.token.consejoA, { nombre: 'Prueba Cambio', documento: dni, rol: 'operador' });
    const t = (await login({ documento: dni, contrasena: alta.cuerpo.claveTemporal })).cuerpo.tokenAcceso as string;
    assert.equal((await post('/v1/auth/cambiar-contrasena', t, { contrasenaActual: alta.cuerpo.claveTemporal, contrasenaNueva: 'corta' })).estado, 422);
    assert.equal((await post('/v1/auth/cambiar-contrasena', t, { contrasenaActual: alta.cuerpo.claveTemporal, contrasenaNueva: dni })).estado, 422);
    assert.equal((await post('/v1/auth/cambiar-contrasena', t, {})).estado, 401, 'sin la clave actual cuenta como el primer fallo');
    for (let i = 0; i < 3; i++) assert.equal((await post('/v1/auth/cambiar-contrasena', t, { contrasenaActual: 'no-es', contrasenaNueva: 'Clave-larga-de-prueba' })).estado, 401);
    assert.equal((await post('/v1/auth/cambiar-contrasena', t, { contrasenaActual: 'no-es', contrasenaNueva: 'Clave-larga-de-prueba' })).estado, 401);
    const bloqueada = await post('/v1/auth/cambiar-contrasena', t, { contrasenaActual: alta.cuerpo.claveTemporal, contrasenaNueva: 'Clave-larga-de-prueba' });
    assert.equal(bloqueada.estado, 429);
    assert.ok(Number(bloqueada.cabeceras.get('retry-after')) > 0);
    assert.equal((await post('/v1/auth/cambiar-contrasena', '', {})).estado, 401);
  });

  test('las claves temporales no quedan en la base, en la bitácora ni en el registro de la API', async () => {
    const dni = nuevoDni();
    const nuevo = await post('/v1/asociados', m.token.tesoreroA, { nombre: 'Sin Rastro', documento: dni });
    const acceso = await post(`/v1/asociados/${nuevo.cuerpo.id}/acceso`, m.token.tesoreroA);
    const reset = await post(`/v1/asociados/${nuevo.cuerpo.id}/acceso/restablecer`, m.token.tesoreroA);
    const equipo = await post('/v1/equipo', m.token.consejoA, { nombre: 'Equipo Sin Rastro', documento: nuevoDni(), rol: 'operador' });
    const claves: string[] = [acceso.cuerpo.claveTemporal, reset.cuerpo.claveTemporal, equipo.cuerpo.claveTemporal];
    assert.equal(new Set(claves).size, 3);
    const bitacora = JSON.stringify([
      (await pool.query('SELECT * FROM evento_auditoria WHERE jass_id = (SELECT jass_id FROM membresia WHERE usuario_id = $1)', [acceso.cuerpo.usuarioId])).rows,
      m.api.registros,
    ]);
    const volcado = JSON.stringify([
      (await pool.query('SELECT * FROM usuario WHERE id = ANY($1)', [[acceso.cuerpo.usuarioId, equipo.cuerpo.usuarioId]])).rows,
      (await pool.query('SELECT * FROM sesion WHERE usuario_id = ANY($1)', [[acceso.cuerpo.usuarioId]])).rows,
      bitacora,
    ]);
    for (const clave of claves) assert.ok(!volcado.includes(clave), 'una clave temporal quedó registrada');
    assert.ok(!bitacora.includes(dni), 'el DNI completo no debe estar en la bitácora ni en el registro de la API');
    const resp = JSON.stringify([acceso.cuerpo, reset.cuerpo]);
    assert.ok(resp.includes(claves[0]) && resp.includes(claves[1]), 'la clave sí viaja en la respuesta que la genera');
  });

  test('el límite por origen cuenta solo los fallos: responde 429 con Retry-After y no consulta cuentas', async () => {
    // Todas las solicitudes de la prueba salen de 127.0.0.1. Los inicios correctos de las pruebas anteriores no cuentan.
    let limite = 0;
    for (let i = 0; i < 80 && limite === 0; i++) {
      const r = await login({ documento: nuevoDni(), contrasena: 'incorrecta-123' });
      if (r.estado === 429) limite = i + 1;
    }
    assert.ok(limite > 0 && limite <= 51, `el límite llegó en el intento ${limite}`);
    const r = await login({ documento: m.esc.consejoA.documento, contrasena: CLAVE });
    assert.equal(r.estado, 429);
    assert.equal(r.cuerpo.codigo, 'demasiados-intentos');
    assert.equal(r.cabeceras.get('retry-after'), '900');
  });
});
