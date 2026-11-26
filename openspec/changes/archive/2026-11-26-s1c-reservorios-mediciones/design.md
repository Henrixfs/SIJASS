# Design

## Context

Estado observado al 2026-11-19 (rama `feat/s1c-reservorios-mediciones`, sobre `feat/s1b-acceso-cuotas-pagos`):

- `RegistrarMedicion` (s1a) recibe un `ContextoActor { jassId, usuarioId }` y una `UnidadDeTrabajo` propia de mediciones (memoria y PostgreSQL). Devuelve `accepted | duplicate | conflict | rejected`; un dato inválido es `rejected` con motivo, no una excepción. Los campos no admitidos en el comando dan `campo-no-permitido`.
- `RepositorioMediciones.listar(jassId, { reservorioId })` ordena por toma descendente y por `id`; no tiene límite.
- `RepositorioReservorios` solo tiene `existeEnJass`. La tabla `reservorio(id, jass_id, nombre)` existe desde `0001`; no hay alta ni listado, ni unicidad de nombre.
- s1b aporta sesiones, membresías con rol (`operador` ya existe), guardia que construye el `ContextoAcceso` en cada solicitud, filtro de errores que audita cada `403` y la interfaz con pestañas por rol.
- Las unidades de trabajo de acceso (s1b) y de mediciones (s1a) son distintas por diseño (diseño interno §1: un módulo no escribe tablas de otro).

## Goals / Non-Goals

**Goals:**
- Reutilizar `RegistrarMedicion` sin modificar el dominio ni sus especificaciones.
- Permisos por rol en el servidor y aislamiento por JASS en cada consulta; un reservorio ajeno e inexistente son indistinguibles.
- Un flujo E2E: operador registra, consejo consulta, consejo de otra JASS no ve nada.

**Non-Goals:** ver *What Changes → Fuera de alcance* de la propuesta.

## Decisions

**D1 — Reservorios en el módulo de acceso.** Se añade `reservorios` a `RepositoriosAcceso` (módulo `organizacion` comparte unidad de trabajo con `identidad`, como ya hace `jass`): `crear`, `listar(jassId)` y `existeEnJass`. Los casos `CrearReservorio` y `ListarReservorios` escriben la auditoría de alta (`reservorio.creado`) en la misma transacción. El adaptador de mediciones sigue usando su propio `RepositorioReservorios.existeEnJass` sobre la misma tabla; en PostgreSQL ambos ven los mismos datos.

**D2 — Permisos nuevos.** `reservorios.leer` y `mediciones.leer`: `consejo`, `tesorero`, `operador`. `reservorios.crear`: `consejo`. `mediciones.registrar`: `operador`. El perfil `asociado` no tiene ninguno. El operador **lee todo el historial de su JASS** (la matriz dice «propias» para *corregir*, que es RF08 y queda fuera).

**D3 — Casos de uso de la capa de aplicación.** `RegistrarMedicionAutorizada` exige `mediciones.registrar`, valida el `Idempotency-Key`, construye el comando con `{ ...cuerpo, operationId }` (así los campos extra llegan al dominio y se rechazan allí) y delega en `RegistrarMedicion` con `{ jassId, usuarioId }` de la membresía. `ConsultarHistorial` exige `mediciones.leer`, comprueba que el reservorio pertenece a la JASS (`existeEnJass`, si no `ErrorAccesoDenegado('recurso-ajeno')`) y devuelve las 200 más recientes. El límite se aplica en el caso de uso (el puerto no cambia); el costo es leer todas las filas de un reservorio, aceptable ahora y a medir en `s1e`.

**D4 — HTTP.** `POST /v1/reservorios`, `GET /v1/reservorios`, `POST /v1/mediciones` (`Idempotency-Key` = `operationId`), `GET /v1/reservorios/:id/mediciones` y `GET /v1/mediciones/catalogo`. Mapeo de resultados: `accepted` 201, `duplicate` 200, `conflict` 409, `rejected` 422 con `{ codigo: motivo }`. La respuesta del historial incluye `registradoPor` (identificador de cuenta) y no nombres de personas.

**D5 — Migración `0003`.** `UNIQUE` sobre `(jass_id, lower(nombre))` mediante índice único de expresión y `CHECK (length(btrim(nombre)) BETWEEN 1 AND 80)`. Reversible. Los nombres de las filas ya existentes en pruebas de `s1a` son `reservorio-<uuid>` (≤ 80 caracteres) y distintos, por lo que no chocan.

**D6 — Interfaz.** Pestaña *Mediciones* para todo el personal; las pestañas *Asociados* y *Cuotas* solo para `tesorero` y `consejo` (el `operador` entra directo a *Mediciones*). Formulario del operador: reservorio, método (del catálogo), valor (acepta coma o punto), fecha y hora de la toma (`datetime-local`, interpretada en hora de Lima, UTC-5, y enviada con desplazamiento explícito). El `Idempotency-Key` se regenera al cambiar el contenido y se conserva en reintentos, como en pagos. Aviso fijo: «SIJASS registra la lectura tomada en campo; no dictamina la calidad del agua ni indica dosis».

**D7 — Pruebas.** Unitarias de permisos y de la conversión de hora y valor; integración por HTTP sobre PostgreSQL con una matriz de aislamiento ampliada (se añaden `operadorB` y `consejoB` al escenario de pruebas); contrato de `ListarReservorios`/`CrearReservorio` en memoria y PostgreSQL; E2E del flujo. Las mediciones en memoria no se mezclan con el almacén de acceso: las pruebas de mediciones por HTTP usan PostgreSQL.

## Risks / Trade-offs

- **Sin auditoría de mediciones:** quién registró queda en `registrado_por`, pero no hay evento de auditoría; se resuelve con RF08. Los `403` sí se auditan.
- **Historial con tope de 200:** un reservorio con más lecturas no muestra las antiguas; sin filtros ni paginación todavía.
- **Catálogo provisional:** el selector de método refleja el catálogo del dominio, pendiente de validar con las JASS piloto.
- **Hora de Lima fija (UTC-5):** correcta para el Perú; el dominio normaliza a UTC.

## Migration Plan

Aditiva y reversible (`0003`). Sin datos de producción.

## Open Questions

- ¿El operador debe ver solo sus propias mediciones? Se asumió ver todas las de su JASS (D2).
- ¿Localidades de los reservorios (RF02)? Fuera de este cambio.
