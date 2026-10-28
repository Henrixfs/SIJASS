# Plan de pruebas y validación — SIJASS

**Estado:** plan de calidad para la arquitectura objetivo. Ninguna prueba del MVP ha sido ejecutada; el prototipo contiene cinco pruebas unitarias sobre el modelo anterior.

## 1. Situación verificada del prototipo (2026-10-28)

| Comprobación | Resultado |
|---|---|
| `npm install` y `npm test` en una copia limpia de `tecnologia/siJASS-clean-architecture/` (Node.js 22.22.0, npm 10.9.4) | **Falla la compilación**: `TS2307: Cannot find module 'node:test'` y `'node:assert'` por falta de `@types/node` (DT01) |
| La misma copia con `@types/node` añadido localmente, **sin versionar el cambio** | Las 5 pruebas pasan (5/5) |

Esta verificación solo demuestra que el dominio del prototipo se comporta como sus pruebas esperan; no valida PWA, API, base de datos, sincronización ni RAG.

### Correspondencia de las pruebas existentes

| Prueba en `dominio.test.ts` | Caso del plan | Observación |
|---|---|---|
| `medición válida` | PT03 (parcial) | Modelo heredado |
| `rechaza cloro negativo` | PT01 (parcial) | Vigente conceptualmente |
| `rechaza confianza incorrecta` | — | Valida el campo `confianza`, que se retirará del modelo |
| `caso de uso persiste medición` | PT03 (parcial) | Sin JASS ni autor |
| `operación idempotente` | PT04 (parcial) | En memoria, sin transacción ni hash |

## 2. Matriz de pruebas

| ID | Nivel | Caso | Resultado esperado | Requisitos | Estado |
|---|---|---|---|---|---|
| PT01 | Unitario | Valor de medición no finito o negativo | Rechazo con error de dominio | RF07, RNF03 | Prototipo (modelo heredado) |
| PT02 | Unitario | Fecha inválida, unidad o método fuera de catálogo | Rechazo con error de dominio | RF07, RNF03 | Pendiente |
| PT03 | Unitario | Registrar y recuperar una medición dentro de la JASS | Lectura correcta con autor y JASS | RF06 | Prototipo parcial (sin JASS) |
| PT04 | Integración | Reenviar el mismo `operationId` con el mismo contenido | `duplicate` y un único efecto | RF10, RNF04 | Prototipo parcial (no transaccional) |
| PT05 | E2E | 100 registros sin conexión, cierre, reinicio y reconexión | 0 pérdidas observadas; todos sincronizados | RF10, RNF01 | Pendiente |
| PT06 | Seguridad | Tesorero intenta corregir una medición | `403`, sin cambios, evento auditado | RF01, RNF05 | Pendiente |
| PT07 | Compatibilidad | PWA en la matriz de dispositivos y navegadores del piloto | Instalación, almacenamiento local y sincronización funcionales | RNF08 | Pendiente |
| PT08 | Documental | Documento en borrador, sustituido o privado de otra JASS | No se lista ni se recupera | RF09, RF14, RNF09 | Pendiente |
| PT09 | Dominio | Registro con fotografía adjunta | Se guarda el valor manual; ningún valor se estima a partir de la imagen | RF06 | Pendiente |
| PT10 | Integración | Corregir una medición; corregir sobre una revisión desactualizada | Conserva original, nuevo valor, motivo, actor y fecha; la segunda devuelve `conflict` | RF08, RF11 | Pendiente |
| PT11 | Integración | Falla entre la reserva del `operationId` y la escritura de la medición | Reversión completa; ni `accepted` falso ni pérdida silenciosa | RF10, RNF04 | Pendiente |
| PT12 | Integración | Mismo `operationId` con contenido distinto | `conflict` sin sobrescritura | RF10, RNF04 | Pendiente |
| PT13 | Seguridad | Usuario de la JASS A accede a datos de la JASS B (mediciones, asociados, reservorios, reportes) | Denegación sin filtrar datos | RF01–RF03, RF11, RNF05 | Pendiente |
| PT14 | Integración | Pago parcial, doble envío con la misma `Idempotency-Key` y reversa | Saldos exactos; un solo pago; reversa auditada | RF04, RF05, RNF04 | Pendiente |
| PT15 | RAG | Pregunta sin fuentes suficientes | Abstención explícita | RF13, RNF09 | Pendiente |
| PT16 | RAG | Pregunta con fuentes aprobadas | Citas de documento, versión y página verificables | RF13, RF14, RNF09 | Pendiente |
| PT17 | Seguridad RAG | Instrucciones maliciosas en un PDF y consulta dirigida a otra JASS | Sin escrituras, sin exfiltración, sin obediencia al documento | RF13, RNF05, RNF09 | Pendiente |
| PT18 | Integración | Falla del proveedor de notificaciones | Reintento sin duplicar el evento de negocio | RF12 | Futuro |
| PT19 | Unitario | Datos incompletos o incoherentes (hora futura, posible duplicado, rango configurado) | Advertencia determinística sin modificar el valor | RF15, RNF03 | Pendiente |
| PT20 | Resiliencia | Servicio RAG o proveedor de LLM fuera de servicio | El asistente informa indisponibilidad; el registro sin conexión sigue funcionando | RF10, RF13, RNF01 | Pendiente |
| PT21 | Calidad documental | Enlaces relativos, identificadores, sintaxis Mermaid y coherencia de la matriz | Sin enlaces rotos ni identificadores huérfanos | Transversal | Ejecutada manualmente el 2026-10-28; pendiente de automatizar en CI |
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
