# Proposal

## Why

El dominio de medición (`s1a`) existe y está probado contra PostgreSQL, pero ninguna persona puede usarlo: no hay forma de dar de alta un reservorio, de registrar una lectura ni de consultar el historial desde una interfaz. Con `s1b` ya existen sesiones, perfiles y roles; este cambio conecta el dominio de medición a esa base y entrega el segundo flujo de valor: **el operador elige un reservorio de su JASS, registra una medición manual y la consulta en el historial, y el consejo la consulta**, con aislamiento verificado entre JASS.

Aporta a **C01–C02** (RF02, RF06, RF07, RF11 parcial llevados a especificaciones verificables), **C04** (cuarto cambio SDD), **C05** (pruebas de permisos y de aislamiento de mediciones: completa PT13), **C06/C07** (segundo flujo E2E y segunda pantalla) y **C14** (migración `0003`).

## What Changes

- **Reservorios (RF02).** El consejo crea reservorios de su JASS; todo el personal los lista. El nombre es único dentro de la JASS.
- **Mediciones en línea (RF06, RF07, RF11).** `POST /v1/mediciones` reutiliza `RegistrarMedicion` con la JASS y el autor tomados de la membresía; el `Idempotency-Key` es el `operationId`. `GET /v1/reservorios/:id/mediciones` devuelve el historial del reservorio. `GET /v1/mediciones/catalogo` expone los métodos del catálogo (provisional) y la unidad.
- **Permisos (matriz de actores).** Registrar: `operador`. Consultar el historial: `operador`, `tesorero` y `consejo`. El perfil `asociado` no accede a mediciones. Crear reservorios: `consejo`. Todo se verifica en el servidor y por JASS.
- **Interfaz.** Pantalla *Mediciones* para el personal: elegir reservorio, registrar la lectura (método, valor en mg/L, fecha y hora de la toma) y ver el historial; el consejo además gestiona reservorios. Cada pantalla recuerda que SIJASS no dictamina la calidad del agua.
- **Esquema.** Migración `0003`: nombre de reservorio único por JASS y acotado.
- **Documentación.** Plan de pruebas (PT13 completo para mediciones y reservorios), matriz C01–C16 y roadmap.

Fuera de alcance: correcciones y anulaciones (RF08), advertencias determinísticas (RF15), evidencia fotográfica, operación sin conexión y sincronización, auditoría de las mediciones (la unidad de trabajo de mediciones y la de acceso son distintas; se resuelve junto con RF08), paginación del historial más allá de un límite, localidades.

## Capabilities

### New Capabilities
- `reservorios-jass`: alta y consulta de reservorios de una JASS.
- `mediciones-en-linea`: registro y consulta de mediciones manuales por HTTP e interfaz, con permisos y aislamiento.

### Modified Capabilities
<!-- Ninguna: medicion-cloro, registro-idempotente y persistencia-mediciones no cambian. -->

## Impact

- **Código:** `tecnologia/siJASS-clean-architecture/` (permisos, casos de uso, repositorio de reservorios, controladores, migración `0003`), `tecnologia/sijass-web/` (pantalla), `tecnologia/e2e/` (flujo nuevo).
- **Dependencias:** ninguna nueva.
- **Riesgos:** (1) las mediciones no se auditan todavía; se documenta. (2) El catálogo de métodos es provisional. (3) El historial se limita a las 200 mediciones más recientes por consulta.
