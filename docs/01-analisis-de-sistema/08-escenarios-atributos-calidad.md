# 08. Escenarios de atributos de calidad — SIJASS

Cada escenario se expresa con **fuente, estímulo, entorno, artefacto, respuesta y medida** (Bass, Clements y Kazman, 2021). Las medidas son metas **pendientes de validación** y se verifican con las pruebas indicadas en el [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md).

## Resumen

| Escenario | Atributo | Pruebas |
|---|---|---|
| EC-01 Captura sin conexión | RNF01, RNF08 | PT05, PT07 |
| EC-02 Idempotencia y recuperación | RNF04 | PT04, PT11, PT12 |
| EC-03 Aislamiento entre JASS | RNF05 | PT06, PT13 |
| EC-04 Corrección auditada | RNF03 | PT01, PT02, PT10 |
| EC-05 Nuevo módulo de negocio | RNF07 | PT25 |
| EC-06 Asistente no disponible | RNF01 | PT20 |
| EC-07 Nuevo cliente móvil | RNF07 | PT25 |
| EC-08 Pregunta sin evidencia o maliciosa | RNF09 | PT15, PT17 |
| EC-09 Guardado local en gama baja | RNF02 | PT22 |
| EC-10 Operador nuevo | RNF06 | PT23 |
| EC-11 Protección de datos personales | RNF10 | PT24 |
| EC-12 Nueva versión de un documento | RNF09 | PT08, PT16 |

## EC-01 — Captura sin conexión (RNF01, RNF08)

- **Fuente:** operador técnico.
- **Estímulo:** pierde la conectividad mientras registra una medición.
- **Entorno:** PWA instalada, catálogos de reservorios precargados, sesión iniciada previamente con conexión.
- **Artefacto:** formulario de medición, Dexie/IndexedDB y cola local.
- **Respuesta:** guarda la medición con `operationId` y estado *pendiente*; muestra el número de registros no enviados; el registro persiste tras cerrar y reabrir el navegador.
- **Medida:** 0 pérdidas observadas en 100 registros con cierre y reinicio, en cada dispositivo de la matriz de prueba; se informa la cuota de almacenamiento disponible.

## EC-02 — Idempotencia y recuperación (RNF04)

- **Fuente:** red inestable.
- **Estímulo:** el mismo lote se envía tres veces; en uno de los envíos la conexión se corta después de que el servidor confirmó la transacción.
- **Entorno:** API NestJS y PostgreSQL disponibles.
- **Artefacto:** `POST /sync`, tabla de operaciones idempotentes y escritura de la medición.
- **Respuesta:** exactamente un efecto de negocio por operación; los reenvíos devuelven `duplicate` con el resultado original; el mismo UUID con contenido distinto devuelve `conflict`.
- **Medida:** 0 registros duplicados y 0 operaciones `accepted` sin dato persistido.

## EC-03 — Aislamiento entre JASS (RNF05)

- **Fuente:** tesorero autenticado en la JASS A.
- **Estímulo:** solicita una medición, un asociado o un documento privado de la JASS B, o intenta modificar una medición.
- **Entorno:** API y servicio RAG operativos.
- **Artefacto:** políticas de autorización por recurso y filtro del corpus.
- **Respuesta:** `403` o `404` sin revelar datos ni títulos; el intento queda auditado.
- **Medida:** 100 % de los casos negativos de la matriz de autorización rechazados.

## EC-04 — Corrección auditada (RNF03)

- **Fuente:** operador autorizado.
- **Estímulo:** corrige una lectura ya registrada.
- **Entorno:** medición persistida en PostgreSQL.
- **Artefacto:** agregado `Medicion` y bitácora de auditoría.
- **Respuesta:** conserva valor anterior y nuevo, motivo, actor, fecha y número de revisión; rechaza datos inválidos.
- **Medida:** 100 % de las correcciones del conjunto de prueba con revisión completa y secuencia íntegra.

## EC-05 — Nuevo módulo de negocio (RNF07)

- **Fuente:** equipo de desarrollo.
- **Estímulo:** añadir un módulo, por ejemplo, reporte de fugas.
- **Entorno:** código versionado con pruebas.
- **Artefacto:** módulos del monolito.
- **Respuesta:** se agregan casos de uso y adaptadores sin modificar entidades de otros módulos.
- **Medida:** las pruebas existentes siguen pasando sin cambios.

## EC-06 — Asistente no disponible (RNF01)

- **Fuente:** falla de red o del proveedor de modelo de lenguaje.
- **Estímulo:** el usuario abre el asistente.
- **Entorno:** operador en campo.
- **Artefacto:** PWA, API y servicio RAG.
- **Respuesta:** informa que el asistente no está disponible; el registro y el historial local de mediciones siguen funcionando.
- **Medida:** el flujo de registro local se completa en el 100 % de los intentos con el proveedor desconectado.

## EC-07 — Nuevo cliente móvil (RNF07)

- **Fuente:** equipo de desarrollo.
- **Estímulo:** incorporar un cliente React Native, Capacitor o Flutter.
- **Entorno:** contrato OpenAPI vigente.
- **Artefacto:** API, casos de uso y adaptadores.
- **Respuesta:** el nuevo cliente consume el mismo contrato sin cambios en las reglas de negocio del servidor.
- **Medida:** pruebas de contrato y de autorización pasan sin modificar el dominio.

## EC-08 — Pregunta sin evidencia o maliciosa (RNF09)

- **Fuente:** usuario de la JASS.
- **Estímulo:** pregunta sin respuesta en el corpus, o un documento contiene instrucciones maliciosas.
- **Entorno:** asistente en línea, corpus parcial o adversarial.
- **Artefacto:** recuperación, construcción del contexto, LLM y verificación de citas.
- **Respuesta:** se abstiene o responde solo con citas verificables; no ejecuta instrucciones contenidas en los documentos.
- **Medida:** evaluación del conjunto de prueba: 100 % de respuestas con cita o abstención, 0 filtraciones entre JASS, 0 instrucciones adversariales obedecidas.

## EC-09 — Guardado local en gama baja (RNF02)

- **Fuente:** operador.
- **Estímulo:** pulsa «Guardar» en una medición.
- **Entorno:** teléfono Android de gama baja o media definido para el piloto, sin conexión.
- **Artefacto:** formulario React y Dexie.
- **Respuesta:** confirmación local del registro.
- **Medida:** percentil 95 ≤ 2 s en 50 registros consecutivos.

## EC-10 — Operador nuevo (RNF06)

- **Fuente:** operador sin experiencia previa con el sistema.
- **Estímulo:** registra su primera medición tras una inducción breve.
- **Entorno:** campo, conectividad limitada.
- **Artefacto:** interfaz de registro.
- **Respuesta:** completa la tarea con mensajes de validación comprensibles.
- **Medida:** tasa de éxito, tiempo y errores por tarea registrados en la prueba de usabilidad; la meta se fija con la línea base del piloto.

## EC-11 — Protección de datos personales (RNF10)

- **Fuente:** usuario o integración externa.
- **Estímulo:** se adjunta una fotografía o se consulta el asistente con información del padrón.
- **Entorno:** operación normal.
- **Artefacto:** almacén de objetos, API y adaptador del LLM.
- **Respuesta:** se eliminan metadatos de ubicación de las fotografías, el acceso es temporal y restringido a la JASS, y no se envían datos personales al proveedor de IA.
- **Medida:** pruebas automatizadas de metadatos y de contenido de las solicitudes al LLM sin hallazgos.

## EC-12 — Nueva versión de un documento (RNF09)

- **Fuente:** administrador autorizado.
- **Estímulo:** carga una nueva versión aprobada de un documento del corpus.
- **Entorno:** asistente habilitado.
- **Artefacto:** catálogo de documentos, indexación y citas.
- **Respuesta:** la versión anterior pasa a *sustituida* sin borrarse; las respuestas nuevas citan la versión vigente.
- **Medida:** las respuestas del conjunto de evaluación identifican la fuente, versión y página correctas.
