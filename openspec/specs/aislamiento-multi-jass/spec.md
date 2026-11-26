# aislamiento-multi-jass Specification

## Purpose
Garantiza que SIJASS pueda servir a varias JASS en una misma instalación sin que una cuenta lea o modifique datos de otra, incluso si una consulta futura olvida filtrar por JASS, y que el equipo de plataforma no llegue a los datos de negocio.

## Requirements

### Requirement: Ninguna cuenta accede a datos de otra JASS
El sistema SHALL resolver la JASS de cada solicitud en el servidor desde la membresía activa y SHALL responder como recurso inexistente cuando una cuenta pida por identificador un recurso de otra JASS, sin distinguirlo de uno que no existe.

#### Scenario: Consulta por identificador ajeno
- **WHEN** el Consejo de la JASS A pide el detalle de un asociado, un pago o un reservorio de la JASS B
- **THEN** la respuesta es idéntica a la de un identificador inexistente

#### Scenario: Escritura sobre recursos ajenos
- **WHEN** Tesorería de la JASS A intenta registrar un pago sobre una cuota de la JASS B
- **THEN** la operación se rechaza sin modificar datos de ninguna JASS

### Requirement: Seguridad por filas en la base de datos
El sistema SHALL aplicar seguridad por filas en cada tabla con `jass_id` mediante un rol de aplicación sin privilegios de propietario, SHALL fijar la JASS de la solicitud en cada transacción y SHALL devolver cero filas ajenas aunque una consulta no incluya el filtro por JASS.

#### Scenario: Consulta sin filtro
- **WHEN** dentro de una transacción de la JASS A se ejecuta una consulta sobre asociados, cuotas, pagos o reservorios sin condición por JASS
- **THEN** solo se devuelven filas de la JASS A

#### Scenario: Inserción con JASS distinta
- **WHEN** dentro de una transacción de la JASS A se intenta insertar una fila con `jass_id` de la JASS B
- **THEN** la base de datos rechaza la inserción

#### Scenario: Transacción sin JASS
- **WHEN** una transacción de negocio no fija ninguna JASS
- **THEN** no ve ninguna fila de las tablas protegidas

### Requirement: Operaciones de sistema acotadas
El sistema SHALL reservar el acceso sin JASS fijada a un conjunto cerrado de operaciones de sistema (inicio y renovación de sesión, comandos de plataforma y operaciones del perfil de plataforma) y SHALL impedir que una solicitud de negocio lo active.

#### Scenario: Solicitud de negocio
- **WHEN** una solicitud de personal o de asociado se procesa
- **THEN** su transacción fija la JASS de la membresía y no puede activar el modo de sistema

### Requirement: Datos de negocio fuera del alcance de la plataforma
El sistema SHALL impedir al perfil de plataforma leer o escribir asociados, cuotas, pagos, reversas, reservorios y mediciones de cualquier JASS, tanto en la API como en la base de datos.

#### Scenario: Consulta directa con el contexto de plataforma
- **WHEN** una transacción con el contexto de plataforma consulta las tablas de negocio
- **THEN** no devuelve filas

### Requirement: Pruebas de aislamiento con varias JASS
El sistema SHALL mantener una batería automatizada con al menos tres JASS que compruebe, para cada recurso, que lecturas, listados y escrituras de una JASS no alcanzan a las otras, tanto con la implementación en memoria como con PostgreSQL.

#### Scenario: Batería ejecutada en integración
- **WHEN** se ejecutan las pruebas de integración contra PostgreSQL
- **THEN** la batería de aislamiento con tres JASS pasa y falla si se quita el filtro por JASS de una consulta o la política de una tabla
