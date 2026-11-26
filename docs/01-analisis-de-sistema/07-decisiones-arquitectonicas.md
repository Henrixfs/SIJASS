# 07. Registro de decisiones arquitectónicas (ADR) — SIJASS

**Formato:** cada ADR registra contexto, decisión, alternativas, consecuencias y estado, siguiendo la propuesta de Nygard (2011).

**Estados de una ADR:**
- **Aceptada (diseño):** adoptada como base del diseño del MVP; aún no implementada ni validada en producción.
- **Propuesta:** preferida, pero sujeta a una evaluación explícita antes de aceptarse.
- **Sustituida:** reemplazada por otra ADR; se conserva por trazabilidad.

## 1. Resumen

| ADR | Decisión | Drivers | Estado |
|---|---|---|---|
| ADR-001 | Backend NestJS como monolito modular | DA05, DA07 | Aceptada (diseño) |
| ADR-002 | Frontend React + TypeScript + Vite como PWA (`vite-plugin-pwa`/Workbox) con Dexie/IndexedDB | DA01, DA03, DA08 | Aceptada (diseño) |
| ADR-003 | Registro manual trazable de la lectura de cloro en lugar de estimación fotográfica | DA02, DA03, DA04 | Aceptada (diseño); sustituye la decisión anterior de inferencia ONNX |
| ADR-004 | PostgreSQL como fuente central de verdad | DA04, DA09 | Aceptada (diseño) |
| ADR-005 | `operationId` UUID, hash de contenido e idempotencia transaccional | DA01, DA09 | Aceptada (diseño) |
| ADR-006 | Clean Architecture pragmática dentro de cada módulo | DA04, DA07 | Aceptada (diseño) |
| ADR-007 | Servicio de IA separado en Python + FastAPI para el RAG | DA10, DA11 | Aceptada (diseño) |
| ADR-008 | Autenticación con JWT, RBAC y autorización por JASS en el servidor | DA06 | Aceptada (diseño) |
| ADR-009 | Redis y colas dedicadas no obligatorios en el MVP | DA05 | Aceptada (diseño) |
| ADR-010 | Documentos y parámetros normativos versionados y aprobados | DA04, DA10 | Aceptada (diseño) |
| ADR-011 | API REST/JSON sobre HTTPS documentada con OpenAPI para múltiples clientes | DA07 | Aceptada (diseño) |
| ADR-012 | RAG solo en línea con modelo preentrenado configurable, sin entrenamiento propio | DA10, DA11 | Aceptada (diseño) |
| ADR-013 | Pagos solo en línea en el MVP | DA05, DA09 | Aceptada (diseño) |
| ADR-014 | Validaciones determinísticas primero; aprendizaje automático solo con datos validados | DA12 | Aceptada (diseño) |
| ADR-015 | PostgreSQL + pgvector para la recuperación documental | DA05, DA10 | Propuesta (sujeta a evaluación) |
| ADR-016 | Caché HTTP para estáticos y datos de referencia; sin caché de datos de personas ni de servidor en el MVP | DA05 | Aceptada (implementada en el prototipo) |
| ADR-017 | Aislamiento entre JASS reforzado en la base con seguridad por filas | DA04, DA05 | Aceptada (implementada en el prototipo) |

## 2. Detalle

### ADR-001 — Monolito modular con NestJS

- **Contexto:** equipo de una persona, presupuesto limitado y dominio acotado (identidad, JASS, padrón y pagos, mediciones, sincronización, documentos).
- **Decisión:** un único backend Node.js + NestJS desplegado como una unidad, organizado en módulos por capacidad de negocio con interfaces explícitas entre ellos.
- **Alternativas:** microservicios por módulo (descartado: coste operativo, consistencia distribuida y despliegue complejos sin necesidad de escalar de forma independiente); backend sin modularidad (descartado: acoplamiento y dificultad de evolución).
- **Consecuencias:** transacciones locales simples y operación sencilla. Exige disciplina: un módulo no accede a las tablas de otro y se comunica mediante servicios de aplicación. Permite extraer un módulo en el futuro si una métrica lo justifica.

### ADR-002 — PWA con React, TypeScript, Vite y Dexie

- **Contexto:** los operadores trabajan sin conexión en reservorios y usan teléfonos Android de bajos recursos; la instalación desde tiendas no es viable al inicio.
- **Decisión:** cliente web React + TypeScript + Vite, convertido en PWA mediante `vite-plugin-pwa` (Workbox) para precargar recursos estáticos, y Dexie como capa sobre IndexedDB para la cola de mediciones y catálogos mínimos.
- **Alternativas:** web solo en línea (descartada: no cumple DA01); aplicación nativa desde el inicio (descartada: mayor coste y distribución por tienda); `localStorage` (descartado: síncrono, de capacidad reducida y solo texto).
- **Consecuencias:** un solo código para teléfono y computadora. IndexedDB no garantiza persistencia permanente (RC13), por lo que la UI debe mostrar pendientes y solicitar almacenamiento persistente. La compatibilidad debe probarse en los dispositivos del piloto.

### ADR-003 — Registro manual en lugar de estimación fotográfica DPD

- **Contexto:** la versión anterior proponía estimar la concentración de cloro con un modelo de visión (MobileNetV3/ONNX) a partir de fotografías del reactivo DPD. No existe un dataset etiquetado, un instrumento de referencia ni una validación que respalde esa estimación.
- **Decisión:** el operador obtiene la lectura con el procedimiento de campo establecido y la registra manualmente; la fotografía es evidencia opcional. ONNX Runtime Web y la visión artificial pasan a línea de investigación futura.
- **Alternativas:** mantener la estimación con un modelo preentrenado genérico (descartada: sin evidencia de exactitud, riesgo sanitario); estimación con advertencia de «baja confianza» (descartada: la confianza de un modelo no calibrado no es una medida de exactitud).
- **Consecuencias:** el MVP es realista y auditable. El valor del sistema reside en la trazabilidad y no en la medición. La decisión anterior queda **sustituida**.

### ADR-004 — PostgreSQL como fuente central de verdad

- **Contexto:** se requieren transacciones, integridad referencial y restricciones de unicidad para idempotencia, pagos y auditoría.
- **Decisión:** PostgreSQL como base de datos central; los datos locales del navegador son copias temporales.
- **Alternativas:** base documental (descartada: menor soporte para invariantes relacionales y transacciones entre entidades); archivos compartidos (descartados).
- **Consecuencias:** migraciones versionadas y respaldos obligatorios. Permite incorporar pgvector en la misma instancia (ADR-015).

### ADR-005 — Idempotencia transaccional por operación

- **Contexto:** con red intermitente el cliente reintenta envíos; un mismo comando puede llegar varias veces o con contenido alterado.
- **Decisión:** cada comando offline lleva un `operationId` UUID generado en el cliente y un hash de su contenido. El servidor reserva `(jassId, operationId)` con restricción de unicidad **en la misma transacción** que la escritura de negocio y devuelve `accepted`, `duplicate`, `rejected` o `conflict` por operación.
- **Alternativas:** reintentar `POST` sin deduplicación (descartada: duplicados); deduplicar fuera de la transacción (descartada: ventanas de inconsistencia); resolución «última escritura gana» (descartada: pérdida silenciosa de correcciones).
- **Consecuencias:** reintentos seguros y conflictos explícitos que requieren una interfaz de resolución manual. Los registros de idempotencia se conservan como parte de la auditoría.

### ADR-006 — Clean Architecture pragmática

- **Contexto:** se espera cambiar persistencia, proveedores de IA y clientes sin reescribir reglas de negocio.
- **Decisión:** cada módulo separa presentación, aplicación, dominio e infraestructura; el dominio no depende de NestJS, SQL, React ni del LLM; las dependencias externas se acceden mediante puertos.
- **Alternativas:** lógica en controladores o componentes React (descartada); arquitectura hexagonal estricta con mapeos exhaustivos en todos los módulos (descartada para módulos CRUD simples por su coste).
- **Consecuencias:** dominio comprobable con pruebas sin red ni base de datos; más archivos e interfaces. Los módulos de configuración sencilla pueden simplificar capas de forma documentada.

### ADR-007 — Servicio de IA en Python + FastAPI

- **Contexto:** el RAG requiere extracción de texto de PDF, fragmentación, embeddings y orquestación con el modelo de lenguaje, áreas en las que el ecosistema Python es más maduro.
- **Decisión:** un único servicio auxiliar Python + FastAPI, accesible solo desde la API NestJS por red interna, responsable de ingestión y consulta. No almacena datos transaccionales y no expone endpoints públicos.
- **Alternativas:** implementar el RAG dentro de NestJS con bibliotecas JavaScript (viable; se reconsiderará si el coste operativo del segundo servicio no se justifica); dividir el servicio en varios microservicios (descartado).
- **Consecuencias:** ciclo de vida independiente del componente de IA y un segundo contenedor a operar. Es la **única** excepción al despliegue monolítico y no constituye una arquitectura de microservicios.

### ADR-008 — Autenticación, RBAC y autorización por JASS

- **Contexto:** varias organizaciones comparten la instalación (RC10) y se manejan datos personales (RC05).
- **Decisión:** sesión con token de acceso JWT de corta duración y renovación controlada; contraseñas con función de derivación robusta (por ejemplo, Argon2id o bcrypt); autorización en el servidor que combina rol y membresía activa de JASS en cada caso de uso; auditoría de accesos denegados relevantes.
- **Alternativas:** autorización solo en el frontend (descartada); credenciales compartidas por JASS (descartada: no permite auditoría individual).
- **Consecuencias:** cada consulta y repositorio incluye el filtro de JASS. La captura offline se autoriza provisionalmente con la sesión almacenada y el servidor vuelve a autorizar al sincronizar.

### ADR-009 — Sin Redis ni colas dedicadas en el MVP

- **Contexto:** la versión anterior incluía Redis; no existen métricas que lo justifiquen.
- **Decisión:** no incluir Redis, *brokers* ni colas dedicadas en el MVP; PostgreSQL cubre persistencia, idempotencia y, si se necesita, una tabla *outbox*.
- **Alternativas:** caché distribuida desde el inicio (descartada: infraestructura sin necesidad comprobada).
- **Consecuencias:** menos componentes. Se reevaluará con mediciones de carga.

### ADR-010 — Documentos y parámetros versionados y aprobados

- **Contexto:** las normas cambian (RC11) y el asistente solo debe responder con fuentes vigentes.
- **Decisión:** cada documento del corpus y cada parámetro de validación tiene versión, estado (borrador, aprobado, sustituido), responsable de aprobación y fecha; las versiones sustituidas no se borran.
- **Alternativas:** límites rígidos en el código (descartada); corpus sin control de versiones (descartada).
- **Consecuencias:** se requiere un flujo de aprobación humana y un responsable por JASS o por plataforma.

### ADR-011 — API REST/JSON con OpenAPI para múltiples clientes

- **Contexto:** se prevén clientes móviles futuros cuya tecnología no está decidida (RC14).
- **Decisión:** API REST/JSON sobre HTTPS, versionada y documentada con OpenAPI; todas las reglas de negocio residen en el servidor.
- **Alternativas:** GraphQL (descartada: mayor complejidad para el equipo y para cachear sin conexión); backend acoplado a un framework de interfaz (descartada).
- **Consecuencias:** cualquier cliente (React web, React Native, Capacitor, Flutter u otro) consume el mismo contrato. Compartir contratos no equivale a compartir código de interfaz: Flutter requeriría reescribir la UI y el almacenamiento local en Dart.

### ADR-012 — RAG en línea con modelo preentrenado configurable

- **Contexto:** no hay datos ni recursos para entrenar un modelo propio; un LLM local en teléfonos de gama baja no es viable.
- **Decisión:** el asistente RAG funciona solo con conexión; el modelo de lenguaje es preentrenado y se accede mediante un puerto `ProveedorLLM` configurable (API de un proveedor o modelo de pesos abiertos autoalojado). No se realiza entrenamiento ni ajuste fino propio.
- **Alternativas:** LLM local en el dispositivo (descartada en el MVP); entrenamiento propio (descartada: sin datos); asistente sin recuperación documental (descartada: respuestas no verificables).
- **Consecuencias:** el registro de mediciones nunca depende del asistente. La elección del proveedor considera privacidad, costo, latencia y calidad en español.

### ADR-013 — Pagos solo en línea en el MVP

- **Contexto:** las operaciones de dinero exigen atomicidad, conciliación y reglas de reversa.
- **Decisión:** registrar pagos únicamente con conexión, con clave de idempotencia por pago.
- **Alternativas:** pagos offline con conciliación posterior (descartada en el MVP: riesgo de cobros dobles y conflictos entre tesoreros).
- **Consecuencias:** el tesorero necesita conexión para registrar pagos. Una ampliación futura requerirá nueva ADR con invariantes financieras.

### ADR-014 — Validaciones determinísticas antes que aprendizaje automático

- **Contexto:** no existe historial suficiente para entrenar ni evaluar detectores de anomalías.
- **Decisión:** el MVP usa reglas determinísticas versionadas (completitud, formato, rango configurado, coherencia temporal, duplicados); no se presentan como aprendizaje automático.
- **Alternativas:** detección de anomalías con ML desde el inicio (descartada: sin datos).
- **Consecuencias:** comportamiento explicable y comprobable. La detección estadística se evaluará cuando exista historial validado.

### ADR-015 — PostgreSQL + pgvector para la recuperación documental

- **Contexto:** el corpus inicial será pequeño (guías, manuales y normas); se busca evitar otra base de datos.
- **Decisión propuesta:** almacenar fragmentos, metadatos y embeddings en un esquema dedicado de PostgreSQL con la extensión pgvector, combinando el filtro de permisos y la búsqueda en una sola consulta.
- **Alternativas:** base de datos vectorial dedicada (descartada por coste operativo); búsqueda de texto completo de PostgreSQL sin embeddings (alternativa a evaluar; puede ser suficiente para un corpus pequeño); búsqueda híbrida.
- **Criterio de aceptación:** comparar recuperación textual, vectorial e híbrida con un conjunto de preguntas revisado y adoptar la opción con mejor relación entre calidad y complejidad.
- **Consecuencias:** misma infraestructura de respaldo. El servicio RAG usa un rol de base de datos limitado a su esquema.

### ADR-016 — Caché HTTP para estáticos y datos de referencia; sin caché de datos de personas ni de servidor

- **Contexto:** el criterio C11 pide una caché medida y ADR-009 excluye Redis mientras no haya una necesidad comprobada. Las mediciones locales del Sprint 2 ([análisis](../07-evaluacion-final/analisis-bd-y-cache.md)) muestran lecturas del portal de ~14 ms de mediana a carga ligera y consultas con índice de menos de 1 ms; el límite es la CPU de un proceso.
- **Decisión:** (1) caché HTTP de los archivos estáticos con hash (`immutable`) y `ETag`; (2) caché `private` de 5 minutos con `ETag` solo para datos de referencia iguales para todos (`GET /v1/mediciones/catalogo`); (3) `no-store` en toda respuesta con datos de personas; (4) sin caché de servidor (Redis ni memoria del proceso).
- **Alternativas:** caché de la lectura de membresía (descartada: una desactivación o un restablecimiento de clave deben surtir efecto al instante); caché de saldos con tiempo de vida (descartada: mostraría un saldo equivocado tras un pago); Redis (descartada por ADR-009: infraestructura sin necesidad medida).
- **Criterio de reevaluación:** p95 de lectura mayor de 800 ms con la carga real del piloto. Primer candidato: caché de lectura por JASS con invalidación al confirmar cada transacción de esa JASS (válida con una sola réplica).
- **Consecuencias:** los datos personales no quedan en el disco del dispositivo; la interfaz carga rápido gracias a los estáticos inmutables; el servidor no mantiene estado de caché que invalidar.

### ADR-017 — Aislamiento entre JASS reforzado en la base con seguridad por filas

- **Contexto:** la autorización por JASS en la aplicación (ADR-008) depende de que cada consulta filtre por `jass_id`; un olvido filtraría datos de otra organización. SIJASS pasa a ser una plataforma con varias JASS (`s2a-acceso-dni-multi-jass`).
- **Decisión:** PostgreSQL con seguridad por filas (RLS) en las tablas de negocio. La API ejecuta cada transacción con `SET LOCAL ROLE sijass_app` (rol sin inicio de sesión ni `BYPASSRLS`) y fija la JASS (`app.jass_id`); las operaciones de sistema (inicio de sesión, plataforma) fijan `app.sistema` y solo alcanzan las tablas que lo permiten. Una transacción de negocio sin JASS no ve filas.
- **Alternativas:** solo filtros en la aplicación (descartada: un solo olvido filtra datos); una base o un esquema por JASS (descartada en el MVP: costo operativo y migraciones por inquilino).
- **Consecuencias:** defensa en profundidad comprobada con consultas directas en la base ([prueba](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/aislamiento-filas.test.ts)); costo de rendimiento no apreciable ([medición](../07-evaluacion-final/analisis-bd-y-cache.md)); el propietario de la base y las migraciones no se ven afectados.

## 3. Mantenimiento del registro

Antes de aceptar formalmente una ADR se anotan fecha, responsable, alternativas evaluadas, coste, riesgos y evidencia. Un cambio de ADR obliga a actualizar requisitos, modelo C4, [matriz de trazabilidad](../05-trazabilidad-y-validacion/matriz-trazabilidad.md) y [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md).

## 4. Referencias

- Nygard, M. (2011). *Documenting architecture decisions*. https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Lewis, P. et al. (2020). *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*. NeurIPS 2020. https://arxiv.org/abs/2005.11401
