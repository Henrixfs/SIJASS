// Escenario k6 del portal del asociado (s1e, design.md D7). Cada usuario virtual usa su propia
// cuenta (`asociado<__VU>@carga.sijass.pe`), inicia sesión UNA vez y consulta repetidamente su
// saldo, sus cuotas y sus pagos con tiempo de pensamiento. La carga sube por etapas hasta META_VU.
//
//   k6 run -e BASE_URL=http://host:3000 -e CLAVE_CARGA=… -e META_VU=2000 portal.js
//
// Variables: BASE_URL, CLAVE_CARGA (obligatoria), META_VU (2000), SEGUNDOS_ETAPA (60),
// SEGUNDOS_MANTENER (120), ENTORNO (local|ci|despliegue; obligatorio), SALIDA (ruta del resumen JSON).
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const CLAVE = __ENV.CLAVE_CARGA;
const META = Number(__ENV.META_VU || 2000);
const POR_ETAPA = Number(__ENV.SEGUNDOS_ETAPA || 60);
const MANTENER = Number(__ENV.SEGUNDOS_MANTENER || 120);
const ENTORNO = __ENV.ENTORNO;

if (!CLAVE) throw new Error('Falta CLAVE_CARGA');
if (!['local', 'ci', 'despliegue'].includes(ENTORNO)) throw new Error('ENTORNO debe ser local, ci o despliegue: cada resultado se etiqueta con su entorno');

// Subida gradual hacia la meta, una etapa por escalón, y luego mantenimiento y descenso. Por
// defecto los escalones son fracciones de la meta; `ETAPAS=25,50,100,…` los fija en usuarios virtuales.
const OBJETIVOS = __ENV.ETAPAS
  ? __ENV.ETAPAS.split(',').map((x) => Number(x.trim()))
  : [0.025, 0.1, 0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(META * f)));
const stages = [
  ...OBJETIVOS.map((target) => ({ duration: `${POR_ETAPA}s`, target })),
  { duration: `${MANTENER}s`, target: OBJETIVOS[OBJETIVOS.length - 1] },
  { duration: '30s', target: 0 },
];

// Etiqueta `etapa` (1..N en la subida, N+1 mantenimiento, N+2 descenso) para medir cada escalón por separado.
function etapaActual() {
  const t = exec.instance.currentTestRunDuration / 1000;
  return Math.min(Math.floor(t / POR_ETAPA) + 1, OBJETIVOS.length + 1 + (t > POR_ETAPA * OBJETIVOS.length + MANTENER ? 1 : 0));
}

export const options = {
  scenarios: { portal: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '30s' } },
  thresholds: {
    'http_req_duration{tipo:lectura}': ['p(95)<800'],
    errores_lectura: ['rate<0.01'],
    errores_login: ['rate<0.01'],
    'http_req_duration{tipo:login}': ['max>=0'], // siempre verdadero: solo hace que k6 informe el inicio de sesión aparte
    // Umbrales siempre verdaderos que solo sirven para que k6 informe cada etapa por separado.
    ...Object.fromEntries(
      Array.from({ length: OBJETIVOS.length + 2 }, (_, i) => i + 1).flatMap((e) => [
        [`http_req_duration{tipo:lectura,etapa:${e}}`, ['max>=0']],
        [`errores_lectura{etapa:${e}}`, ['rate>=0']],
      ]),
    ),
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const erroresLectura = new Rate('errores_lectura');
const erroresLogin = new Rate('errores_login');
const inicios = new Counter('inicios_de_sesion');

let token = null;

function iniciarSesion() {
  const r = http.post(`${BASE}/v1/auth/login`, JSON.stringify({ correo: `asociado${__VU}@carga.sijass.pe`, contrasena: CLAVE }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { tipo: 'login' },
  });
  const ok = r.status === 200;
  erroresLogin.add(!ok);
  inicios.add(1);
  token = ok ? r.json('tokenAcceso') : null;
  return ok;
}

export default function () {
  if (token === null && !iniciarSesion()) {
    sleep(5);
    return;
  }
  const etapa = String(etapaActual());
  const cabeceras = { headers: { Authorization: `Bearer ${token}` }, tags: { tipo: 'lectura', etapa } };
  for (const ruta of ['saldo', 'cuotas', 'pagos']) {
    const r = http.get(`${BASE}/v1/portal/${ruta}`, cabeceras);
    const ok = check(r, { 'estado 200': (x) => x.status === 200 });
    erroresLectura.add(!ok, { etapa });
    if (r.status === 401) {
      token = null; // el token de acceso dura 15 minutos: se vuelve a iniciar sesión
      break;
    }
  }
  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  const salida = __ENV.SALIDA || 'resumen-k6.json';
  return { [salida]: JSON.stringify({ entorno: ENTORNO, metaVu: META, etapas: stages, resumen: data }, null, 2) };
}
