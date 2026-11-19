# Design

## Context

Estado observado al 2026-11-16 en `tecnologia/siJASS-clean-architecture/` y `.github/workflows/ci.yml` (ver `proposal.md` — *Why* para la motivación):

- `package.json`: `engines.node` es `>=20` y `@types/node` es `^20.19.43` (instalado 20.19.43).
- `ci.yml`: el job `prototipo` usa la matriz `[20, 22]`; los jobs `documentacion` e `integracion` ya usan Node.js 22.
- Ciclo de vida de Node.js, según `endoflife.date` y `nodejs.org/dist` consultados el 2026-11-16:

  | Línea | LTS desde | Fin de soporte activo | Fin de vida |
  |---|---|---|---|
  | 20 | 2023-10-24 | 2024-10-22 | **2026-04-30** |
  | 22 | 2024-10-29 | 2025-10-21 | 2027-04-30 |
  | 24 | 2025-10-28 | 2026-10-20 | 2028-04-30 |
  | 26 | 2026-10-28 | 2027-10-27 | 2029-04-30 |

- Rangos `engines` declarados por las dependencias instaladas (lectura de sus `package.json`, sin ejecutar nada): `eslint` 9.39.5 y `typescript-eslint` 8.72.1 `^18.18 || ^20.9 || >=21.1`; `node-pg-migrate` 9.0.0 `>=20.11`; `pg` 8.23.1 `>=16`; `typescript` 5.9.3 `>=14.17`. Todos incluyen Node.js 22, 24 y 26, pero **declarar un rango no demuestra que funcionen**: no se ejecutó el prototipo en Node.js 22 ni 26 durante la planificación. Localmente se ha usado Node.js 24.18.0; el CI de S1a probó 20 y 22.
- La spec `prototype-quality-gate` fija «20 o superior» en dos escenarios.

## Goals / Non-Goals

**Goals:**
- Que el rango declarado, los tipos del compilador y las versiones probadas en CI cuenten la misma historia.
- Que el CI pruebe la versión mínima declarada y las líneas LTS posteriores vigentes.

**Non-Goals:**
- Actualizar otras dependencias, aunque `npm install` regenere el lockfile.
- Fijar una política automática de versiones (por ejemplo, leer `engines` desde el workflow). Se decide caso por caso.
- Tocar los jobs `documentacion` e `integracion`.

## Decisions

**D1 — Mínimo `>=22` y matriz `[22, 24, 26]`.** La mínima declarada es la línea más antigua con soporte vigente (22, hasta 2027-04-30); se prueban además las dos LTS posteriores.
- *Por qué incluir 24:* es la versión que se usa en el desarrollo local, y es la línea que aún estará soportada hasta 2028-04.
- *Por qué incluir 26:* es la LTS activa desde el 2026-10-28; dejarla fuera repetiría el problema que motiva el cambio (probar solo versiones antiguas).
- *Desviación respecto de lo conversado:* la exploración previa mencionó `[22, 24]`. Se añade 26 porque al verificar el ciclo de vida resultó ser la LTS activa. Si la comprobación de CI de la línea 26 resultara inviable por un defecto ajeno al proyecto, ver *Risks*.
- *Alternativas:*
  - `[22, 24]`: omite la LTS activa.
  - `[22, 26]`: la más económica (2 ejecuciones) y prueba los extremos, pero omite la versión que se usa localmente.
  - Solo `[22]`: no detectaría una regresión en versiones posteriores.

**D2 — `@types/node` en `^22`, la línea mínima.** Los tipos corresponden a la versión *más antigua* soportada, no a la más nueva, para que el compilador rechace APIs que Node.js 22 no tiene.
- *Alternativa descartada:* `^24` o `^26`, que permitirían usar APIs ausentes en 22 y solo fallarían en tiempo de ejecución.
- Al subir de `^20.19.43` a `^22`, `package-lock.json` se regenera con `npm install`; se revisa que el diff del lockfile solo cambie `@types/node` y sus dependencias (`undici-types`).

**D3 — Documentación solo prospectiva.** Se cambian las frases que prometen soporte hacia adelante («Requiere Node.js 20 o superior»). Las menciones de ejecuciones pasadas (plan de pruebas, matriz de cumplimiento, roadmap, README) son evidencia fechada y se conservan, para no reescribir la historia.

**D4 — La spec dice «22 o superior» y exige la mínima en la matriz.** Se modifican *Instalación reproducible desde el lockfile* y *Verificación automática en CI* (cada una con todos sus escenarios). Se añaden dos escenarios comprobables: el rango declarado en `package.json` y la composición de la matriz. El texto «hoy 24 y 26» describe el estado actual de las líneas LTS; si cambia, se actualiza con un cambio nuevo.

## Risks / Trade-offs

- **[Una dependencia falla en Node.js 26]** → Es un riesgo real: no se probó localmente (ver *Context*). El CI lo revela en el propio PR. Si el fallo es de una dependencia y se resuelve con una actualización menor, se aplica; si no, se retira 26 de la matriz y de la spec con una nota en este cambio, en vez de ocultar el fallo.
- **[El job `prototipo` pasa de 2 a 3 ejecuciones]** → Aumento marginal de minutos de CI; se acepta.
- **[Un contribuyente con Node.js 20 local]** → `npm` solo advierte por `engines` (no hay `engine-strict`); sigue pudiendo instalar. Es **BREAKING** únicamente respecto del rango declarado.
- **[El lockfile cambia]** → Se revisa el diff (D2). Una actualización de transitivas ajenas a `@types/node` se considera un hallazgo y se corrige antes del PR.

## Migration Plan

1. Rama `chore/retirar-node-20`; cambios de `package.json`, `package-lock.json`, `ci.yml` y READMEs.
2. Verificar localmente (`npm ci`, lint, build, pruebas con Node.js 24) y subir el PR.
3. Confirmar en CI los tres jobs `prototipo` (22, 24 y 26), `documentacion` e `integracion`.
4. Tras fusionar, archivar el cambio (`/opsx:archive`).

**Reversión:** revertir el merge; no hay datos ni esquema involucrados.
