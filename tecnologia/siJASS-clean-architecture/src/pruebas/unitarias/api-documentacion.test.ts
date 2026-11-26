/** Documentación interactiva de la API (Swagger UI en `/docs`), servida sin dependencias externas. */
import type { INestApplication } from '@nestjs/common';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from '../marco.js';
import { crearAplicacion } from '../../api/aplicacion.js';
import { leerConfiguracion } from '../../api/config.js';
import { UnidadDeTrabajoAccesoMemoria } from '../../infraestructura/memoria-acceso.js';
import { crearEntorno } from '../entorno-acceso.js';

const CONTRATO = fileURLToPath(new URL('../../../../../docs/api/openapi.yaml', import.meta.url));

async function iniciar(archivoOpenapi: string | undefined): Promise<{ app: INestApplication; url: string }> {
  const entorno = crearEntorno(new UnidadDeTrabajoAccesoMemoria());
  const app = await crearAplicacion({ casos: entorno.casos, archivoOpenapi });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };
  return { app, url: `http://127.0.0.1:${port}` };
}

describe('documentación de la API en /docs', () => {
  let con: { app: INestApplication; url: string };
  let sin: { app: INestApplication; url: string };

  before(async () => {
    con = await iniciar(CONTRATO);
    sin = await iniciar(undefined);
  });
  after(async () => {
    await con.app.close();
    await sin.app.close();
  });

  test('la página carga Swagger UI desde el propio origen, sin sesión y con cabeceras seguras', async () => {
    const r = await fetch(`${con.url}/docs`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/html/);
    const html = await r.text();
    assert.match(html, /\/docs\/swagger-ui-bundle\.js/);
    assert.doesNotMatch(html, /https?:\/\//, 'ningún recurso externo');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('cache-control'), 'no-cache');
  });

  test('publica el contrato OpenAPI y los dos archivos de Swagger UI', async () => {
    const contrato = await fetch(`${con.url}/docs/openapi.yaml`);
    assert.equal(contrato.status, 200);
    assert.match(contrato.headers.get('content-type') ?? '', /yaml/);
    const texto = await contrato.text();
    assert.match(texto, /^openapi: 3\.1\.0/m);
    assert.match(texto, /\/v1\/auth\/login:/);
    for (const [ruta, tipo] of [['/docs/swagger-ui.css', /text\/css/], ['/docs/swagger-ui-bundle.js', /javascript/], ['/docs/iniciar.js', /javascript/]] as const) {
      const r = await fetch(`${con.url}${ruta}`);
      assert.equal(r.status, 200, ruta);
      assert.match(r.headers.get('content-type') ?? '', tipo, ruta);
    }
  });

  test('solo se publican los archivos previstos: el resto del paquete y otros métodos no', async () => {
    for (const ruta of ['/docs/package.json', '/docs/swagger-ui.js', '/docs/../package.json', '/docs/otra-cosa']) {
      const r = await fetch(`${con.url}${ruta}`);
      assert.equal(r.status, 404, ruta);
    }
    const post = await fetch(`${con.url}/docs`, { method: 'POST' });
    assert.notEqual(post.status, 200);
  });

  test('sin contrato no hay documentación y la API sigue funcionando', async () => {
    assert.equal((await fetch(`${sin.url}/docs`)).status, 404);
    assert.equal((await fetch(`${sin.url}/docs/openapi.yaml`)).status, 404);
    const r = await fetch(`${sin.url}/v1/yo`);
    assert.equal(r.status, 401, 'las rutas de la API conservan su guardia');
  });

  test('por defecto la configuración apunta al contrato del repositorio y OPENAPI_FILE lo reemplaza', () => {
    const base = { JWT_SECRET: 's'.repeat(32), DATABASE_URL: 'postgres://x' };
    assert.match(leerConfiguracion(base).archivoOpenapi ?? '', /docs[\\/]api[\\/]openapi\.yaml$/);
    assert.equal(leerConfiguracion({ ...base, OPENAPI_FILE: '/app/openapi.yaml' }).archivoOpenapi, '/app/openapi.yaml');
  });
});
