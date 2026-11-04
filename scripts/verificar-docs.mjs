#!/usr/bin/env node
// Verificación de integridad documental de SIJASS (sin dependencias).
//
// Comprueba, sobre todos los archivos .md versionados del repositorio:
//   1. Enlaces relativos: el destino (archivo o carpeta) existe. Se ignoran
//      URLs absolutas, mailto y anclas; no se validan los fragmentos (#sección).
//   2. Identificadores HUnn, RFnn, RNFnn, ADR-nnn, PTnn y DTnn: cada uno
//      referenciado debe estar definido en su documento fuente.
//   3. Criterios C01-C16: la rúbrica y la matriz de cumplimiento contienen
//      cada código exactamente una vez como fila de tabla, y ningún documento
//      referencia un código fuera de C01-C16.
//
// Uso: node scripts/verificar-docs.mjs   (desde cualquier carpeta)
// Salida: código 0 si todo es consistente; código 1 si hay problemas.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETAS_EXCLUIDAS = new Set(['node_modules', '.git', 'openspec', '.claude', '.agents', 'dist']);

// Prefijo del identificador → documento donde debe estar definido.
const FUENTES = {
  HU: 'docs/01-analisis-de-sistema/02-historias-del-usuario.md',
  RF: 'docs/01-analisis-de-sistema/03-requisitos-funcionales.md',
  RNF: 'docs/01-analisis-de-sistema/04-atributos-de-calidad.md',
  ADR: 'docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md',
  PT: 'docs/05-trazabilidad-y-validacion/plan-pruebas.md',
  DT: 'docs/00-alcance-y-roadmap.md',
};
const RUBRICA = 'docs/07-evaluacion-final/rubrica-trabajo-final.md';
const MATRIZ = 'docs/07-evaluacion-final/matriz-cumplimiento.md';
const CRITERIOS = Array.from({ length: 16 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);

const problemas = [];
const rel = (ruta) => relative(RAIZ, ruta).split(sep).join('/');

function listarMarkdown(carpeta) {
  const archivos = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (!CARPETAS_EXCLUIDAS.has(entrada.name)) archivos.push(...listarMarkdown(join(carpeta, entrada.name)));
    } else if (entrada.name.endsWith('.md')) {
      archivos.push(join(carpeta, entrada.name));
    }
  }
  return archivos;
}

const quitarBloquesDeCodigo = (texto) => texto.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '');

// --- Definiciones de identificadores ---------------------------------------
const definidos = {};
for (const [prefijo, archivo] of Object.entries(FUENTES)) {
  const ruta = join(RAIZ, archivo);
  if (!existsSync(ruta)) {
    problemas.push(`${archivo}: documento fuente de ${prefijo} inexistente`);
    definidos[prefijo] = new Set();
    continue;
  }
  const guion = prefijo === 'ADR' ? '-' : '';
  // Definición: primera celda de una fila de tabla o encabezado que empieza con el ID.
  const patron = new RegExp(`^(?:\\|\\s*|#+\\s*)(${prefijo}${guion}\\d{2,3})\\b`, 'gm');
  definidos[prefijo] = new Set([...readFileSync(ruta, 'utf8').matchAll(patron)].map((m) => m[1]));
}

// --- Recorrido de documentos ----------------------------------------------
const archivos = listarMarkdown(RAIZ);
let enlacesRevisados = 0;
let referenciasRevisadas = 0;

for (const archivo of archivos) {
  const texto = readFileSync(archivo, 'utf8');
  const nombre = rel(archivo);

  // 1. Enlaces relativos (fuera de bloques de código).
  for (const m of quitarBloquesDeCodigo(texto).matchAll(/\]\(([^)\s]+)\)/g)) {
    const destino = m[1].split('#')[0].split('?')[0];
    if (!destino || /^[a-z][a-z0-9+.-]*:/i.test(destino)) continue;
    enlacesRevisados++;
    let ruta;
    try {
      ruta = destino.startsWith('/') ? join(RAIZ, decodeURIComponent(destino)) : resolve(dirname(archivo), decodeURIComponent(destino));
    } catch {
      problemas.push(`${nombre}: enlace con codificación inválida -> ${m[1]}`);
      continue;
    }
    if (!existsSync(ruta)) problemas.push(`${nombre}: enlace roto -> ${m[1]}`);
  }

  // 2. Identificadores referenciados.
  for (const [prefijo, ids] of Object.entries(definidos)) {
    const guion = prefijo === 'ADR' ? '-' : '';
    const vistos = new Set(texto.match(new RegExp(`\\b${prefijo}${guion}\\d{2,3}\\b`, 'g')) ?? []);
    for (const id of vistos) {
      referenciasRevisadas++;
      if (!ids.has(id)) problemas.push(`${nombre}: identificador ${id} no definido en ${FUENTES[prefijo]}`);
    }
  }

  // 3a. Códigos de criterio referenciados.
  for (const codigo of new Set(texto.match(/\bC\d{2}\b/g) ?? [])) {
    referenciasRevisadas++;
    if (!CRITERIOS.includes(codigo)) problemas.push(`${nombre}: criterio ${codigo} fuera de C01-C16`);
  }
}

// 3b. Rúbrica y matriz: cada criterio exactamente una vez como fila de tabla.
for (const archivo of [RUBRICA, MATRIZ]) {
  const ruta = join(RAIZ, archivo);
  if (!existsSync(ruta)) {
    problemas.push(`${archivo}: documento inexistente`);
    continue;
  }
  const filas = [...readFileSync(ruta, 'utf8').matchAll(/^\|\s*(C\d{2})\s*\|/gm)].map((m) => m[1]);
  for (const codigo of CRITERIOS) {
    const veces = filas.filter((f) => f === codigo).length;
    if (veces !== 1) problemas.push(`${archivo}: el criterio ${codigo} aparece ${veces} veces como fila (se esperaba 1)`);
  }
}

// --- Resultado --------------------------------------------------------------
console.log(`Documentos Markdown revisados: ${archivos.length}`);
console.log(`Enlaces relativos revisados: ${enlacesRevisados}`);
console.log(`Identificadores y criterios referenciados revisados: ${referenciasRevisadas}`);

if (problemas.length > 0) {
  console.error(`\nSe encontraron ${problemas.length} problema(s):`);
  for (const p of problemas) console.error(` - ${p}`);
  process.exit(1);
}
console.log('Verificación documental correcta.');
