# cuotas-y-pagos Specification

## Purpose
Administra el padrón de asociados, genera cuotas por periodo, registra pagos en línea de forma idempotente con reversa compensatoria y calcula el saldo de cada asociado (RF03, RF04, RF05, ADR-013).

## Requirements

### Requirement: Padrón con baja lógica
El sistema SHALL registrar asociados con nombre completo y documento de identidad únicos dentro de su JASS, SHALL dar de baja sin borrado físico y SHALL impedir nuevas cuotas y pagos a un asociado dado de baja.

#### Scenario: Alta de asociado
- **WHEN** el tesorero registra un asociado con nombre y documento válidos
- **THEN** queda activo en la JASS del tesorero y se registra un evento de auditoría

#### Scenario: Documento repetido
- **WHEN** se registra otro asociado con el mismo documento en la misma JASS
- **THEN** la respuesta es `409` y el padrón no cambia; el mismo documento en otra JASS sí se admite

#### Scenario: Baja lógica
- **WHEN** se da de baja a un asociado
- **THEN** su estado es `baja`, sus cuotas y pagos se conservan y no se le pueden generar cuotas nuevas ni registrar pagos

### Requirement: Generación de cuotas por periodo
El sistema SHALL generar una cuota por asociado activo para un periodo `AAAA-MM` con un importe entero positivo en céntimos, SHALL ser idempotente por (asociado, periodo) y SHALL informar cuántas cuotas creó y cuántas ya existían.

#### Scenario: Generación inicial
- **WHEN** se generan las cuotas de `2026-11` con importe 1500 para 3 asociados activos
- **THEN** se crean 3 cuotas de 1500 céntimos y se registra un evento de auditoría

#### Scenario: Regeneración
- **WHEN** se repite la generación del mismo periodo
- **THEN** se crean 0 cuotas, se informan 3 existentes y los importes no cambian

#### Scenario: Importe inválido
- **WHEN** el importe es cero, negativo, decimal o no numérico, o el periodo no cumple `AAAA-MM`
- **THEN** la respuesta es `422` y no se crea ninguna cuota

### Requirement: Pago en línea con comprobante e idempotencia
El sistema SHALL registrar un pago contra una cuota con importe entero positivo en céntimos, un comprobante de texto obligatorio y el encabezado `Idempotency-Key` (UUID) obligatorio. La clave SHALL ser única por JASS. El importe SHALL NOT superar el saldo pendiente de la cuota. El pago y su evento de auditoría SHALL confirmarse en una sola transacción.

#### Scenario: Pago correcto
- **WHEN** el tesorero registra 500 céntimos sobre una cuota pendiente de 1500, con comprobante y clave
- **THEN** el pago queda vigente, el saldo pendiente de la cuota es 1000 y existe un evento de auditoría

#### Scenario: Reintento con la misma clave y el mismo contenido
- **WHEN** se reenvía el mismo pago con la misma clave
- **THEN** la respuesta devuelve el pago original (`200`) y no se crea otro

#### Scenario: Misma clave con contenido distinto
- **WHEN** se envía la misma clave con otro importe o comprobante
- **THEN** la respuesta es `409` y el pago original no cambia

#### Scenario: Reintentos concurrentes
- **WHEN** diez solicitudes idénticas con la misma clave llegan simultáneamente
- **THEN** existe exactamente un pago

#### Scenario: Sobrepago
- **WHEN** el importe supera el saldo pendiente de la cuota
- **THEN** la respuesta es `422` y no se crea ningún pago

#### Scenario: Falta la clave, el comprobante o el importe es inválido
- **WHEN** falta `Idempotency-Key`, falta el comprobante, o el importe no es un entero positivo
- **THEN** la respuesta es `422` y no se crea ningún pago

#### Scenario: Cuota de otra JASS o de asociado dado de baja
- **WHEN** se registra un pago sobre una cuota que no pertenece a la JASS del solicitante o cuyo asociado está de baja
- **THEN** la respuesta es `403` en el primer caso y `409` en el segundo, y no se crea ningún pago

#### Scenario: Atomicidad
- **WHEN** falla la escritura del evento de auditoría durante el registro de un pago
- **THEN** el pago no queda guardado

### Requirement: Reversa compensatoria
El sistema SHALL reversar un pago vigente con un motivo obligatorio, SHALL marcarlo como `revertido` sin borrarlo, SHALL registrar la reversa con su actor y fecha y SHALL rechazar reversar un pago ya revertido.

#### Scenario: Reversa correcta
- **WHEN** el tesorero reversa un pago vigente de 500 con motivo
- **THEN** el pago pasa a `revertido`, existe una reversa con motivo, actor y fecha, y el saldo pendiente de la cuota vuelve a aumentar en 500

#### Scenario: Doble reversa
- **WHEN** se reversa un pago ya revertido
- **THEN** la respuesta es `409` y no se crea otra reversa

#### Scenario: Reversa sin motivo
- **WHEN** el motivo está vacío
- **THEN** la respuesta es `422` y el pago sigue vigente

### Requirement: Saldo del asociado
El sistema SHALL calcular el saldo de un asociado como la suma de sus cuotas exigibles menos la suma de sus pagos no revertidos, donde una cuota es exigible si su periodo es igual o anterior al periodo actual del reloj del servidor. El saldo SHALL expresarse en céntimos y ser positivo cuando el asociado debe.

#### Scenario: Saldo con cuota exigible y futura
- **WHEN** un asociado tiene cuotas de 1500 en el periodo actual y en el siguiente y un pago vigente de 500
- **THEN** su saldo es 1000

#### Scenario: Pago revertido no cuenta
- **WHEN** el único pago de un asociado se reversa
- **THEN** su saldo vuelve al importe de sus cuotas exigibles

#### Scenario: Estado de la cuota
- **WHEN** se consulta una cuota
- **THEN** su estado es `pendiente` sin pagos vigentes, `parcial` con pagos que no la cubren y `pagada` si los pagos vigentes suman su importe
