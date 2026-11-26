# acceso-por-perfiles Specification

## Purpose
Identifica a cada persona con credenciales individuales, le asigna un perfil (personal de la JASS o asociado) dentro de una única JASS y autoriza en el servidor cada solicitud según su membresía activa y su permiso sobre el recurso (RF01, ADR-008).

## Requirements

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

### Requirement: Política mínima de contraseñas
El sistema SHALL aceptar como contraseña de una cuenta nueva solo textos de 10 a 128 caracteres, y SHALL rechazar con `422` cualquier otro sin crear la cuenta.

#### Scenario: Contraseña demasiado corta o larga
- **WHEN** el personal crea el acceso de un asociado con una contraseña de menos de 10 o más de 128 caracteres
- **THEN** la respuesta es `422` y no se crea el usuario ni la membresía

### Requirement: Limitación de intentos fallidos
El sistema SHALL ordenar atómicamente por cuenta las decisiones de autenticación; SHALL bloquear durante 15 minutos tras 5 fallos consecutivos y reiniciar el contador con un inicio correcto solo si no hay bloqueo vigente en el momento de decidir. El orden de decisión SHALL prevalecer sobre el orden de llegada.

#### Scenario: Bloqueo temporal
- **WHEN** una cuenta acumula 5 intentos fallidos consecutivos
- **THEN** el siguiente intento responde `429` aunque la contraseña sea correcta, hasta que pasen 15 minutos

#### Scenario: Contador reiniciado
- **WHEN** una cuenta con 4 intentos fallidos inicia sesión correctamente
- **THEN** su contador vuelve a 0

#### Scenario: Bloqueo activado durante verificación
- **WHEN** un inicio correcto verifica la contraseña mientras otro intento de la misma cuenta confirma el quinto fallo y activa el bloqueo antes de decidir el inicio correcto
- **THEN** el inicio correcto responde `429`, no emite tokens ni reinicia el contador y el bloqueo permanece vigente

#### Scenario: Bloqueo vigente y hash cambiado
- **WHEN** durante la verificación cambian el hash de la cuenta y se activa el bloqueo antes de la decisión
- **THEN** prevalece el bloqueo vigente: el inicio responde `429` sin emitir tokens ni reiniciar el contador

#### Scenario: Inicio correcto decidido antes del quinto fallo
- **WHEN** con 4 fallos un inicio correcto se decide y confirma antes que otro intento incorrecto de la misma cuenta
- **THEN** el inicio correcto crea la sesión y reinicia el contador; el intento incorrecto posterior cuenta como primer fallo

#### Scenario: Intentos fallidos concurrentes
- **WHEN** varios intentos incorrectos de la misma cuenta se deciden concurrentemente antes de quedar bloqueada
- **THEN** se ordenan sin perder incrementos, el quinto activa el bloqueo y las decisiones posteriores durante el bloqueo responden `429` sin emitir tokens

#### Scenario: Acceso tras vencimiento del bloqueo
- **WHEN** el bloqueo ha vencido y un usuario activo con membresía activa inicia sesión con contraseña correcta
- **THEN** recibe una sesión y el contador queda en cero

#### Scenario: Fallo tras vencimiento del bloqueo
- **WHEN** el bloqueo ha vencido y el primer intento decidido presenta contraseña incorrecta
- **THEN** responde `401`, inicia un nuevo conteo en uno y no prolonga el bloqueo vencido

#### Scenario: Cuentas independientes y varias instancias
- **WHEN** dos instancias de backend comparten PostgreSQL y deciden intentos de una misma cuenta mientras otra cuenta inicia sesión
- **THEN** las decisiones de la primera respetan el mismo orden atómico y no alteran el contador ni la sesión de la segunda

#### Scenario: Fallo transaccional al crear sesión
- **WHEN** falla el registro de sesión o auditoría durante un inicio correcto
- **THEN** no se emiten tokens y se revierten tanto el reinicio del contador como la creación de sesión

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
El sistema SHALL denegar con `401` toda solicitud sin token válido y con `403` toda solicitud cuyo perfil o rol no tenga permiso, y SHALL responder `403` igual para un recurso inexistente que para uno de otra JASS. Padrón administrativo, cuotas, pagos, reversas y cuentas de asociado SHALL estar limitados a `tesorero` y `consejo` de la JASS activa. El portal SHALL limitarse al perfil `asociado` y a sus propios datos.

#### Scenario: Sin token
- **WHEN** se solicita cualquier ruta protegida sin token o con un token vencido o alterado
- **THEN** la respuesta es `401`

#### Scenario: Rol sin permiso
- **WHEN** un `operador` intenta registrar un pago
- **THEN** la respuesta es `403` y no se crea ningún pago

#### Scenario: Operador sin acceso financiero
- **WHEN** un `operador` consulta el listado administrativo de asociados, un estado de cuenta o un pago de su JASS, o intenta generar cuotas o reversar un pago
- **THEN** cada solicitud responde `403` sin revelar información financiera ni modificar datos

#### Scenario: Personal financiero de la JASS
- **WHEN** `consejo` o `tesorero` consulta el padrón o un pago de su propia JASS con membresía activa
- **THEN** recibe los datos autorizados y no obtiene recursos de otra JASS

#### Scenario: Asociado solo consulta su información
- **WHEN** un asociado consulta el portal o intenta acceder al estado de cuenta de otro asociado
- **THEN** el portal devuelve exclusivamente sus propios datos y la ruta administrativa responde `403`

#### Scenario: Asociado en rutas de personal
- **WHEN** un asociado solicita una ruta del personal
- **THEN** la respuesta es `403`

#### Scenario: Personal en rutas del portal
- **WHEN** un usuario de perfil `personal` solicita una ruta del portal
- **THEN** la respuesta es `403`

#### Scenario: Recurso de otra JASS
- **WHEN** el tesorero de la JASS A solicita el estado de cuenta de un asociado de la JASS B
- **THEN** la respuesta es `403`, idéntica a la de un identificador inexistente
