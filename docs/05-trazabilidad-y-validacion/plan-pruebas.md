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
| PT13 | Seguridad | Usuario de la JASS A accede a datos de la JASS B (mediciones, asociados, reservorios, reportes) | Denegación sin filtrar datos | RF01–RF03, RF11, RNF05 | Prototipo para asociados, cuotas, pagos y portal (verificado en local, `s1b`: [matriz de aislamiento HTTP](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-aislamiento.test.ts) y [E2E](../../tecnologia/e2e/pruebas/flujo-pagos.spec.ts)); mediciones y reservorios por HTTP verificados en local con `s1c` ([matriz de aislamiento de mediciones](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-mediciones.test.ts) y [E2E](../../tecnologia/e2e/pruebas/flujo-mediciones.spec.ts)) |
| PT14 | Integración | Pago parcial, doble envío con la misma `Idempotency-Key` y reversa | Saldos exactos; un solo pago; reversa auditada | RF04, RF05, RNF04 | Prototipo (verificado en local, `s1b`: [casos de padrón y pagos](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-padron.ts) sobre memoria y PostgreSQL y [concurrencia](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/acceso-concurrencia.test.ts) en 10 rondas) |
| PT15 | RAG | Pregunta sin fuentes suficientes | Abstención explícita | RF13, RNF09 | Pendiente |
| PT16 | RAG | Pregunta con fuentes aprobadas | Citas de documento, versión y página verificables | RF13, RF14, RNF09 | Pendiente |
| PT17 | Seguridad RAG | Instrucciones maliciosas en un PDF y consulta dirigida a otra JASS | Sin escrituras, sin exfiltración, sin obediencia al documento | RF13, RNF05, RNF09 | Pendiente |
| PT18 | Integración | Falla del proveedor de notificaciones | Reintento sin duplicar el evento de negocio | RF12 | Futuro |
| PT19 | Unitario | Datos incompletos o incoherentes (hora futura, posible duplicado, rango configurado) | Advertencia determinística sin modificar el valor | RF15, RNF03 | Pendiente |
| PT20 | Resiliencia | Servicio RAG o proveedor de LLM fuera de servicio | El asistente informa indisponibilidad; el registro sin conexión sigue funcionando | RF10, RF13, RNF01 | Pendiente |
| PT21 | Calidad documental | Enlaces relativos, identificadores, sintaxis Mermaid y coherencia de la matriz | Sin enlaces rotos ni identificadores huérfanos | Transversal | Enlaces relativos e identificadores (HU, RF, RNF, ADR, PT, DT y criterios C01–C16): automatizados con `scripts/verificar-docs.mjs` en el job `documentacion` del [CI](https://github.com/Henrixfs/SIJASS/actions/runs/41888011941) (PR #3, fusionado a `main`). Sintaxis Mermaid y coherencia semántica de la matriz: siguen siendo manuales (última ejecución 2026-10-28) |
| PT22 | Rendimiento | Guardado local de 50 mediciones en un teléfono de gama baja del piloto | Percentil 95 ≤ 2 s | RNF02 | Pendiente |
| PT23 | Usabilidad | Prueba de tareas con operadores reales | Tasa de éxito, tiempo y errores registrados | RNF06 | Pendiente |
| PT24 | Privacidad | Fotografía con metadatos de ubicación; consulta al asistente | Metadatos eliminados; URLs temporales; ninguna solicitud al LLM contiene datos personales | RF03, RF13, RNF10 | Pendiente |
| PT25 | Contrato | Pruebas de contrato OpenAPI y adición de un cliente o módulo nuevo | Contrato cumplido sin modificar el dominio | RNF07 | Pendiente |

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
