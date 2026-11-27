# Plan de pruebas y validación — SIJASS

**Estado:** plan de calidad para la arquitectura objetivo. Ninguna prueba del MVP ha sido ejecutada en CI sobre un despliegue; el prototipo contiene pruebas unitarias, de contrato, de integración contra PostgreSQL, HTTP y E2E que cubren PT01–PT04, PT11–PT14 (ver la sección 1).

## 1. Situación verificada del prototipo

| Comprobación | Resultado |
|---|---|
| **2026-10-28, antes de `s0-saneamiento-prototipo`:** `npm install` y `npm test` en una copia limpia de `tecnologia/siJASS-clean-architecture/` (Node.js 22.22.0, npm 10.9.4) | **Falla la compilación**: `TS2307: Cannot find module 'node:test'` y `'node:assert'` por falta de `@types/node` (DT01) |
| **2026-10-28:** la misma copia con `@types/node` añadido localmente, **sin versionar el cambio** | Las 5 pruebas pasan (5/5) |
| **2026-11-04, tras `s0-saneamiento-prototipo`:** `npm ci`, `npm run lint`, `npm run build` y `npm test` en copia limpia (Node.js 24 local; Node.js 20 y 22 en [CI](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941), commit `9725d15`, PR #3 fusionado a `main`; el CI de `main` también pasó: [ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/41888275471)) | Todos terminan con código 0; 5/5 pruebas pasan; DT01 y DT02 resueltas |
| **2026-11-16, tras `s1a-dominio-medicion`:** `npm ci`, `npm run lint`, `npm test` y `npm run test:integration` contra PostgreSQL 16 (commit `e79b29a`, [PR #5](https://github.com/Henrixfs/SIJASS/pull/5)). En GitHub Actions ([ejecución 43899642952](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)): `prototipo` en Node.js 20 y 22, `documentacion` e `integracion`. En local: Node.js 24 y PostgreSQL 16 en Docker, tres ejecuciones consecutivas de `test:integration` | Todos terminan con código 0; `npm test` pasa 73 pruebas y `test:integration` pasa 52 (migración aplicada, revertida y vuelta a aplicar); DT03–DT06 resueltas |

Esta verificación solo demuestra que el dominio y la persistencia del prototipo se comportan como sus pruebas esperan; no valida PWA, API, autenticación, sincronización ni RAG.

### Correspondencia de las pruebas existentes

El archivo `dominio.test.ts` (cinco pruebas sobre el modelo heredado) se retiró en `s1a-dominio-medicion`. Las pruebas actuales se organizan por nivel:

| PT | Prueba | Nivel | Se ejecuta con |
|---|---|---|---|
| PT01 | Valores no finitos, negativos y no numéricos: [`medicion.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/medicion.test.ts) | Unitaria | `npm test` |
| PT02 | Fechas, unidad y método: [`medicion.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/medicion.test.ts) e [`instante.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/instante.test.ts) | Unitaria | `npm test` |
| PT03 | Registrar y recuperar con autor y JASS: batería [`repositorio-mediciones.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/repositorio-mediciones.ts) | Contrato | `npm test` (memoria) y `npm run test:integration` (PostgreSQL) |
| PT04 | Duplicado y tres reintentos (RNF04): batería [`registro-idempotente.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/registro-idempotente.ts) | Contrato | ambos |
| PT11 | Fallo entre la reserva y la escritura, repetido en 10 rondas: [`registro-idempotente.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/registro-idempotente.ts) | Contrato | ambos (en PostgreSQL, vía [`contrato-postgres.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/contrato-postgres.test.ts)) |
| PT12 | Conflicto sin sobrescritura: [`registro-idempotente.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/registro-idempotente.ts) | Contrato | ambos |
| — | Restricciones del esquema por SQL directo y coherencia del catálogo: [`esquema.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/esquema.test.ts) | Integración | `npm run test:integration` |

PT13 se cubre ya para asociados, cuotas, pagos y portal (`s1b`) y para reservorios y mediciones (`s1c`, ver abajo).

### Verificación del Sprint 2 (2026-11-26, en local)

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `npm run build` y `npm test` (**Jest**, ESM + ts-jest) en `tecnologia/siJASS-clean-architecture/` | Código 0; 470 pruebas unitarias en 19 suites; la comprobación cruzada con el ejecutor nativo (`npm run test:nativo`) también pasa 470 |
| `npm run test:cobertura` (Jest, V8) | Núcleo del negocio (dominio, aplicación, adaptadores de memoria y seguridad): 98,1 % de líneas, 92,3 % de ramas y 98,0 % de funciones; umbrales 90/85/90 |
| `npm run test:integration` contra PostgreSQL 16 sobre una base limpia (ejecutor nativo) | Código 0; 380 pruebas, 0 fallos; la cobertura nativa de la integración (HTTP y PostgreSQL) fue de 96,6 % de líneas y 88,9 % de ramas en la medición del 2026-11-25 |
| Interfaz: `npm run lint`, `tsc -b`, `npm run test:cobertura`, `npm run build` | Código 0; 147 pruebas, 88,5 % de líneas |
| `npx playwright test` (Chrome, API real y PostgreSQL) | 14 pruebas aprobadas |
| `npx playwright test -c playwright.responsive.config.ts` | 23 pruebas aprobadas |
| Newman sobre la [colección de Postman](../api/sijass.postman_collection.json) (generada del contrato) contra la API local | 35 peticiones, 70 aserciones, 0 fallos |
| k6 progresivo hasta 2.000 usuarios virtuales (local) | 86.450 solicitudes, 0 errores; p95 de lectura < 800 ms hasta ~200 usuarios virtuales; ver la [validación de atributos de calidad](../07-evaluacion-final/validacion-atributos-de-calidad.md) |

Es evidencia **local**; la de **GitHub Actions** se cita aparte: [PR #13](https://github.com/Henrixfs/SIJASS/pull/13), commit `3557c48`, [ejecución 45854454728](https://github.com/Henrixfs/SIJASS/actions/runs/45854454728): `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)`, `Interfaz y E2E (navegador)` e `Imagen del contenedor` en verde (7 de 7). Un intento anterior del commit `6c37c99` ([ejecución 45853607502](https://github.com/Henrixfs/SIJASS/actions/runs/45853607502)) falló en una prueba de interfaz que no esperaba los datos de red; se corrigió en `3557c48`. Prueba nueva del Sprint: `/docs` (Swagger UI), la caché HTTP del catálogo (`ETag`, `304` y errores en `no-store`) y la equivalencia del listado del padrón con el estado de cuenta individual.

### Verificación de `s1f-backend-incidencias` (2026-11-26, en local)

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `npm run build` y `npm run test:cobertura` en `tecnologia/siJASS-clean-architecture/` | Código 0; 522 pruebas unitarias, 0 fallos; cobertura global 98,4 % de líneas y 92,1 % de ramas (umbral 90 % y 85 %) |
| `npm run migrar`, `npm run migrar:revertir` y `npm run migrar` sobre una base nueva y desechable | Código 0; la migración `0006` se aplica, se revierte y se vuelve a aplicar |
| `npm run test:integration` contra PostgreSQL 16 en Docker | Código 0; 434 pruebas de integración, 0 fallos |
| `pg_dump` de la base de pruebas y `pg_restore` en una base desechable | Mismo número de incidencias, eventos, fotos y versiones de reglas; las cinco políticas de seguridad por filas y los dos disparadores del historial presentes |
| `node scripts/generar-postman.mjs --verificar` y `node scripts/verificar-docs.mjs` | La colección (47 peticiones) coincide con el contrato; verificación documental correcta |
| `openspec validate s1f-backend-incidencias --strict` | Válido |

Es evidencia **local**: no hay ejecución de CI del cambio todavía, y no incluye interfaz (el cambio es solo backend). La foto se valida por su firma y se guarda sin metadatos, pero el sistema **no** analiza su contenido.

| PT | Prueba de `s1f` | Nivel |
|---|---|---|
| PT29 | Incidencias: [`incidencia-dominio.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/incidencia-dominio.test.ts) (24 combinaciones de la matriz, ciclo de atención y foto), [`casos-incidencias.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-incidencias.ts) sobre memoria y PostgreSQL y [`api-incidencias.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-incidencias.test.ts) por HTTP | Contrato / Seguridad |
| PT30 | Concurrencia e historial: [`incidencias-postgres.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/incidencias-postgres.test.ts) (diez creaciones con la misma clave, dos modificaciones de la misma revisión, reglas y fotos simultáneas, historial de solo inserción y seguridad por filas de las tablas nuevas) | Integración |

### Verificación de `s2a-acceso-dni-multi-jass` (2026-11-25, en local)

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `npm run build` y `npm test` en `tecnologia/siJASS-clean-architecture/` | Código 0; 456 pruebas unitarias, 0 fallos |
| `npm run migrar`, `npm run migrar:revertir -- 5` y `npm run migrar` sobre una base nueva; después `npm run test:integration` contra PostgreSQL 16 en Docker sobre otra base limpia y migrada | Código 0; revertir las cinco migraciones deja el esquema vacío y volver a aplicarlas registra las cinco; 364 pruebas de integración, 0 fallos (esquema `0004`, seguridad por filas `0005`, identidad por HTTP y matriz de aislamiento incluidos) |
| `npm run lint`, `tsc -b`, `npm test` y `npm run build` en `tecnologia/sijass-web/` | Código 0; 147 pruebas de interfaz en 7 archivos |
| `npx playwright test` en `tecnologia/e2e/` (Chrome del sistema, API real y PostgreSQL con la base recreada) | 14 pruebas aprobadas: los tres flujos anteriores adaptados a DNI y tipo, más los cinco de [`flujo-acceso.spec.ts`](../../tecnologia/e2e/pruebas/flujo-acceso.spec.ts) |
| `npx playwright test -c playwright.responsive.config.ts` (API simulada) | 23 pruebas aprobadas: 15 de [`acceso.spec.ts`](../../tecnologia/e2e/responsive/acceso.spec.ts) (ingreso, cambio de clave y entrega de clave a 320, 360, 390, 768 y 1440 px) y 8 de la suite anterior; [capturas y medidas](../diseno/evidencia/s2a-acceso/README.md) |
| `openspec validate s2a-acceso-dni-multi-jass --strict` | Válido |

Es evidencia **local**; la ejecución de CI en GitHub Actions del mismo cambio se cita en la verificación del Sprint 2 (más arriba). No valida despliegue, rendimiento, PWA, sincronización ni RAG, y las medidas de accesibilidad son técnicas, **no** una prueba con personas.

| PT | Prueba de `s2a` | Nivel |
|---|---|---|
| PT26 | Identidad por DNI: [`casos-identidad.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-identidad.ts) sobre memoria y PostgreSQL, [`api-identidad.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-identidad.test.ts) por HTTP y [`flujo-acceso.spec.ts`](../../tecnologia/e2e/pruebas/flujo-acceso.spec.ts) en navegador | Seguridad / E2E |
| PT27 | Aislamiento multi-JASS en la base: [`casos-aislamiento.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-aislamiento.ts) y [`aislamiento-filas.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/aislamiento-filas.test.ts), con consultas directas bajo el rol `sijass_app` | Seguridad |
| PT28 | Adaptación del ingreso, el cambio de clave y la entrega de clave: [`acceso.spec.ts`](../../tecnologia/e2e/responsive/acceso.spec.ts) | Interfaz |

### Verificación de `s1e-despliegue-evidencia` (2026-11-20)

| Entorno | Comprobación | Resultado |
|---|---|---|
| Local | `npm run lint`, `npm run build` y `npm test` (API) | Código 0; 400 pruebas unitarias |
| Local | `npm run test:integration` contra PostgreSQL 16 | Código 0; 280 pruebas (contrato OpenAPI por HTTP, salud, caché estática y verificación de despliegue incluidos) |
| Local | `docker build` y la pila del compose (PostgreSQL, migraciones, API) | Imagen de 362 MB; `/v1/salud` y `/` responden; usuario no root; sin `.env`, sin pruebas compiladas y sin `JWT_SECRET` no arranca; `verificar-despliegue.mjs`: 6 aprobadas, 0 fallidas, 4 no aplicables |
| Local | k6: humo y rampa hasta 2.000 usuarios virtuales | Ver la [matriz](../07-evaluacion-final/matriz-cumplimiento.md#35-aporte-de-s1e); **local, no representa el despliegue** |
| CI | Los siete jobs, incluido `Imagen del contenedor` | En verde: [PR #12](https://github.com/Henrixfs/SIJASS/pull/12), commit `2a42eeb` (hoy `d85db0e`, tras un rebase), [ejecución 44651717598](https://github.com/Henrixfs/SIJASS/actions/runs/44651717598): `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)`, `Interfaz y E2E (navegador)` e `Imagen del contenedor` en verde |
| Despliegue | Todo | **Sin medir**: no existe despliegue |

### Verificación de `s1d-asistente-tecnico` (2026-11-19, en local)

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `npm run build` y `npm test` (API) | Código 0; 393 pruebas unitarias, incluidas la validación del manifiesto, 16 preguntas con evidencia, 8 abstenciones, 25 pedidos de dosis bloqueados y 15 preguntas legítimas no bloqueadas |
| `npm run test:integration` contra PostgreSQL 16 | Código 0; 264 pruebas, con el asistente por HTTP (permisos, privacidad por búsqueda en todas las columnas de texto, solo lectura y arranque con corpus inválido en proceso real) |
| Interfaz: `npm run lint`, `npm run build`, `npm test` | Código 0; 94 pruebas, tres ejecuciones |
| `npx playwright test` (Chrome del sistema) | 9 pruebas aprobadas en tres ejecuciones consecutivas |

Es evidencia **local**; la de **GitHub Actions** se cita aparte: [PR #11](https://github.com/Henrixfs/SIJASS/pull/11), commit `f2e8123`, [ejecución 44644551404](https://github.com/Henrixfs/SIJASS/actions/runs/44644551404): `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)` e `Interfaz y E2E (navegador)` en verde. Los resultados usan un corpus de **EJEMPLO**: demuestran el comportamiento (citas comprobables, abstención, límites), **no** la calidad de las respuestas con documentos reales, que requiere el corpus aprobado y un conjunto de evaluación.

### Verificación de `s1c-reservorios-mediciones` (2026-11-19, en local)

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `npm run build` y `npm test` (API) | Código 0; 278 pruebas unitarias |
| `npm run test:integration` contra PostgreSQL 16 en Docker (esquema `0003`, baterías de reservorios en memoria y PostgreSQL, API de reservorios y mediciones, matriz de aislamiento) | Código 0; 245 pruebas |
| Interfaz: `npm run lint`, `npm run build`, `npm test` | Código 0; 84 pruebas, tres ejecuciones |
| `npx playwright test` (Chrome del sistema) | 7 pruebas aprobadas en tres ejecuciones consecutivas |

Es evidencia **local**. Evidencia **de GitHub Actions** (aparte): CI en GitHub Actions: [PR #10](https://github.com/Henrixfs/SIJASS/pull/10), commit `6cb320a`, [ejecución 44640749517](https://github.com/Henrixfs/SIJASS/actions/runs/44640749517) con `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)` e `Interfaz y E2E (navegador)` en verde.

| PT | Prueba de `s1c` | Nivel |
|---|---|---|
| PT13 | [`api-mediciones.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-mediciones.test.ts): 7 cuentas × cada ruta nueva × reservorio propio, ajeno e inexistente; todo `403` idéntico y auditado; las escrituras denegadas no cambian ninguna tabla | Seguridad |
| PT03 / PT04 | Mismas propiedades de registro e idempotencia (reintento `200`, conflicto `409`, rechazos `422`) ahora por HTTP | Integración |
| — | [`flujo-mediciones.spec.ts`](../../tecnologia/e2e/pruebas/flujo-mediciones.spec.ts): el operador registra, el consejo y el tesorero consultan, el consejo de otra JASS no ve nada | E2E |

### Verificación de `s1b-acceso-cuotas-pagos` (2026-11-19, en local)

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `npm run build` y `npm test` en `tecnologia/siJASS-clean-architecture/` (Node.js 24.18) | Código 0; 256 pruebas unitarias, 0 fallos |
| `npm run test:integration` contra PostgreSQL 16 en Docker (esquema `0002` por SQL directo, baterías compartidas con la memoria, concurrencia en 10 rondas, API HTTP, aislamiento, seguridad y procesos reales) | Código 0; 215 pruebas, 0 fallos, en dos ejecuciones consecutivas más |
| `npm run migrar`, `npm run migrar:revertir` y `npm run migrar` | Código 0; la reversión de `0002` deja solo las tablas de `0001` |
| `npm audit --omit=dev` (API) | 0 vulnerabilidades en dependencias de ejecución |
| `npm run lint`, `npm test` y `npm run build` en `tecnologia/sijass-web/` | Código 0; 56 pruebas de interfaz |
| `npx playwright test` en `tecnologia/e2e/` (Chrome del sistema, API real, PostgreSQL y la interfaz construida) | 5 pruebas aprobadas en tres ejecuciones consecutivas |

Esta tabla es evidencia **local**. Evidencia **de GitHub Actions** (aparte): CI en GitHub Actions: [PR #9](https://github.com/Henrixfs/SIJASS/pull/9), commit `97ba688`, [ejecución 44635444554](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554) con `Prototipo` (Node 22, 24 y 26), `Documentación`, `Integración (PostgreSQL)` e `Interfaz y E2E (navegador)` en verde. No valida despliegue, rendimiento, PWA, sincronización ni RAG.

| PT | Prueba de `s1b` | Nivel |
|---|---|---|
| PT13 / PT14 | [`casos-acceso.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-acceso.ts) y [`casos-padron.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-padron.ts): las mismas baterías sobre memoria (`npm test`) y PostgreSQL (`npm run test:integration`), con la matriz perfil/rol × caso de uso | Contrato |
| PT13 | [`api-aislamiento.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-aislamiento.test.ts): cada una de 8 cuentas × cada ruta × cada recurso por HTTP; todo `403` idéntico y auditado | Seguridad |
| PT14 | [`acceso-concurrencia.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/acceso-concurrencia.test.ts): diez reintentos simultáneos, dos pagos que juntos superan la cuota, rotación simultánea del refresco | Integración |
| — | [`api-seguridad.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-seguridad.test.ts): arranque sin `JWT_SECRET`, secretos fuera de la bitácora y la base, errores internos sin detalles | Seguridad |
| — | [`flujo-pagos.spec.ts`](../../tecnologia/e2e/pruebas/flujo-pagos.spec.ts): el tesorero registra un pago y el asociado, en otro navegador, ve su saldo actualizado | E2E |

## 2. Matriz de pruebas

| ID | Nivel | Caso | Resultado esperado | Requisitos | Estado |
|---|---|---|---|---|---|
| PT01 | Unitario | Valor de medición no finito o negativo | Rechazo con error de dominio | RF07, RNF03 | Prototipo (automatizada en CI: [medicion.test.ts](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/medicion.test.ts), [CI](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) |
| PT02 | Unitario | Fecha inválida, unidad o método fuera de catálogo | Rechazo con error de dominio | RF07, RNF03 | Prototipo (automatizada en CI: [medicion.test.ts](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/medicion.test.ts), [instante.test.ts](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/instante.test.ts), [CI](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) |
| PT03 | Unitario | Registrar y recuperar una medición dentro de la JASS | Lectura correcta con autor y JASS | RF06 | Prototipo (automatizada en CI: [repositorio-mediciones.ts](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/repositorio-mediciones.ts), [CI](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) |
| PT04 | Integración | Reenviar el mismo `operationId` con el mismo contenido | `duplicate` y un único efecto | RF10, RNF04 | Prototipo (automatizada en CI: [registro-idempotente.ts](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/registro-idempotente.ts), [CI](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) |
| PT05 | E2E | 100 registros sin conexión, cierre, reinicio y reconexión | 0 pérdidas observadas; todos sincronizados | RF10, RNF01 | Pendiente |
| PT06 | Seguridad | Tesorero intenta corregir una medición | `403`, sin cambios, evento auditado | RF01, RNF05 | Pendiente |
| PT07 | Compatibilidad | PWA en la matriz de dispositivos y navegadores del piloto | Instalación, almacenamiento local y sincronización funcionales | RNF08 | Pendiente |
| PT08 | Documental | Documento en borrador, sustituido o privado de otra JASS | No se lista ni se recupera | RF09, RF14, RNF09 | Pendiente |
| PT09 | Dominio | Registro con fotografía adjunta | Se guarda el valor manual; ningún valor se estima a partir de la imagen | RF06 | Pendiente |
| PT10 | Integración | Corregir una medición; corregir sobre una revisión desactualizada | Conserva original, nuevo valor, motivo, actor y fecha; la segunda devuelve `conflict` | RF08, RF11 | Pendiente |
| PT11 | Integración | Falla entre la reserva del `operationId` y la escritura de la medición | Reversión completa; ni `accepted` falso ni pérdida silenciosa | RF10, RNF04 | Prototipo (automatizada en CI: [registro-idempotente.ts](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/registro-idempotente.ts), [CI](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) |
| PT12 | Integración | Mismo `operationId` con contenido distinto | `conflict` sin sobrescritura | RF10, RNF04 | Prototipo (automatizada en CI: [registro-idempotente.ts](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/registro-idempotente.ts), [CI](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)) |
| PT13 | Seguridad | Usuario de la JASS A accede a datos de la JASS B (mediciones, asociados, reservorios, reportes) | Denegación sin filtrar datos | RF01–RF03, RF11, RNF05 | Prototipo para asociados, cuotas, pagos y portal (verificado en local, `s1b`: [matriz de aislamiento HTTP](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-aislamiento.test.ts) y [E2E](../../tecnologia/e2e/pruebas/flujo-pagos.spec.ts)); mediciones y reservorios por HTTP verificados en local con `s1c` ([matriz de aislamiento de mediciones](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-mediciones.test.ts) y [E2E](../../tecnologia/e2e/pruebas/flujo-mediciones.spec.ts)); `s2a` añade la defensa en la base con seguridad por filas (PT27) |
| PT14 | Integración | Pago parcial, doble envío con la misma `Idempotency-Key` y reversa | Saldos exactos; un solo pago; reversa auditada | RF04, RF05, RNF04 | Prototipo (verificado en local, `s1b`: [casos de padrón y pagos](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-padron.ts) sobre memoria y PostgreSQL y [concurrencia](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/acceso-concurrencia.test.ts) en 10 rondas) |
| PT15 | RAG | Pregunta sin fuentes suficientes | Abstención explícita | RF13, RNF09 | Prototipo con corpus de **EJEMPLO** (verificado en local, `s1d`: [`asistente-dominio.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/asistente-dominio.test.ts)); pendiente con el corpus aprobado |
| PT16 | RAG | Pregunta con fuentes aprobadas | Citas de documento, versión y página verificables | RF13, RF14, RNF09 | Prototipo con corpus de **EJEMPLO** (verificado en local, `s1d`: cada fragmento citado es subcadena literal de su página en 16 preguntas); pendiente con el corpus aprobado |
| PT17 | Seguridad RAG | Instrucciones maliciosas en un PDF y consulta dirigida a otra JASS | Sin escrituras, sin exfiltración, sin obediencia al documento | RF13, RNF05, RNF09 | Prototipo (verificado en local, `s1d`: instrucciones maliciosas en una página se citan como texto, sin escrituras; el asistente no accede a datos de ninguna JASS); pendiente la evaluación con el corpus aprobado |
| PT18 | Integración | Falla del proveedor de notificaciones | Reintento sin duplicar el evento de negocio | RF12 | Futuro |
| PT19 | Unitario | Datos incompletos o incoherentes (hora futura, posible duplicado, rango configurado) | Advertencia determinística sin modificar el valor | RF15, RNF03 | Pendiente |
| PT20 | Resiliencia | Servicio RAG o proveedor de LLM fuera de servicio | El asistente informa indisponibilidad; el registro sin conexión sigue funcionando | RF10, RF13, RNF01 | Pendiente |
| PT21 | Calidad documental | Enlaces relativos, identificadores, sintaxis Mermaid y coherencia de la matriz | Sin enlaces rotos ni identificadores huérfanos | Transversal | Enlaces relativos e identificadores (HU, RF, RNF, ADR, PT, DT y criterios C01–C16): automatizados con `scripts/verificar-docs.mjs` en el job `documentacion` del [CI](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941) (PR #3, fusionado a `main`). Sintaxis Mermaid y coherencia semántica de la matriz: siguen siendo manuales (última ejecución 2026-10-28) |
| PT22 | Rendimiento | Guardado local de 50 mediciones en un teléfono de gama baja del piloto | Percentil 95 ≤ 2 s | RNF02 | Pendiente |
| PT23 | Usabilidad | Prueba de tareas con operadores reales | Tasa de éxito, tiempo y errores registrados | RNF06 | Pendiente |
| PT24 | Privacidad | Fotografía con metadatos de ubicación; consulta al asistente | Metadatos eliminados; URLs temporales; ninguna solicitud al LLM contiene datos personales | RF03, RF13, RNF10 | Prototipo parcial: la foto de una incidencia pierde EXIF (JPEG) y los fragmentos de texto (PNG) antes de guardarse y se lee con `no-store` (verificado en local, `s1f`); el asistente y las URLs temporales siguen pendientes |
| PT25 | Contrato | Pruebas de contrato OpenAPI y adición de un cliente o módulo nuevo | Contrato cumplido sin modificar el dominio | RNF07 | Prototipo para el contrato HTTP (verificado en local y en CI, `s1e`: [`contrato-openapi.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/contrato-openapi.test.ts) compara el [documento OpenAPI](../api/openapi.yaml) con los controladores y con los estados observados); la prueba de «añadir un cliente o módulo sin modificar el dominio» sigue pendiente |
| PT26 | Seguridad | Ingreso por DNI con tipo de acceso equivocado, clave generada tolerante a mayúsculas, bloqueo de cuenta y límite por origen, cambio obligatorio de clave, restablecimiento y JASS suspendida | Sin sesión con el tipo equivocado; el servidor solo permite cambiar la clave mientras esté pendiente; el restablecimiento quita el bloqueo y cierra sesiones; ninguna clave en bitácora ni errores | RF01, RNF05 | Prototipo (verificado en local, `s2a`: ver arriba) |
| PT27 | Seguridad | Consulta o escritura de la JASS A sobre filas de la JASS B directamente en la base, y transacción de negocio sin JASS | Sin filas visibles, inserción rechazada y plataforma sin acceso a datos de negocio | RF01–RF03, RNF05 | Prototipo (verificado en local, `s2a`: seguridad por filas con el rol `sijass_app`) |
| PT28 | Usabilidad técnica | Ingreso, cambio de clave y entrega de clave a 320–1440 px: desbordamiento, objetivos de 44 px, contraste y teclado | Sin desbordamiento, objetivos ≥ 44 px, contraste ≥ 4,5:1 y recorrido completo por teclado | RNF06, RNF08 | Prototipo (verificado en local, `s2a`; **no** sustituye PT23 con personas reales) |

## 3. Pruebas del asistente RAG

Se construirá un conjunto de evaluación revisado por personal competente que incluya: preguntas respondibles, preguntas sin respuesta en el corpus, varias versiones de un mismo documento, fuentes contradictorias, consultas dirigidas a documentos de otra JASS y textos maliciosos incrustados en PDF. Para cada respuesta se registran: pertinencia del contexto recuperado, sustento de cada afirmación, exactitud de las citas, abstención correcta y ausencia de filtraciones. Se versionan el prompt, la configuración, el modelo y el corpus para que la evaluación sea reproducible. Una respuesta bien redactada no se considera fiable sin esta evidencia.

## 4. Pruebas sin conexión

- Ejecutar con red inestable, navegador cerrado, reinicio del teléfono y operaciones concurrentes desde dos dispositivos.
- Comprobar que el estado local coincide con el confirmado por el servidor y que ningún error desaparece sin revisión.
- Provocar escenarios de cuota agotada y limpieza de datos del sitio; IndexedDB **no garantiza persistencia permanente**.
- En el MVP solo las mediciones y sus correcciones funcionan sin conexión; los pagos siguen siendo en línea.

## 5. Controles de ingeniería previstos

Ejecutar en CI: `npm ci`, compilación TypeScript, pruebas unitarias, lint, pruebas de contrato OpenAPI, integración con PostgreSQL, pruebas de aislamiento entre JASS, prueba de restauración de respaldo y revisión de dependencias. Ningún resultado se informa como exitoso sin la salida verificable del pipeline.

## 6. Criterio de piloto

Ninguna predicción de cloro por imagen forma parte del piloto. Un especialista valida el procedimiento de medición, la normativa aplicable y la redacción de las advertencias, sin delegar decisiones sanitarias en el asistente.
