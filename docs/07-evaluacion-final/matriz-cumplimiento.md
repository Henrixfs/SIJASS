# Matriz de cumplimiento del trabajo final — SIJASS

**Versión:** 2026-11-26 (Sprint 2, en `main`) · **Base:** [rúbrica del trabajo final](rubrica-trabajo-final.md) (C01–C16) · **Alcance y estados:** [alcance y hoja de ruta](../00-alcance-y-roadmap.md).

Esta matriz relaciona cada criterio de evaluación con los artefactos de SIJASS (historias, requisitos, decisiones y pruebas), los entregables previstos y la evidencia que existe **hoy**. No contiene puntajes ni resultados de pruebas que no se hayan ejecutado. Complementa, sin reemplazar, la [matriz de trazabilidad](../05-trazabilidad-y-validacion/matriz-trazabilidad.md) (HU → RF → RNF → DA → ADR → pruebas).

## 1. Estados

Se usa la [convención del roadmap](../00-alcance-y-roadmap.md#1-convención-de-estados) (*Implementado*, *Prototipo*, *Diseño propuesto*, *Pendiente de validación*, *Futuro*) más una etiqueta propia de esta matriz:

| Estado | Significado |
|---|---|
| **Sin diseño documentado** | La rúbrica lo exige, pero el repositorio no contiene ni requisito, ni decisión, ni diseño que lo cubra. Requiere decisión del equipo antes de planificarse. |

Un criterio solo pasa a *Implementado* con evidencia verificable (CI en verde sobre el commit, informe de prueba, enlace a código). Un estado mixto se declara por componente en la columna de evidencia.

**Sprint:** el roadmap define *etapas* con criterios de salida, no sprints con fechas. `S0` es el cambio [`s0-saneamiento-prototipo`](../../openspec/changes/archive/2026-11-13-s0-saneamiento-prototipo/proposal.md) (Etapa 0). `S1a` es el cambio `s1a-dominio-medicion` ([PR #5](https://github.com/Henrixfs/SIJASS/pull/5)), primera parte de la Etapa 1. Para el resto se indica la etapa del roadmap en que el criterio encaja y que el sprint se asigna al planificarla; las asignaciones marcadas «(propuesta)» no están aprobadas.

## 2. Matriz

| Código | Descripción | Requisitos relacionados | Sprint | Entregables | Evidencia de cumplimiento (hoy) | Estado |
|---|---|---|---|---|---|---|
| C01 | Identificación del problema y requerimientos | HU01–HU13 · RF01–RF15 · RNF01–RNF10 · EC-01–EC-12 | Previo a S0; validación en Etapa 5 | Análisis de problema, historias, requisitos, atributos de calidad y restricciones | [Alcance §2–4](../00-alcance-y-roadmap.md), [historias](../01-analisis-de-sistema/02-historias-del-usuario.md), [RF](../01-analisis-de-sistema/03-requisitos-funcionales.md), [RNF](../01-analisis-de-sistema/04-atributos-de-calidad.md), [RC](../01-analisis-de-sistema/05-restricciones.md). Sin validación con usuarios reales (RNF y metas «propuestas») | Diseño propuesto |
| C02 | Análisis y diseño del sistema | HU01–HU13 · RF01–RF15 · DA01–DA12 · ADR-006 | Previo a S0; refinamiento por etapa; S1a (modelo de medición) | Actores, historias, diseño interno de módulos, patrones y principios | [Actores](../01-analisis-de-sistema/01-actores.md), [diseño interno](../03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md), [patrones](../03-diseno-de-software/diseno-interno/patrones-de-diseno.md), [SOLID](../03-diseno-de-software/diseno-interno/principios-de-diseno.md). El prototipo ya implementa el modelo de medición manual del diseño interno §4 (DT03 y DT04 resueltas por `s1a-dominio-medicion`, [CI](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)). `s1b-acceso-cuotas-pagos` implementa en el prototipo los módulos `identidad`, `padron` y `auditoria` del diseño interno (§2, §3, §7) con acceso por perfiles, cuotas, pagos idempotentes con reversa, portal del asociado y bitácora transaccional (verificado en local el 2026-11-19 y en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554)); ver §3.2). `s2a-acceso-dni-multi-jass` sustituye en el prototipo el ingreso por correo por el ingreso por DNI con claves generadas, el equipo de la JASS, el perfil de plataforma y el aislamiento por JASS reforzado en la base (verificado en local el 2026-11-25; ver §3.6). **Pendiente:** `RevisionMedicion` y corrección (RF08), advertencias (RF15), auditoría de mediciones y tabla de evidencia | Diseño propuesto (medición, identidad y padrón: Prototipo parcial) |
| C03 | Arquitectura de bajo y alto nivel | DA01–DA12 · ADR-001–ADR-015 · RNF07 | Previo a S0; contraste con código en Etapas 1–2 | Arquitectura inicial, componentes, C4 niveles 1–4, ADR | [Arquitectura inicial](../02-arquitectura-software/arquitectura-inicial.md), [C4](../04-modelo-c4/Nivel2-Diagrama-de-Contenedores.md), [ADR](../01-analisis-de-sistema/07-decisiones-arquitectonicas.md). Bajo nivel: el [prototipo](../../tecnologia/siJASS-clean-architecture/README.md) ejemplifica capas dominio/aplicación/infraestructura con puertos; ningún contenedor del diseño está implementado | Diseño propuesto (bajo nivel: Prototipo parcial) |
| C04 | Desarrollo basado en SDD | Reglas de `openspec/config.yaml` · todos los RF/RNF | S0 (inicia), continuo; S1a | OpenSpec configurado; cambio con propuesta, especificaciones, diseño y tareas; especificaciones principales archivadas | OpenSpec configurado y versionado en `main` (PR #2). `s0-saneamiento-prototipo` se planificó, validó (`openspec validate --strict`), implementó en el [PR #3](https://github.com/Henrixfs/SIJASS/pull/3) (merge `c1c3c0a`) y se **archivó** (`openspec/changes/archive/`), con sus dos especificaciones en `openspec/specs/`. `s1a-dominio-medicion` está implementado y fusionado en el [PR #5](https://github.com/Henrixfs/SIJASS/pull/5) (merge `04dd554`) con CI en verde ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) y **archivado** (`openspec/changes/archive/2026-11-16-s1a-dominio-medicion/`); sus especificaciones `medicion-cloro`, `persistencia-mediciones` y `registro-idempotente` se añadieron a `openspec/specs/` y la modificación de `prototype-quality-gate` se aplicó. `retirar-node-20` ([PR #7](https://github.com/Henrixfs/SIJASS/pull/7), [CI en `main`](https://github.com/Henrixfs/SIJASS/actions/runs/43921573566)) se **archivó** el 2026-11-19 (`openspec/changes/archive/2026-11-19-retirar-node-20/`) y su delta se sincronizó con la especificación principal `prototype-quality-gate` (rango «Node.js 22 o superior»); `openspec validate --all --strict` pasa en las cinco especificaciones | Diseño propuesto (herramienta en uso; tres cambios archivados; `s1b-acceso-cuotas-pagos` con propuesta, cuatro especificaciones, diseño y tareas validados con `openspec validate --strict`) |
| C05 | Pruebas unitarias e integración | RF06, RF07, RF08, RF10, RF15 · RNF03, RNF04 · PT01–PT04, PT09–PT12, PT14, PT19 | S0 (base reproducible); S1a (integración) | Pruebas unitarias y de integración ejecutadas en CI; integración con PostgreSQL | [73 pruebas unitarias](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/medicion.test.ts) con `node:test` (dominio, canonización, caso de uso y batería de contrato en memoria) y [52 pruebas de integración contra PostgreSQL 16](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/esquema.test.ts) (esquema por SQL directo y la misma batería de contrato, con reversión y concurrencia en 10 rondas). Cubren PT01–PT04, PT11 y PT12 según el [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md); CI en verde en el [PR #5](https://github.com/Henrixfs/SIJASS/pull/5) ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)): `prototipo` (Node.js 20 y 22) e `integracion`. Un escenario negativo en CI pone en rojo solo `integracion` ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43900014936)). `s1b` añade (local, verificado en local el 2026-11-19 y en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554))): 256 pruebas unitarias, 215 de integración, 56 de interfaz y 5 E2E; PT13 y PT14 cubiertas para asociados, cuotas y pagos (ver el [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md)). `s2a` añade (solo en local, 2026-11-25): 456 pruebas unitarias, 364 de integración, 147 de interfaz y 14 E2E, con PT26 a PT28. **Pendiente:** PT09, PT10 (RF08) y PT19; RF15 sin pruebas; PT13 para mediciones | Prototipo |
| C06 | Pruebas End to End | RF10 · RNF01, RNF08 · PT05, PT07, PT13 | Etapa 3 (offline); Etapa 2 (flujos en línea) | Pruebas E2E de flujos en línea y de la operación sin conexión | Casos definidos en el plan (PT05, PT07, PT13). No hay herramienta E2E elegida ni código; No existe aplicación **desplegada**. Sí hay una prueba E2E en navegador real (Playwright con Chrome) del flujo «el tesorero registra un pago y el asociado ve su saldo», de la guardia de pantallas por perfil y del aislamiento entre JASS, en [`flujo-pagos.spec.ts`](../../tecnologia/e2e/pruebas/flujo-pagos.spec.ts): 5 pruebas aprobadas en tres ejecuciones consecutivas (verificado en local el 2026-11-19 y en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554))); falta la operación sin conexión (PT05, PT07). Con `s2a` hay 14 pruebas E2E en cuatro archivos (los tres flujos anteriores, adaptados al ingreso por DNI, y [`flujo-acceso.spec.ts`](../../tecnologia/e2e/pruebas/flujo-acceso.spec.ts)), aprobadas en local el 2026-11-25; aún sin ejecución de CI | Prototipo (flujos E2E en local; los de `s1b` a `s1d` también en CI) |
| C07 | Interfaz y experiencia de usuario | HU01, HU04, HU10 · RNF06, RNF08 · EC-10 · ADR-002 · PT07, PT23 | Etapas 2–3; prueba de tareas en Etapa 5 | Interfaz PWA, prototipos de pantalla, prueba de usabilidad con operadores reales | Decisión de stack (ADR-002) y metas de usabilidad (RNF06). `tecnologia/sijass-web/` ofrece una interfaz React para el flujo de cobro (ingreso, padrón, cuotas, pagos, reversa) y el portal del asociado, con 56 pruebas y formato en soles; sin bocetos aprobados, sin prueba de usabilidad con usuarios reales y sin PWA. `s2a` rehace el ingreso con dos botones («Soy asociado» y «Soy administrador») y añade cambio y entrega de claves, equipo y plataforma, con medidas de accesibilidad técnicas a 320–1440 px ([evidencia](../diseno/evidencia/s2a-acceso/README.md)); no hay prueba con personas reales | Prototipo (interfaz del flujo de cobro y de accesos; sin validación con usuarios) |
| C08 | Escalabilidad del frontend y backend | RNF07 · DA05, DA07 · ADR-001, ADR-009, ADR-011 · PT25 | Etapa 2 (propuesta) | Estrategia de escalado y criterios de extracción de módulos; contrato OpenAPI | ADR-001 (monolito modular extraíble) y ADR-011 (API versionada para múltiples clientes). No hay estrategia de escalado horizontal, metas de capacidad ni mediciones | Diseño propuesto (parcial; faltan metas y estrategia) |
| C09 | Escalabilidad de base de datos | RNF04, RNF05 · DA04, DA09 · ADR-004, ADR-005, ADR-015 | Etapa 1 (propuesta); S1a (esquema) | Esquema y migraciones PostgreSQL con índices por `jassId`; estrategia de crecimiento (pool, índices, respaldo) | [Migración `0001`](../../tecnologia/siJASS-clean-architecture/migraciones/0001_esquema-mediciones.sql): tablas `jass`, `reservorio`, `metodo_medicion`, `medicion` y `operacion_idempotente`, claves primarias encabezadas por `jass_id`, clave foránea compuesta (reservorio, JASS) e índice `(jass_id, reservorio_id, tomada_en)`, con restricciones comprobadas por SQL directo. Se aplica, se revierte y se vuelve a aplicar contra PostgreSQL 16 en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)). **Pendiente:** estrategia de crecimiento (pool afinado, respaldo, particionado) y mediciones de rendimiento; el catálogo de métodos es provisional y faltan evidencia y reservorios gestionables. [Migración `0002`](../../tecnologia/siJASS-clean-architecture/migraciones/0002_acceso-padron-pagos.sql): `usuario`, `asociado`, `membresia`, `sesion`, `cuota`, `pago`, `reversa_pago` y `evento_auditoria`, con claves compuestas por JASS, unicidad de la clave de idempotencia por JASS, bloqueo de modificación de la bitácora y reversión probada por SQL directo (33 pruebas de esquema). `s2a` añade las migraciones `0004` (DNI, clave generada, estado y ubicación de la JASS, perfil de plataforma) y `0005` (seguridad por filas con el rol `sijass_app`), aplicables, reversibles y reaplicables en local | Prototipo (esquema e índices); estrategia de crecimiento: Sin diseño documentado |
| C10 | Configuración de dominio y/o subdominio DNS y CDN | RNF08 · RC08 · [despliegue sugerido](../02-arquitectura-software/arquitectura-inicial.md) | Etapa 5 (propuesta) | Dominio o subdominio con DNS configurado, HTTPS y CDN para los recursos estáticos de la PWA | El despliegue sugerido menciona un servidor o VPS con HTTPS y proxy inverso. No se documenta dominio, DNS ni CDN | Sin diseño documentado |
| C11 | Implementación de caché | RNF02 · DA05 · ADR-002, ADR-009 | Por decidir (ver §4) | Caché implementada y medida, con decisión registrada | Existe caché de recursos estáticos en el cliente (Workbox, ADR-002) solo como diseño. [ADR-009](../01-analisis-de-sistema/07-decisiones-arquitectonicas.md) excluye Redis y colas en el MVP y difiere su reevaluación a mediciones de carga. No hay estrategia de caché de servidor ni de CDN | Prototipo (caché HTTP de estáticos y del catálogo; ADR-016 sin contradecir ADR-009; sin CDN ni caché de servidor) |
| C12 | CI/CD | RNF07 · PT21 · [DT07](../00-alcance-y-roadmap.md#6-deuda-técnica-conocida) | S0 (CI); S1a (integración); retirar-node-20 (matriz); CD por definir | Workflow de CI con instalación, lint, build y pruebas; verificación documental; despliegue continuo | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml): `npm ci`, lint, build y pruebas en Node.js 20 y 22 y verificación documental, en verde en el [PR #3](https://github.com/Henrixfs/SIJASS/pull/3) ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941)); fusionado a `main` con [CI en verde](https://github.com/Henrixfs/SIJASS/actions/runs/41888275471). El job `integracion` (S1a) levanta `postgres:16` y ejecuta migración, reversión, reaplicación y pruebas de integración, en verde en el [PR #5](https://github.com/Henrixfs/SIJASS/pull/5) ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)); un fallo deliberado lo pone en rojo sin afectar a los otros jobs ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43900014936)). CD no tiene diseño ni ADR Con `retirar-node-20` ([PR #7](https://github.com/Henrixfs/SIJASS/pull/7)) la matriz del job `prototipo` pasó de Node.js 20 y 22 a `[22, 24, 26]`, porque Node.js 20 salió de soporte el 2026-04-30; cada versión ejecuta 73 pruebas en verde ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43920160971)). Las ejecuciones con Node.js 20 citadas arriba son históricas | Prototipo (CI con integración y matriz Node.js 22/24/26); El job `web-e2e` (API + PostgreSQL + interfaz + Playwright) se añadió al workflow en `s1b`; **pasó en GitHub Actions** en el [PR #9](https://github.com/Henrixfs/SIJASS/pull/9) (commit `97ba688`, [ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554)). CD: Sin diseño documentado |
| C13 | Pruebas de carga con k6 | RNF02, RNF04 · DA05 | Etapa 2–5 (propuesta) | Escenarios k6 versionados, metas de carga acordadas e informe de resultados | Ninguna meta de carga ni caso de prueba: PT22 mide guardado local en el teléfono, no carga del servidor. No existe aplicación ni API que cargar | Sin diseño documentado |
| C14 | Código fuente y base de datos en GitHub | RC04 · [DT02](../00-alcance-y-roadmap.md#6-deuda-técnica-conocida) | S0 (reproducibilidad); S1a (base de datos); retirar-node-20 (versiones) | Repositorio con código, lockfile, CI y migraciones de PostgreSQL | Repositorio en GitHub con documentación, el prototipo de dominio y persistencia, el lockfile (DT02) y la [migración `0001`](../../tecnologia/siJASS-clean-architecture/migraciones/0001_esquema-mediciones.sql) reversible, aplicada, revertida y reaplicada en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)). **Pendiente:** migraciones de usuarios, pagos, auditoría y evidencia El rango declarado coincide con lo probado: `engines.node` `>=22` y `@types/node` `^22` en `package.json` y `package-lock.json` ([PR #7](https://github.com/Henrixfs/SIJASS/pull/7), [ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43920160971)) `s1b` añade el paquete de interfaz `tecnologia/sijass-web/`, el de E2E `tecnologia/e2e/` y la migración `0002` ([PR #9](https://github.com/Henrixfs/SIJASS/pull/9), [CI](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554)); `s2a` añade las migraciones `0004` y `0005` (solo en local) | Prototipo (código y esquema SQL parcial) |
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

## 3.1. Aporte de S1a

`s1a-dominio-medicion` ([PR #5](https://github.com/Henrixfs/SIJASS/pull/5)) es la primera parte de la Etapa 1: sustituye el modelo heredado por el registro manual de mediciones y añade la idempotencia y la persistencia en PostgreSQL. **No** cierra ningún criterio; ninguno pasa a *Implementado*.

| Criterio | Aporte de S1a | Evidencia | Pendiente visible |
|---|---|---|---|
| Criterio C02 | Modelo `Medicion` manual con JASS, método, unidad, autor y revisión (DT03, DT04) | [`medicion.ts`](../../tecnologia/siJASS-clean-architecture/src/dominio/medicion.ts) y su [prueba](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/medicion.test.ts); CI en verde ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) | Auditoría, RF08 y RF15 |
| Criterio C04 | Segundo cambio OpenSpec completo y archivado: propuesta, cuatro especificaciones, diseño y 34 tareas con verificación | [PR #5](https://github.com/Henrixfs/SIJASS/pull/5), [cambio archivado](../../openspec/changes/archive/2026-11-16-s1a-dominio-medicion/proposal.md) | Planificar `s1b-pagos-membresias-auditoria` |
| Criterio C05 | Pruebas unitarias, de contrato (memoria y PostgreSQL) y de integración; PT01–PT04, PT11 y PT12 automatizadas | [Plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md); 73 + 52 pruebas en la [ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952) | PT09, PT10, PT14, PT19; RF08 y RF15 sin pruebas |
| Criterio C09 | Esquema `0001` versionado y reversible, con claves e índice encabezados por la JASS | [Migración](../../tecnologia/siJASS-clean-architecture/migraciones/0001_esquema-mediciones.sql) y [pruebas del esquema](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/esquema.test.ts) | Estrategia de crecimiento: pool, respaldo y particionado |
| Criterio C12 | Job `integracion` con PostgreSQL 16, independiente de los demás | [`ci.yml`](../../.github/workflows/ci.yml); [verde](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952) y [rojo deliberado](https://github.com/Henrixfs/SIJASS/actions/runs/43900014936) | CD |
| Criterio C14 | Migración SQL reversible versionada junto al código | [Migración](../../tecnologia/siJASS-clean-architecture/migraciones/0001_esquema-mediciones.sql) | Migraciones del resto del modelo |

## 3.2. Aporte de s1b

`s1b-acceso-cuotas-pagos` ([propuesta](../../openspec/changes/archive/2026-11-26-s1b-acceso-cuotas-pagos/proposal.md)) construye el primer flujo de valor de extremo a extremo: acceso por perfiles (personal y asociado), padrón, cuotas, pagos con reversa y portal del asociado. **No** cierra ningún criterio y **ninguno pasa a *Implementado***. La evidencia **local** (2026-11-19) se complementa con la de **GitHub Actions**, que se cita aparte: CI en GitHub Actions: [PR #9](https://github.com/Henrixfs/SIJASS/pull/9), commit `97ba688`, [ejecución 44635444554](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554) con `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)` e `Interfaz y E2E (navegador)` en verde.

| Criterio | Aporte de s1b | Evidencia | Pendiente visible |
|---|---|---|---|
| Criterio C02 | Módulos `identidad`, `padron` y `auditoria` del diseño interno | [Especificaciones](../../openspec/changes/archive/2026-11-26-s1b-acceso-cuotas-pagos/specs/cuotas-y-pagos/spec.md) y [diseño](../../openspec/changes/archive/2026-11-26-s1b-acceso-cuotas-pagos/design.md) | RF08, RF15, OpenAPI |
| Criterio C04 | Tercer cambio SDD: cuatro especificaciones con escenarios y tareas con verificación | [Cambio](../../openspec/changes/archive/2026-11-26-s1b-acceso-cuotas-pagos/tasks.md) | Archivar tras fusionar |
| Criterio C05 | PT13 y PT14 para asociados, cuotas y pagos; contrato memoria/PostgreSQL; concurrencia | [Plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md) | PT09, PT10, PT19 |
| Criterio C06 | Un flujo E2E en navegador real | [`flujo-pagos.spec.ts`](../../tecnologia/e2e/pruebas/flujo-pagos.spec.ts) | Operación sin conexión |
| Criterio C07 | Interfaz del flujo de cobro | [`sijass-web`](../../tecnologia/sijass-web/README.md) | Diseño, usabilidad real, PWA |
| Criterio C09 | Migración `0002` reversible | [Migración](../../tecnologia/siJASS-clean-architecture/migraciones/0002_acceso-padron-pagos.sql) | Estrategia de crecimiento |
| Criterio C12 | Job `web-e2e` en el workflow | [`ci.yml`](../../.github/workflows/ci.yml) | CD |
| Criterio C14 | Migración `0002` y paquetes `sijass-web` y `e2e` | Repositorio | Migraciones de reservorios y evidencia |

## 3.3. Aporte de s1c

`s1c-reservorios-mediciones` conecta el dominio de medición (`s1a`) a las sesiones y los roles de `s1b`: el consejo da de alta reservorios, el operador registra mediciones manuales, y operador, tesorero y consejo consultan el historial, con aislamiento entre JASS. **No** cierra ningún criterio y **ninguno pasa a *Implementado***. Evidencia verificado en local el 2026-11-19 (278 pruebas unitarias, 245 de integración, 84 de interfaz y 7 E2E) y en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/44640749517)); la de GitHub Actions se cita aparte: CI en GitHub Actions: [PR #10](https://github.com/Henrixfs/SIJASS/pull/10), commit `6cb320a`, [ejecución 44640749517](https://github.com/Henrixfs/SIJASS/actions/runs/44640749517) con `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)` e `Interfaz y E2E (navegador)` en verde.

| Criterio | Aporte de s1c | Evidencia | Pendiente visible |
|---|---|---|---|
| Criterio C02 | RF02 (reservorios) y RF06, RF07 y RF11 parcial por HTTP e interfaz | [Especificaciones](../../openspec/changes/archive/2026-11-26-s1c-reservorios-mediciones/specs/mediciones-en-linea/spec.md) | RF08, RF15, auditoría de mediciones |
| Criterio C04 | Cuarto cambio SDD | [Cambio](../../openspec/changes/archive/2026-11-26-s1c-reservorios-mediciones/tasks.md) | Archivar tras fusionar |
| Criterio C05 | PT13 completo para mediciones y reservorios; 278 + 245 + 84 pruebas | [Plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md) | PT09, PT10, PT19 |
| Criterio C06 | Segundo flujo E2E en navegador | [`flujo-mediciones.spec.ts`](../../tecnologia/e2e/pruebas/flujo-mediciones.spec.ts) | Operación sin conexión |
| Criterio C07 | Pantalla de mediciones por rol, con aviso de no dictamen | [`Mediciones.tsx`](../../tecnologia/sijass-web/src/paginas/Mediciones.tsx) | Usabilidad con operadores reales |
| Criterio C09 | Migración `0003` (nombre único por JASS) | [Migración](../../tecnologia/siJASS-clean-architecture/migraciones/0003_reservorios-unicos.sql) | Estrategia de crecimiento |
| Criterio C14 | Migración `0003` | Repositorio | Evidencia fotográfica |

## 3.4. Aporte de s1d

`s1d-asistente-tecnico` construye lo que no depende de insumos externos del asistente documental: contrato, recuperación con citas verificables, abstención, límite de dosis, interfaz y pruebas, con un corpus de **EJEMPLO** ficticio. **No** cierra ningún criterio y **ninguno pasa a *Implementado***. Evidencia verificado en local el 2026-11-19 (393 pruebas unitarias, 264 de integración, 94 de interfaz y 9 E2E) y en CI ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/44644551404)). Evidencia de GitHub Actions (aparte): [PR #11](https://github.com/Henrixfs/SIJASS/pull/11), commit `f2e8123`, [ejecución 44644551404](https://github.com/Henrixfs/SIJASS/actions/runs/44644551404): `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)` e `Interfaz y E2E (navegador)` en verde.

| Criterio | Aporte de s1d | Evidencia | Pendiente visible |
|---|---|---|---|
| Criterio C02 | RF13 y RF14 en su parte determinista | [Especificación](../../openspec/changes/archive/2026-11-26-s1d-asistente-tecnico/specs/asistente-documental/spec.md) | Corpus aprobado, proveedor, FastAPI |
| Criterio C04 | Quinto cambio SDD | [Cambio](../../openspec/changes/archive/2026-11-26-s1d-asistente-tecnico/tasks.md) | Archivar tras fusionar |
| Criterio C05 | PT15, PT16 y PT17 con corpus de ejemplo | [Plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md) | Evaluación con el corpus aprobado |
| Criterio C06 | Tercer flujo E2E | [`flujo-asistente.spec.ts`](../../tecnologia/e2e/pruebas/flujo-asistente.spec.ts) | Operación sin conexión |
| Criterio C07 | Pestaña *Asistente* con aviso de corpus de ejemplo | [`Asistente.tsx`](../../tecnologia/sijass-web/src/paginas/Asistente.tsx) | Usabilidad con operadores reales |

## 3.5. Aporte de s1e

`s1e-despliegue-evidencia` construye y verifica **en local y en CI** todo lo que no depende de servicios externos (contrato OpenAPI, sonda de salud, caché estática, contenedor, verificación del despliegue, escenarios de carga k6) y **prepara y nombra** lo que sí depende (dominio, DNS, HTTPS real, CDN, hosting, CD). **No** cierra ningún criterio y **ninguno pasa a *Implementado***. Las tres evidencias se mantienen **separadas**; la del despliegue está en blanco porque **no existe despliegue**.

| Criterio | Evidencia **local** | Evidencia **CI** (GitHub Actions) | Evidencia del **despliegue** |
|---|---|---|---|
| Criterio C08 | [Contrato OpenAPI](../api/openapi.yaml) con 24 rutas y su prueba; capacidad local medida (tabla de abajo) | [PR #12](https://github.com/Henrixfs/SIJASS/pull/12), commit `2a42eeb` (hoy `d85db0e`, tras un rebase), [ejecución 44651717598](https://github.com/Henrixfs/SIJASS/actions/runs/44651717598): `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)`, `Interfaz y E2E (navegador)` e `Imagen del contenedor` en verde | **Sin medir** |
| Criterio C10 | [`verificar-despliegue.mjs`](../../scripts/verificar-despliegue.mjs) y [`Caddyfile`](../../Caddyfile) preparados; DNS, TLS, HSTS y redirección salen **no aplicable** sin dominio | El job `Imagen del contenedor` ejecuta el script (solo las comprobaciones aplicables) | **Sin medir** (sin dominio, DNS ni CDN) |
| Criterio C11 | Caché estática implementada y probada: `/assets/*` `immutable` con `ETag` y `304`, `index.html` `no-cache`, `/v1/*` `no-store` | Mismas pruebas en el job `Integración (PostgreSQL)` | **Sin medir** (sin CDN ni navegador real) |
| Criterio C12 | Imagen construida y ejecutada con el compose; usuario no root; sin secretos; sin pruebas compiladas | Job `Imagen del contenedor`: construye, levanta con PostgreSQL y migraciones y verifica; la **publicación en GHCR es manual y no se ejecutó** | **Sin medir** (CD no automatizado: falta destino y credenciales) |
| Criterio C13 | Escenario k6 y siembra de 2.000 cuentas; humo y rampa **locales** (tabla de abajo) | **No ejecutado** en CI | **Sin medir** |

Todo lo anterior se detalla, junto con lo que falta para el despliegue, en [`docs/08-despliegue/`](../08-despliegue/despliegue-y-bloqueos.md).

### Pruebas de carga del portal (resultado **local**, 2026-11-20)

> **Advertencia.** Estas cifras son **locales**: el generador de carga (k6), la API (contenedor) y PostgreSQL (contenedor) comparten una misma máquina de desarrollo (AMD Ryzen 7 5700U, 8 núcleos y 16 hilos, 14 GB de RAM, Windows 11 con Docker Desktop de 16 CPU y 7 GB para el contenedor). **No representan la capacidad del despliegue ni de una JASS real.** Los registros completos están en [`docs/07-evaluacion-final/carga/`](carga/).

Modelo de carga: cada usuario virtual inicia sesión una vez con su propia cuenta y lee `saldo`, `cuotas` y `pagos` del portal con 1 a 3 s de pensamiento entre iteraciones. Umbral: p95 de lectura < 800 ms y errores < 1 %.

| Usuarios virtuales (escalón de 40 s) | p50 lectura | p95 lectura | p99 lectura | Errores |
|---|---|---|---|---|
| 25 | 14 ms | 20 ms | 33 ms | 0 % |
| 50 | 13 ms | 21 ms | 29 ms | 0 % |
| 100 | 17 ms | 52 ms | 103 ms | 0 % |
| 150 | 26 ms | 224 ms | 385 ms | 0 % |
| 200 | 112 ms | 299 ms | 375 ms | 0 % |
| **300** | 424 ms | **756 ms** | 906 ms | 0 % |
| 500 | 1,17 s | 1,89 s | 2,25 s | 0 % |
| 1.000 | 2,92 s | 4,74 s | 5,95 s | 0 % |
| 2.000 (subida) | 13,99 s | 28,43 s | 31,87 s | 0 % |
| 2.000 (mantenimiento 20 s) | 7,12 s | 27,97 s | 31,90 s | 0 % |

Primera rampa (seis escalones de 60 s hasta 2.000, mantenimiento de 120 s): p50 8,36 s, p95 11,75 s, p99 12,86 s, rendimiento medio 158 solicitudes por segundo, 81.521 solicitudes, 2.000 inicios de sesión y **0 errores**; el umbral de latencia **no se cumplió**. La rampa por escalones finos tuvo un rendimiento medio de 148 solicitudes por segundo.

**Lectura honesta de lo observado (local):**

- **Capacidad con el umbral de latencia:** hasta unos **300 usuarios virtuales concurrentes** (alrededor de 150 solicitudes por segundo) en esta máquina; más allá, las solicitudes hacen cola y la latencia crece de forma casi proporcional a la carga. **La meta de 2.000 usuarios virtuales concurrentes NO se alcanzó** con la latencia exigida.
- **Sin errores:** el sistema no rechazó ni falló ninguna solicitud, incluso a 2.000 usuarios virtuales; degrada la latencia, no la corrección.
- **Dónde se satura (observación, no diagnóstico por perfilado):** el contenedor de la API estable en torno a 100–160 % de CPU durante las lecturas (un solo proceso Node.js, cercano a un núcleo y medio) y PostgreSQL cerca de 100–120 %; en las ráfagas de inicio de sesión la API llegó a ~520 % (derivación `scrypt`). Cada lectura del portal abre dos transacciones y hace del orden de nueve viajes a la base, y cada una de las tres rutas del portal recalcula el estado de cuenta completo; el grupo de conexiones es de 10.
- **No se aplicó ninguna optimización.** Candidatos a evaluar **con medición** antes de afirmar mejoras: varias réplicas de la API detrás de un balanceador, una sola consulta para autorizar, lecturas sin transacción explícita, un único punto de lectura del portal, el tamaño del grupo de conexiones y guardar la membresía durante la vigencia del token.
- La latencia del inicio de sesión no se informó por separado en estas ejecuciones (se corrigió el escenario para hacerlo en las siguientes).

## 3.6. Aporte de s2a

`s2a-acceso-dni-multi-jass` ([propuesta](../../openspec/changes/archive/2026-11-26-s2a-acceso-dni-multi-jass/proposal.md)) cambia el acceso para que lo use gente sin estudios: ingreso con DNI y dos botones, claves de tres palabras, cambio y restablecimiento de clave, equipo del Consejo, rol de plataforma que da de alta las JASS y aislamiento entre JASS reforzado con seguridad por filas en la base. **No** cierra ningún criterio y **ninguno pasa a *Implementado***. La evidencia es **local** (2026-11-25); **no hay ejecución de CI** del cambio, y la evidencia del **despliegue** sigue en blanco porque no existe despliegue.

| Criterio | Aporte de s2a | Evidencia **local** | Pendiente visible |
|---|---|---|---|
| Criterio C02 | RF01 con identidad por DNI, perfiles y plataforma; claves generadas | [Especificaciones](../../openspec/changes/archive/2026-11-26-s2a-acceso-dni-multi-jass/specs/acceso-por-documento/spec.md) y [diseño](../../openspec/changes/archive/2026-11-26-s2a-acceso-dni-multi-jass/design.md) | Recuperación autónoma de clave, varias JASS por persona |
| Criterio C04 | Cambio SDD completo: cinco especificaciones, diseño de 14 decisiones y 38 tareas; `openspec validate --strict` válido | [Cambio](../../openspec/changes/archive/2026-11-26-s2a-acceso-dni-multi-jass/tasks.md) | Tarea 9.2 (delta sobre `acceso-por-perfiles`, al archivar `s1b`); archivar |
| Criterio C05 | 456 pruebas unitarias, 364 de integración y 147 de interfaz; PT26 y PT27 | [Plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md#verificación-de-s2a-acceso-dni-multi-jass-2026-11-25-en-local) | Ejecución en CI |
| Criterio C06 | Cinco recorridos nuevos en navegador real: tipo equivocado, Consejo→Tesorería con cambio de clave, Tesorería→asociada, bloqueo y restablecimiento, plataforma→JASS nueva y suspensión | [`flujo-acceso.spec.ts`](../../tecnologia/e2e/pruebas/flujo-acceso.spec.ts) | Operación sin conexión |
| Criterio C07 | Ingreso con dos botones, cambio obligatorio y entrega de clave, medidos a 320, 360, 390, 768 y 1440 px | [Capturas y medidas](../diseno/evidencia/s2a-acceso/README.md); [`acceso.spec.ts`](../../tecnologia/e2e/responsive/acceso.spec.ts) | Prueba de usabilidad con personas reales (PT23), PWA |
| Criterio C09 | Migraciones `0004` y `0005` reversibles; seguridad por filas con el rol `sijass_app` | [`0004`](../../tecnologia/siJASS-clean-architecture/migraciones/0004_acceso-por-documento.sql), [`0005`](../../tecnologia/siJASS-clean-architecture/migraciones/0005_seguridad-por-filas.sql) | Estrategia de crecimiento |
| Criterio C14 | Migraciones, comandos de operación y [guía de operación](../08-despliegue/guia-operacion-acceso.md) | Repositorio | — |

## 3.7. Aporte del Sprint 2

Contraste detallado con el enunciado del Sprint 2 en [cumplimiento del Sprint 2](cumplimiento-sprint-2.md). Las pruebas y la carga se ejecutaron en **local** (2026-11-26); el CI de GitHub Actions del cambio ([PR #13](https://github.com/Henrixfs/SIJASS/pull/13), 14 de 14 comprobaciones en verde) se cita en el [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md#verificación-del-sprint-2-2026-11-26-en-local) y la evidencia del **despliegue** sigue en blanco porque no existe despliegue. **No** cierra ningún criterio.

| Criterio | Aporte | Evidencia **local** | Pendiente visible |
|---|---|---|---|
| Criterio C03 | Capas verificables y decisiones nuevas (ADR-016 y ADR-017) | [SOLID y patrones en el código](../03-diseno-de-software/diseno-interno/solid-y-patrones-en-el-codigo.md) | Módulos con límites forzados |
| Criterio C05 | **Jest** con reporte de cobertura (núcleo: 98,1 % de líneas, 92,3 % de ramas) y 470 unitarias; 380 de integración | [Plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md#verificación-del-sprint-2-2026-11-26-en-local) | CI en verde en el PR #13; falta la ejecución en el despliegue |
| Criterio C08 | Contrato OpenAPI de 35 operaciones con Swagger UI en `/docs` y colección de Postman ejecutada con Newman (35 peticiones, 0 fallos); capacidad medida | [Validación de atributos de calidad](validacion-atributos-de-calidad.md) | Escalado horizontal no medido |
| Criterio C09 | Análisis con `EXPLAIN` sobre 2.000 asociados; el «N + 1» del padrón se corrigió (13,7 s → 0,24 s) | [Análisis de BD y caché](analisis-bd-y-cache.md) | Respaldo y crecimiento: solo propuesta |
| Criterio C11 | Caché HTTP de estáticos inmutables y del catálogo de referencia; sin caché de datos de personas (ADR-016) | [Análisis](analisis-bd-y-cache.md#5-estrategia-de-caché-decisión-adr-016) | Sin CDN ni caché de servidor |
| Criterio C13 | Rampa k6 hasta 2.000 usuarios virtuales tras `s2a` | Tabla de abajo y [`carga/`](carga/) | Contra el despliegue: sin medir |

### Pruebas de carga tras s2a (resultado **local**, 2026-11-25)

> **Advertencia.** Cifras **locales**: k6, la API y PostgreSQL (contenedores) comparten una máquina de desarrollo. **No representan el despliegue ni una JASS real.** Registro: [`carga/local-2026-11-26-02-17-32.json`](carga/local-2026-11-26-02-17-32.json).

Rampa de seis escalones de 60 s hasta 2.000 usuarios virtuales y mantenimiento de 120 s; cada usuario entra con su DNI y lee `saldo`, `cuotas` y `pagos`.

| Escalón | Usuarios virtuales al final | Mediana | p95 | p99 | Errores |
|---|---|---|---|---|---|
| 1 | 50 | 14 ms | 28 ms | 42 ms | 0 % |
| 2 | 200 | 154 ms | 512 ms | 616 ms | 0 % |
| 3 | 500 | 1,31 s | 2,08 s | 2,15 s | 0 % |
| 4 | 1.000 | 3,40 s | 5,14 s | 5,49 s | 0 % |
| 5 | 1.500 | 6,42 s | 8,52 s | 9,21 s | 0 % |
| 6 | 2.000 | 9,13 s | 10,09 s | 10,13 s | 0 % |

Total: 86.450 solicitudes (165 por segundo), 2.000 inicios de sesión, **0 errores**. El umbral propio (p95 < 800 ms) se cumple hasta unos 200 usuarios virtuales y no en la meta; el inicio de sesión (`scrypt`) tuvo una mediana de 5,12 s durante la subida. Lectura completa en la [validación de atributos de calidad](validacion-atributos-de-calidad.md).

## 3.8. Aporte de s1f

`s1f-backend-incidencias` ([propuesta](../../openspec/changes/s1f-backend-incidencias/proposal.md)) agrega el backend para que las familias reporten problemas del servicio (fuga, falta de agua, agua turbia, poca presión, averías u otros) y la JASS los atienda: prioridad sugerida por una matriz configurable que confirma una persona, responsable, acciones públicas o internas, cierre y reapertura con historial de solo inserción, y una foto opcional sin metadatos. **No** tiene interfaz todavía y **no** cierra ningún criterio. La evidencia es **local** (2026-11-26); **no hay ejecución de CI** del cambio.

| Criterio | Aporte de s1f | Evidencia **local** | Pendiente visible |
|---|---|---|---|
| Criterio C04 | Cambio SDD con especificación de 13 requisitos y decisiones aprobadas registradas antes de implementar | [Diseño](../../openspec/changes/s1f-backend-incidencias/design.md) y [tareas](../../openspec/changes/s1f-backend-incidencias/tasks.md) | Archivar tras la CI; tareas de la sección 5 (Sprint 0) aparte |
| Criterio C05 | 522 pruebas unitarias y 434 de integración; PT29 y PT30 | [Plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md#verificación-de-s1f-backend-incidencias-2026-11-26-en-local) | Ejecución en CI |
| Criterio C08 | 12 operaciones nuevas en el contrato OpenAPI (47 en total) y en la colección de Postman | [Contrato](../api/openapi.yaml) | Interfaz que las consuma |
| Criterio C09 | Migración `0006` aditiva y reversible con seguridad por filas, historial de solo inserción y respaldo restaurado en una base desechable | [`0006`](../../tecnologia/siJASS-clean-architecture/migraciones/0006_incidencias.sql) | Política de retención de fotos antes del piloto |
| Criterio C14 | Rutas con idempotencia, revisión optimista y auditoría en la misma transacción | Repositorio | Notificaciones a la JASS |

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
