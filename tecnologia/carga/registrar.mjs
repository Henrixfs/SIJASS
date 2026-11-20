#!/usr/bin/env node
/**
 * Registra el resultado de una ejecución k6 con su entorno, fecha, versión y máquina (s1e,
 * design.md D8, spec `pruebas-de-carga`).
 *
 *   node tecnologia/carga/registrar.mjs <resumen-k6.json> [--observaciones="texto"]
 *
 * Escribe `docs/07-evaluacion-final/carga/<entorno>-<fecha>.json` con las métricas esenciales y,
 * cuando el entorno es `local`, una advertencia fija: una cifra local NO es capacidad del despliegue.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node tecnologia/carga/registrar.mjs <resumen-k6.json> [--observaciones="texto"]');
  process.exit(2);
}
const observaciones = (process.argv.find((a) => a.startsWith('--observaciones=')) ?? '').slice('--observaciones='.length);
const k6 = JSON.parse(readFileSync(archivo, 'utf8'));
if (!['local', 'ci', 'despliegue'].includes(k6.entorno)) throw new Error('El resumen no declara un entorno válido (local, ci o despliegue)');

const m = k6.resumen.metrics;
const v = (metrica, estadistico) => m[metrica]?.values?.[estadistico];
const redondear = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : null);
const comando = (c) => {
  try {
    return execSync(c, { encoding: 'utf8' }).trim();
  } catch {
    return 'desconocido';
  }
};

const registro = {
  entorno: k6.entorno,
  fecha: new Date().toISOString(),
  version: comando('git rev-parse --short HEAD'),
  metaVu: k6.metaVu,
  vuMaximos: v('vus_max', 'max') ?? v('vus', 'max'),
  duracionS: redondear((k6.resumen.state?.testRunDurationMs ?? 0) / 1000),
  maquina: { so: `${os.type()} ${os.release()}`, cpus: os.cpus().length, modeloCpu: os.cpus()[0]?.model, memoriaGb: Math.round(os.totalmem() / 2 ** 30) },
  rendimiento: { solicitudesPorSegundo: redondear(v('http_reqs', 'rate')), solicitudesTotales: v('http_reqs', 'count') },
  latenciaMs: {
    lectura: { p50: redondear(v('http_req_duration{tipo:lectura}', 'med')), p95: redondear(v('http_req_duration{tipo:lectura}', 'p(95)')), p99: redondear(v('http_req_duration{tipo:lectura}', 'p(99)')), max: redondear(v('http_req_duration{tipo:lectura}', 'max')) },
    login: { p50: redondear(v('http_req_duration{tipo:login}', 'med')), p95: redondear(v('http_req_duration{tipo:login}', 'p(95)')), p99: redondear(v('http_req_duration{tipo:login}', 'p(99)')), max: redondear(v('http_req_duration{tipo:login}', 'max')) },
  },
  errores: {
    lecturaTasa: redondear(v('errores_lectura', 'rate')),
    loginTasa: redondear(v('errores_login', 'rate')),
    solicitudesFallidasTasa: redondear(v('http_req_failed', 'rate')),
    iniciosDeSesion: v('inicios_de_sesion', 'count'),
  },
  porEtapa: (k6.etapas ?? []).map((e, i) => {
    const sufijo = `{tipo:lectura,etapa:${i + 1}}`;
    return {
      etapa: i + 1,
      vuObjetivo: e.target,
      p50Ms: redondear(v(`http_req_duration${sufijo}`, 'med')),
      p95Ms: redondear(v(`http_req_duration${sufijo}`, 'p(95)')),
      p99Ms: redondear(v(`http_req_duration${sufijo}`, 'p(99)')),
      errorTasa: redondear(v(`errores_lectura{etapa:${i + 1}}`, 'rate')),
    };
  }).filter((e) => e.p95Ms !== null && e.vuObjetivo > 0),
  umbrales: Object.fromEntries(Object.entries(m).flatMap(([nombre, metrica]) => (metrica.thresholds ? Object.entries(metrica.thresholds).filter(() => !nombre.includes('etapa:')).map(([t, ok]) => [`${nombre} ${t}`, ok.ok ?? ok]) : []))),
  observaciones,
  advertencia:
    k6.entorno === 'local'
      ? 'Resultado LOCAL: el generador de carga, la API y la base de datos comparten la misma máquina de desarrollo. NO representa la capacidad del despliegue ni de una JASS real.'
      : k6.entorno === 'ci'
        ? 'Resultado de CI: ejecutores compartidos de GitHub Actions; no representa el despliegue.'
        : 'Resultado contra el servicio desplegado.',
};

const carpeta = fileURLToPath(new URL('../../docs/07-evaluacion-final/carga/', import.meta.url));
mkdirSync(carpeta, { recursive: true });
const nombre = `${registro.entorno}-${registro.fecha.slice(0, 19).replace(/[:T]/g, '-')}.json`;
writeFileSync(`${carpeta}${nombre}`, `${JSON.stringify(registro, null, 2)}\n`);
console.log(`Registrado: docs/07-evaluacion-final/carga/${nombre}`);
console.log(JSON.stringify({ entorno: registro.entorno, vuMaximos: registro.vuMaximos, rendimiento: registro.rendimiento, latenciaLecturaMs: registro.latenciaMs.lectura, errores: registro.errores, porEtapa: registro.porEtapa }, null, 2));
