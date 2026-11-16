# medicion-cloro Specification

## Purpose

Registra de forma manual y trazable la lectura de cloro residual que el operador obtuvo en campo, con JASS, autor, método y horas de toma y de recepción, y rechaza de forma determinística los datos estructuralmente inválidos. SIJASS registra la lectura; no la mide, no la estima a partir de imágenes ni la certifica.

## Requirements

### Requirement: Contrato de la medición manual
Toda medición registrada SHALL contener identificador, JASS, reservorio, método, valor, unidad, hora de toma, hora de recepción, autor, origen (`en-linea` o `sincronizada`), estado y revisión, y SHALL admitir un identificador de evidencia opcional. Toda medición nueva SHALL quedar con estado `vigente` y revisión 1. Ninguna medición SHALL contener campos de estimación automática (confianza, confirmación ni identificador de modelo).

#### Scenario: Medición aceptada con todos sus campos
- **WHEN** un actor registra un comando válido con reservorio, método, valor, unidad y hora de toma
- **THEN** la medición resultante contiene todos los campos del contrato, con estado `vigente` y revisión 1

#### Scenario: Sin campos de estimación automática
- **WHEN** se lee cualquier medición registrada
- **THEN** no contiene `confianza`, `confirmada` ni `modeloId`, y ningún campo indica que el valor fue estimado por IA

#### Scenario: Campo obligatorio ausente
- **WHEN** el comando omite el valor, la unidad, el método, la hora de toma o el reservorio
- **THEN** la medición se rechaza con el motivo de la regla correspondiente a ese campo y no se registra

#### Scenario: Comando con campos fuera de su contrato
- **WHEN** el comando incluye un campo que no le pertenece (por ejemplo `jassId`, `registradoPor`, `registradaEn`, `estado`, `revision` o `confianza`)
- **THEN** la medición se rechaza con motivo `campo-no-permitido` y no se registra

### Requirement: Evidencia fotográfica opcional sin estimación
El identificador de evidencia SHALL ser opcional y, cuando exista, SHALL ser un UUID. La presencia de evidencia SHALL NOT alterar ni sustituir el valor ingresado por el operador.

#### Scenario: Registro con evidencia
- **WHEN** se registra un comando válido con un `evidenciaId` UUID
- **THEN** la medición conserva ese identificador y su valor es exactamente el ingresado por el operador

#### Scenario: Registro sin evidencia
- **WHEN** se registra un comando válido sin `evidenciaId`
- **THEN** la medición se acepta sin identificador de evidencia

#### Scenario: Identificador de evidencia malformado
- **WHEN** el `evidenciaId` no es un UUID
- **THEN** la medición se rechaza con motivo `identificador-invalido`

### Requirement: Datos de trazabilidad fijados por el servidor
La JASS y el autor de la medición SHALL tomarse del contexto del actor que provee el servidor. La hora de recepción SHALL fijarla el reloj del servidor, en UTC. El identificador de la medición SHALL asignarlo el servidor. El origen lo determina el canal de entrada del servidor. El comando del cliente SHALL NOT poder fijar ninguno de esos datos.

#### Scenario: JASS y autor tomados del contexto
- **WHEN** el usuario U de la JASS A registra una medición válida
- **THEN** la medición queda con `jassId` = A y `registradoPor` = U

#### Scenario: Hora de recepción del servidor
- **WHEN** el reloj del servidor marca el instante T al recibir el comando
- **THEN** `registradaEn` es T expresado en UTC, con independencia de la hora declarada por el dispositivo

#### Scenario: Identificador asignado por el servidor
- **WHEN** se aceptan dos comandos válidos distintos
- **THEN** cada medición recibe un identificador UUID distinto asignado por el servidor

### Requirement: Valor finito y no negativo
El valor de la lectura SHALL ser un número finito mayor o igual que cero. En caso contrario, la medición SHALL rechazarse con motivo `valor-invalido` y no registrarse.

#### Scenario: Valor negativo
- **WHEN** el valor es `-0.1`
- **THEN** la medición se rechaza con motivo `valor-invalido`

#### Scenario: Valor no finito o no numérico
- **WHEN** el valor es `NaN`, `Infinity`, `-Infinity` o un texto
- **THEN** la medición se rechaza con motivo `valor-invalido`

#### Scenario: Valor cero
- **WHEN** el valor es `0` o `-0`
- **THEN** la medición se acepta y su valor registrado es `0`

### Requirement: Unidad y método del catálogo
La unidad SHALL ser `mg/L`. El método SHALL pertenecer al catálogo de métodos de medición, que en este cambio contiene `comparador-dpd` y `colorimetro` de forma provisional, pendiente de validación con las JASS piloto. Una unidad o un método fuera de catálogo SHALL rechazarse.

#### Scenario: Unidad fuera de catálogo
- **WHEN** la unidad es `ppm` o `mg/l`
- **THEN** la medición se rechaza con motivo `unidad-invalida`

#### Scenario: Método fuera de catálogo
- **WHEN** el método es `estimacion-imagen` o cualquier código ausente del catálogo
- **THEN** la medición se rechaza con motivo `metodo-desconocido`

#### Scenario: Métodos del catálogo
- **WHEN** el método es `comparador-dpd` o `colorimetro` y el resto del comando es válido
- **THEN** la medición se acepta con ese método

### Requirement: Hora de toma con zona horaria explícita
La hora de toma SHALL expresarse en ISO 8601 con fecha, hora y desplazamiento de zona explícito (`Z` o `±hh:mm`), en un día de calendario existente y con precisión no mayor que milisegundos. Una fecha válida SHALL conservarse como el mismo instante, normalizado a UTC.

#### Scenario: Hora sin zona horaria
- **WHEN** la hora de toma es `2026-10-12T08:00:00`
- **THEN** la medición se rechaza con motivo `fecha-invalida`

#### Scenario: Día de calendario inexistente
- **WHEN** la hora de toma es `2026-02-30T08:00:00Z`
- **THEN** la medición se rechaza con motivo `fecha-invalida`

#### Scenario: Formato incompleto o fuera de rango
- **WHEN** la hora de toma es `2026-10-12`, `2026-10-12 08:00:00Z`, `2026-10-12T24:00:00Z` o `2026-10-12T08:00:00.123456Z`
- **THEN** la medición se rechaza con motivo `fecha-invalida`

#### Scenario: Hora con desplazamiento local
- **WHEN** la hora de toma es `2026-10-12T08:00:00-05:00`
- **THEN** la medición se acepta y su hora de toma es `2026-10-12T13:00:00.000Z`

### Requirement: Toma no posterior a la recepción
La hora de toma SHALL NOT ser posterior a la hora de recepción más una tolerancia configurable, cuyo valor por defecto es de cinco minutos, para absorber el desfase del reloj del dispositivo. Una toma anterior a la recepción SHALL aceptarse sin advertencia en este cambio.

#### Scenario: Toma en el límite de la tolerancia
- **WHEN** la hora de toma es exactamente la hora de recepción más cinco minutos
- **THEN** la medición se acepta

#### Scenario: Toma posterior a la tolerancia
- **WHEN** la hora de toma supera en un milisegundo la hora de recepción más cinco minutos
- **THEN** la medición se rechaza con motivo `toma-posterior-a-recepcion`

#### Scenario: Tolerancia configurada
- **WHEN** la tolerancia se configura en cero y la hora de toma es un milisegundo posterior a la recepción
- **THEN** la medición se rechaza con motivo `toma-posterior-a-recepcion`

#### Scenario: Toma antigua
- **WHEN** la hora de toma es varios días anterior a la recepción
- **THEN** la medición se acepta sin advertencia, porque las advertencias de coherencia temporal (RF15) no forman parte de este cambio

### Requirement: Reservorio de la JASS del actor
El reservorio SHALL existir y pertenecer a la JASS del actor. Un reservorio inexistente o de otra JASS SHALL rechazarse con el mismo motivo, `reservorio-no-encontrado`, para no revelar la existencia de reservorios ajenos. Un identificador de reservorio que no sea UUID SHALL rechazarse con motivo `identificador-invalido`.

#### Scenario: Reservorio de otra JASS
- **WHEN** un actor de la JASS A registra una medición sobre un reservorio de la JASS B
- **THEN** la medición se rechaza con motivo `reservorio-no-encontrado` y no se registra nada

#### Scenario: Reservorio inexistente
- **WHEN** el reservorio no existe en ninguna JASS
- **THEN** la medición se rechaza con el mismo motivo `reservorio-no-encontrado`

#### Scenario: Reservorio propio
- **WHEN** el reservorio pertenece a la JASS del actor y el resto del comando es válido
- **THEN** la medición se acepta

### Requirement: Recuperación dentro de la JASS
Una medición aceptada SHALL poder recuperarse por su identificador dentro de su JASS, con todos sus campos tal como se registraron, incluidos la JASS y el autor.

#### Scenario: Registrar y recuperar
- **WHEN** un actor de la JASS A registra una medición y luego se consulta por su identificador en la JASS A
- **THEN** se obtiene la misma medición, con su JASS, su autor, su método, su valor y sus horas de toma y de recepción
