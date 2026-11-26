# Proposal

## Why

Las familias carecen de un canal de incidencias trazable y la JASS no dispone de un flujo compartido de atención. Se propone el backend mínimo para registrar y seguir reportes con aislamiento y reintentos seguros.

## What Changes

- Incorporar registro, consulta y seguimiento de incidencias, clasificación, prioridad, asignación, acciones y cierre auditados.
- Admitir fotografía opcional con acceso restringido e idempotencia de creación preparada para futuros clientes desconectados.
- Documentar y probar la API REST, su aislamiento por JASS y sus garantías de concurrencia.
- Registrar el alcance declarado sin tratarlo como medición verificada y sugerir prioridades mediante reglas determinísticas de categoría y alcance configurables por JASS, con confirmación o corrección humana y trazabilidad de la regla aplicada.
- Exclusivamente planificación y futura implementación backend; sin interfaz, PWA, notificaciones ni sincronización en segundo plano.

## Capabilities

### New Capabilities

- `gestion-incidencias`: ciclo de vida, acceso, trazabilidad y evidencia de incidencias de la JASS.

### Modified Capabilities

Ninguna: se respetan las especificaciones existentes de acceso, auditoría e idempotencia de mediciones, sin ampliar su alcance implícitamente.

## Impact

Backend NestJS, dominio, aplicación, PostgreSQL, migraciones, contrato OpenAPI y pruebas. Depende de s1b y de la base acumulada de s1e; requiere resolver la integración de ramas. Aporta potencialmente a C04, C08 y C14, sin declarar criterios cumplidos antes de comprobar evidencia.
