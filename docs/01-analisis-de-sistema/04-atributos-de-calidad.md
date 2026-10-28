# 04. Atributos de calidad (requisitos no funcionales) — SIJASS

**Estado:** pendiente de validación. Todas las cifras son **metas propuestas** que deberán medirse en pruebas o en el piloto; ninguna ha sido alcanzada ni medida todavía.

## 1. Catálogo

| ID | Atributo | Estímulo y entorno | Respuesta esperada | Medida propuesta | Escenario |
|---|---|---|---|---|---|
| RNF01 | Disponibilidad sin conexión | Teléfono sin red, PWA instalada y catálogos precargados | El operador registra mediciones y ve su estado local | 0 pérdidas observadas en 100 registros con cierre y reinicio del navegador | EC-01, EC-06 |
| RNF02 | Rendimiento local | Teléfono Android de gama baja o media del piloto | Guardar una medición en el almacenamiento local | Percentil 95 ≤ 2 s desde «Guardar» hasta la confirmación local | EC-09 |
| RNF03 | Integridad de mediciones | Datos inválidos o corrección posterior | Rechazo de datos inválidos; correcciones trazables | 100 % de los casos inválidos del conjunto de prueba rechazados; 100 % de correcciones con revisión y autor | EC-04 |
| RNF04 | Idempotencia | Reintento del mismo lote por red inestable | Un único efecto de negocio por operación | 0 efectos duplicados tras 3 reintentos; `conflict` ante el mismo UUID con contenido distinto | EC-02 |
| RNF05 | Seguridad y aislamiento entre JASS | Sesión válida que intenta acceder a recursos de otra JASS o fuera de su rol | Denegación y registro de auditoría | 100 % de los casos de la matriz de autorización rechazados sin filtrar datos | EC-03 |
| RNF06 | Usabilidad | Operador nuevo con conectividad limitada | Registrar una medición con ayuda mínima | Prueba de tareas con operadores reales: tasa de éxito, tiempo y errores registrados (meta a fijar con la línea base del piloto) | EC-10 |
| RNF07 | Modificabilidad e independencia de clientes | Incorporación de un cliente móvil u otro módulo | Reutilizar la API sin modificar el dominio | Pruebas de contrato y de dominio pasan sin cambios en el núcleo | EC-05, EC-07 |
| RNF08 | Compatibilidad | Dispositivos y navegadores del piloto | PWA instalable con almacenamiento local operativo | Matriz explícita de dispositivos y navegadores validada en campo | EC-01 |
| RNF09 | Trazabilidad del asistente RAG | Pregunta con o sin respaldo documental | Respuesta citada o abstención | 100 % de las respuestas del conjunto de evaluación con citas verificables o abstención; tasa de abstención informada | EC-08, EC-12 |
| RNF10 | Privacidad y protección de datos | Datos personales, fotografías y documentos privados | Minimización, control de acceso, retención definida | Pruebas de aislamiento, eliminación de metadatos de imágenes, ausencia de datos personales en solicitudes al LLM | EC-11 |

## 2. Priorización

| Prioridad | Atributos | Justificación |
|---|---|---|
| Crítica | RNF01, RNF04, RNF05 | Sin ellos el sistema pierde datos, duplica registros o expone información de otra organización |
| Alta | RNF03, RNF09, RNF10 | Determinan la confianza en el registro, en el asistente y el cumplimiento de la protección de datos |
| Media | RNF02, RNF06, RNF07, RNF08 | Condicionan la adopción y la evolución; se ajustan con evidencia del piloto |

## 3. Consideraciones

- **Seguridad:** la autorización se comprueba siempre en el servidor; no se confía en filtros del cliente ni en el modelo de lenguaje.
- **Persistencia local:** IndexedDB puede ser vaciado por el navegador bajo presión de almacenamiento o por el usuario. Se solicita almacenamiento persistente cuando el navegador lo permite, se advierte de los registros pendientes y se sincroniza en cuanto hay conexión (ver [diseño de sincronización](../03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md#5-sincronización-de-mediciones)).
- **Calidad del dato:** la integridad estructural y la auditoría no garantizan que la lectura de campo sea exacta; la exactitud depende del procedimiento y del equipo de medición.
- **RAG:** las citas y las pruebas de fundamentación reducen el riesgo de respuestas incorrectas, pero no lo eliminan.
- **IA fotográfica futura:** cualquier meta de error o precisión solo se definirá tras contar con dataset, instrumento de referencia y protocolo de evaluación independiente.

## 4. Cambios respecto de la versión anterior

- Se retiran las metas de inferencia (≤ 2 s por clasificación) y de precisión del modelo (≥ 85 %, MAE ≤ 0,2 mg/L), que suponían un modelo de visión inexistente.
- RNF02 pasa a medir el guardado local; RNF03 pasa a integridad de mediciones.
- Se incorporan RNF09 (trazabilidad RAG) y RNF10 (privacidad).
