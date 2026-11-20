/**
 * Sonda de salud y caché estática de la interfaz (s1e, tareas 2.1 y 2.2).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import pg from 'pg';
import { crearAplicacion } from '../../api/aplicacion.js';
import { UnidadDeTrabajoAccesoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { UnidadDeTrabajoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-postgres.js';
import { crearEntorno } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';
import { iniciarApi, type Api } from './entorno-api.js';

function crearWeb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>SIJASS</title><div id="raiz"></div>');
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log("app");');
  writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return dir;
}

describe('API — /v1/salud', () => {
  const pool = crearPool();
  let api: Api;
  before(async () => {
    api = await iniciarApi(pool);
  });
  after(async () => {
    await api.cerrar();
    await pool.end();
  });

  test('con la base disponible: 200 {estado: ok, base: ok}, sin sesión y sin otros datos', async () => {
    const r = await api.peticion('GET', '/v1/salud');
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { estado: 'ok', base: 'ok' });
    assert.equal(r.cabeceras.get('cache-control'), 'no-store');
  });

  test('con la base caída: 503 sin direcciones, usuario ni texto de error', async () => {
    const mala = new pg.Pool({ connectionString: 'postgres://usuario-secreto:clave-secreta@127.0.0.1:1/base-secreta', max: 1, connectionTimeoutMillis: 1000 });
    mala.on('error', () => undefined);
    const entorno = crearEntorno(new UnidadDeTrabajoAccesoPostgres(mala), { mediciones: new UnidadDeTrabajoPostgres(mala) });
    const app = await crearAplicacion({ casos: entorno.casos });
    await app.listen(0, '127.0.0.1');
    try {
      const puerto = (app.getHttpServer().address() as { port: number }).port;
      const r = await fetch(`http://127.0.0.1:${puerto}/v1/salud`);
      const texto = await r.text();
      assert.equal(r.status, 503);
      assert.deepEqual(JSON.parse(texto), { estado: 'degradado', base: 'error' });
      for (const secreto of ['usuario-secreto', 'clave-secreta', 'base-secreta', '127.0.0.1', 'ECONNREFUSED', 'connect']) assert.ok(!texto.includes(secreto), `filtra ${secreto}`);
    } finally {
      await app.close();
      await mala.end().catch(() => undefined);
    }
  });
});

describe('API — caché estática de la interfaz', () => {
  const pool = crearPool();
  let api: Api;
  before(async () => {
    api = await iniciarApi(pool, undefined, undefined, crearWeb());
  });
  after(async () => {
    await api.cerrar();
    await pool.end();
  });

  test('/assets/* con hash: public, max-age de un año, immutable y ETag', async () => {
    const r = await api.peticion('GET', '/assets/index-abc123.js');
    assert.equal(r.estado, 200);
    assert.equal(r.cabeceras.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.ok(r.cabeceras.get('etag'));
    assert.equal(r.texto, 'console.log("app");');
  });

  /**
   * `fetch` añade `Cache-Control: no-cache` a las solicitudes con `If-None-Match` (modo `no-store`
   * de la especificación), lo que obliga a un 200; un navegador real revalida con `max-age` vencido
   * y sin esa cabecera. Por eso la solicitud condicional se hace con `node:http`.
   */
  function condicional(ruta: string, etag: string): Promise<{ estado: number; cuerpo: string }> {
    return new Promise((resolver, rechazar) => {
      http
        .get(`${api.url}${ruta}`, { headers: { 'if-none-match': etag } }, (res) => {
          let cuerpo = '';
          res.on('data', (d) => (cuerpo += d));
          res.on('end', () => resolver({ estado: res.statusCode ?? 0, cuerpo }));
        })
        .on('error', rechazar);
    });
  }

  test('solicitud condicional con el ETag vigente → 304 sin cuerpo; con otro ETag → 200', async () => {
    const etag = (await api.peticion('GET', '/assets/index-abc123.js')).cabeceras.get('etag')!;
    const vigente = await condicional('/assets/index-abc123.js', etag);
    assert.equal(vigente.estado, 304);
    assert.equal(vigente.cuerpo, '');
    assert.equal((await condicional('/assets/index-abc123.js', '"otro"')).estado, 200);
  });

  test('index.html y las rutas de la SPA: no-cache', async () => {
    for (const ruta of ['/', '/portal', '/personal/asociados/abc', '/ingresar']) {
      const r = await api.peticion('GET', ruta);
      assert.equal(r.estado, 200, ruta);
      assert.equal(r.cabeceras.get('cache-control'), 'no-cache', ruta);
      assert.match(r.texto, /<div id="raiz">/);
    }
    const f = await api.peticion('GET', '/favicon.svg');
    assert.equal(f.cabeceras.get('cache-control'), 'no-cache');
  });

  test('un /assets/ inexistente es 404 (no index.html)', async () => {
    const r = await api.peticion('GET', '/assets/no-existe.js');
    assert.equal(r.estado, 404);
    assert.ok(!r.texto.includes('<div id="raiz">'));
  });

  test('toda ruta /v1/* lleva no-store y la API no se sirve como interfaz', async () => {
    for (const ruta of ['/v1/salud', '/v1/yo', '/v1/no-existe']) {
      const r = await api.peticion('GET', ruta);
      assert.equal(r.cabeceras.get('cache-control'), 'no-store', ruta);
      assert.ok(!r.texto.includes('<div id="raiz">'), ruta);
    }
  });

  test('un POST a una ruta de la interfaz no devuelve index.html', async () => {
    const r = await api.peticion('POST', '/portal', { cuerpo: {} });
    assert.notEqual(r.estado, 200);
  });

  test('las cabeceras de seguridad acompañan también a los estáticos', async () => {
    const r = await api.peticion('GET', '/assets/index-abc123.js');
    assert.equal(r.cabeceras.get('x-content-type-options'), 'nosniff');
    assert.equal(r.cabeceras.get('x-frame-options'), 'DENY');
    assert.equal(r.cabeceras.get('x-powered-by'), null);
  });
});
