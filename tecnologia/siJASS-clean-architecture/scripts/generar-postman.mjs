#!/usr/bin/env node
// Genera la colección de Postman a partir de `docs/api/openapi.yaml` (la fuente única del contrato).
//
//   node scripts/generar-postman.mjs            # escribe docs/api/sijass.postman_collection.json
//   node scripts/generar-postman.mjs --verificar # falla si el archivo versionado no coincide con el contrato
//
// La colección se importa en Postman o se ejecuta con Newman. Variables: `baseUrl`, `documento`,
// `clave` (cuenta con la que se entra) y `tipo`; el inicio de sesión guarda `token` y `refresco`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const CONTRATO = fileURLToPath(new URL('../../../docs/api/openapi.yaml', import.meta.url));
const SALIDA = fileURLToPath(new URL('../../../docs/api/sijass.postman_collection.json', import.meta.url));
const contrato = parse(readFileSync(CONTRATO, 'utf8'));

function resolver(nodo) {
  if (nodo && typeof nodo === 'object' && '$ref' in nodo) {
    return nodo.$ref.replace(/^#\//, '').split('/').reduce((n, k) => n[k], contrato);
  }
  return nodo;
}

/** Ejemplo mínimo coherente con un esquema (usa `example` o el primer `enum` si existen). */
function ejemplo(esquema, profundidad = 0) {
  const s = resolver(esquema);
  if (s === undefined || profundidad > 4) return null;
  if (s.example !== undefined) return s.example;
  if (s.enum) return s.enum[0];
  const tipo = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  if (tipo === 'object' || s.properties) {
    const obligatorias = new Set(s.required ?? []);
    const obj = {};
    for (const [k, v] of Object.entries(s.properties ?? {})) {
      if (obligatorias.has(k) || profundidad === 0) obj[k] = ejemplo(v, profundidad + 1);
    }
    return obj;
  }
  if (tipo === 'array') return [ejemplo(s.items, profundidad + 1)];
  if (tipo === 'integer' || tipo === 'number') return s.minimum ?? 1;
  if (tipo === 'boolean') return true;
  if (s.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
  if (s.format === 'date-time') return '2026-11-25T08:00:00-05:00';
  return s.minLength ? 'x'.repeat(Math.min(s.minLength, 8)) : 'texto';
}

const VARIABLES_DE_RUTA = { id: 'id', usuarioId: 'usuarioId' };

function peticion(ruta, metodo, op) {
  const parametros = (op.parameters ?? []).map(resolver);
  const cabeceras = [];
  for (const p of parametros) {
    if (p.in === 'header') cabeceras.push({ key: p.name, value: p.name === 'Idempotency-Key' ? '{{$guid}}' : String(ejemplo(p.schema)) });
  }
  const cuerpoSchema = op.requestBody?.content?.['application/json']?.schema;
  if (cuerpoSchema) cabeceras.push({ key: 'Content-Type', value: 'application/json' });
  const caminoPostman = ruta.replace(/\{(\w+)\}/g, ':$1');
  const publica = Array.isArray(op.security) && op.security.length === 0;
  const estados = Object.keys(op.responses ?? {}).filter((c) => /^\d+$/.test(c)).map(Number);

  const prueba = [
    `pm.test('el estado está declarado en el contrato (${estados.join(', ')})', () => pm.expect([${estados.join(', ')}]).to.include(pm.response.code));`,
    "pm.test('responde en menos de 2 s', () => pm.expect(pm.response.responseTime).to.be.below(2000));",
  ];
  if (ruta === '/v1/auth/login') {
    prueba.push(
      "if (pm.response.code === 200) { const s = pm.response.json(); pm.collectionVariables.set('token', s.tokenAcceso); pm.collectionVariables.set('refresco', s.tokenRefresco); }",
    );
  }
  if (ruta === '/v1/auth/refresh') {
    prueba.push(
      "if (pm.response.code === 200) { const s = pm.response.json(); pm.collectionVariables.set('token', s.tokenAcceso); pm.collectionVariables.set('refresco', s.tokenRefresco); }",
    );
  }

  let cuerpo;
  if (cuerpoSchema) {
    let datos = ejemplo(cuerpoSchema);
    if (ruta === '/v1/auth/login') datos = { documento: '{{documento}}', contrasena: '{{clave}}', tipo: '{{tipo}}' };
    if (ruta === '/v1/auth/refresh' || ruta === '/v1/auth/logout') datos = { tokenRefresco: '{{refresco}}' };
    cuerpo = { mode: 'raw', raw: JSON.stringify(datos, null, 2), options: { raw: { language: 'json' } } };
  }

  return {
    name: `${metodo.toUpperCase()} ${ruta}`,
    request: {
      method: metodo.toUpperCase(),
      header: cabeceras,
      ...(cuerpo ? { body: cuerpo } : {}),
      ...(publica ? { auth: { type: 'noauth' } } : {}),
      url: {
        raw: `{{baseUrl}}${caminoPostman}`,
        host: ['{{baseUrl}}'],
        path: caminoPostman.split('/').filter(Boolean),
        variable: [...ruta.matchAll(/\{(\w+)\}/g)].map(([, nombre]) => ({ key: VARIABLES_DE_RUTA[nombre] ?? nombre, value: '00000000-0000-4000-8000-000000000000' })),
      },
      description: [op.summary, op.description].filter(Boolean).join('\n\n'),
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: prueba } }],
  };
}

const carpetas = new Map((contrato.tags ?? []).map((t) => [t.name, { name: t.name, item: [] }]));
for (const [ruta, metodos] of Object.entries(contrato.paths)) {
  for (const [metodo, op] of Object.entries(metodos)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(metodo)) continue;
    const etiqueta = op.tags?.[0] ?? 'Sin etiqueta';
    if (!carpetas.has(etiqueta)) carpetas.set(etiqueta, { name: etiqueta, item: [] });
    carpetas.get(etiqueta).item.push(peticion(ruta, metodo, op));
  }
}

const coleccion = {
  info: {
    name: `${contrato.info.title} (${contrato.info.version})`,
    description: 'Generada desde docs/api/openapi.yaml con `node scripts/generar-postman.mjs`. No la edite a mano: regenérela.\n\nEjecute primero «POST /v1/auth/login» (guarda `token` y `refresco`). Cambie `documento`, `clave` y `tipo` en las variables de la colección para entrar con otra cuenta.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    { key: 'documento', value: '10000002' },
    { key: 'clave', value: '' },
    { key: 'tipo', value: 'administrador' },
    { key: 'token', value: '' },
    { key: 'refresco', value: '' },
  ],
  item: [...carpetas.values()].filter((c) => c.item.length > 0),
};

const texto = `${JSON.stringify(coleccion, null, 2)}\n`;
if (process.argv.includes('--verificar')) {
  const actual = (() => { try { return readFileSync(SALIDA, 'utf8'); } catch { return ''; } })();
  if (actual !== texto) {
    console.error('La colección de Postman no coincide con el contrato. Regenérela: node scripts/generar-postman.mjs');
    process.exit(1);
  }
  console.log('La colección de Postman coincide con el contrato.');
} else {
  writeFileSync(SALIDA, texto, 'utf8');
  const total = coleccion.item.reduce((n, c) => n + c.item.length, 0);
  console.log(`Colección escrita: ${total} peticiones en ${coleccion.item.length} carpetas.`);
}
