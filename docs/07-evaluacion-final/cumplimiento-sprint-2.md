# Cumplimiento del Sprint 2 — Implementación y validación de la arquitectura

**Estado al 2026-11-25** · Contrasta el enunciado del Sprint 2 (ocho actividades y cinco entregables) con lo que existe en el repositorio, con su evidencia y con lo que falta. Complementa la [matriz de cumplimiento](matriz-cumplimiento.md) (criterios C01–C16). Toda la evidencia es **local**: el trabajo de `s2a` y del Sprint 2 **no está aún en GitHub** ni tiene ejecución de CI (ver §4).

## 1. Actividades

| # | Actividad del Sprint 2 | Estado | Evidencia | Qué falta |
|---|---|---|---|---|
| 1 | Implementar el estilo arquitectónico | **Hecho (prototipo)** | Monolito modular NestJS en capas ([estructura](../../tecnologia/siJASS-clean-architecture/README.md), ADR-001) | Los módulos son carpetas y puertos, no paquetes con límites forzados por el compilador |
| 2 | Aplicar el enfoque o patrón arquitectónico (Clean Architecture) | **Hecho** | [SOLID y patrones en el código](../03-diseno-de-software/diseno-interno/solid-y-patrones-en-el-codigo.md): el núcleo no importa NestJS, `pg` ni Express | — |
| 3 | Especificaciones SDD con criterios de aceptación y tareas técnicas | **Hecho** | Cambios OpenSpec con escenarios `WHEN/THEN` y tareas verificables: `s0`, `s1a`, `retirar-node-20` (archivados), `s1b` a `s1e` y `s2a` (completos) | Archivar `s1b` a `s1e` y `s2a`; la tarea 9.2 de `s2a` depende de archivar `s1b` |
| 4 | Endpoints REST funcionales y documentados con OpenAPI/Swagger | **Hecho** | [OpenAPI](../api/openapi.yaml) con 35 operaciones y prueba de coherencia; **Swagger UI** en `/docs`; [colección de Postman](../api/sijass.postman_collection.json) ejecutada con Newman: 35 peticiones, 70 aserciones, 0 fallos | — |
| 5 | Analizar la base de datos y la estrategia de caché | **Hecho** | [Análisis de BD y caché](analisis-bd-y-cache.md) con `EXPLAIN` sobre 2.000 asociados, el hallazgo del «N + 1» corregido (13,7 s → 0,24 s), ADR-016 y ADR-017 | Estrategia de crecimiento y respaldo: solo propuesta |
| 6 | Aplicar principios SOLID y patrones de diseño | **Hecho** | [Documento con enlaces al código](../03-diseno-de-software/diseno-interno/solid-y-patrones-en-el-codigo.md) | — |
| 7 | Pruebas automatizadas con **Jest**, con reporte de cobertura y en CI/CD (GitHub Actions) | **Hecho (local)** | `npm test` ejecuta Jest: **470** pruebas unitarias; `npm run test:cobertura`: núcleo del negocio **98,1 %** de líneas, **92,3 %** de ramas y **98,0 %** de funciones, con umbrales mínimos; CI con artefacto de cobertura ([`ci.yml`](../../.github/workflows/ci.yml)) | La interfaz usa Vitest (misma API que Jest). Falta ver el CI en verde con estos cambios (§4) |
| 8 | Pruebas de escenarios de calidad con k6 (hasta 2.000 usuarios), Postman y Jest | **Hecho en parte** | [Validación de atributos de calidad](validacion-atributos-de-calidad.md): k6 progresivo hasta **2.000** usuarios virtuales con 0 errores, Newman, Jest, E2E | 5 de 12 escenarios no se pueden validar sin la PWA y sin personas (§3) |

## 2. Entregables

| Entregable | Estado | Dónde |
|---|---|---|
| Código fuente organizado según la arquitectura | **Listo** (local) | [`tecnologia/`](../../tecnologia) |
| Primera versión funcional | **Lista** (local): ingreso por DNI, padrón, cuotas, pagos, reversa, portal de familias, reservorios, mediciones, asistente, equipo y plataforma | API + interfaz; demostración con `sembrar-demo`; 14 pruebas E2E |
| Documentación de la API (OpenAPI/Swagger) | **Lista** | `/docs` y [`openapi.yaml`](../api/openapi.yaml) |
| Pruebas con Jest y reporte de cobertura | **Listo** | [README del backend](../../tecnologia/siJASS-clean-architecture/README.md#pruebas-con-jest-cobertura-swagger-y-postman-sprint-2); el reporte HTML se genera en `cobertura/` |
| Evidencias de validación de atributos de calidad | **Listo, con límites declarados** | [Validación](validacion-atributos-de-calidad.md) |

**Criterio fundamental del Sprint** («la implementación respeta las decisiones arquitectónicas documentadas y se demuestra con pruebas»): el aislamiento entre JASS (ADR-008 y ADR-017), la idempotencia (ADR-005), el contrato OpenAPI (ADR-011) y la separación en capas (ADR-006) tienen pruebas que se ejecutan. ADR-002 (PWA con almacenamiento local) y ADR-007 (servicio de IA) **no** están implementadas.

## 3. Lo que no está y por qué

| Pendiente | Por qué | Cuándo |
|---|---|---|
| PWA, captura sin conexión y guardado local (EC-01, EC-06, EC-09) | Requiere trabajo de interfaz y de sincronización | Cambio `s2b` |
| Corrección auditada de mediciones (EC-04, RF08) | No implementada | Sin planificar |
| Prueba de usabilidad con personas (EC-10) | Requiere personas reales | Piloto |
| Dominio, DNS, HTTPS real y CDN (C10), despliegue continuo (C12) y carga contra el servicio (C13) | **No existe despliegue** | Requiere decisiones y datos que da el equipo ([despliegue](../08-despliegue/despliegue-y-bloqueos.md)) |
| Informe final y presentación (C15, C16) | Se escriben al cierre | Cierre del proyecto |

## 4. Riesgos para el sábado y qué hacer

1. **El código de `s2a` y del Sprint 2 no está en GitHub** (C14). La rama de trabajo es `feat/s1e-despliegue-evidencia` con el PR de `s1e` todavía abierto y decenas de archivos sin confirmar. Acción: confirmar el trabajo por cambios (`s2a` y Sprint 2), enviarlo, esperar el CI en verde y fusionar. Solo lo que esté en GitHub y en verde se puede citar como evidencia de CI.
2. **CI sin ver:** se cambió el flujo (Jest, cobertura, colección de Postman). Lo probado en local no sustituye una ejecución en GitHub Actions; si Node.js 22 o 26 se comportan distinto con Jest, se verá ahí.
3. **Dominio y CDN (C10):** sin un dominio o subdominio y un servidor, el criterio queda en blanco. Con un servidor Linux con Docker y un subdominio (propio o gratuito) se puede completar en una tarde con el compose y el `Caddyfile` que ya existen; faltan esos datos del equipo.
4. **Archivar los cambios OpenSpec** (C04): `s1b` a `s1e` y `s2a` están completos y sin archivar; archivarlos deja visibles las especificaciones principales.

## Flags

**Red Flags:** ninguna técnica; el riesgo es de entrega (§4.1).

**Yellow Flags:** evidencia solo local; PWA y sin conexión pendientes; C10 y el CD dependen de un despliegue que no existe.
