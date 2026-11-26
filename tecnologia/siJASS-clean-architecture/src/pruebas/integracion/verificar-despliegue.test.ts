/**
 * `scripts/verificar-despliegue.mjs` contra un servidor bien configurado (la API real con una
 * interfaz de prueba) y contra uno mal configurado (s1e, tarea 3.2).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { crearPool } from './entorno.js';
import { iniciarApi, type Api } from './entorno-api.js';

const SCRIPT = fileURLToPath(new URL('../../../../../scripts/verificar-despliegue.mjs', import.meta.url));

/**
 * Asíncrono a propósito: la API y los servidores de prueba viven en este mismo proceso, y un
 * `spawnSync` bloquearía su bucle de eventos y el script nunca recibiría respuesta.
 */
function ejecutar(argumentos: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, [SCRIPT, ...argumentos], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
    let stdout = '';
    let stderr = '';
    const limite = setTimeout(() => {
      hijo.kill();
      rechazar(new Error('el script no terminó en 30 s'));
    }, 30000);
    hijo.stdout.on('data', (d) => (stdout += d));
    hijo.stderr.on('data', (d) => (stderr += d));
    hijo.on('close', (status) => {
      clearTimeout(limite);
      resolver({ status, stdout, stderr });
    });
  });
}
const verificar = (url: string) => ejecutar([url]);

describe('verificar-despliegue.mjs', () => {
  const pool = crearPool();
  let api: Api;
  before(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><script type="module" src="/assets/app-abc123.js"></script><div id="raiz"></div>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    api = await iniciarApi(pool, undefined, undefined, dir);
  });
  after(async () => {
    await api.cerrar();
    await pool.end();
  });

  test('contra la API local sin TLS: aprueba salud, cabeceras y caché y marca DNS, TLS, HSTS y redirección como no aplicables', async () => {
    const r = await verificar(api.url);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const ok of ['Página principal', 'Caché de index.html', 'Cabeceras de seguridad', 'Caché de estáticos', 'API sin caché', 'Salud']) assert.match(r.stdout, new RegExp(`✔ ${ok}`));
    for (const na of ['DNS', 'Certificado TLS', 'Redirección HTTP→HTTPS', 'HSTS']) assert.match(r.stdout, new RegExp(`– ${na} \\(no aplicable\\)`));
    assert.ok(!/✔ (DNS|Certificado TLS|HSTS|Redirección)/.test(r.stdout), 'lo no aplicable no se da por aprobado');
    assert.match(r.stdout, /4 no aplicables \(no se dan por aprobadas\)/);
  });

  /** Servidor que responde algo plausible pero mal configurado. */
  function servidorMalo(cabeceras: Record<string, string>, salud = 200): Promise<{ url: string; cerrar: () => Promise<void> }> {
    return new Promise((resolver) => {
      const s = http.createServer((req, res) => {
        if (req.url === '/v1/salud') {
          res.writeHead(salud, { 'content-type': 'application/json', ...cabeceras });
          return res.end(JSON.stringify(salud === 200 ? { estado: 'ok', base: 'ok' } : { estado: 'degradado', base: 'error' }));
        }
        if (req.url?.startsWith('/assets/')) {
          res.writeHead(200, { 'cache-control': 'max-age=60' });
          return res.end('x');
        }
        res.writeHead(200, { 'content-type': 'text/html', ...cabeceras });
        res.end('<script src="/assets/app-1.js"></script><div id="raiz"></div>');
      });
      s.listen(0, '127.0.0.1', () => resolver({ url: `http://127.0.0.1:${(s.address() as { port: number }).port}`, cerrar: () => new Promise((r) => s.close(() => r())) }));
    });
  }

  test('contra un servidor sin cabeceras de seguridad ni caché correcta: falla y nombra cada comprobación', async () => {
    const s = await servidorMalo({ 'x-powered-by': 'Express' });
    try {
      const r = await verificar(s.url);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /✖ Página principal: .*Cache-Control: no-cache/);
      assert.match(r.stdout, /✖ Caché de estáticos: .*immutable/);
      assert.match(r.stdout, /✖ API sin caché: .*no-store/);
    } finally {
      await s.cerrar();
    }
  });

  test('con index.html correcto pero sin cabeceras de seguridad: falla nombrando las que faltan', async () => {
    const s = await servidorMalo({ 'cache-control': 'no-cache', 'x-powered-by': 'Express' });
    try {
      const r = await verificar(s.url);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /✖ Página principal: cabeceras de seguridad incorrectas: .*X-Content-Type-Options.*X-Frame-Options.*Referrer-Policy.*X-Powered-By/);
    } finally {
      await s.cerrar();
    }
  });

  test('con la salud degradada: falla en «Salud»', async () => {
    const s = await servidorMalo({ 'cache-control': 'no-store' }, 503);
    try {
      const r = await verificar(s.url);
      assert.equal(r.status, 1);
      assert.match(r.stdout, /✖ Salud: .*503/);
    } finally {
      await s.cerrar();
    }
  });

  test('sin argumento: uso y código 2; con un destino inalcanzable: falla', async () => {
    const sin = await ejecutar([]);
    assert.equal(sin.status, 2);
    assert.match(sin.stderr, /Uso/);
    const r = await verificar('http://127.0.0.1:1');
    assert.equal(r.status, 1);
  });
});
