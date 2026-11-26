# gestion-de-accesos Specification

## Purpose

Define quién crea, entrega, restablece y desactiva los accesos de cada nivel (equipo de la JASS y asociados), de modo que ninguna persona necesite correo ni conocer reglas de contraseñas y que cada alta quede auditada y limitada a su propia JASS.

## ADDED Requirements

### Requirement: Alta de acceso de un asociado con clave generada
El sistema SHALL permitir a Tesorería y al Consejo crear el acceso de un asociado activo sin cuenta a partir de su DNI ya registrado en el padrón, SHALL generar la clave temporal, SHALL devolverla una sola vez en esa respuesta y SHALL NOT aceptar una clave enviada por el cliente.

#### Scenario: Alta correcta
- **WHEN** Tesorería crea el acceso de un asociado activo cuyo documento tiene 8 dígitos
- **THEN** la respuesta es `201` con la clave temporal generada, el asociado puede entrar con su DNI y esa clave, y la clave no se vuelve a poder consultar

#### Scenario: Documento no es un DNI
- **WHEN** el documento del asociado no tiene 8 dígitos
- **THEN** la respuesta es `422` con el código `documento-no-es-dni` y no se crea cuenta ni membresía

#### Scenario: Asociado dado de baja o con acceso
- **WHEN** se intenta crear el acceso de un asociado dado de baja o que ya tiene acceso
- **THEN** la respuesta es `409` y no se crea nada

#### Scenario: Asociado de otra JASS
- **WHEN** Tesorería usa el identificador de un asociado de otra JASS
- **THEN** la respuesta es la misma que para un recurso inexistente

### Requirement: Estado del acceso del asociado
El sistema SHALL indicar en el padrón y en la cuenta de cada asociado si tiene acceso (`sin-acceso`, `activo` o `inactivo`) sin exponer datos de la cuenta, para que el personal sepa si debe crearlo o restablecerlo.

#### Scenario: Asociado sin acceso
- **WHEN** el personal consulta el padrón
- **THEN** cada asociado trae su estado de acceso y los que no tienen cuenta figuran como `sin-acceso`

### Requirement: Restablecimiento de la clave de un asociado
El sistema SHALL permitir a Tesorería y al Consejo restablecer la clave de un asociado con acceso, SHALL generar una clave temporal nueva devuelta una sola vez, SHALL invalidar sus sesiones y su bloqueo y SHALL auditar la acción.

#### Scenario: Restablecimiento correcto
- **WHEN** Tesorería restablece la clave de un asociado bloqueado por intentos fallidos
- **THEN** recibe una clave nueva, la anterior deja de servir, el bloqueo desaparece y los tokens de refresco previos son rechazados

#### Scenario: Operador sin permiso
- **WHEN** un Operador intenta restablecer la clave de un asociado
- **THEN** la respuesta es `403` y no cambia nada

### Requirement: Equipo de la JASS gestionado por el Consejo
El sistema SHALL permitir solo al Consejo listar, crear y desactivar las cuentas de Tesorería y Operador de su JASS indicando nombre y DNI, SHALL generar su clave temporal con cambio pendiente y SHALL NOT permitir crear otro rol, desactivarse a sí mismo ni dejar la JASS sin Consejo activo.

#### Scenario: Alta de Tesorería
- **WHEN** el Consejo crea una cuenta de Tesorería con nombre y DNI
- **THEN** recibe la clave temporal una sola vez, la cuenta queda activa con cambio de clave pendiente y aparece en el listado con el DNI enmascarado

#### Scenario: Rol no permitido
- **WHEN** el Consejo intenta crear una cuenta con rol `consejo` o `plataforma`
- **THEN** la respuesta es `422` y no se crea nada

#### Scenario: Desactivación
- **WHEN** el Consejo desactiva la cuenta de un Operador
- **THEN** esa cuenta no puede iniciar sesión, sus sesiones se invalidan y el hecho queda auditado

#### Scenario: Protecciones del último Consejo
- **WHEN** el Consejo intenta desactivar su propia cuenta
- **THEN** la respuesta es `409` y la cuenta sigue activa

#### Scenario: Otros roles
- **WHEN** Tesorería u Operador intentan listar o crear cuentas del equipo
- **THEN** la respuesta es `403`

### Requirement: Restablecimiento de la clave del equipo
El sistema SHALL permitir al Consejo restablecer la clave de una cuenta de Tesorería u Operador de su JASS con una clave temporal nueva y cambio pendiente, y SHALL rechazar restablecer cuentas de otra JASS o del propio Consejo por esta vía.

#### Scenario: Restablecimiento correcto
- **WHEN** el Consejo restablece la clave de Tesorería
- **THEN** recibe una clave temporal una sola vez, las sesiones anteriores de esa cuenta dejan de servir y debe cambiarla al entrar

### Requirement: Entrega única y sin rastro de la clave temporal
El sistema SHALL mostrar cada clave temporal únicamente en la respuesta que la genera, SHALL almacenar solo su derivación y SHALL NOT registrarla en bitácoras, auditoría ni mensajes de error.

#### Scenario: Revisión de la auditoría
- **WHEN** se consultan los eventos de auditoría tras crear y restablecer accesos
- **THEN** existen eventos con quién, a quién y cuándo, y ninguno contiene la clave generada
