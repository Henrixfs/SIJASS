# 02. Historias de usuario — SIJASS

**Estado:** diseño propuesto; las historias deben validarse con operadores, tesoreros y consejos directivos de las JASS piloto.

**Prioridad MoSCoW:** *Must* = obligatoria para el MVP · *Should* = recomendable en la primera entrega · *Could* = posterior al MVP.

## 1. Catálogo

| ID | Historia de usuario | Prioridad | RF |
|---|---|---|---|
| HU01 | Como **operador** quiero registrar la lectura de cloro residual obtenida con el procedimiento de campo establecido y adjuntar evidencia opcional, para conservar un registro trazable. | Must | RF06, RF07 |
| HU02 | Como **operador autorizado** quiero corregir una medición conservando el valor original, para subsanar errores sin perder trazabilidad. | Must | RF08 |
| HU03 | Como **operador** quiero consultar los procedimientos técnicos aprobados, para orientar mi trabajo de campo. | Should | RF09, RF14 |
| HU04 | Como **operador** quiero registrar mediciones sin conexión y sincronizarlas después, para trabajar en reservorios sin cobertura. | Must | RF10 |
| HU05 | Como **tesorero** quiero mantener el padrón de asociados, para conocer a quién corresponde cada obligación. | Must | RF03 |
| HU06 | Como **tesorero** quiero generar cuotas y registrar pagos en línea, para reemplazar el cuaderno de cobranzas. | Must | RF04 |
| HU07 | Como **tesorero** quiero consultar periodos y saldos pendientes, para gestionar la morosidad. | Must | RF05 |
| HU08 | Como **consejo directivo** quiero configurar mi JASS y sus reservorios, para que las mediciones se asocien al punto correcto. | Must | RF02 |
| HU09 | Como **consejo directivo** quiero asignar usuarios y roles, para que cada persona acceda solo a lo que le corresponde. | Must | RF01 |
| HU10 | Como **consejo directivo** quiero consultar el historial y los reportes de mediciones, para supervisar la cloración y rendir cuentas. | Must | RF11 |
| HU11 | Como **consejo directivo** quiero recibir alertas operativas configurables, para reaccionar a tiempo ante registros fuera de parámetros. | Could | RF12 |
| HU12 | Como **usuario de la JASS** quiero preguntar al asistente sobre documentos técnicos autorizados, para obtener respuestas con sus fuentes. | Must | RF13, RF14 |
| HU13 | Como **operador** quiero ver advertencias sobre datos incompletos o incoherentes antes de guardar, para revisarlos a tiempo. | Should | RF15 |

## 2. Criterios de aceptación

**HU01 — Registro manual de medición**
- El formulario exige valor, unidad (`mg/L`), método de medición del catálogo, fecha y hora de la toma, y reservorio; el autor y la JASS se toman de la sesión.
- La fotografía es opcional, se valida por tipo y tamaño y se almacena con acceso restringido a la JASS.
- El sistema **nunca** calcula ni sugiere un valor de concentración a partir de la imagen.

**HU02 — Corrección auditada**
- Una corrección registra valor anterior, valor nuevo, motivo obligatorio, actor y fecha; el valor original permanece consultable.
- Una corrección hecha sobre una revisión desactualizada se rechaza como conflicto y no sobrescribe cambios ajenos.

**HU03 — Procedimientos aprobados**
- Solo se listan documentos en estado *aprobado* y accesibles para la JASS del usuario, con versión y fecha.
- El sistema no genera instrucciones automáticas de dosificación.

**HU04 — Medición sin conexión**
- La medición se guarda localmente con un `operationId` (UUID) y estado visible: *pendiente*, *enviando*, *sincronizada*, *rechazada* o *conflicto*.
- Reintentar el mismo envío no crea registros duplicados; los errores se muestran por operación y no se descartan en silencio.
- La aplicación advierte que el almacenamiento del navegador no es permanente y muestra la cantidad de registros pendientes.

**HU05 — Padrón de asociados**
- Altas y actualizaciones con campos validados; las bajas son lógicas y conservan el historial de obligaciones.
- Un tesorero solo ve asociados de su JASS.

**HU06 — Cuotas y pagos en línea**
- Cada pago genera comprobante, admite pagos parciales según la política de la JASS y se registra con clave de idempotencia para impedir cobros dobles por reintento.
- Una reversa crea un movimiento compensatorio auditado; ningún pago se elimina.

**HU07 — Morosidad**
- Los saldos se calculan a partir de cuotas exigibles, pagos válidos y reversas; se filtran por periodo y asociado.

**HU08 — JASS y reservorios**
- Cada reservorio pertenece a una única JASS; solo el consejo de esa JASS lo crea o modifica.

**HU09 — Usuarios y roles**
- La autorización se aplica en el backend combinando rol y membresía de JASS; una acción fuera del rol responde `403` y queda auditada.

**HU10 — Historial y reportes**
- Filtros por rango de fechas y reservorio; cada medición muestra autor, método, origen (en línea o sincronizada) y sus correcciones.
- Los reportes se pueden exportar para compartirlos con la ATM fuera del sistema.

**HU11 — Alertas (posterior al MVP)**
- Los umbrales provienen de parámetros aprobados por personal competente y versionados; cada envío queda registrado y es reintentable.

**HU12 — Asistente documental RAG**
- La respuesta incluye documento, versión y página de cada afirmación o una abstención explícita cuando no hay evidencia suficiente.
- Solo se recuperan documentos aprobados y autorizados para la JASS del usuario.
- El asistente requiere conexión; sin red se informa su indisponibilidad sin afectar el registro de mediciones.
- El asistente no ejecuta operaciones de escritura ni obedece instrucciones contenidas en los documentos.

**HU13 — Advertencias de integridad**
- Las advertencias provienen de reglas determinísticas versionadas (completitud, unidades, fechas futuras, valores fuera de rango configurado, registros repetidos).
- La advertencia no modifica el valor ni constituye un dictamen sanitario; el operador puede guardar indicando una justificación cuando la regla lo permita.

## 3. Condiciones transversales

- Todo comando persistido incluye `operationId` (UUID), autor, marca temporal y JASS **determinada por el backend**.
- En el MVP la captura sin conexión se limita a **mediciones y sus correcciones**; los pagos se registran solo en línea.
- La IA futura (anomalías, tendencias, visión DPD) está condicionada a datos suficientes y validación independiente; ver [estrategia de IA](../06-estrategia-ia/estrategia-ia-sin-dataset.md).

## 4. Cambios respecto de la versión anterior

| Historia anterior | Cambio |
|---|---|
| HU01 «fotografiar el reactivo DPD y estimar el cloro» | Sustituida por el registro **manual** con evidencia opcional |
| HU02 «corregir lecturas dudosas» de la IA | Generalizada a corrección auditada de cualquier medición |
| HU03 «consultar cálculo de dosificación» | Sustituida por consulta de procedimientos aprobados; el cálculo automático queda fuera del alcance |
| HU12 y HU13 | Nuevas: asistente RAG y validaciones determinísticas |
