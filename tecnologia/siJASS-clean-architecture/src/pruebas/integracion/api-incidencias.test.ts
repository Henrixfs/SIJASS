/**
 * Incidencias por HTTP (s1f, tareas 1.2, 2.3 y 3.1): estados de respuesta, permisos, foto binaria
 * con sus límites y cabeceras, y reglas de prioridad.
 */
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { MATRIZ_POR_DEFECTO } from '../../dominio/incidencia.js';
import { nuevaClave } from '../entorno-acceso.js';
import { jpegConExif, MARCA_EXIF, pngConTexto } from '../fotos-prueba.js';
import { crearPool } from './entorno.js';
import { crearMundo, type Mundo } from './entorno-api.js';

const CUERPO_403 = '{"codigo":"acceso-denegado","mensaje":"Acceso denegado"}';
const reporte = (extra: Record<string, unknown> = {}) => ({
  categoria: 'calidad-observada', alcanceReportado: 'individual', descripcion: 'El agua sale con color', observadaEn: '2026-11-19T06:40:00-05:00', ubicacion: 'Mi casa, sector bajo', ...extra,
});

describe('API — incidencias', () => {
  const pool = crearPool();
  let m: Mundo;
  before(async () => {
    m = await crearMundo(pool);
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });
  const post = (ruta: string, token: string, cuerpo: unknown, cabeceras?: Record<string, string>) => m.api.peticion('POST', ruta, { token, cuerpo, cabeceras });
  const get = (ruta: string, token?: string) => m.api.peticion('GET', ruta, { token });
  const reportar = (token = m.token.asociadoA1, extra?: Record<string, unknown>, clave = nuevaClave()) => post('/v1/incidencias', token, reporte(extra), { 'idempotency-key': clave });
  async function foto(token: string, id: string, bytes: Buffer, tipo: string, revision: string, clave = nuevaClave()) {
    const r = await fetch(`${m.api.url}/v1/incidencias/${id}/foto`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': tipo, 'idempotency-key': clave, 'if-match': revision },
      body: new Uint8Array(bytes),
    });
    const texto = await r.text();
    return { estado: r.status, texto, cuerpo: texto.startsWith('{') ? JSON.parse(texto) : undefined };
  }

  test('sin token → 401 en todas las rutas de incidencias', async () => {
    for (const [metodo, ruta] of [['GET', '/v1/incidencias'], ['POST', '/v1/incidencias'], ['GET', '/v1/incidencias/reglas-prioridad'], ['GET', '/v1/incidencias/00000000-0000-4000-8000-000000000000/foto']]) {
      assert.equal((await m.api.peticion(metodo, ruta)).estado, 401, `${metodo} ${ruta}`);
    }
  });

  test('el asociado reporta (201); el reintento devuelve el mismo (200); otra descripción con la clave → 409', async () => {
    const clave = nuevaClave();
    const a = await reportar(m.token.asociadoA1, {}, clave);
    assert.equal(a.estado, 201);
    assert.equal(a.cuerpo.estado, 'registrada');
    assert.equal(a.cuerpo.sugerencia, undefined);
    const b = await reportar(m.token.asociadoA1, {}, clave);
    assert.equal(b.estado, 200);
    assert.equal(b.cuerpo.id, a.cuerpo.id);
    const c = await reportar(m.token.asociadoA1, { descripcion: 'Otra' }, clave);
    assert.equal(c.estado, 409);
    assert.equal(c.cuerpo.codigo, 'clave-idempotencia-reutilizada');
  });

  test('datos inválidos, campos de más o sin clave → 422; el personal no reporta → 403', async () => {
    assert.equal((await reportar(m.token.asociadoA1, { alcanceReportado: 'barrio' })).estado, 422);
    const extra = await reportar(m.token.asociadoA1, { jassId: m.esc.jassB });
    assert.equal(extra.estado, 422);
    assert.equal(extra.cuerpo.codigo, 'campo-no-permitido');
    assert.equal((await post('/v1/incidencias', m.token.asociadoA1, reporte())).estado, 422);
    const personal = await reportar(m.token.consejoA);
    assert.equal(personal.estado, 403);
    assert.equal(personal.texto, CUERPO_403);
  });

  test('el asociado ve solo lo suyo; el ajeno, el de otra JASS y el inexistente dan el mismo 403', async () => {
    const id = (await reportar()).cuerpo.id;
    const vacio = '00000000-0000-4000-8000-000000000000';
    for (const [token, ruta] of [[m.token.asociadoA2, id], [m.token.consejoB, id], [m.token.asociadoB1, id], [m.token.consejoA, vacio], [m.token.consejoA, 'no-uuid']]) {
      const r = await get(`/v1/incidencias/${ruta}`, token);
      assert.equal(r.estado, 403);
      assert.equal(r.texto, CUERPO_403);
    }
    const lista = await get('/v1/incidencias?limite=100', m.token.asociadoA2);
    assert.equal(lista.estado, 200);
    assert.ok(lista.cuerpo.incidencias.every((i: { id: string }) => i.id !== id));
    const personal = await get(`/v1/incidencias/${id}`, m.token.tesoreroA);
    assert.equal(personal.estado, 200);
    assert.equal(personal.cuerpo.sugerencia.prioridad, 'media');
    assert.equal(personal.cuerpo.reportadoPor.nombre, 'Rosa Quispe');
  });

  test('ciclo completo por HTTP con revisión: 200, transición inválida y revisión vieja → 409, Tesorería → 403', async () => {
    const id = (await reportar()).cuerpo.id;
    assert.equal((await post(`/v1/incidencias/${id}/estado`, m.token.consejoA, { revision: 1, estado: 'cerrada', detalle: 'x' })).estado, 409);
    assert.equal((await post(`/v1/incidencias/${id}/estado`, m.token.tesoreroA, { revision: 1, estado: 'en-atencion' })).estado, 403);
    const p = await post(`/v1/incidencias/${id}/prioridad`, m.token.operadorA, { revision: 1, prioridad: 'alta', motivo: 'Varias familias' });
    assert.equal(p.estado, 200);
    assert.equal(p.cuerpo.prioridadConfirmada, 'alta');
    const r = await post(`/v1/incidencias/${id}/responsable`, m.token.operadorA, { revision: 2, responsableId: m.esc.operadorA.usuarioId });
    assert.equal(r.estado, 200);
    assert.equal((await post(`/v1/incidencias/${id}/responsable`, m.token.operadorA, { revision: 3, responsableId: m.esc.operadorB.usuarioId })).estado, 422);
    assert.equal((await post(`/v1/incidencias/${id}/estado`, m.token.operadorA, { revision: 3, estado: 'en-atencion' })).estado, 200);
    const vieja = await post(`/v1/incidencias/${id}/acciones`, m.token.operadorA, { revision: 3, descripcion: 'Tarde', visibilidad: 'publica' });
    assert.equal(vieja.estado, 409);
    assert.equal(vieja.cuerpo.codigo, 'revision-desactualizada');
    assert.equal((await post(`/v1/incidencias/${id}/acciones`, m.token.operadorA, { revision: 4, descripcion: 'Se limpió el filtro', visibilidad: 'publica' })).estado, 200);
    assert.equal((await post(`/v1/incidencias/${id}/estado`, m.token.operadorA, { revision: 5, estado: 'cerrada', detalle: 'Filtro limpio' })).estado, 200);
    const delAsociado = await get(`/v1/incidencias/${id}/historial`, m.token.asociadoA1);
    assert.deepEqual(delAsociado.cuerpo.eventos.map((e: { tipo: string }) => e.tipo), ['creada', 'estado', 'accion', 'estado']);
    assert.equal(delAsociado.texto.includes('Varias familias'), false);
  });

  test('foto: se guarda sin EXIF, se lee con su tipo y no-store; reintento idéntico → mismo resultado', async () => {
    const id = (await reportar()).cuerpo.id;
    const clave = nuevaClave();
    const subida = await foto(m.token.asociadoA1, id, jpegConExif(), 'image/jpeg', '1', clave);
    assert.equal(subida.estado, 200);
    assert.equal(subida.cuerpo.revision, 2);
    const otra = await foto(m.token.asociadoA1, id, jpegConExif(), 'image/jpeg', '1', clave);
    assert.equal(otra.estado, 200);
    assert.deepEqual(otra.cuerpo, subida.cuerpo);
    const r = await fetch(`${m.api.url}/v1/incidencias/${id}/foto`, { headers: { authorization: `Bearer ${m.token.consejoA}` } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.length, subida.cuerpo.tamano);
    assert.equal(bytes.includes(MARCA_EXIF), false);
    const ajena = await fetch(`${m.api.url}/v1/incidencias/${id}/foto`, { headers: { authorization: `Bearer ${m.token.asociadoA2}` } });
    assert.equal(ajena.status, 403);
  });

  test('foto: otro formato o tipo distinto → 415; más de 5 MiB → 413; sin If-Match → 422; sin foto → 404', async () => {
    const id = (await reportar()).cuerpo.id;
    assert.equal((await foto(m.token.asociadoA1, id, Buffer.from('GIF89a....'), 'image/gif', '1')).estado, 415);
    assert.equal((await foto(m.token.asociadoA1, id, pngConTexto(), 'image/jpeg', '1')).estado, 415);
    assert.equal((await foto(m.token.asociadoA1, id, Buffer.from('{}'), 'application/json', '1')).estado, 415);
    const enorme = Buffer.concat([jpegConExif(), Buffer.alloc(5 * 1024 * 1024)]);
    assert.equal((await foto(m.token.asociadoA1, id, enorme, 'image/jpeg', '1')).estado, 413);
    assert.equal((await foto(m.token.asociadoA1, id, jpegConExif(), 'image/jpeg', '')).estado, 422);
    assert.equal((await foto(m.token.tesoreroA, id, jpegConExif(), 'image/jpeg', '1')).estado, 403);
    const sin = await get(`/v1/incidencias/${id}/foto`, m.token.consejoA);
    assert.equal(sin.estado, 404);
  });

  test('reglas: todo el personal las lee; el Consejo las cambia con la versión vigente; versión vieja → 409', async () => {
    const leidas = await get('/v1/incidencias/reglas-prioridad', m.token.operadorA);
    assert.equal(leidas.estado, 200);
    assert.equal(leidas.cuerpo.version, 0);
    assert.equal((await get('/v1/incidencias/reglas-prioridad', m.token.asociadoA1)).estado, 403);
    const put = (token: string, cuerpo: unknown) => m.api.peticion('PUT', '/v1/incidencias/reglas-prioridad', { token, cuerpo });
    assert.equal((await put(m.token.operadorA, { version: 0, reglas: MATRIZ_POR_DEFECTO })).estado, 403);
    assert.equal((await put(m.token.consejoA, { version: 0, reglas: { fuga: MATRIZ_POR_DEFECTO.fuga } })).estado, 422);
    const ok = await put(m.token.consejoA, { version: 0, reglas: MATRIZ_POR_DEFECTO });
    assert.equal(ok.estado, 200);
    assert.equal(ok.cuerpo.version, 1);
    assert.equal((await put(m.token.consejoA, { version: 0, reglas: MATRIZ_POR_DEFECTO })).estado, 409);
    assert.equal((await get('/v1/incidencias/reglas-prioridad', m.token.consejoB)).cuerpo.version, 0);
  });

  test('listado: filtros y paginación por HTTP; parámetros inválidos → 422', async () => {
    for (let i = 0; i < 3; i++) await reportar(m.token.asociadoB1, { categoria: 'presion', descripcion: `Lista ${i}` });
    const pagina = await get('/v1/incidencias?categoria=presion&limite=2', m.token.consejoB);
    assert.equal(pagina.estado, 200);
    assert.equal(pagina.cuerpo.incidencias.length, 2);
    const siguiente = await get(`/v1/incidencias?categoria=presion&limite=2&cursor=${encodeURIComponent(pagina.cuerpo.siguienteCursor)}`, m.token.consejoB);
    assert.equal(siguiente.cuerpo.incidencias.length, 1);
    assert.equal(siguiente.cuerpo.siguienteCursor, null);
    for (const q of ['limite=0', 'estado=pausada', 'desde=ayer', 'cursor=basura']) {
      assert.equal((await get(`/v1/incidencias?${q}`, m.token.consejoB)).estado, 422, q);
    }
  });
});
