# Design

## Context

La rama s1e acumula acceso por membresía, auditoría de solo inserción y patrones transaccionales PostgreSQL. El contrato de idempotencia existente se limita a mediciones; no debe extenderse implícitamente. Véase proposal.md.

## Goals / Non-Goals

**Goals:** API aislada por JASS, historial auditable y creación segura ante reintentos; integración en el monolito existente.

**Non-Goals:** interfaz, PWA, entrega garantizada offline, notificaciones, IA y panel municipal.

## Decisions

1. Conservar capas de dominio, aplicación, API y adaptadores PostgreSQL. Alternativa: servicio independiente; se descarta por costo operativo y ausencia de necesidad demostrada.
2. Nueva tabla de incidencias con claves compuestas por JASS y referencias validadas, más historial append-only. Actor y JASS proceden del contexto autenticado; control fino en casos de uso y repositorios. Asociado solo consulta sus propios reportes; consejo y operador gestionan; tesorero consulta. Esta matriz es una propuesta para revisión.
3. Crear reserva de idempotencia específica, por JASS y actor, con UUID y hash canónico calculado en servidor, en la misma transacción que incidencia e historial. No reutilizar sin cambio la reserva de mediciones, porque su contrato y tipo están acotados.
4. Una fotografía JPEG o PNG de hasta 5 MiB por incidencia, en una tabla PostgreSQL privada con metadatos y bytes; validar contenido real, no solo extensión. Se evita un servicio adicional y se integra la escritura transaccional. Controlar crecimiento y respaldo; alternativa de almacenamiento de objetos se pospone.
5. La sugerencia es distinta de la prioridad confirmada, que comienza nula. Se conserva regla y versión aplicada; reglas nuevas no recalculan reportes anteriores. Ninguna regla realiza diagnóstico sanitario ni cierra incidencias.
6. Toda escritura distinta de creación usa revisión optimista y transacción. La carga de foto requiere clave idempotente propia; misma clave y bytes devuelve resultado original, otra carga con esa clave da 409. Se validan MIME y firma, límite 5 MiB y se eliminan metadatos EXIF antes de guardar. No se habilita borrado en este cambio; retención y supresión conforme política deben aprobarse antes del piloto.

## Matriz de permisos propuesta

| Operación | Asociado | Consejo | Operador | Tesorero |
|---|---|---|---|---|
| Crear reporte | Propio | No | No | No |
| Consultar lista, detalle, foto e historial público | Propios | JASS | JASS | JASS |
| Adjuntar o sustituir foto | Propio | JASS | JASS | No |
| Iniciar, cerrar, reabrir, asignar, registrar acción y confirmar prioridad | No | JASS | JASS | No |
| Consultar historial interno | No | JASS | JASS | JASS |
| Consultar reglas | No | JASS | JASS | JASS |
| Modificar reglas | No | JASS | No | No |

El responsable debe tener membresía personal activa de la misma JASS. Si se desactiva después de asignado, se conserva el histórico y se muestra como inactivo; no se reasigna automáticamente. Acciones internas no aparecen al asociado; cierre y cambios de estado son públicos.

## Reglas de prioridad propuestas

El alcance es una declaración del reportante, no una medición verificada ni un diagnóstico sanitario. El campo obligatorio `alcanceReportado` admite `individual`, `varias-viviendas`, `general` o `desconocido`; se conserva inmutable como parte del contenido original. Una matriz versionada por JASS combina exactamente categoría y alcance. La matriz predeterminada versión 0 es:

| Categoría | individual | varias-viviendas | general | desconocido |
|---|---|---|---|---|
| fuga | media | alta | alta | media |
| interrupción | media | alta | alta | media |
| avería | media | media | alta | media |
| presión | baja | media | alta | media |
| calidad observada | media | alta | alta | media |
| otra | baja | media | alta | baja |

Son valores iniciales de organización del trabajo, no umbrales sanitarios validados. Consejo puede reemplazar la matriz completa de 24 combinaciones con valores baja, media o alta; faltantes, duplicados y valores ajenos al catálogo se rechazan. La regla aplicada es `categoria:<valor>/alcance:<valor>` y se conserva con su versión y sugerencia, sin recalcular incidencias anteriores. La actualización es atómica con control de versión y auditoría; una versión obsoleta recibe 409. Si no existe configuración se usa la matriz versión 0. Confirmar o corregir la prioridad es una decisión humana auditada.

## Contrato REST propuesto

Todas las rutas requieren Bearer; JASS y actor provienen exclusivamente de la sesión. Los objetos de respuesta exponen `id`, `categoria`, `alcanceReportado`, `descripcion`, `observadaEn`, `ubicacion`, `estado`, `sugerencia` (prioridad, regla y versión), `prioridadConfirmada` nullable, `responsableId` nullable, `creadaEn` y `revision`. No aceptar `jassId`, actor ni hash del cliente. Fechas ISO 8601 con zona; descripción y ubicación recortadas, no vacías, de hasta 2000 y 300 caracteres.

| Método y ruta | Entrada | Éxito |
|---|---|---|
| POST `/v1/incidencias` | `Idempotency-Key: UUID`; JSON `categoria`, `alcanceReportado`, `descripcion`, `observadaEn`, `ubicacion` | 201 con objeto; 200 y mismo objeto original si es reintento |
| GET `/v1/incidencias` | `desde`, `hasta` opcionales ISO; `estado`, `categoria` opcionales; `limite` 1–100 (20 por defecto), `cursor` opaco | 200 `{ incidencias, siguienteCursor }`; filtrar por permisos antes de paginar |
| GET `/v1/incidencias/{id}` | UUID | 200 con objeto |
| GET `/v1/incidencias/{id}/historial` | `limite`, `cursor` como listado | 200 `{ eventos, siguienteCursor }`; visibilidad según rol |
| POST `/v1/incidencias/{id}/estado` | JSON `revision`, `estado`, `detalle` (cierre o reapertura) | 200 objeto actualizado |
| POST `/v1/incidencias/{id}/prioridad` | JSON `revision`, `prioridad`, `motivo` (obligatorio al diferir de sugerencia) | 200 objeto actualizado |
| POST `/v1/incidencias/{id}/responsable` | JSON `revision`, `responsableId` UUID o null para desasignar | 200 objeto actualizado |
| POST `/v1/incidencias/{id}/acciones` | JSON `revision`, `descripcion`, `visibilidad` (`publica` o `interna`) | 200 objeto actualizado |
| PUT `/v1/incidencias/{id}/foto` | `Idempotency-Key`, `If-Match` con revisión; cuerpo binario JPEG o PNG | 200 metadatos y revisión; mismo resultado ante reintento idéntico |
| GET `/v1/incidencias/{id}/foto` | UUID | 200 bytes con tipo validado y `Cache-Control: no-store` |
| GET `/v1/incidencias/reglas-prioridad` | Sin cuerpo | 200 `{ version, reglas }` |
| PUT `/v1/incidencias/reglas-prioridad` | JSON `version`, `reglas` con las 24 combinaciones de categoría y alcance | 200 nueva versión; 409 si versión desactualizada |

El hash canónico de creación incluye el alcance reportado; el mismo actor con la misma clave y distinto alcance recibe 409, y el mismo contenido reintentado tras un cambio de reglas devuelve el resultado original sin reevaluarlo. La identidad de la regla contiene categoría, alcance y versión. Errores: 400 JSON malformado, 401 credenciales ausentes o inválidas, 403 permiso denegado o recurso ajeno/inexistente, 409 conflicto de clave, revisión o transición, 413 cuerpo excesivo, 415 tipo no admitido, 422 datos o campos inválidos y 500 error interno sin detalles sensibles. Rechazos de validación no reservan claves; errores de infraestructura revierten transacción. La prioridad humana y el historial se auditan en la misma transacción.

## Risks / Trade-offs

- [Fotos en base incrementan almacenamiento y respaldo] → límites, medición y política de retención acordada antes del piloto.
- [Roles y flujo son supuestos de producto] → aprobación explícita antes de implementar.
- [Cambios de rama aún no integrados] → resolver orden de PR y revalidar antes de aplicar.
- [Conflictos entre operación y evidencia] → carga independiente autenticada y transaccional, con reintentos seguros definidos en contrato.

## Migration Plan

Migración aditiva y pruebas en base desechable. Antes de producción, respaldo y restauración ensayados. La reversión tras recibir datos requiere respaldo y autorización; no borrar información de incidencias como rollback automático.

## Decisiones aprobadas (2026-11-26)

El usuario aprobó en el chat, el 2026-11-26, las reglas resumidas así: solo el asociado crea y ve los suyos; Consejo y Operación asignan, confirman o corrigen la prioridad con motivo, anotan acciones, cierran con acción y reabren con motivo; Tesorería solo consulta; solo el Consejo cambia la matriz de prioridad; ciclo `registrada → en-atencion → cerrada → en-atencion` y una cerrada solo se reabre; foto opcional JPEG o PNG de hasta 5 MiB sin metadatos y sin borrado; el asociado no ve prioridad, responsable ni notas internas. Para implementarlas se precisa:

1. **Reserva idempotente en la propia fila.** La clave UUID y el hash canónico de la creación se guardan en la incidencia, con un índice único por JASS, autor y clave: reserva y creación son una sola inserción atómica y la reserva dura lo mismo que la incidencia. Un rechazo de validación no inserta nada y no reserva la clave. La foto usa su propia tabla de operaciones con la misma regla.
2. **Una incidencia cerrada solo admite reapertura.** Prioridad, responsable, acciones y foto responden `409 incidencia-cerrada`.
3. **Historial del asociado.** Ve la creación, los cambios de estado, el cierre con la acción, la reapertura con su motivo y las acciones públicas. Prioridad, responsable, acciones internas y cambios de foto quedan para el personal.
4. **Orden y paginación.** El listado va de la más reciente a la más antigua y filtra por fecha de recepción, estado y categoría; el historial va en orden cronológico. Ambos usan cursor opaco.
5. **Fecha de observación.** ISO 8601 con zona y no posterior a la recepción más cinco minutos.
6. **Responsable.** Cuenta activa con membresía de personal activa en la misma JASS; `null` lo desasigna.
7. **Foto.** Se comprueba la firma real (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`) y se quitan los segmentos `APP1` de un JPEG y los fragmentos `eXIf`, `tEXt`, `iTXt` y `zTXt` de un PNG antes de guardar.
8. **Sección 5 de tareas.** Cierra el Sprint 0 y no depende de este cambio: queda fuera de esta implementación.
9. **Límites, retención y recuperación de la foto.** Una foto por incidencia, de hasta 5 MiB, guardada sin metadatos en `incidencia_foto` (PostgreSQL) junto con su SHA-256. Viaja en el mismo respaldo de la base (`pg_dump`) y se recupera al restaurarlo; se comprobó en una base desechable. No hay borrado en este cambio: se conserva mientras exista la incidencia, hasta que se apruebe una política de retención antes del piloto. Si la escritura falla, la transacción se revierte y no queda ni la foto ni su reserva.
