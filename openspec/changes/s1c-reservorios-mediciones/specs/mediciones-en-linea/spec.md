# mediciones-en-linea Specification

## Purpose

Expone por HTTP y por la interfaz el registro manual de mediciones de cloro residual y su historial por reservorio, reutilizando el dominio y la persistencia existentes, con permisos por rol y aislamiento entre JASS (RF06, RF07, RF11). SIJASS registra la lectura del operador; no la estima ni dictamina la calidad del agua.

## ADDED Requirements

### Requirement: Registro por el operador
El sistema SHALL permitir solo al rol `operador` registrar una medición en un reservorio de su JASS, tomando la JASS y el autor de la membresía y el `operationId` del encabezado `Idempotency-Key` (UUID). Las respuestas SHALL ser `201` si es nueva, `200` con el mismo resultado si es un reintento, `409` si la misma clave llega con otro contenido y `422` con el motivo si el dominio rechaza el dato.

#### Scenario: Registro correcto
- **WHEN** el operador registra 0.65 mg/L con método `comparador-dpd` y hora de toma válida en un reservorio de su JASS
- **THEN** la respuesta es `201` con el identificador, la revisión 1 y la hora de recepción del servidor, y la medición queda con su JASS y su autor

#### Scenario: Reintento
- **WHEN** se reenvía la misma solicitud con la misma clave
- **THEN** la respuesta es `200` con el mismo identificador y existe una sola medición

#### Scenario: Misma clave, otro contenido
- **WHEN** la misma clave llega con otro valor
- **THEN** la respuesta es `409` y la medición original no cambia

#### Scenario: Dato rechazado por el dominio
- **WHEN** el valor es negativo o no numérico, la unidad no es `mg/L`, el método no está en el catálogo o la hora de toma es posterior a la recepción
- **THEN** la respuesta es `422` con el motivo del dominio y no se crea ninguna medición

#### Scenario: Falta la clave
- **WHEN** falta `Idempotency-Key` o no es un UUID
- **THEN** la respuesta es `422` y no se crea ninguna medición

#### Scenario: Campos que el cliente no puede fijar
- **WHEN** el cuerpo incluye `jassId`, `registradoPor`, `registradaEn`, `estado` o `revision`
- **THEN** la respuesta es `422` con motivo `campo-no-permitido` y no se crea ninguna medición

#### Scenario: Sin permiso
- **WHEN** un `tesorero`, el `consejo` o un asociado intenta registrar una medición
- **THEN** la respuesta es `403` y no se crea ninguna medición

#### Scenario: Reservorio de otra JASS o inexistente
- **WHEN** el operador de la JASS A registra una medición en un reservorio de la JASS B o inexistente
- **THEN** la respuesta es `403`, idéntica en ambos casos, y no se crea ninguna medición

### Requirement: Historial por reservorio
El sistema SHALL devolver a `operador`, `tesorero` y `consejo` el historial de un reservorio de su JASS, de la toma más reciente a la más antigua, limitado a las 200 más recientes, y SHALL negarlo a los asociados y a cualquier usuario de otra JASS.

#### Scenario: Consulta del consejo
- **WHEN** el consejo consulta el historial de un reservorio de su JASS tras un registro del operador
- **THEN** ve la medición con valor, unidad, método, hora de toma y hora de registro, y el autor identificado por su identificador de cuenta

#### Scenario: Orden
- **WHEN** hay varias mediciones con distinta hora de toma
- **THEN** se devuelven de la más reciente a la más antigua

#### Scenario: Otra JASS
- **WHEN** el consejo o el operador de la JASS B consulta el historial de un reservorio de la JASS A
- **THEN** la respuesta es `403`, idéntica a la de un identificador inexistente, sin ningún dato

#### Scenario: Asociado
- **WHEN** un asociado consulta el historial
- **THEN** la respuesta es `403`

#### Scenario: Denegaciones auditadas
- **WHEN** cualquiera de las denegaciones anteriores ocurre
- **THEN** existe un evento `acceso.denegado` con el actor y la ruta, sin datos de la medición

### Requirement: Catálogo de métodos
El sistema SHALL exponer al personal la lista de métodos del catálogo provisional con su descripción y la unidad `mg/L`.

#### Scenario: Catálogo
- **WHEN** el personal consulta el catálogo
- **THEN** recibe los códigos `comparador-dpd` y `colorimetro` con su descripción

### Requirement: Interfaz de mediciones
La interfaz SHALL permitir al operador elegir un reservorio, registrar la lectura y ver el historial; al tesorero y al consejo, ver el historial; y al consejo, además, crear reservorios. SHALL mostrar un aviso de que SIJASS no dictamina la calidad del agua y SHALL NOT ofrecer ninguna estimación a partir de imágenes ni cálculo de dosis.

#### Scenario: Flujo del operador en el navegador
- **WHEN** el operador inicia sesión, elige un reservorio, registra una lectura y abre el historial
- **THEN** ve la medición recién registrada en el historial

#### Scenario: El consejo consulta
- **WHEN** el consejo, en otro navegador, elige el mismo reservorio
- **THEN** ve la medición del operador y no ve el formulario de registro

#### Scenario: Otra JASS en el navegador
- **WHEN** el consejo de otra JASS abre la pantalla de mediciones
- **THEN** no ve reservorios ni mediciones de la primera JASS
