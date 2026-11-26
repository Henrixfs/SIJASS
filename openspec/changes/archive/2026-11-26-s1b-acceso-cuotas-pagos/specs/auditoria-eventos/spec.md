# auditoria-eventos Specification

## Purpose

Mantiene una bitácora de solo inserción de los eventos sensibles de acceso, padrón, cuotas y pagos, escrita en la misma transacción que el cambio auditado (diseño interno §7).

## ADDED Requirements

### Requirement: Evento de auditoría transaccional
El sistema SHALL escribir un `evento_auditoria` con JASS, actor, acción, recurso, identificador del recurso, fecha y origen en la misma transacción que cada alta de asociado, baja, creación de cuenta de acceso, generación de cuotas, pago y reversa. Si el evento no se puede escribir, el cambio SHALL revertirse.

#### Scenario: Evento por pago
- **WHEN** se registra un pago
- **THEN** existe un evento `pago.registrado` con el actor, la JASS y el identificador del pago

#### Scenario: Reversión conjunta
- **WHEN** falla la escritura del evento durante una reversa
- **THEN** la reversa no queda guardada y el pago sigue vigente

### Requirement: Registro de accesos denegados
El sistema SHALL registrar un evento `acceso.denegado` cuando una solicitud autenticada recibe `403`, con el actor, la ruta y el motivo, sin incluir datos del recurso solicitado ni contraseñas ni tokens. Los inicios de sesión fallidos y los bloqueos SHALL registrarse como `sesion.fallida` y `sesion.bloqueada` sin almacenar la contraseña enviada.

#### Scenario: Acceso denegado auditado
- **WHEN** un asociado recibe `403` al pedir una ruta del personal
- **THEN** existe un evento `acceso.denegado` con su identificador y la ruta, y sin datos del recurso

#### Scenario: Secretos fuera de la bitácora
- **WHEN** se inspeccionan todos los eventos tras una sesión de pruebas con inicios de sesión fallidos
- **THEN** ninguno contiene la contraseña ni los tokens utilizados

### Requirement: Bitácora de solo inserción
La base de datos SHALL impedir `UPDATE` y `DELETE` sobre `evento_auditoria` para el rol de la aplicación.

#### Scenario: Intento de modificación
- **WHEN** el rol de la aplicación intenta actualizar o borrar un evento
- **THEN** la base de datos rechaza la operación
