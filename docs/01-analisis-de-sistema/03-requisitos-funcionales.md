# 03. Requisitos funcionales — SIJASS

**Estado:** diseño propuesto. Ningún requisito está implementado; el prototipo existente solo cubre parcialmente validaciones del modelo anterior (ver [deuda técnica](../00-alcance-y-roadmap.md#6-deuda-técnica-conocida)).

## 1. Catálogo

| ID | Requisito | HU | Alcance | Criterio de aceptación verificable |
|---|---|---|---|---|
| RF01 | Autenticar usuarios y autorizar cada operación por rol y JASS | HU09 | MVP | Token válido **y** permiso sobre el recurso; acceso a otra JASS responde `403` sin revelar datos |
| RF02 | Configurar JASS, localidades y reservorios | HU08 | MVP | Cada reservorio pertenece a una JASS; identificadores y relaciones consistentes |
| RF03 | Registrar y actualizar asociados con baja lógica | HU05 | MVP | Campos validados; bajas sin borrado físico; datos delimitados por JASS |
| RF04 | Generar cuotas por periodo y registrar pagos en línea con comprobante y reversa | HU06 | MVP | Transacción atómica; clave de idempotencia por pago; reversas compensatorias auditadas |
| RF05 | Calcular y consultar morosidad | HU07 | MVP | Saldo = cuotas exigibles − pagos no revertidos, por asociado y periodo |
| RF06 | Registrar la lectura manual de cloro residual con evidencia fotográfica opcional | HU01 | MVP | Valor, unidad, método, fecha/hora de toma y reservorio obligatorios; foto validada en tipo y tamaño |
| RF07 | Validar la integridad estructural de cada medición | HU01 | MVP | Rechaza valores no finitos o negativos, unidades o métodos fuera de catálogo y fechas inválidas; nunca etiqueta un valor como «estimado por IA» |
| RF08 | Corregir o anular una medición con trazabilidad | HU02 | MVP | Conserva valor anterior y nuevo, motivo, actor, fecha y número de revisión; conflicto si la revisión base no es la vigente |
| RF09 | Listar y consultar procedimientos técnicos aprobados | HU03 | MVP | Solo documentos aprobados y autorizados, con versión y fecha; sin prescripción automática de tratamiento |
| RF10 | Persistir mediciones sin conexión y sincronizarlas por lote | HU04 | MVP | `operationId` UUID, resultado individual por operación, idempotencia transaccional, sin pérdidas silenciosas |
| RF11 | Consultar historial, auditoría y reportes de mediciones | HU10 | MVP | Filtros por fecha y reservorio dentro de la JASS autorizada; exportación del reporte |
| RF12 | Emitir alertas configurables con registro de entrega | HU11 | Futuro | Reglas aprobadas y versionadas; reintentos sin duplicar el evento de negocio |
| RF13 | Responder consultas mediante el asistente documental RAG | HU12 | MVP | Recuperación filtrada por permisos, citas verificables (documento, versión, página), abstención sin evidencia, sin escrituras |
| RF14 | Administrar el corpus documental del asistente | HU12, HU03 | MVP | Registro de origen, versión, estado, ámbito (público o JASS), checksum, aprobador y trazabilidad de la indexación |
| RF15 | Advertir incoherencias mediante reglas determinísticas | HU13 | MVP | Señala el dato dudoso con la regla aplicada; no sustituye ni corrige el valor automáticamente |

**Distinción RF09/RF13:** RF09 es la consulta navegable del catálogo de documentos (sin modelo de lenguaje); RF13 es la respuesta generada a partir de fragmentos recuperados. RF14 sustenta ambos.

## 2. Reglas de negocio

**RF06–RF08 — Origen de la medición.** La concentración se determina fuera del sistema mediante el procedimiento de campo establecido; SIJASS la registra, valida su estructura y conserva su trazabilidad, pero **no mide ni certifica** la concentración. Nunca se deduce un valor en mg/L a partir de una fotografía. Toda corrección o anulación añade una revisión y un evento de auditoría; no se sobrescribe sin rastro.

**RF04 — Pagos.** Un pago tiene identificador, comprobante y clave de idempotencia. Los pagos parciales y las reversas respetan el estado de la cuota. Una cuota y un pago son entidades distintas: no se impone una unicidad que impida pagos fraccionados. En el MVP los pagos **solo** se registran en línea.

**RF10 — Sincronización.** La clave idempotente `(jassId, operationId)` se reserva **en la misma transacción** que la escritura de la medición. El mismo UUID con el mismo contenido (mismo hash) devuelve el resultado ya registrado (`duplicate`); con contenido distinto devuelve `conflict`. Cada operación de un lote se procesa en su propia transacción, de modo que un error no revierte las demás. El cliente no elimina un registro local hasta recibir confirmación del servidor.

**RF13–RF14 — Asistente.** Los documentos se filtran por estado y permisos **antes** de recuperar fragmentos. El texto de los documentos se trata como dato no confiable, nunca como instrucción. Sin evidencia suficiente, el asistente responde: «No encontré información verificable en los documentos autorizados». El asistente no tiene herramientas de escritura.

**RF15 — Validaciones determinísticas.** Se admiten reglas de completitud, formato, rango configurado y coherencia temporal. Sus resultados son advertencias de calidad del dato, no detecciones de riesgo sanitario ni aprendizaje automático.

## 3. Cambios respecto de la versión anterior

| Requisito anterior | Cambio |
|---|---|
| RF06 «Capturar imágenes DPD» | Redefinido: registro manual con foto como evidencia opcional |
| RF07 «Estimar cloro con modelo versionado y confianza» | Sustituido por validación de integridad estructural |
| RF08 «Confirmar/corregir baja confianza» | Generalizado a corrección auditada de cualquier medición |
| RF09 «Cálculo de dosificación parametrizado» | Sustituido por consulta de procedimientos aprobados; el cálculo automático queda fuera del alcance |
| RF13, RF14, RF15 | Nuevos: asistente RAG, corpus documental y validaciones determinísticas |
