# portal-asociado Specification

## Purpose
Permite al asociado consultar, con su propia cuenta, su saldo, sus cuotas y sus pagos, sin acceso alguno a datos de otros asociados ni de otras JASS.

## Requirements

### Requirement: Consulta de lo propio
El sistema SHALL ofrecer a las cuentas de perfil `asociado` el saldo, las cuotas y los pagos del asociado referido por su membresía. Las rutas del portal SHALL NOT recibir identificadores de asociado, de JASS ni de cuenta.

#### Scenario: Saldo actualizado tras un pago
- **WHEN** el tesorero registra un pago de 500 para un asociado con saldo 1500 y el asociado consulta su saldo
- **THEN** el portal muestra un saldo de 1000 y el pago en su lista de pagos

#### Scenario: Reversa visible
- **WHEN** el tesorero reversa ese pago
- **THEN** el portal muestra de nuevo un saldo de 1500 y el pago con estado `revertido`

#### Scenario: Asociado dado de baja
- **WHEN** el asociado fue dado de baja
- **THEN** puede consultar su historial pero no se le generan nuevas cuotas

### Requirement: Aislamiento entre cuentas
Una cuenta de asociado SHALL NOT acceder a datos de otro asociado de su JASS ni de otra JASS, por ninguna ruta. Los intentos denegados SHALL registrarse en la auditoría.

#### Scenario: Otro asociado de la misma JASS
- **WHEN** el asociado B intenta leer el estado de cuenta del asociado A por la ruta del personal, o enviando el identificador de A al portal
- **THEN** recibe `403` en la ruta del personal, el portal le devuelve únicamente sus propios datos y no obtiene ningún dato de A

#### Scenario: Asociado de otra JASS
- **WHEN** un asociado de la JASS B intenta leer datos de un asociado de la JASS A
- **THEN** recibe `403` sin ningún dato de A

#### Scenario: Pagos de otro asociado
- **WHEN** el asociado B pide el detalle de un pago del asociado A
- **THEN** recibe `403` y el intento queda auditado

### Requirement: Interfaz web de ambos perfiles
La interfaz web SHALL permitir iniciar sesión y mostrar solo las pantallas del perfil de la cuenta: el personal registra asociados, genera cuotas, registra y reversa pagos y consulta el estado de cuenta; el asociado ve su saldo, sus cuotas y sus pagos. La interfaz SHALL mostrar en soles con dos decimales los importes recibidos en céntimos.

#### Scenario: Flujo de extremo a extremo en el navegador
- **WHEN** el tesorero inicia sesión en el navegador y registra un pago, y luego el asociado inicia sesión en otro contexto del navegador
- **THEN** el asociado ve su saldo actualizado y el pago registrado

#### Scenario: Pantallas por perfil
- **WHEN** un asociado abre en el navegador una ruta de pantalla del personal
- **THEN** la interfaz lo redirige a su portal y no se muestran datos del personal
