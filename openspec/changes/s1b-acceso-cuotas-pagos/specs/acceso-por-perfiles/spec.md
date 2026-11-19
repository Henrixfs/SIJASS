# acceso-por-perfiles Specification

## Purpose

Identifica a cada persona con credenciales individuales, le asigna un perfil (personal de la JASS o asociado) dentro de una única JASS y autoriza en el servidor cada solicitud según su membresía activa y su permiso sobre el recurso (RF01, ADR-008).

## ADDED Requirements

### Requirement: Inicio de sesión con credenciales individuales
El sistema SHALL autenticar con correo y contraseña, SHALL guardar la contraseña solo como derivación `scrypt` con sal propia y SHALL emitir un token de acceso JWT firmado de 15 minutos de vigencia y un token de refresco opaco. Las respuestas de credenciales inválidas SHALL ser idénticas para correo desconocido y contraseña errónea.

#### Scenario: Inicio de sesión correcto
- **WHEN** un usuario activo con membresía activa envía su correo y su contraseña correctos
- **THEN** recibe un token de acceso y un token de refresco, y el token de acceso no contiene su contraseña ni su JASS

#### Scenario: Credenciales inválidas
- **WHEN** se envía una contraseña errónea o un correo inexistente
- **THEN** la respuesta es `401` con el mismo cuerpo en ambos casos y no se emite ningún token

#### Scenario: Contraseña almacenada
- **WHEN** se inspecciona la tabla de usuarios tras crear dos cuentas con la misma contraseña
- **THEN** la contraseña no aparece en claro y las dos cuentas tienen sal y derivación distintas

### Requirement: Limitación de intentos fallidos
El sistema SHALL bloquear el inicio de sesión de una cuenta durante 15 minutos tras 5 intentos fallidos consecutivos, y SHALL reiniciar el contador con un inicio de sesión correcto.

#### Scenario: Bloqueo temporal
- **WHEN** una cuenta acumula 5 intentos fallidos consecutivos
- **THEN** el siguiente intento responde `429` aunque la contraseña sea correcta, hasta que pasen 15 minutos

#### Scenario: Contador reiniciado
- **WHEN** una cuenta con 4 intentos fallidos inicia sesión correctamente
- **THEN** su contador vuelve a 0

### Requirement: Renovación y cierre de sesión
El sistema SHALL renovar el token de acceso con un token de refresco vigente, SHALL rotar el token de refresco en cada renovación, SHALL almacenarlo solo como hash y SHALL invalidar la sesión al cerrar sesión. Un token de refresco ya usado SHALL ser rechazado.

#### Scenario: Renovación rotativa
- **WHEN** se renueva con un token de refresco vigente
- **THEN** se devuelve un nuevo par de tokens y el token de refresco anterior deja de servir

#### Scenario: Sesión cerrada
- **WHEN** el usuario cierra sesión y luego intenta renovar con su token de refresco
- **THEN** la renovación responde `401`

### Requirement: Perfiles y membresía única
Cada cuenta SHALL tener como máximo una membresía activa, con perfil `personal` (rol `consejo`, `tesorero` u `operador`) o `asociado`. Una membresía de asociado SHALL referir a un único asociado de su misma JASS. La JASS, el perfil y el rol SHALL leerse de la membresía en cada solicitud, nunca del cuerpo, la ruta ni el token.

#### Scenario: Membresía desactivada
- **WHEN** se desactiva la membresía de un usuario que tiene un token de acceso aún vigente
- **THEN** su siguiente solicitud responde `403`

#### Scenario: Segunda membresía activa
- **WHEN** se intenta activar una segunda membresía para la misma cuenta
- **THEN** la base de datos la rechaza

#### Scenario: JASS enviada por el cliente
- **WHEN** una solicitud autenticada incluye un `jassId` distinto al de la membresía del solicitante
- **THEN** el servidor lo ignora y nunca opera sobre la JASS indicada

### Requirement: Autorización por perfil, rol y recurso
El sistema SHALL denegar con `401` toda solicitud sin token válido y con `403` toda solicitud cuyo perfil o rol no tenga permiso, y SHALL responder `403` igual para un recurso inexistente que para uno de otra JASS. Los permisos SHALL ser: padrón y cuotas (crear y actualizar: `tesorero`, `consejo`; leer: personal), pagos y reversas (registrar y reversar: `tesorero`, `consejo`; leer: personal), cuentas de acceso de asociados (crear: `tesorero`, `consejo`) y portal (solo perfil `asociado`).

#### Scenario: Sin token
- **WHEN** se solicita cualquier ruta protegida sin token o con un token vencido o alterado
- **THEN** la respuesta es `401`

#### Scenario: Rol sin permiso
- **WHEN** un `operador` intenta registrar un pago
- **THEN** la respuesta es `403` y no se crea ningún pago

#### Scenario: Asociado en rutas de personal
- **WHEN** un asociado solicita una ruta del personal
- **THEN** la respuesta es `403`

#### Scenario: Personal en rutas del portal
- **WHEN** un usuario de perfil `personal` solicita una ruta del portal
- **THEN** la respuesta es `403`

#### Scenario: Recurso de otra JASS
- **WHEN** el tesorero de la JASS A solicita el estado de cuenta de un asociado de la JASS B
- **THEN** la respuesta es `403`, idéntica a la de un identificador inexistente
