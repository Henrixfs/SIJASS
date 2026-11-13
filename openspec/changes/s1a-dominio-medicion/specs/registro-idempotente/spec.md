# Spec Delta

## Purpose

Garantiza que cada operación de registro de medición produzca un único efecto de negocio aunque se reenvíe, que informe un resultado explícito (`accepted`, `duplicate`, `conflict` o `rejected`) y que la reserva de la operación y la escritura se confirmen o se reviertan juntas, también ante envíos concurrentes.

## ADDED Requirements

### Requirement: Operación identificada por JASS y operationId
Toda solicitud de registro SHALL llevar un `operationId` UUID. La clave de idempotencia SHALL ser el par (JASS del actor, `operationId`), de modo que un mismo `operationId` en dos JASS identifique operaciones independientes. Un `operationId` que no sea UUID SHALL rechazarse con motivo `operacion-invalida`, sin reservarse.

#### Scenario: Mismo operationId en dos JASS
- **WHEN** un actor de la JASS A y un actor de la JASS B envían cada uno una operación válida con el mismo `operationId`
- **THEN** ambas devuelven `accepted` y existen dos mediciones, una en cada JASS

#### Scenario: operationId malformado
- **WHEN** el `operationId` no es un UUID
- **THEN** la operación devuelve `rejected` con motivo `operacion-invalida` y no queda reserva ni medición

#### Scenario: Deduplicación por operación, no por contenido
- **WHEN** dos operaciones con distinto `operationId` tienen exactamente el mismo contenido
- **THEN** ambas devuelven `accepted` y existen dos mediciones

### Requirement: Hash de contenido calculado por el servidor
El servidor SHALL calcular un hash SHA-256 del contenido canónico de cada operación: su tipo y los campos del comando con las claves ordenadas, excluido el `operationId`. El hash SHALL ser determinista e independiente del orden de las claves. El servidor SHALL NOT aceptar un hash calculado por el cliente.

#### Scenario: Orden de claves distinto
- **WHEN** se reenvía una operación aceptada con los mismos campos y valores en otro orden de claves
- **THEN** devuelve `duplicate`

#### Scenario: Cambio en cualquier campo
- **WHEN** se reenvía una operación aceptada con un único campo del comando cambiado (valor, método, unidad, hora de toma, reservorio o evidencia)
- **THEN** el hash difiere y la operación devuelve `conflict`

#### Scenario: Hash enviado por el cliente
- **WHEN** el comando incluye un campo de hash
- **THEN** la operación devuelve `rejected` con motivo `campo-no-permitido`

### Requirement: Un único efecto por operación
Reenviar una operación ya aceptada, en la misma JASS y con el mismo contenido, SHALL devolver `duplicate` con el resultado original: identificador de la medición, revisión y hora de recepción. Un reenvío SHALL NOT crear otra medición ni modificar la existente.

#### Scenario: Reenvío con el mismo contenido
- **WHEN** se reenvía una operación aceptada con el mismo `operationId` y el mismo contenido
- **THEN** devuelve `duplicate` con el mismo identificador de medición, revisión y hora de recepción que el `accepted` original

#### Scenario: Tres reintentos
- **WHEN** una operación se envía una vez y se reintenta tres veces con el mismo contenido
- **THEN** se obtiene un `accepted` y tres `duplicate`, y existe exactamente una medición y una reserva para esa operación

#### Scenario: Reenvío en otro momento
- **WHEN** se reenvía una operación aceptada cuando el reloj del servidor ya marca otra hora
- **THEN** el `duplicate` informa la hora de recepción original, no la actual

### Requirement: Conflicto ante contenido distinto
Una operación cuyo `operationId` ya fue aceptado en la misma JASS, pero cuyo contenido tiene otro hash, SHALL devolver `conflict`. SHALL NOT modificar la medición ni el resultado almacenados, aunque el contenido nuevo sea inválido.

#### Scenario: Mismo operationId con otro valor
- **WHEN** se envía una operación aceptada con el mismo `operationId` y un valor distinto
- **THEN** devuelve `conflict`, y la medición y el resultado almacenados no cambian

#### Scenario: Contenido distinto e inválido
- **WHEN** se envía una operación aceptada con el mismo `operationId` y un valor negativo
- **THEN** devuelve `conflict`, no `rejected`

#### Scenario: Reenvío original tras un conflicto
- **WHEN** después de un `conflict` se reenvía la operación con su contenido original
- **THEN** devuelve `duplicate` con el resultado original

### Requirement: Resultado explícito por operación
Cada operación SHALL terminar con exactamente uno de los resultados `accepted`, `duplicate`, `conflict` o `rejected`. `rejected` SHALL incluir un motivo de un conjunto cerrado y no revelar datos de otra JASS. Un fallo de infraestructura SHALL propagarse como error de la operación, nunca como `accepted` ni `rejected`, para que el cliente pueda reintentarla.

#### Scenario: Rechazo con motivo
- **WHEN** una operación nueva contiene un dato inválido
- **THEN** devuelve `rejected` con el motivo de la regla incumplida (por ejemplo `valor-invalido` o `reservorio-no-encontrado`)

#### Scenario: Fallo de infraestructura
- **WHEN** la persistencia falla durante una operación nueva
- **THEN** la operación termina con error, sin resultado `accepted` ni `rejected`

### Requirement: Atomicidad de la reserva y la escritura
La reserva de la operación, la escritura de la medición y el registro del resultado SHALL confirmarse en una sola unidad de trabajo, o no confirmarse en absoluto. Un rechazo o cualquier fallo SHALL revertir todo, incluida la reserva, de modo que un reintento posterior pueda aplicarse.

#### Scenario: Fallo entre la reserva y la escritura
- **WHEN** la escritura de la medición falla después de reservar el `operationId`
- **THEN** no queda reserva ni medición para esa operación, y un reintento con el mismo contenido devuelve `accepted`

#### Scenario: Fallo después de escribir la medición
- **WHEN** el registro del resultado falla después de escribir la medición
- **THEN** no queda medición ni reserva para esa operación

#### Scenario: Rechazo sin rastro
- **WHEN** una operación nueva devuelve `rejected`
- **THEN** no queda reserva ni medición, y un envío posterior con el mismo `operationId` y un contenido válido devuelve `accepted`

### Requirement: Envíos concurrentes de la misma operación
N envíos simultáneos de una operación con la misma JASS, el mismo `operationId` y el mismo contenido SHALL producir exactamente un `accepted` y N−1 `duplicate` con el mismo resultado. SHALL existir una sola medición. Si los contenidos difieren, exactamente uno SHALL resultar `accepted` y los demás `conflict` o `duplicate` según su hash.

#### Scenario: Diez envíos simultáneos idénticos
- **WHEN** se envían diez veces a la vez la misma operación con el mismo contenido
- **THEN** se obtienen un `accepted` y nueve `duplicate` con el mismo identificador de medición, y existe exactamente una medición

#### Scenario: Envíos simultáneos con contenido distinto
- **WHEN** se envían a la vez dos operaciones con el mismo `operationId` y valores distintos
- **THEN** una devuelve `accepted`, la otra devuelve `conflict` y existe exactamente una medición
