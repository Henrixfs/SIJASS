# Matriz de cumplimiento del trabajo final — SIJASS

**Versión:** 2026-11-04 · **Base:** [rúbrica del trabajo final](rubrica-trabajo-final.md) (C01–C16) · **Alcance y estados:** [alcance y hoja de ruta](../00-alcance-y-roadmap.md).

Esta matriz relaciona cada criterio de evaluación con los artefactos de SIJASS (historias, requisitos, decisiones y pruebas), los entregables previstos y la evidencia que existe **hoy**. No contiene puntajes ni resultados de pruebas que no se hayan ejecutado. Complementa, sin reemplazar, la [matriz de trazabilidad](../05-trazabilidad-y-validacion/matriz-trazabilidad.md) (HU → RF → RNF → DA → ADR → pruebas).

## 1. Estados

Se usa la [convención del roadmap](../00-alcance-y-roadmap.md#1-convención-de-estados) (*Implementado*, *Prototipo*, *Diseño propuesto*, *Pendiente de validación*, *Futuro*) más una etiqueta propia de esta matriz:

| Estado | Significado |
|---|---|
| **Sin diseño documentado** | La rúbrica lo exige, pero el repositorio no contiene ni requisito, ni decisión, ni diseño que lo cubra. Requiere decisión del equipo antes de planificarse. |

Un criterio solo pasa a *Implementado* con evidencia verificable (CI en verde sobre el commit, informe de prueba, enlace a código). Un estado mixto se declara por componente en la columna de evidencia.

**Sprint:** el roadmap define *etapas* con criterios de salida, no sprints con fechas. `S0` es el cambio [`s0-saneamiento-prototipo`](../../openspec/changes/s0-saneamiento-prototipo/proposal.md) (Etapa 0). Para el resto se indica la etapa del roadmap en que el criterio encaja y que el sprint se asigna al planificarla; las asignaciones marcadas «(propuesta)» no están aprobadas.

## 2. Matriz

| Código | Descripción | Requisitos relacionados | Sprint | Entregables | Evidencia de cumplimiento (hoy) | Estado |
|---|---|---|---|---|---|---|
| C01 | Identificación del problema y requerimientos | HU01–HU13 · RF01–RF15 · RNF01–RNF10 · EC-01–EC-12 | Previo a S0; validación en Etapa 5 | Análisis de problema, historias, requisitos, atributos de calidad y restricciones | [Alcance §2–4](../00-alcance-y-roadmap.md), [historias](../01-analisis-de-sistema/02-historias-del-usuario.md), [RF](../01-analisis-de-sistema/03-requisitos-funcionales.md), [RNF](../01-analisis-de-sistema/04-atributos-de-calidad.md), [RC](../01-analisis-de-sistema/05-restricciones.md). Sin validación con usuarios reales (RNF y metas «propuestas») | Diseño propuesto |
| C02 | Análisis y diseño del sistema | HU01–HU13 · RF01–RF15 · DA01–DA12 · ADR-006 | Previo a S0; refinamiento por etapa | Actores, historias, diseño interno de módulos, patrones y principios | [Actores](../01-analisis-de-sistema/01-actores.md), [diseño interno](../03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md), [patrones](../03-diseno-de-software/diseno-interno/patrones-de-diseno.md), [SOLID](../03-diseno-de-software/diseno-interno/principios-de-diseno.md). Solo documentación; el prototipo aún usa el modelo heredado (DT03, DT04) | Diseño propuesto |
| C03 | Arquitectura de bajo y alto nivel | DA01–DA12 · ADR-001–ADR-015 · RNF07 | Previo a S0; contraste con código en Etapas 1–2 | Arquitectura inicial, componentes, C4 niveles 1–4, ADR | [Arquitectura inicial](../02-arquitectura-software/arquitectura-inicial.md), [C4](../04-modelo-c4/Nivel2-Diagrama-de-Contenedores.md), [ADR](../01-analisis-de-sistema/07-decisiones-arquitectonicas.md). Bajo nivel: el [prototipo](../../tecnologia/siJASS-clean-architecture/README.md) ejemplifica capas dominio/aplicación/infraestructura con puertos; ningún contenedor del diseño está implementado | Diseño propuesto (bajo nivel: Prototipo parcial) |
| C04 | Desarrollo basado en SDD | Reglas de `openspec/config.yaml` · todos los RF/RNF | S0 (inicia), continuo | OpenSpec configurado; cambio con propuesta, especificaciones, diseño y tareas; especificaciones principales archivadas | OpenSpec configurado y versionado en `main` (PR #2); cambio `s0-saneamiento-prototipo` planificado, validado (`openspec validate --strict`) e implementado en el [PR #3](https://github.com/Henrixfs/SIJASS/pull/3) fusionado a `main` (merge `c1c3c0a`), sin archivar. `openspec/specs/` sigue vacío | Diseño propuesto (herramienta en uso; ningún cambio archivado) |
| C05 | Pruebas unitarias e integración | RF06, RF07, RF08, RF10, RF15 · RNF03, RNF04 · PT01–PT04, PT09–PT12, PT14, PT19 | S0 (base reproducible); Etapa 1 (integración) | Pruebas unitarias y de integración ejecutadas en CI; integración con PostgreSQL | [5 pruebas unitarias](../../tecnologia/siJASS-clean-architecture/src/pruebas/dominio.test.ts) sobre el modelo heredado; correspondencia parcial con PT01, PT03, PT04 en el [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md). Tras DT01 compilan y pasan 5/5 con `npm ci` en Node.js 20 y 22 ([CI del PR #3](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941), fusionado a `main`; CI de `main`: [ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/41888275471)). Sin pruebas de integración | Prototipo |
| C06 | Pruebas End to End | RF10 · RNF01, RNF08 · PT05, PT07, PT13 | Etapa 3 (offline); Etapa 2 (flujos en línea) | Pruebas E2E de flujos en línea y de la operación sin conexión | Casos definidos en el plan (PT05, PT07, PT13). No hay herramienta E2E elegida ni código; no existe aplicación que probar | Diseño propuesto |
| C07 | Interfaz y experiencia de usuario | HU01, HU04, HU10 · RNF06, RNF08 · EC-10 · ADR-002 · PT07, PT23 | Etapas 2–3; prueba de tareas en Etapa 5 | Interfaz PWA, prototipos de pantalla, prueba de usabilidad con operadores reales | Decisión de stack (ADR-002) y metas de usabilidad (RNF06). No hay bocetos, maquetas ni código de interfaz en el repositorio | Diseño propuesto (sin diseño de interfaz documentado) |
| C08 | Escalabilidad del frontend y backend | RNF07 · DA05, DA07 · ADR-001, ADR-009, ADR-011 · PT25 | Etapa 2 (propuesta) | Estrategia de escalado y criterios de extracción de módulos; contrato OpenAPI | ADR-001 (monolito modular extraíble) y ADR-011 (API versionada para múltiples clientes). No hay estrategia de escalado horizontal, metas de capacidad ni mediciones | Diseño propuesto (parcial; faltan metas y estrategia) |
| C09 | Escalabilidad de base de datos | RNF04, RNF05 · DA04, DA09 · ADR-004, ADR-005, ADR-015 | Etapa 1 (propuesta) | Esquema y migraciones PostgreSQL con índices por `jassId`; estrategia de crecimiento (pool, índices, respaldo) | Solo la decisión de usar PostgreSQL (ADR-004) y la propuesta pgvector (ADR-015). No hay esquema, migraciones ni estrategia de escalado | Sin diseño documentado |
| C10 | Configuración de dominio y/o subdominio DNS y CDN | RNF08 · RC08 · [despliegue sugerido](../02-arquitectura-software/arquitectura-inicial.md) | Etapa 5 (propuesta) | Dominio o subdominio con DNS configurado, HTTPS y CDN para los recursos estáticos de la PWA | El despliegue sugerido menciona un servidor o VPS con HTTPS y proxy inverso. No se documenta dominio, DNS ni CDN | Sin diseño documentado |
| C11 | Implementación de caché | RNF02 · DA05 · ADR-002, ADR-009 | Por decidir (ver §4) | Caché implementada y medida, con decisión registrada | Existe caché de recursos estáticos en el cliente (Workbox, ADR-002) solo como diseño. [ADR-009](../01-analisis-de-sistema/07-decisiones-arquitectonicas.md) excluye Redis y colas en el MVP y difiere su reevaluación a mediciones de carga. No hay estrategia de caché de servidor ni de CDN | Sin diseño documentado (conflicto aparente con ADR-009; ver §4) |
| C12 | CI/CD | RNF07 · PT21 · [DT07](../00-alcance-y-roadmap.md#6-deuda-técnica-conocida) | S0 (CI); CD por definir | Workflow de CI con instalación, lint, build y pruebas; verificación documental; despliegue continuo | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml): `npm ci`, lint, build y pruebas en Node.js 20 y 22 y verificación documental, en verde en el [PR #3](https://github.com/Henrixfs/SIJASS/pull/3) ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941)); fusionado a `main` con [CI en verde](https://github.com/Henrixfs/SIJASS/actions/runs/41888275471). CD no tiene diseño ni ADR | Prototipo (CI en `main`); CD: Sin diseño documentado |
| C13 | Pruebas de carga con k6 | RNF02, RNF04 · DA05 | Etapa 2–5 (propuesta) | Escenarios k6 versionados, metas de carga acordadas e informe de resultados | Ninguna meta de carga ni caso de prueba: PT22 mide guardado local en el teléfono, no carga del servidor. No existe aplicación ni API que cargar | Sin diseño documentado |
| C14 | Código fuente y base de datos en GitHub | RC04 · [DT02](../00-alcance-y-roadmap.md#6-deuda-técnica-conocida) | S0 (reproducibilidad); Etapa 1 (base de datos) | Repositorio con código, lockfile, CI y migraciones de PostgreSQL | Repositorio en GitHub con documentación y el prototipo de dominio. Lockfile versionado en el PR #3 (DT02). Sin esquema ni migraciones de base de datos | Prototipo (código); Sin diseño documentado (esquema SQL) |
| C15 | Informe final | Todos | Cierre del proyecto | Informe final basado en esta documentación y en la evidencia de cada criterio | La documentación de `docs/` es la fuente; no existe borrador del informe en el repositorio | Pendiente |
| C16 | Presentación y dominio del tema | Todos · [criterio de comunicación](../00-alcance-y-roadmap.md#8-criterio-de-comunicación) | Cierre del proyecto | Presentación y preparación de preguntas sobre decisiones, límites y estado real | Hay una exposición previa del primer sprint en el historial de Git; no existe material de la presentación final | Pendiente |

## 3. Aporte del Sprint 0

`s0-saneamiento-prototipo` no implementa funcionalidades del MVP ni modifica el modelo de dominio. Su contribución a la rúbrica es la base técnica verificable:

| Criterio | Aporte de S0 | Evidencia esperada al cerrar S0 |
|---|---|---|
| Criterio C04 | Cambio OpenSpec completo con especificaciones verificables | `openspec validate s0-saneamiento-prototipo --strict` sin errores (verificación final: tarea 6.3) |
| Criterio C05 | Las pruebas unitarias existentes compilan y se ejecutan de forma reproducible (DT01) | `npm ci && npm test` con 5/5 pruebas en CI. **Obtenida:** [ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941) (Node.js 20 y 22); PR #3 fusionado a `main` ([CI en `main`](https://github.com/Henrixfs/SIJASS/actions/runs/41888275471)) |
| Criterio C12 | CI con instalación, lint, build, pruebas y verificación documental (DT07) | Ejecución de GitHub Actions en verde sobre el commit. **Obtenida:** [ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941) sobre `9725d15` (3 jobs); PR #3 fusionado a `main` ([CI en `main`](https://github.com/Henrixfs/SIJASS/actions/runs/41888275471)) |
| Criterio C14 | Dependencias reproducibles con lockfile (DT02) | `package-lock.json` versionado; `npm ci` en copia limpia. **Obtenida:** `npm ci` en copia limpia local y en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941)) |
| C01–C03 | La documentación mantiene enlaces e identificadores consistentes (PT21 se automatiza en parte) | `node scripts/verificar-docs.mjs` con código 0. **Obtenida:** local y en el job `documentacion` del CI |

S0 **no** cierra ningún criterio por completo; deja C05, C12 y C14 en estado parcial con evidencia reproducible.

## 4. Brechas y decisiones abiertas

Criterios sin diseño documentado o con tensión con una decisión vigente. Ninguna se resuelve en esta matriz; cada una exige una decisión explícita y, cuando corresponda, una ADR nueva.

| Criterio | Brecha | Decisión necesaria |
|---|---|---|
| Criterio C11 | ADR-009 excluye Redis y DA05 exige justificar cada componente con necesidad comprobada | Definir qué tipo de caché se implementará (por ejemplo, cabeceras HTTP, CDN o caché en memoria) y registrarlo en una ADR que no contradiga ADR-009, o sustituirla formalmente. La medición con k6 (C13) puede aportar la justificación |
| Criterio C13 | No hay metas de carga ni RNF de capacidad | Acordar escenarios y metas (usuarios concurrentes, latencia, tasa de error) y crear los casos PT correspondientes |
| Criterio C10 | No hay proveedor de dominio ni CDN definidos | Elegir proveedor, dominio o subdominio y alcance del CDN; verificar costo frente a RC03 |
| C09, C08 | No hay estrategia de escalado | Definir metas de capacidad y las decisiones técnicas mínimas que las sustenten |
| Criterio C06 | No hay herramienta E2E elegida | Decidir la herramienta al planificar la Etapa 2 |
| Criterio C07 | No hay diseño de interfaz | Producir bocetos o prototipo de las pantallas críticas (HU01, HU04) |
| Criterio C12 | No hay diseño de CD | Definir destino de despliegue (ver C10) y estrategia de entrega |

Los criterios C08–C11 y C13 no figuran en el alcance del MVP del roadmap; incorporarlos puede requerir actualizar el [alcance](../00-alcance-y-roadmap.md) y la [matriz de trazabilidad](../05-trazabilidad-y-validacion/matriz-trazabilidad.md) de forma simultánea.

## 5. Mantenimiento

- Al cerrar un cambio OpenSpec que aporte a un criterio, se actualizan en esta matriz el estado y el enlace a la evidencia en el mismo pull request.
- Ningún criterio pasa a *Implementado* sin salida verificable (CI, informe o código enlazado).
- Los puntajes y las ponderaciones oficiales, si se obtienen, se registran en la [rúbrica](rubrica-trabajo-final.md), no aquí.
- Esta matriz se mantiene coherente con el [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md): una prueba nueva para C13 o C06 recibe un identificador PT y se referencia desde aquí.
