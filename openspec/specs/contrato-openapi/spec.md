# contrato-openapi Specification

## Purpose
Documenta el contrato HTTP de SIJASS en OpenAPI para múltiples clientes (ADR-011, PT25) y garantiza que el documento y el código no diverjan.

## Requirements

### Requirement: Documento OpenAPI de todas las rutas
`docs/api/openapi.yaml` SHALL describir, en OpenAPI 3.1, cada ruta `/v1` del servidor con su método, sus parámetros, los cuerpos de solicitud y de respuesta, los códigos de estado posibles (incluidos `401`, `403`, `409`, `422` y `429` donde apliquen), el esquema de seguridad `Bearer` y el encabezado `Idempotency-Key` donde se exige.

#### Scenario: Documento válido
- **WHEN** se analiza el documento
- **THEN** es YAML válido, declara `openapi: 3.1.0`, y cada operación tiene `operationId` único, al menos una respuesta de éxito y un esquema de error `{ codigo, mensaje }`

### Requirement: Coherencia con el código
Una prueba automática SHALL comparar el conjunto de pares (método, ruta) del documento con el de los controladores y SHALL fallar si una ruta del código no está en el documento o una del documento no existe en el código.

#### Scenario: Ruta sin documentar
- **WHEN** un controlador expone una ruta que no figura en el documento
- **THEN** la prueba falla nombrando la ruta

#### Scenario: Ruta documentada inexistente
- **WHEN** el documento incluye una ruta que ningún controlador implementa
- **THEN** la prueba falla nombrando la ruta

#### Scenario: Sin divergencias
- **WHEN** el documento y el código coinciden
- **THEN** la prueba pasa

### Requirement: Códigos de estado documentados verificados
Para un conjunto de operaciones representativas, la prueba SHALL comprobar que cada código de estado que la API devuelve realmente está declarado en el documento para esa operación.

#### Scenario: Estados observados
- **WHEN** se ejecutan las solicitudes de las pruebas HTTP de flujos y de aislamiento
- **THEN** todo estado observado figura en la lista de respuestas de su operación
