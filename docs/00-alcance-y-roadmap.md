# 00. Alcance, hoja de ruta y estado del proyecto — SIJASS

**Versión del documento:** 2026-10-28 · **Estado global:** diseño propuesto con un prototipo de dominio; ningún componente del MVP está desplegado.

Este documento fija el alcance del primer producto mínimo viable (MVP), la convención de estados utilizada en toda la documentación y la hoja de ruta por etapas. Cualquier otro documento que contradiga este alcance debe corregirse.

## 1. Convención de estados

Toda la documentación clasifica cada artefacto o capacidad con uno de los siguientes estados:

| Estado | Significado | Evidencia mínima exigida |
|---|---|---|
| **Implementado** | Código integrado en el repositorio, ejecutable y cubierto por pruebas reproducibles | Build y pruebas exitosos en CI sobre el commit correspondiente |
| **Prototipo** | Código demostrativo parcial, sin garantías de producción | Código y pruebas en el repositorio, aunque incompletos |
| **Diseño propuesto** | Definido en la documentación; no existe código | Requisito, ADR o diagrama aprobado por el equipo |
| **Pendiente de validación** | Decisión o meta que requiere evidencia externa (pruebas de campo, usuarios, especialista, norma vigente) | Acta, informe de prueba o confirmación institucional |
| **Futuro** | Fuera del MVP; solo se planifica | Ninguna; requiere nueva decisión de alcance |

**Situación al 2026-10-28:** solo existe un **prototipo** TypeScript de dominio en [`tecnologia/siJASS-clean-architecture/`](../tecnologia/siJASS-clean-architecture/README.md). La PWA, la API NestJS, PostgreSQL, la sincronización y el asistente RAG son **diseño propuesto**.

## 2. Problema

Las Juntas Administradoras de Servicios de Saneamiento (JASS) de Ayacucho registran en cuadernos físicos las lecturas de cloro residual y el control de cuotas familiares. Esto dificulta la trazabilidad (quién midió, cuándo, con qué método y si hubo correcciones), la consulta histórica y la rendición de cuentas ante la comunidad y las autoridades. Los reservorios suelen ubicarse en zonas con conectividad intermitente o nula.

## 3. Objetivo del MVP

Permitir que el personal autorizado de cada JASS:

1. registre de forma **manual y trazable** las mediciones de cloro residual obtenidas con un procedimiento de campo establecido, incluso sin conexión;
2. administre asociados, cuotas, pagos y morosidad **en línea**;
3. consulte historiales y reportes con aislamiento entre organizaciones; y
4. formule preguntas sobre documentos técnicos aprobados mediante un **asistente documental RAG** que cite sus fuentes o se abstenga.

## 4. Alcance funcional

### 4.1 Dentro del MVP

| # | Capacidad | Requisitos | Modo de operación |
|---|---|---|---|
| 1 | Gestión de JASS, reservorios, usuarios y roles (RBAC por JASS) | RF01, RF02 | En línea |
| 2 | Padrón de asociados con baja lógica | RF03 | En línea |
| 3 | Cuotas por periodo, pagos con comprobante, reversas auditadas y morosidad | RF04, RF05 | **Solo en línea** |
| 4 | Registro manual de mediciones de cloro con evidencia fotográfica opcional | RF06, RF07 | En línea y **sin conexión** |
| 5 | Correcciones auditables que conservan el valor original | RF08 | En línea y sin conexión (con detección de conflictos) |
| 6 | Persistencia local de mediciones y sincronización idempotente | RF10 | Sin conexión → sincronización posterior |
| 7 | Historial, auditoría y reportes de mediciones | RF11 | En línea (historial propio pendiente visible localmente) |
| 8 | Consulta de procedimientos y documentos técnicos aprobados | RF09, RF14 | En línea |
| 9 | Asistente RAG documental con citas y abstención | RF13, RF14 | **Solo en línea** |
| 10 | Validaciones determinísticas de integridad y coherencia | RF15 | En línea y sin conexión |

### 4.2 Fuera del MVP

- Estimación de la concentración de cloro a partir de fotografías del reactivo DPD (no existe dataset validado; ver [estrategia de IA](06-estrategia-ia/estrategia-ia-sin-dataset.md)).
- Cálculo o recomendación automática de dosificación química, instrucciones de tratamiento o dictámenes de potabilidad.
- Detección de anomalías mediante aprendizaje automático y análisis predictivo de tendencias.
- Registro de pagos sin conexión y conciliación financiera offline.
- Alertas y notificaciones por mensajería (HU11/RF12, prioridad *Could*).
- Acceso directo de asociados o del Área Técnica Municipal (ATM).
- Aplicaciones móviles nativas o híbridas (React Native, Capacitor, Flutter u otra alternativa).
- Asistente RAG sin conexión.

## 5. Hoja de ruta por etapas

Las etapas se definen por **criterios de salida verificables**, no por fechas comprometidas.

| Etapa | Entregable | Criterio de salida | Estado |
|---|---|---|---|
| 0 — Saneamiento | Prototipo compilable, `package-lock.json`, CI con build y pruebas, documentación alineada | `npm ci`, build y pruebas pasan en CI; enlaces e identificadores documentales verificados | En curso (documentación actualizada; deuda de código abierta) |
| 1 — Dominio y persistencia | Modelo `Medicion` manual, `Pago`, `Membresia`, migraciones PostgreSQL, auditoría | Invariantes y transacciones probadas contra PostgreSQL | Diseño propuesto |
| 2 — Flujos esenciales en línea | API NestJS con OpenAPI, frontend React con autenticación, RBAC, padrón, pagos e historial | Pruebas de contrato, E2E y denegación entre JASS (PT06, PT13, PT14) | Diseño propuesto |
| 3 — Operación offline | PWA instalable, cola Dexie de mediciones, `POST /sync` idempotente | Cero duplicados en reintentos; cero pérdidas observadas en el protocolo PT05; conflictos visibles | Diseño propuesto |
| 4 — Asistente RAG | Servicio FastAPI, ingestión de corpus aprobado, recuperación con permisos, citas | Conjunto de evaluación con citas correctas, abstención y resistencia a *prompt injection* (PT15–PT17) | Diseño propuesto |
| 5 — Piloto | Despliegue controlado en una o dos JASS | Acta de usabilidad con operadores reales, matriz de dispositivos validada, plan de respaldo y soporte | Pendiente de validación |
| Futuro A — Analítica | Detección estadística de anomalías y tendencias | Historial validado suficiente; tasa de falsos positivos informada | Futuro |
| Futuro B — Movilidad | Cliente React Native, Capacitor, Flutter u otro sobre la misma API | Pruebas reales de cámara, almacenamiento local y sincronización | Futuro |
| Investigación — Visión DPD | Estimación fotográfica de cloro | Dataset representativo, instrumento de referencia y validación independiente | Futuro (condicionado) |

## 6. Deuda técnica conocida

Identificada durante la auditoría del 2026-10-28. Se documenta aquí porque este trabajo es exclusivamente documental; su corrección corresponde a un cambio de código posterior.

| ID | Deuda | Impacto | Acción propuesta |
|---|---|---|---|
| DT01 | `package.json` no declara `@types/node`; `npm test` falla en instalación limpia con `TS2307: Cannot find module 'node:test'` | El prototipo no compila tal como está versionado | Añadir `@types/node` como dependencia de desarrollo |
| DT02 | No existe `package-lock.json` | Builds no reproducibles; no se puede usar `npm ci` | Generar y versionar el lockfile |
| DT03 | `Medicion` conserva `confianza`, `confirmada` y `modeloId` del diseño anterior basado en IA fotográfica | El código no refleja el registro manual del MVP | Migrar al contrato de [diseño interno](03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md) |
| DT04 | `Medicion` no incluye `jassId`, método, unidad, autor ni hora de toma | No hay aislamiento por JASS ni trazabilidad | Incorporar los campos y sus invariantes |
| DT05 | `OperacionesMemoria` registra UUID en un `Set` independiente de `MedicionesMemoria` y sin hash de contenido | No demuestra idempotencia transaccional ni detección de conflictos | Implementar idempotencia junto con la escritura en PostgreSQL |
| DT06 | `MedicionesMemoria.guardar` lanza un `Error` genérico ante un identificador repetido, comportamiento que el puerto `RepositorioMediciones` no especifica | Una implementación PostgreSQL podría comportarse distinto (riesgo para LSP) | Especificar en el puerto un error de dominio para duplicados y probar ambas implementaciones con la misma batería |
| DT07 | No existe CI ni lint | Ninguna verificación automática | Añadir GitHub Actions con build, pruebas y lint |

## 7. Decisiones abiertas

- Si un usuario puede pertenecer a varias JASS y cómo cambia de contexto organizacional.
- Base legal, consentimiento y plazo de retención de fotografías y datos del padrón, conforme a la Ley N.° 29733 y su reglamento.
- Métodos y equipos de medición realmente usados por las JASS piloto (comparador visual DPD, colorímetro u otro) y su catálogo.
- Dispositivos Android y navegadores objetivo, a definir mediante pruebas de campo.
- Responsables de aprobar documentos del corpus RAG y parámetros normativos.
- Proveedor o modelo de lenguaje, considerando costo, privacidad, latencia y calidad en español.
- Uso de pgvector frente a búsqueda textual de PostgreSQL, según evaluación con el corpus real (ADR-015).

## 8. Criterio de comunicación

En presentaciones y documentos se distingue siempre entre **prototipo**, **diseño propuesto**, **MVP implementado** y **función validada en campo**. Ninguna respuesta del asistente se presenta como dictamen sanitario y ninguna función documentada se presenta como operativa sin evidencia de pruebas.
