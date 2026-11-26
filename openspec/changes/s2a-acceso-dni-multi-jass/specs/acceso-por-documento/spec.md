# acceso-por-documento Specification

## Purpose

Permite entrar a SIJASS con el número de DNI y una clave sencilla, decide en el servidor quién es la persona y qué puede hacer según su membresía, y mantiene las claves seguras (generadas, cambiables y restablecibles) sin exigir correo electrónico.

## ADDED Requirements

### Requirement: Inicio de sesión con DNI y clave
El sistema SHALL autenticar con un DNI de 8 dígitos y una contraseña, SHALL emitir un token de acceso de 15 minutos y un token de refresco opaco, y SHALL responder `401` con el mismo cuerpo y un costo de cálculo equivalente cuando el DNI no exista o la clave sea incorrecta.

#### Scenario: Inicio de sesión correcto
- **WHEN** una persona activa con membresía activa envía su DNI y su clave correctos
- **THEN** recibe un token de acceso, un token de refresco, su perfil y su rol, y el token de acceso no contiene su clave ni su JASS

#### Scenario: DNI inexistente y clave incorrecta se parecen
- **WHEN** se envía un DNI que no existe y, por separado, un DNI existente con clave incorrecta
- **THEN** ambas respuestas son `401` con el mismo cuerpo y no se emite ningún token

#### Scenario: DNI con formato inválido
- **WHEN** se envía un documento que no tiene exactamente 8 dígitos
- **THEN** la respuesta es `401` con el cuerpo de credenciales inválidas y no se consulta ninguna cuenta

### Requirement: Tipo de acceso elegido frente al real
El sistema SHALL aceptar opcionalmente el tipo de acceso elegido (`asociado` o `administrador`) y SHALL determinar el perfil real solo por la membresía de la cuenta. Si las credenciales son correctas y el tipo elegido no coincide, SHALL responder `409` con el tipo real y SHALL NOT emitir tokens.

#### Scenario: Administrador entra como administrador
- **WHEN** una cuenta de personal inicia sesión eligiendo `administrador`
- **THEN** la sesión se emite con perfil `personal` y su rol

#### Scenario: Asociado elige administrador
- **WHEN** un asociado con credenciales correctas inicia sesión eligiendo `administrador`
- **THEN** la respuesta es `409` con el tipo real `asociado`, no se emite ningún token y no cuenta como intento fallido

#### Scenario: Tipo elegido con credenciales incorrectas
- **WHEN** se envía un tipo de acceso con una clave incorrecta
- **THEN** la respuesta es `401` sin revelar cuál es el tipo real de la cuenta

### Requirement: Claves generadas de tres palabras
El sistema SHALL generar las claves temporales con tres palabras elegidas al azar de una lista de al menos 2048 palabras comunes en español, sin tildes ni eñes, unidas con guiones, y SHALL aceptarlas al iniciar sesión sin distinguir mayúsculas, espacios ni guiones adicionales mientras la clave no se haya cambiado.

#### Scenario: Forma de la clave generada
- **WHEN** se crea o restablece un acceso
- **THEN** la clave devuelta tiene el formato `palabra-palabra-palabra`, solo letras minúsculas sin tildes, y cumple la política de longitud mínima

#### Scenario: Escritura tolerante
- **WHEN** una persona escribe su clave generada con mayúsculas, con espacios en lugar de guiones o con espacios sobrantes
- **THEN** el inicio de sesión es correcto

#### Scenario: Claves distintas por acceso
- **WHEN** se crean dos accesos consecutivos
- **THEN** sus claves se generan de forma independiente y se almacenan con derivación y sal propias

### Requirement: Política de contraseñas elegidas
El sistema SHALL aceptar como contraseña elegida por una persona solo textos de 10 a 128 caracteres distintos de su DNI, y SHALL comparar las contraseñas elegidas exactamente, sin normalizarlas.

#### Scenario: Contraseña demasiado corta o igual al DNI
- **WHEN** una persona intenta cambiar su clave por una de menos de 10 caracteres o igual a su DNI
- **THEN** la respuesta es `422` y la clave no cambia

#### Scenario: Comparación exacta
- **WHEN** una persona que ya eligió su propia contraseña inicia sesión con otra capitalización
- **THEN** el inicio de sesión falla

### Requirement: Cambio de clave propio
El sistema SHALL permitir a una persona autenticada cambiar su clave enviando la actual y la nueva, SHALL cerrar todas sus sesiones anteriores, SHALL emitir una sesión nueva y SHALL quitar la marca de cambio pendiente.

#### Scenario: Cambio correcto
- **WHEN** una persona autenticada envía su clave actual correcta y una nueva válida
- **THEN** recibe una sesión nueva, los tokens de refresco anteriores dejan de servir y puede entrar con la clave nueva y no con la anterior

#### Scenario: Clave actual incorrecta
- **WHEN** envía una clave actual incorrecta
- **THEN** la respuesta es `401`, la clave no cambia y se cuenta como intento fallido de la cuenta

### Requirement: Cambio obligatorio de la clave del personal
El sistema SHALL marcar como pendiente el cambio de clave de toda cuenta de personal creada o restablecida con clave generada, SHALL informarlo en la sesión y SHALL rechazar con `403` y el código `cambio-de-clave-pendiente` cualquier operación distinta de cambiar la clave, consultar `yo` o cerrar sesión mientras siga pendiente. Las cuentas de asociados no tienen esa obligación.

#### Scenario: Primer ingreso del personal
- **WHEN** una cuenta de personal con clave generada inicia sesión
- **THEN** `GET /v1/yo` indica el cambio pendiente y una consulta al padrón responde `403` con `cambio-de-clave-pendiente`

#### Scenario: Cambio realizado
- **WHEN** esa cuenta cambia su clave
- **THEN** la marca desaparece y puede usar las operaciones de su rol

#### Scenario: Asociado con clave generada
- **WHEN** un asociado con clave generada inicia sesión
- **THEN** no tiene cambio pendiente y entra directamente al portal

### Requirement: Limitación de intentos por cuenta y por origen
El sistema SHALL bloquear el inicio de sesión de una cuenta durante 15 minutos tras 5 intentos fallidos consecutivos y SHALL limitar a 50 los intentos **fallidos** de inicio de sesión desde un mismo origen en una ventana de 15 minutos, respondiendo `429` en ambos casos. Los inicios correctos no cuentan para el límite del origen.

#### Scenario: Bloqueo de la cuenta
- **WHEN** una cuenta acumula 5 intentos fallidos
- **THEN** el siguiente intento responde `429` aunque la clave sea correcta, hasta que pasen 15 minutos

#### Scenario: Límite por origen
- **WHEN** un mismo origen acumula 50 intentos fallidos de inicio de sesión en 15 minutos, contra cuentas iguales o distintas
- **THEN** los siguientes responden `429` sin consultar las cuentas

#### Scenario: Una red compartida no se bloquea por inicios correctos
- **WHEN** muchas personas inician sesión correctamente desde un mismo origen (datos móviles o una red compartida)
- **THEN** ningún inicio correcto se cuenta para el límite del origen y ninguna responde `429`

### Requirement: Datos de la sesión
El sistema SHALL devolver en `GET /v1/yo` el perfil, el rol, el nombre de la persona, su DNI enmascarado mostrando solo los 3 últimos dígitos, el nombre de su JASS (salvo el perfil de plataforma) y si tiene el cambio de clave pendiente, y SHALL NOT devolver identificadores internos de usuario ni de otras JASS.

#### Scenario: Consulta de una cuenta de personal
- **WHEN** el Consejo consulta `GET /v1/yo`
- **THEN** recibe su nombre, `•••••123`, el nombre de su JASS y su rol, y ningún identificador de la JASS

#### Scenario: Consulta de un asociado
- **WHEN** un asociado consulta `GET /v1/yo`
- **THEN** su nombre sale del padrón de su JASS y el rol es nulo

### Requirement: Cuentas sin correo y documento único
El sistema SHALL identificar cada cuenta por un documento único en todo el sistema, SHALL no exigir correo y SHALL rechazar con `409` el alta de una cuenta con un documento que ya tiene acceso, sin indicar a qué JASS pertenece.

#### Scenario: Documento ya registrado
- **WHEN** se crea un acceso para un documento que ya tiene cuenta en cualquier JASS
- **THEN** la respuesta es `409` con un código genérico y el cuerpo no contiene nombres ni JASS ajenas

#### Scenario: Auditoría sin secretos
- **WHEN** se inicia sesión, falla un intento, se cambia o se restablece una clave
- **THEN** se registra un evento de auditoría que no contiene claves, tokens ni el DNI completo
