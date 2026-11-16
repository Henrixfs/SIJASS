# Proposal

## Why

La Etapa 0 de la hoja de ruta (`docs/00-alcance-y-roadmap.md`) exige un prototipo compilable, reproducible y verificado automáticamente antes de construir el dominio real. Hoy el prototipo `tecnologia/siJASS-clean-architecture/` **no compila en una instalación limpia** (DT01: falta `@types/node`, error `TS2307` sobre `node:test`), no tiene `package-lock.json` (DT02, no admite `npm ci`) y no hay CI ni lint (DT07). Sin esa base, ninguna etapa posterior puede declarar un estado «Implementado», que según la convención del proyecto requiere build y pruebas exitosos en CI.

**Criterios de evaluación a los que aporta** (ver `docs/07-evaluacion-final/matriz-cumplimiento.md`): C04 (SDD), C05 (pruebas unitarias reproducibles), C12 (CI), C14 (repositorio con dependencias reproducibles) y, mediante la verificación documental, la consistencia de C01–C03. No cierra por completo ningún criterio.

## What Changes

- Añadir `@types/node` como dependencia de desarrollo del prototipo (DT01).
- Generar y versionar `package-lock.json` y fijar el motor de Node (`engines`, Node ≥ 20) para que `npm ci` sea reproducible (DT02).
- Añadir lint (ESLint con `typescript-eslint`) y un script `lint` al prototipo (parte de DT07).
- Añadir un workflow de GitHub Actions (`.github/workflows/ci.yml`) que ejecute `npm ci`, `lint`, build y pruebas sobre el prototipo en cada push y pull request (DT07).
- Añadir una comprobación automatizada de documentación (script ejecutado en CI) que verifique que los enlaces relativos de los `.md` resuelven, que los identificadores HU/RF/RNF/ADR/PT/DT referenciados existen en su documento fuente y que la rúbrica y la matriz de cumplimiento conservan los 16 criterios C01–C16.
- Actualizar `README.md` del prototipo y `docs/00-alcance-y-roadmap.md` (§1, §5, §6) para marcar DT01, DT02 y DT07 como resueltas y reflejar el estado de la Etapa 0 con la evidencia de CI.
- Actualizar `docs/07-evaluacion-final/matriz-cumplimiento.md` (C04, C05, C12, C14) y `PT21` en el plan de pruebas con la evidencia real al cerrar el sprint. La rúbrica y la matriz ya existen (creadas con la planificación); este cambio no las reescribe.
- **Fuera de alcance** (se mantienen como deuda para la Etapa 1): DT03–DT06 (rediseño de `Medicion`, `jassId`, idempotencia transaccional, error de dominio por duplicado). No se modifica código fuente de `src/` salvo lo que el lint exija para pasar sin reglas desactivadas de forma injustificada.

## Capabilities

### New Capabilities
- `prototype-quality-gate`: el prototipo de dominio se instala de forma reproducible (`npm ci`), compila, pasa lint y pasa sus pruebas, y esa verificación se ejecuta automáticamente en CI en cada cambio.
- `documentation-integrity`: la documentación Markdown del repositorio mantiene enlaces relativos válidos e identificadores de requisitos, pruebas y deuda (RF, PT, DT) consistentes, verificado por una comprobación automatizada.

### Modified Capabilities
<!-- Ninguna: `openspec/specs/` está vacío; no hay capacidades existentes. -->

## Impact

- **Código**: `tecnologia/siJASS-clean-architecture/` (`package.json`, nuevo `package-lock.json`, configuración de ESLint); posibles ajustes menores de formato en `src/` para satisfacer el lint.
- **CI/Herramientas**: nuevo `.github/workflows/ci.yml` y un script de verificación documental (Node, sin dependencias externas).
- **Documentación**: `README.md` del prototipo y `docs/00-alcance-y-roadmap.md` (estados y deuda técnica); `docs/07-evaluacion-final/matriz-cumplimiento.md` y `PT21` del plan de pruebas; trazabilidad de DT01/DT02/DT07 → este cambio.
- **Dependencias nuevas (solo desarrollo)**: `@types/node`, `eslint`, `typescript-eslint`.
- **Sin impacto** en API, base de datos, PWA ni asistente RAG (aún en «Diseño propuesto»). No se introduce ninguna estimación de cloro por imágenes.
