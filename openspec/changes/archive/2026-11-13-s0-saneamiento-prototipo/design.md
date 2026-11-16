# Design

## Context

Estado observado (2026-11-04) en `tecnologia/siJASS-clean-architecture/`:

- `package.json` solo declara `typescript ^5.6.3`; los scripts son `build` (`tsc -p tsconfig.json`) y `test` (`npm run build && node --test dist/pruebas/*.test.js`). Las pruebas importan `node:test` y `node:assert`, que requieren `@types/node` (DT01).
- `tsconfig.json`: ES2022, `NodeNext`, `strict`, `rootDir: src`, `outDir: dist`; `dist/` y `node_modules/` ya están en `.gitignore`.
- No hay `package-lock.json`, ni `.github/`, ni configuración de lint.
- El código de `src/` está escrito en un estilo compacto (varias sentencias por línea, sangría de un espacio); no fue pensado para un linter con reglas de formato.
- Los 50 enlaces relativos de los `.md` (medidos antes de crear `docs/07-evaluacion-final/`) resuelven; los RF01–RF15 están definidos y los PT01–PT25 se referencian en `docs/`.
- `docs/07-evaluacion-final/` contiene la rúbrica (C01–C16) y la matriz de cumplimiento. Los criterios C08–C11 y C13 no tienen diseño en el repositorio; **no** se abordan en S0 (ver la sección 4 de la matriz).
- Entorno local de referencia: Node 24 / npm 11. El README documenta una verificación previa con Node 22 / npm 10.

Ver `proposal.md` para la motivación y `specs/` para los requisitos.

## Goals / Non-Goals

**Goals:**
- Que `npm ci && npm run lint && npm test` pase en una copia limpia, localmente y en CI.
- Que la verificación documental sea un script sin dependencias, ejecutable localmente y en CI.
- Que la documentación refleje el estado real tras el cambio, con evidencia de CI.

**Non-Goals:**
- Rediseñar `Medicion` ni tocar la idempotencia (DT03–DT06, Etapa 1).
- Introducir NestJS, React, PostgreSQL u otra tecnología del stack objetivo.
- Reformatear el código fuente en bloque ni añadir Prettier.
- Cobertura de código, análisis de seguridad o despliegue (CD).

## Decisions

**D1 — `@types/node` fijado a la línea LTS mínima soportada.** Se instala `@types/node@^20` y `engines.node: ">=20"`. *Por qué:* los tipos deben corresponder al Node más antiguo soportado para no usar APIs que no existen en él. *Alternativas:* `@types/node` más reciente (24) → permite usar APIs no disponibles en 20; sin `engines` → el requisito «Node 20+» del README no se aplica.

**D2 — Lockfile versionado y `npm ci` como único camino en CI.** Se genera `package-lock.json` con `npm install` y se versiona; CI usa `npm ci`, que falla si hay desincronización (cumple el escenario del spec). *Alternativa:* `npm install` en CI → no detecta lockfile obsoleto.

**D3 — ESLint 9 flat config con `typescript-eslint`, reglas `recommended` sin Prettier.** Un `eslint.config.mjs` mínimo sobre `src/**/*.ts`. *Por qué:* detecta errores reales (variables sin usar, `any` implícitos) sin forzar un reformateo del código demostrativo que se rediseñará en la Etapa 1. *Alternativas:* ESLint + Prettier → obligaría a reformatear todos los archivos, ruido sin valor antes del rediseño; solo `tsc --noEmit` → no es análisis estático adicional. Si alguna regla `recommended` marca el código actual, se corrige el código si es trivial; si no, se desactiva esa regla puntual con comentario que referencia la Etapa 1, nunca de forma global.

**D4 — Script de verificación documental propio en Node, sin dependencias.** `scripts/verificar-docs.mjs` en la raíz: recorre `*.md` (excluye `node_modules`, `.git`, `openspec/`, `.claude/`, `.agents/`), valida enlaces relativos (ignora URLs absolutas y anclas) y valida que cada identificador referenciado exista en su documento fuente mediante una tabla `prefijo → archivo` (`HU` → `02-historias-del-usuario.md`, `RF` → `03-requisitos-funcionales.md`, `RNF` → `04-atributos-de-calidad.md`, `ADR` → `07-decisiones-arquitectonicas.md`, `PT` → `plan-pruebas.md`, `DT` → tabla del roadmap) y que `rubrica-trabajo-final.md` y `matriz-cumplimiento.md` contengan `C01`–`C16` una vez cada uno y no se referencie ningún `Cnn` fuera de rango. Sale con código 1 e imprime archivo y destino/identificador. *Por qué:* el equipo no necesita instalar otra herramienta; el script reutiliza Node, ya requerido. *Alternativas:* `markdown-link-check` (dependencia de red y de terceros, valida URLs externas que no queremos que rompan CI), `lychee` (binario externo). Se acepta que no valida anclas internas (`#seccion`); queda como límite documentado.

**D5 — Un único workflow `ci.yml` con dos jobs.** `prototipo` (matriz Node 20 y 22; pasos `npm ci`, `lint`, `build`, `test` con `working-directory` del prototipo, caché de npm) y `documentacion` (Node 22, ejecuta el script de D4). Disparadores: `push` y `pull_request`. *Por qué:* los jobs independientes muestran por separado qué falló. *Alternativa:* un solo job secuencial → un fallo de docs ocultaría el estado del código. Acciones fijadas a versiones mayores estables (`actions/checkout@v4`, `actions/setup-node@v4`).

**D6 — Alineación documental al final, con evidencia.** `docs/00-alcance-y-roadmap.md` solo se marca «Implementado/resuelto» tras ver el CI en verde sobre el commit; la fila de cada DT resuelta cita este cambio. *Por qué:* la propia convención de estados del roadmap exige «build y pruebas exitosos en CI sobre el commit correspondiente». Hasta entonces el texto dice «pendiente de confirmar en CI». La misma regla aplica a `docs/07-evaluacion-final/matriz-cumplimiento.md`: C05, C12 y C14 se actualizan solo con enlaces a evidencia real y mantienen visible lo pendiente; ningún criterio pasa a *Implementado*. También se actualiza `PT21` en el plan de pruebas (de «pendiente de automatizar en CI» a la evidencia de CI). El README del prototipo se actualiza (sección Ejecución y Limitaciones) y deja DT03–DT06 abiertas, asignadas a la Etapa 1.

## Risks / Trade-offs

- [El lint `recommended` marca código existente y obliga a tocar `src/`] → Cambios mínimos y sin alterar comportamiento; las cinco pruebas existentes actúan como red de seguridad; no se desactivan reglas globalmente.
- [Diferencias entre versiones de Node/npm local (24/11) y CI (20/22) generen un lockfile distinto] → Generar el lockfile y validar `npm ci` en Node 20 también en la matriz de CI.
- [El script documental produce falsos positivos (p. ej. `RF` dentro de código, ejemplos o texto como «PT» en otro sentido)] → Patrón de identificador con límites de palabra (`\bRF\d{2}\b`); lista de exclusión explícita en el script si aparece un caso real; documentar el comportamiento en el propio script.
- [CI en GitHub Actions requiere remoto y permisos; no se puede verificar localmente] → Los pasos se ejecutan localmente con los mismos comandos; el criterio de salida de la Etapa 0 se da por cumplido solo tras ver la ejecución real en el PR (D6).
- [Dependencias de desarrollo nuevas aumentan superficie de mantenimiento] → Solo tres (`@types/node`, `eslint`, `typescript-eslint`), todas de desarrollo y fijadas por lockfile.

## Migration Plan

1. Implementar en la rama `chore/setup-openspec` (o una rama derivada) y abrir pull request contra `main`.
2. Verificar localmente: `npm ci`, `npm run lint`, `npm test` y el script documental.
3. Confirmar CI en verde en el PR y recién entonces actualizar los estados documentales (D6).
4. Rollback: revertir el commit; no hay efectos sobre datos ni despliegues.

## Open Questions

- ¿Se exigirá CI verde como regla de protección de rama en `main`? Es configuración del repositorio en GitHub, no afecta a este cambio y puede decidirse después.
