# Gestión de incidencias

## Purpose

Permitir a las familias y al personal registrar y seguir incidencias de servicio con acceso segregado por JASS y trazabilidad verificable.

## ADDED Requirements

### Requirement: Registro de incidencia
El sistema SHALL aceptar reportes autenticados con categoría, alcance reportado, descripción, fecha de observación y ubicación referencial, asociándolos al usuario y a la JASS de su membresía activa. SHALL aceptar las categorías fuga, interrupción, avería, presión, calidad observada y otra.

#### Scenario: Registro autorizado
- **WHEN** un asociado autenticado envía un reporte válido de fuga
- **THEN** se registra para su JASS y usuario, con identificador y fecha de recepción del servidor

#### Scenario: Solicitud inválida
- **WHEN** faltan campos obligatorios o la categoría no pertenece al catálogo
- **THEN** se rechaza el reporte sin crear incidencia ni reserva de operación

### Requirement: Alcance declarado
El alcance reportado SHALL ser obligatorio y aceptar solo individual, varias-viviendas, general o desconocido. El sistema SHALL conservarlo como declaración del reportante y SHALL NOT presentarlo como medición o afectación verificada.

#### Scenario: Valor inválido o ausente
- **WHEN** el alcance no pertenece al catálogo o se omite
- **THEN** se responde 422 y no se crea incidencia ni reserva

### Requirement: Acceso por recurso
El asociado SHALL consultar solo sus propias incidencias; personal autorizado SHALL consultar las de su JASS. El servidor SHALL derivar JASS y actor de la membresía, y SHALL responder igual para recurso inexistente y recurso ajeno.

#### Scenario: Solicitud entre JASS
- **WHEN** un usuario de una JASS consulta una incidencia de otra
- **THEN** recibe 403 sin información del recurso

#### Scenario: Reporte de otro asociado
- **WHEN** un asociado solicita el reporte de otro asociado de la misma JASS
- **THEN** recibe 403 sin información del recurso

### Requirement: Ciclo de atención
El sistema SHALL iniciar en registrada y admitir solo registrada → en-atencion, en-atencion → cerrada y cerrada → en-atencion. El cierre SHALL exigir acción y la reapertura SHALL exigir motivo; ambas SHALL conservar sus ciclos anteriores.

#### Scenario: Cierre trazable
- **WHEN** personal autorizado cierra una incidencia en atención con una acción realizada
- **THEN** se conserva la acción y la incidencia queda cerrada

#### Scenario: Transición inválida
- **WHEN** se intenta cerrar directamente una incidencia registrada
- **THEN** se rechaza la transición sin cambios

#### Scenario: Reapertura
- **WHEN** personal autorizado reabre una incidencia cerrada con motivo
- **THEN** pasa a en-atencion y conserva el cierre anterior y la fecha, actor y motivo de reapertura

### Requirement: Clasificación y responsable
Consejo y operador SHALL poder asignar un responsable personal activo de su JASS, registrar acciones y confirmar o corregir la prioridad sugerida; al corregirla SHALL indicar motivo. El tesorero SHALL tener acceso de solo lectura.

#### Scenario: Responsable de otra JASS
- **WHEN** se intenta asignar un responsable de otra JASS o inactivo
- **THEN** se rechaza la asignación sin modificar la incidencia

### Requirement: Sugerencia determinística y confirmación humana
El sistema SHALL evaluar la combinación exacta de categoría y alcance declarado con la configuración vigente de la JASS al crear el reporte y guardar sugerencia, regla y versión; la prioridad confirmada SHALL iniciar nula. Consejo u operador SHALL confirmar la sugerencia o elegir otra prioridad con motivo.

#### Scenario: Sugerencia sin confirmación
- **WHEN** un reporte coincide con una regla configurada de prioridad alta
- **THEN** la respuesta muestra sugerencia alta y prioridad confirmada nula hasta decisión humana

#### Scenario: Alcance individual predeterminado
- **WHEN** se reporta una interrupción individual con reglas por defecto
- **THEN** la sugerencia es media y la prioridad confirmada es nula

#### Scenario: Varias viviendas predeterminado
- **WHEN** se reporta una interrupción de varias-viviendas con reglas por defecto
- **THEN** la sugerencia es alta y la prioridad confirmada es nula

#### Scenario: Alcance general predeterminado
- **WHEN** se reporta una interrupción general con reglas por defecto
- **THEN** la sugerencia es alta y el alcance permanece identificado como declaración

#### Scenario: Alcance desconocido predeterminado
- **WHEN** se reporta una interrupción de alcance desconocido con reglas por defecto
- **THEN** la sugerencia es media y no se infiere un alcance verificado

#### Scenario: Corrección humana
- **WHEN** un operador sustituye la sugerencia alta por media con motivo
- **THEN** se conserva la sugerencia original y se registra prioridad media con actor, fecha y motivo

### Requirement: Reglas configurables por JASS
Solo consejo SHALL modificar la matriz completa de categoría y alcance a prioridad de su JASS. Sin configuración SHALL aplicarse la matriz por defecto del diseño; cada versión SHALL conservarse para explicar decisiones anteriores. Una actualización con versión desactualizada SHALL responder 409 sin cambios.

#### Scenario: Configuración aislada
- **WHEN** consejo cambia la regla de fuga individual para su JASS
- **THEN** solo las nuevas incidencias de esa JASS usan la nueva versión y las anteriores conservan su sugerencia

#### Scenario: Matriz incompleta
- **WHEN** consejo envía una matriz que omite una combinación o incluye una prioridad inválida
- **THEN** se rechaza con 422 y se mantiene la versión vigente

#### Scenario: Actualizaciones concurrentes de reglas
- **WHEN** dos solicitudes autorizadas actualizan la misma versión de reglas
- **THEN** solo una se confirma y la otra recibe 409

### Requirement: Historial auditable
El sistema SHALL registrar creación, clasificación, asignación, acciones y cambios de estado con actor y fecha, en la misma transacción que el cambio. El historial SHALL ser de solo inserción.

#### Scenario: Fallo de auditoría
- **WHEN** falla el registro del evento de una transición
- **THEN** se revierte la transición y no queda un cambio parcial

### Requirement: Creación idempotente
Cada creación SHALL requerir una clave UUID por JASS y actor. Un reenvío con igual clave y contenido SHALL devolver el resultado original; con contenido distinto SHALL devolver 409. La reserva y la creación SHALL ser atómicas y la reserva SHALL persistir mientras exista la incidencia.

#### Scenario: Reintentos concurrentes
- **WHEN** se envían simultáneamente diez creaciones idénticas con la misma clave
- **THEN** existe una sola incidencia y todos los resultados exitosos identifican esa incidencia

#### Scenario: Reutilización con contenido distinto
- **WHEN** se reutiliza una clave aceptada cambiando la descripción
- **THEN** se responde 409 sin alterar la incidencia original

#### Scenario: Reutilización con alcance diferente
- **WHEN** el mismo actor reenvía una creación aceptada con la misma clave pero cambia el alcance reportado
- **THEN** recibe 409 y no cambia la incidencia ni la sugerencia original

#### Scenario: Pérdida de respuesta
- **WHEN** la creación se confirma pero se pierde la respuesta y el actor reintenta con la misma clave
- **THEN** recibe el identificador y la respuesta original sin crear otra incidencia

#### Scenario: Reintento tras cambiar reglas
- **WHEN** el actor reintenta el contenido original después de que su JASS cambia la matriz
- **THEN** recibe la sugerencia y versión originales sin reevaluarlas ni crear otro reporte

### Requirement: Concurrencia de modificaciones
Toda modificación de incidencia SHALL exigir la revisión vigente y actualizarla atómicamente; si la revisión no coincide SHALL responder 409 sin escribir cambios ni auditoría de negocio.

#### Scenario: Actualizaciones simultáneas
- **WHEN** dos operadores actualizan la misma revisión
- **THEN** solo una operación se confirma y la otra recibe 409

### Requirement: Fotografía opcional protegida
El sistema SHALL permitir una fotografía opcional JPEG o PNG hasta 5 MiB, validar el contenido y proteger su lectura con los permisos del reporte. Solo el autor, consejo u operador SHALL poder adjuntar o sustituirla; la lectura SHALL evitar caché pública.

#### Scenario: Evidencia ajena
- **WHEN** un usuario solicita la fotografía de una incidencia que no puede consultar
- **THEN** se deniega el acceso sin revelar el archivo

#### Scenario: Archivo inválido
- **WHEN** se intenta adjuntar un archivo de formato no admitido o superior al límite configurado
- **THEN** se rechaza y no queda una evidencia accesible

#### Scenario: Reintento de foto
- **WHEN** se reenvía la misma foto con la misma clave idempotente tras perder la respuesta
- **THEN** se devuelve el resultado original sin duplicar ni sustituir una foto diferente

### Requirement: Privacidad e historial
El historial SHALL conservar cambios de estado, prioridad, responsable, acciones y evidencia con actor, fecha y valores pertinentes; SHALL excluir bytes de fotos, credenciales y tokens. La respuesta al asociado SHALL excluir notas internas y datos personales de otros asociados.

#### Scenario: Consulta de historial propio
- **WHEN** el asociado consulta su historial
- **THEN** recibe los eventos públicos de seguimiento sin notas internas ni secretos

### Requirement: Contrato REST
El sistema SHALL documentar en OpenAPI los métodos, entradas, salidas y errores de la API de incidencias, incluyendo autenticación y clave de idempotencia.

#### Scenario: Contrato y controlador
- **WHEN** se ejecuta la prueba de coherencia del contrato
- **THEN** las rutas de incidencias declaradas coinciden con las implementadas
