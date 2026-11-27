# Interfaz de incidencias

## ADDED Requirements

### Requirement: Reporte del asociado en tres pasos
El portal SHALL permitir al asociado reportar un problema eligiendo qué pasa (fuga, no hay agua, agua turbia, poca presión, algo roto, otro o reclamo), a quiénes afecta (solo mi casa, varias casas, toda la zona, no sé) y escribiendo dónde y qué vio, con frases sugeridas y una foto opcional. SHALL enviar el reporte con una clave de idempotencia y, si la foto falla, conservar el reporte y avisarlo.

#### Scenario: Reporte enviado
- **WHEN** el asociado completa los tres pasos y envía
- **THEN** ve la confirmación y el reporte aparece en «Mis reportes» como «Enviado»

#### Scenario: Falta el detalle
- **WHEN** intenta enviar sin escribir dónde o qué vio
- **THEN** la pantalla lo indica y no envía nada

### Requirement: Seguimiento del asociado
El portal SHALL mostrar los reportes del asociado con su avance (enviado, en atención, atendido) y su historial público, sin prioridad, responsable ni notas internas.

#### Scenario: Reporte atendido
- **WHEN** la JASS cierra un reporte con una acción
- **THEN** el asociado ve el avance «Atendido» y la acción en el historial

### Requirement: Bandeja y ficha del personal
El panel SHALL ofrecer a todo el personal una sección «Reportes» con la bandeja filtrable por estado y la ficha de cada reporte con quién reportó, alcance declarado, prioridad sugerida e historial. Consejo y Operación SHALL poder empezar la atención, confirmar o cambiar la prioridad con motivo, anotar acciones públicas o internas, cerrar con la acción y reabrir con motivo; solo el Consejo SHALL elegir responsable. Tesorería SHALL verla en solo lectura.

#### Scenario: Atención completa
- **WHEN** Operación empieza la atención, anota una acción y cierra el reporte
- **THEN** la ficha muestra cada paso en el historial y el estado «Cerrada»

#### Scenario: Revisión desactualizada
- **WHEN** otra persona modificó el reporte antes de guardar
- **THEN** la ficha lo informa, recarga el reporte y conserva lo escrito

#### Scenario: Tesorería
- **WHEN** Tesorería abre un reporte
- **THEN** no ve botones de atención y se le indica que solo puede consultar
