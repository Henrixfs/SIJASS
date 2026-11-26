// Mide, contra una API con la base de carga, el padrón de 2.000 asociados y las lecturas del portal (uso: node medir-api.mjs http://host:puerto).
// Requiere la siembra de `scripts/sembrar-carga.mjs` y la misma clave en SIJASS_CLAVE_CARGA (se lee del entorno).
const base = process.argv[2];
const clave = process.env.SIJASS_CLAVE_CARGA;
if (!base || !clave) throw new Error('Uso: SIJASS_CLAVE_CARGA=… node medir-api.mjs http://host:puerto');
async function login(documento) {
  const r = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento, contrasena: clave }) });
  if (!r.ok) throw new Error(`login ${documento}: ${r.status}`);
  return (await r.json()).tokenAcceso;
}
async function tiempo(nombre, ruta, token, veces = 5) {
  const ms = [];
  let cuerpo = 0;
  for (let i = 0; i < veces; i++) {
    const t0 = performance.now();
    const r = await fetch(`${base}${ruta}`, { headers: { authorization: `Bearer ${token}` } });
    const texto = await r.text();
    ms.push(performance.now() - t0);
    cuerpo = texto.length;
    if (r.status !== 200) throw new Error(`${ruta}: ${r.status}`);
  }
  ms.sort((a, b) => a - b);
  console.log(`${nombre.padEnd(46)} mediana ${ms[Math.floor(ms.length / 2)].toFixed(1).padStart(8)} ms   mín ${ms[0].toFixed(1)}   máx ${ms[ms.length - 1].toFixed(1)}   (${cuerpo} bytes)`);
}
const t0 = performance.now();
const tesorero = await login('99999999');
console.log(`inicio de sesión (scrypt, N=2^15): ${(performance.now() - t0).toFixed(0)} ms`);
const asociado = await login('90000777');
await tiempo('GET /v1/asociados (padrón de 2.000)', '/v1/asociados', tesorero);
await tiempo('GET /v1/portal/saldo', '/v1/portal/saldo', asociado, 20);
await tiempo('GET /v1/portal/cuotas', '/v1/portal/cuotas', asociado, 20);
await tiempo('GET /v1/portal/pagos', '/v1/portal/pagos', asociado, 20);
await tiempo('GET /v1/yo', '/v1/yo', asociado, 20);
