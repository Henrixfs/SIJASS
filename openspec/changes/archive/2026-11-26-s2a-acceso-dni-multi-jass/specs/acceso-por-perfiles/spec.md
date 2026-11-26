## MODIFIED Requirements

### Requirement: Inicio de sesión con credenciales individuales
El sistema SHALL autenticar con el DNI de 8 dígitos y la contraseña (detalle en la capacidad `acceso-por-documento`), SHALL guardar la contraseña solo como derivación `scrypt` con sal propia y SHALL emitir un token de acceso JWT firmado de 15 minutos de vigencia y un token de refresco opaco. Las respuestas de credenciales inválidas SHALL ser idénticas para DNI desconocido y contraseña errónea.

#### Scenario: Inicio de sesión correcto
- **WHEN** un usuario activo con membresía activa envía su DNI y su contraseña correctos
- **THEN** recibe un token de acceso y un token de refresco, y el token de acceso no contiene su contraseña ni su JASS

#### Scenario: Credenciales inválidas
- **WHEN** se envía una contraseña errónea o un DNI inexistente
- **THEN** la respuesta es `401` con el mismo cuerpo en ambos casos y no se emite ningún token

#### Scenario: Contraseña almacenada
- **WHEN** se inspecciona la tabla de usuarios tras crear dos cuentas con la misma contraseña
- **THEN** la contraseña no aparece en claro y las dos cuentas tienen sal y derivación distintas

### Requirement: Política mínima de contraseñas
El sistema SHALL aceptar como contraseña elegida por una persona solo textos de 10 a 128 caracteres distintos de su DNI, SHALL rechazar con `422` cualquier otro sin cambiar la clave, y SHALL generar las claves temporales de los accesos nuevos o restablecidos de modo que cumplan esa política (detalle en la capacidad `acceso-por-documento`).

#### Scenario: Contraseña demasiado corta o larga
- **WHEN** una persona intenta cambiar su clave por una de menos de 10 o más de 128 caracteres
- **THEN** la respuesta es `422` y la clave no cambia

#### Scenario: Contraseña igual al DNI
- **WHEN** una persona intenta cambiar su clave por su propio DNI
- **THEN** la respuesta es `422` y la clave no cambia
