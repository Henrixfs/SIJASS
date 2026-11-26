/**
 * Todo estado HTTP que la API devuelve en solicitudes representativas está declarado en el
 * contrato OpenAPI para esa operación (s1e, spec `contrato-openapi`, «Códigos de estado
 * documentados verificados»).
 */
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { cargarOpenApi } from '../contrato-openapi-util.js';
import { nuevaClave, nuevoDni } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';
import { crearMundo, type Mundo } from './entorno-api.js';

describe('contrato OpenAPI — estados observados vs declarados', () => {
  const pool = crearPool();
  const doc = cargarOpenApi();
  let m: Mundo;
  before(async () => {
    m = await crearMundo(pool);
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  async function verificar(metodo: 'get' | 'post', plantilla: string, ruta: string, opciones: { token?: string; cuerpo?: unknown; cabeceras?: Record<string, string>; esperado?: number } = {}) {
    const r = await m.api.peticion(metodo.toUpperCase(), ruta, { token: opciones.token, cuerpo: opciones.cuerpo, cabeceras: opciones.cabeceras });
    const declarados = Object.keys(doc.paths[plantilla]?.[metodo]?.responses ?? {});
    assert.ok(declarados.length > 0, `${metodo} ${plantilla}: operación no documentada`);
    assert.ok(declarados.includes(String(r.estado)), `${metodo} ${plantilla}: devolvió ${r.estado} y el contrato declara ${declarados.join(', ')}`);
    if (opciones.esperado !== undefined) assert.equal(r.estado, opciones.esperado, `${metodo} ${ruta}`);
    return r;
  }

  test('éxitos y errores representativos de cada grupo de rutas', async () => {
    const T = m.token;
    const clave = () => ({ 'Idempotency-Key': nuevaClave() });
    await verificar('get', '/v1/salud', '/v1/salud', { esperado: 200 });
    await verificar('get', '/v1/yo', '/v1/yo', { token: T.tesoreroA, esperado: 200 });
    await verificar('get', '/v1/yo', '/v1/yo', { esperado: 401 });
    await verificar('post', '/v1/auth/login', '/v1/auth/login', { cuerpo: { documento: m.esc.tesoreroA.documento, contrasena: 'Clave-de-prueba-123' }, esperado: 200 });
    await verificar('post', '/v1/auth/login', '/v1/auth/login', { cuerpo: { documento: '99999999', contrasena: 'mala' }, esperado: 401 });
    await verificar('post', '/v1/auth/refresh', '/v1/auth/refresh', { cuerpo: { tokenRefresco: 'no-existe' }, esperado: 401 });
    await verificar('post', '/v1/auth/logout', '/v1/auth/logout', { cuerpo: { tokenRefresco: 'no-existe' }, esperado: 204 });

    const documentoAlta = nuevoDni();
    const alta = await verificar('post', '/v1/asociados', '/v1/asociados', { token: T.tesoreroA, cuerpo: { nombre: 'Contrato Uno', documento: documentoAlta }, esperado: 201 });
    await verificar('post', '/v1/asociados', '/v1/asociados', { token: T.tesoreroA, cuerpo: { nombre: 'Contrato Uno', documento: documentoAlta }, esperado: 409 });
    await verificar('post', '/v1/asociados', '/v1/asociados', { token: T.tesoreroA, cuerpo: { nombre: '', documento: '1' }, esperado: 422 });
    await verificar('post', '/v1/asociados', '/v1/asociados', { token: T.operadorA, cuerpo: { nombre: 'X', documento: 'CONT-0002' }, esperado: 403 });
    await verificar('get', '/v1/asociados', '/v1/asociados', { token: T.tesoreroA, esperado: 200 });
    await verificar('post', '/v1/asociados/{id}/acceso', `/v1/asociados/${alta.cuerpo.id}/acceso`, { token: T.tesoreroA, esperado: 201 });
    await verificar('post', '/v1/asociados/{id}/acceso', `/v1/asociados/${alta.cuerpo.id}/acceso`, { token: T.tesoreroA, esperado: 409 });
    const rara = await verificar('post', '/v1/asociados', '/v1/asociados', { token: T.tesoreroA, cuerpo: { nombre: 'Documento Raro', documento: 'CE-12345' }, esperado: 201 });
    await verificar('post', '/v1/asociados/{id}/acceso', `/v1/asociados/${rara.cuerpo.id}/acceso`, { token: T.tesoreroA, esperado: 422 });
    await verificar('post', '/v1/asociados/{id}/acceso/restablecer', `/v1/asociados/${alta.cuerpo.id}/acceso/restablecer`, { token: T.tesoreroA, esperado: 200 });
    await verificar('post', '/v1/asociados/{id}/acceso/restablecer', `/v1/asociados/${rara.cuerpo.id}/acceso/restablecer`, { token: T.tesoreroA, esperado: 409 });

    await verificar('post', '/v1/cuotas/generar', '/v1/cuotas/generar', { token: T.tesoreroA, cuerpo: { periodo: '2026-11', importeCentimos: 1500 }, esperado: 200 });
    await verificar('post', '/v1/cuotas/generar', '/v1/cuotas/generar', { token: T.tesoreroA, cuerpo: { periodo: 'mal', importeCentimos: 1 }, esperado: 422 });
    const cuenta = await verificar('get', '/v1/asociados/{id}/estado-de-cuenta', `/v1/asociados/${alta.cuerpo.id}/estado-de-cuenta`, { token: T.tesoreroA, esperado: 200 });
    await verificar('get', '/v1/asociados/{id}/estado-de-cuenta', `/v1/asociados/${m.esc.asociadoB1.id}/estado-de-cuenta`, { token: T.tesoreroA, esperado: 403 });

    const cuotaId = cuenta.cuerpo.cuotas[0].id;
    const cuerpoPago = { cuotaId, importeCentimos: 500, comprobante: 'CONTRATO-1' };
    const k = clave();
    const pago = await verificar('post', '/v1/pagos', '/v1/pagos', { token: T.tesoreroA, cuerpo: cuerpoPago, cabeceras: k, esperado: 201 });
    await verificar('post', '/v1/pagos', '/v1/pagos', { token: T.tesoreroA, cuerpo: cuerpoPago, cabeceras: k, esperado: 200 });
    await verificar('post', '/v1/pagos', '/v1/pagos', { token: T.tesoreroA, cuerpo: { ...cuerpoPago, importeCentimos: 600 }, cabeceras: k, esperado: 409 });
    await verificar('post', '/v1/pagos', '/v1/pagos', { token: T.tesoreroA, cuerpo: cuerpoPago, esperado: 422 });
    await verificar('get', '/v1/pagos/{id}', `/v1/pagos/${pago.cuerpo.id}`, { token: T.tesoreroA, esperado: 200 });
    await verificar('get', '/v1/pagos/{id}', `/v1/pagos/${pago.cuerpo.id}`, { token: T.tesoreroB, esperado: 403 });
    await verificar('post', '/v1/pagos/{id}/reversa', `/v1/pagos/${pago.cuerpo.id}/reversa`, { token: T.tesoreroA, cuerpo: { motivo: ' ' }, esperado: 422 });
    await verificar('post', '/v1/pagos/{id}/reversa', `/v1/pagos/${pago.cuerpo.id}/reversa`, { token: T.tesoreroA, cuerpo: { motivo: 'prueba' }, esperado: 200 });
    await verificar('post', '/v1/pagos/{id}/reversa', `/v1/pagos/${pago.cuerpo.id}/reversa`, { token: T.tesoreroA, cuerpo: { motivo: 'otra' }, esperado: 409 });
    await verificar('post', '/v1/asociados/{id}/baja', `/v1/asociados/${alta.cuerpo.id}/baja`, { token: T.tesoreroA, cuerpo: {}, esperado: 204 });

    for (const ruta of ['saldo', 'cuotas', 'pagos']) {
      await verificar('get', `/v1/portal/${ruta}`, `/v1/portal/${ruta}`, { token: T.asociadoA1, esperado: 200 });
      await verificar('get', `/v1/portal/${ruta}`, `/v1/portal/${ruta}`, { token: T.tesoreroA, esperado: 403 });
    }

    const res = await verificar('post', '/v1/reservorios', '/v1/reservorios', { token: T.consejoA, cuerpo: { nombre: 'Contrato R' }, esperado: 201 });
    await verificar('post', '/v1/reservorios', '/v1/reservorios', { token: T.consejoA, cuerpo: { nombre: 'Contrato R' }, esperado: 409 });
    await verificar('post', '/v1/reservorios', '/v1/reservorios', { token: T.consejoA, cuerpo: { nombre: '' }, esperado: 422 });
    await verificar('get', '/v1/reservorios', '/v1/reservorios', { token: T.operadorA, esperado: 200 });
    await verificar('get', '/v1/mediciones/catalogo', '/v1/mediciones/catalogo', { token: T.operadorA, esperado: 200 });
    const lectura = { reservorioId: res.cuerpo.id, metodo: 'comparador-dpd', valor: 0.6, unidad: 'mg/L', tomadaEn: '2026-11-19T09:00:00-05:00' };
    const k2 = clave();
    await verificar('post', '/v1/mediciones', '/v1/mediciones', { token: T.operadorA, cuerpo: lectura, cabeceras: k2, esperado: 201 });
    await verificar('post', '/v1/mediciones', '/v1/mediciones', { token: T.operadorA, cuerpo: lectura, cabeceras: k2, esperado: 200 });
    await verificar('post', '/v1/mediciones', '/v1/mediciones', { token: T.operadorA, cuerpo: { ...lectura, valor: 0.9 }, cabeceras: k2, esperado: 409 });
    await verificar('post', '/v1/mediciones', '/v1/mediciones', { token: T.operadorA, cuerpo: { ...lectura, valor: -1 }, cabeceras: clave(), esperado: 422 });
    await verificar('post', '/v1/mediciones', '/v1/mediciones', { token: T.tesoreroA, cuerpo: lectura, cabeceras: clave(), esperado: 403 });
    await verificar('get', '/v1/reservorios/{id}/mediciones', `/v1/reservorios/${res.cuerpo.id}/mediciones`, { token: T.consejoA, esperado: 200 });
    await verificar('get', '/v1/reservorios/{id}/mediciones', `/v1/reservorios/${res.cuerpo.id}/mediciones`, { token: T.consejoB, esperado: 403 });

    await verificar('get', '/v1/asistente/documentos', '/v1/asistente/documentos', { token: T.operadorA, esperado: 200 });
    await verificar('post', '/v1/asistente/consultas', '/v1/asistente/consultas', { token: T.operadorA, cuerpo: { pregunta: '¿Cómo se toma la muestra?' }, esperado: 200 });
    await verificar('post', '/v1/asistente/consultas', '/v1/asistente/consultas', { token: T.operadorA, cuerpo: { pregunta: '' }, esperado: 422 });
    await verificar('post', '/v1/asistente/consultas', '/v1/asistente/consultas', { token: T.asociadoA1, cuerpo: { pregunta: 'hola' }, esperado: 403 });
  });

  test('el bloqueo por intentos fallidos (429) y el JSON inválido (400) están declarados', async () => {
    const documento = m.esc.operadorB.documento;
    for (let i = 0; i < 5; i++) await m.api.peticion('POST', '/v1/auth/login', { cuerpo: { documento, contrasena: 'mala-contrasena-1' } });
    await verificar('post', '/v1/auth/login', '/v1/auth/login', { cuerpo: { documento, contrasena: 'Clave-de-prueba-123' }, esperado: 429 });
    const r = await m.api.peticion('POST', '/v1/auth/login', { cuerpoCrudo: '{ no es json' });
    assert.equal(r.estado, 400);
    assert.ok(Object.keys(doc.paths['/v1/auth/login'].post.responses ?? {}).includes('400'));
  });
});
