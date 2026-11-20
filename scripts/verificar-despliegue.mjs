#!/usr/bin/env node
/**
 * Verificación de un despliegue de SIJASS (s1e, spec `despliegue-contenedor`).
 *
 *   node scripts/verificar-despliegue.mjs <url>
 *
 * Informa por separado cada comprobación: ✔ aprobada, ✖ fallida (con el motivo) o – no aplicable.
 * Una comprobación que no se puede hacer (por ejemplo, TLS contra http://127.0.0.1) se marca como
 * «no aplicable»: NUNCA como aprobada. Termina con código 1 si alguna falla.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';

const entrada = process.argv[2];
if (!entrada) {
  console.error('Uso: node scripts/verificar-despliegue.mjs <url>   (por ejemplo https://sijass.ejemplo.pe)');
  process.exit(2);
}

const url = new URL(entrada);
const esHttps = url.protocol === 'https:';
const esLocal = url.hostname === 'localhost' || net.isIP(url.hostname) !== 0;
const base = `${url.protocol}//${url.host}`;
const resultados = [];

const aprobada = (nombre, detalle = '') => resultados.push({ nombre, estado: 'ok', detalle });
const fallida = (nombre, detalle) => resultados.push({ nombre, estado: 'fallo', detalle });
const noAplica = (nombre, motivo) => resultados.push({ nombre, estado: 'na', detalle: motivo });

async function obtener(ruta, opciones = {}) {
  return fetch(`${base}${ruta}`, { redirect: 'manual', ...opciones });
}

async function comprobar(nombre, fn) {
  try {
    await fn();
  } catch (error) {
    fallida(nombre, error instanceof Error ? error.message : String(error));
  }
}

// --- DNS -------------------------------------------------------------------------------------
await comprobar('DNS', async () => {
  if (esLocal) return noAplica('DNS', 'el destino es una dirección IP o localhost');
  const direcciones = await dns.lookup(url.hostname, { all: true });
  if (direcciones.length === 0) throw new Error('el nombre no resuelve a ninguna dirección');
  aprobada('DNS', direcciones.map((d) => d.address).join(', '));
});

// --- TLS -------------------------------------------------------------------------------------
await comprobar('Certificado TLS', async () => {
  if (!esHttps) return noAplica('Certificado TLS', 'el destino no usa HTTPS');
  const certificado = await new Promise((resolver, rechazar) => {
    const socket = tls.connect({ host: url.hostname, port: Number(url.port || 443), servername: url.hostname, timeout: 8000 }, () => {
      const c = socket.getPeerCertificate();
      const autorizado = socket.authorized;
      const motivo = socket.authorizationError;
      socket.end();
      autorizado ? resolver(c) : rechazar(new Error(`certificado no confiable: ${String(motivo)}`));
    });
    socket.on('error', rechazar);
    socket.on('timeout', () => rechazar(new Error('tiempo agotado al conectar')));
  });
  const vence = new Date(certificado.valid_to);
  const dias = Math.floor((vence.getTime() - Date.now()) / 86_400_000);
  if (dias < 7) throw new Error(`el certificado vence en ${dias} días (${vence.toISOString().slice(0, 10)})`);
  aprobada('Certificado TLS', `vigente, vence en ${dias} días`);
});

// --- Redirección HTTP → HTTPS ------------------------------------------------------------------
await comprobar('Redirección HTTP→HTTPS', async () => {
  if (!esHttps) return noAplica('Redirección HTTP→HTTPS', 'el destino no usa HTTPS');
  const r = await fetch(`http://${url.host.replace(/:\d+$/, '')}/`, { redirect: 'manual' });
  const destino = r.headers.get('location') ?? '';
  if (![301, 302, 307, 308].includes(r.status) || !destino.startsWith('https://')) {
    throw new Error(`HTTP respondió ${r.status} sin redirigir a https (location: ${destino || 'ninguna'})`);
  }
  aprobada('Redirección HTTP→HTTPS', `${r.status} → ${destino}`);
});

// --- Página principal, cabeceras y caché -------------------------------------------------------
let html = '';
await comprobar('Página principal', async () => {
  const r = await obtener('/');
  if (r.status !== 200) throw new Error(`/ respondió ${r.status}`);
  html = await r.text();
  if (!html.includes('<div id="raiz">')) throw new Error('/ no devuelve la interfaz');
  aprobada('Página principal', '200, interfaz servida');
  const cc = r.headers.get('cache-control') ?? '';
  if (!cc.includes('no-cache')) throw new Error(`index.html debe llevar Cache-Control: no-cache (lleva «${cc || 'nada'}»)`);
  aprobada('Caché de index.html', cc);

  const faltan = [];
  if ((r.headers.get('x-content-type-options') ?? '').toLowerCase() !== 'nosniff') faltan.push('X-Content-Type-Options: nosniff');
  if (!r.headers.get('x-frame-options')) faltan.push('X-Frame-Options');
  if (!r.headers.get('referrer-policy')) faltan.push('Referrer-Policy');
  if (r.headers.get('x-powered-by')) faltan.push('sin X-Powered-By (está presente)');
  if (faltan.length > 0) throw new Error(`cabeceras de seguridad incorrectas: ${faltan.join(', ')}`);
  aprobada('Cabeceras de seguridad', 'X-Content-Type-Options, X-Frame-Options y Referrer-Policy presentes; sin X-Powered-By');

  if (!esHttps) noAplica('HSTS', 'el destino no usa HTTPS');
  else {
    const hsts = r.headers.get('strict-transport-security') ?? '';
    if (!/max-age=\d{7,}/.test(hsts)) throw new Error(`falta Strict-Transport-Security con max-age de al menos un año (lleva «${hsts || 'nada'}»)`);
    aprobada('HSTS', hsts);
  }
});

await comprobar('Caché de estáticos', async () => {
  const m = /(?:src|href)="(\/assets\/[^"]+)"/.exec(html);
  if (!m) throw new Error('no se encontró ningún archivo de /assets/ en index.html');
  const r1 = await obtener(m[1]);
  if (r1.status !== 200) throw new Error(`${m[1]} respondió ${r1.status}`);
  const cc = r1.headers.get('cache-control') ?? '';
  if (!/public/.test(cc) || !/immutable/.test(cc) || !/max-age=\d{7,}/.test(cc)) throw new Error(`${m[1]} debe ser public, immutable y con max-age de al menos un año (lleva «${cc || 'nada'}»)`);
  if (!r1.headers.get('etag')) throw new Error(`${m[1]} no lleva ETag`);
  aprobada('Caché de estáticos', `${m[1]}: ${cc}`);
});

await comprobar('API sin caché', async () => {
  const r = await obtener('/v1/salud');
  const cc = r.headers.get('cache-control') ?? '';
  if (!cc.includes('no-store')) throw new Error(`/v1/* debe llevar Cache-Control: no-store (lleva «${cc || 'nada'}»)`);
  aprobada('API sin caché', cc);
});

await comprobar('Salud', async () => {
  const r = await obtener('/v1/salud');
  const cuerpo = await r.json().catch(() => ({}));
  if (r.status !== 200 || cuerpo.estado !== 'ok' || cuerpo.base !== 'ok') throw new Error(`/v1/salud respondió ${r.status} ${JSON.stringify(cuerpo)}`);
  aprobada('Salud', 'estado ok, base ok');
});

// --- Informe -----------------------------------------------------------------------------------
const marca = { ok: '✔', fallo: '✖', na: '–' };
for (const r of resultados) console.log(`${marca[r.estado]} ${r.nombre}${r.estado === 'na' ? ' (no aplicable)' : ''}${r.detalle ? `: ${r.detalle}` : ''}`);
const fallos = resultados.filter((r) => r.estado === 'fallo');
const noAplicables = resultados.filter((r) => r.estado === 'na');
console.log(`\n${resultados.length - fallos.length - noAplicables.length} aprobadas, ${fallos.length} fallidas, ${noAplicables.length} no aplicables (no se dan por aprobadas).`);
// `exitCode` en vez de `process.exit`: salir con conexiones HTTP abiertas rompe libuv en Windows.
process.exitCode = fallos.length > 0 ? 1 : 0;
