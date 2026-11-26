# reservorios-jass Specification

## Purpose
Permite al consejo dar de alta los reservorios de su JASS y a todo el personal listarlos, con aislamiento estricto entre JASS (RF02).

## Requirements

### Requirement: Alta de reservorios por el consejo
El sistema SHALL permitir solo al rol `consejo` crear un reservorio en su JASS con un nombre de 1 a 80 caracteres, único dentro de la JASS sin distinguir mayúsculas. La JASS SHALL salir de la membresía, nunca del cuerpo.

#### Scenario: Alta correcta
- **WHEN** el consejo crea el reservorio «Reservorio Central»
- **THEN** la respuesta es `201` con su identificador y queda en la JASS del consejo

#### Scenario: Nombre repetido
- **WHEN** se crea otro reservorio con el mismo nombre en la misma JASS, aunque cambien las mayúsculas
- **THEN** la respuesta es `409`; el mismo nombre en otra JASS sí se admite

#### Scenario: Nombre inválido
- **WHEN** el nombre está vacío, es solo espacios o supera 80 caracteres
- **THEN** la respuesta es `422` y no se crea el reservorio

#### Scenario: Sin permiso
- **WHEN** un `operador`, un `tesorero` o un asociado intenta crear un reservorio
- **THEN** la respuesta es `403` y no se crea nada

#### Scenario: JASS enviada por el cliente
- **WHEN** el cuerpo incluye un `jassId` de otra JASS
- **THEN** el reservorio se crea en la JASS de la membresía

### Requirement: Listado de reservorios de la JASS
El sistema SHALL listar los reservorios de la JASS del solicitante, ordenados por nombre, a todo el personal (`consejo`, `tesorero`, `operador`) y SHALL negarlo a los asociados.

#### Scenario: Aislamiento
- **WHEN** el operador de la JASS A lista los reservorios
- **THEN** recibe solo los de la JASS A, sin ningún dato de la JASS B

#### Scenario: Asociado
- **WHEN** un asociado solicita el listado
- **THEN** la respuesta es `403`
