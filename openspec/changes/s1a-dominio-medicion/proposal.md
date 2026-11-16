# Proposal

## Why

La Etapa 1 de la hoja de ruta (`docs/00-alcance-y-roadmap.md`) exige «invariantes y transacciones probadas contra PostgreSQL». El prototipo `tecnologia/siJASS-clean-architecture/` sigue en el modelo heredado:

- `Medicion` conserva `confianza`, `confirmada` y `modeloId` (DT03).
- Carece de `jassId`, método, unidad, autor y hora de toma (DT04).
- La idempotencia es un `Set` en memoria, sin hash y fuera de toda transacción (DT05).
- Un identificador repetido lanza un `Error` genérico que el puerto no especifica (DT06).

Además, la validación actual de fechas usa `Date.parse`, que en Node.js acepta `2026-02-30T08:00:00Z` (lo convierte en el 2 de marzo) y cadenas sin zona horaria, que interpreta en la hora local del servidor (comprobado con Node.js 24). Sin un contrato de medición verificable y una escritura idempotente probada contra PostgreSQL, ni la API (Etapa 2) ni la sincronización sin conexión (Etapa 3) tienen dónde apoyarse.

Este cambio es la **primera mitad** de la Etapa 1: mediciones de cloro y su persistencia. `Pago`, `Membresia`, usuarios y auditoría quedan para `s1b-pagos-membresias-auditoria`, de modo que la Etapa 1 queda **parcial** al cerrar este cambio.

**Criterios de evaluación a los que aporta** (ver `docs/07-evaluacion-final/matriz-cumplimiento.md`):

- **C05:** primeras pruebas de integración contra PostgreSQL y pruebas unitarias del contrato manual.
- **C09:** primer esquema con claves e índice encabezados por `jass_id`.
- **C14:** migraciones versionadas en el repositorio.
- **C12:** job de integración en CI.
- **C02:** el código pasa a reflejar el diseño interno, sección 4.
- **C04:** segundo cambio dirigido por especificaciones.

No cierra por completo ningún criterio ni declara ninguno *Implementado*.

## What Changes

- **BREAKING** — `Medicion` pasa al contrato manual del diseño interno (sección 4):
  - campos: `id`, `jassId`, `reservorioId`, `metodo`, `valor`, `unidad` (`'mg/L'`), `tomadaEn`, `registradaEn`, `registradoPor`, `origen`, `estado`, `revision` y `evidenciaId` opcional;
  - se retiran `cloroMgL`, `confianza`, `confirmada` y `modeloId`;
  - toda medición nace con `estado = 'vigente'` y `revision = 1` (DT03, DT04).
- Validaciones de integridad (RF07):
  - valor finito y no negativo;
  - unidad y método del catálogo (provisional: `comparador-dpd`, `colorimetro`);
  - fechas ISO 8601 con zona y día de calendario existente;
  - `tomadaEn` no posterior a la recepción más una tolerancia configurable (5 min por defecto);
  - reservorio perteneciente a la JASS del actor.
- Los datos que no aporta el cliente salen del servidor:
  - `jassId` y `registradoPor` provienen de un `ContextoActor` que se pasa por parámetro, nunca del comando;
  - el puerto `Reloj` fija `registradaEn`;
  - un puerto generador de identificadores asigna `id`.
- Idempotencia transaccional (ADR-005, DT05):
  - el servidor calcula el hash SHA-256 del contenido canónico del comando (claves ordenadas, sin `operationId`);
  - reserva `(jassId, operationId)` en la **misma** unidad de trabajo que la escritura;
  - devuelve `accepted`, `duplicate` (con el resultado original), `conflict` o `rejected`;
  - un rechazo o cualquier fallo revierte todo, incluida la reserva.
- `ErrorMedicionDuplicada` pasa a ser parte del contrato del puerto `RepositorioMediciones`. Una única batería de pruebas de contrato se ejecuta contra la implementación en memoria y contra PostgreSQL (DT06).
- Persistencia en PostgreSQL con `pg` y `node-pg-migrate`, en SQL plano y sin ORM:
  - la migración `0001` (reversible) crea `jass`, `reservorio`, `metodo_medicion`, `medicion` y `operacion_idempotente`;
  - las restricciones (`CHECK`, claves foráneas compuestas por JASS y unicidad) las aplica la propia base de datos.
- Pruebas:
  - `npm test` sigue sin necesitar base de datos;
  - el nuevo `npm run test:integration` exige `DATABASE_URL` y falla con un mensaje claro si falta;
  - un `docker-compose.yml` sirve solo para el desarrollo local.
- CI: nuevo job `integracion` (Node.js 22 con un servicio `postgres:16`) que migra, revierte, vuelve a migrar y ejecuta `test:integration`. Es independiente de los jobs existentes.
- Documentación, al final y con evidencia real de CI:
  - roadmap: DT03–DT06 resueltas y Etapa 1 parcial; también se corrige el título de `docs/00-alcance-y-roadmap.md`, que el commit `f2017e6` de S0 dejó corrupto;
  - plan de pruebas y matrices de cumplimiento y trazabilidad;
  - README del prototipo;
  - nota de desfase en el diseño interno (sección 4);
  - descripciones del prototipo que quedan desactualizadas en el C4 de nivel 4, en `componentes-arquitectonicos.md` y en `principios-de-diseno.md`.
- **Fuera de alcance:** corrección y anulación (RF08, `revision_medicion`), advertencias determinísticas (RF15), `Pago`, `Membresia`, usuarios, autenticación, auditoría, NestJS, HTTP, lotes de sincronización y PWA. De la evidencia fotográfica solo entra el campo opcional `evidenciaId`, sin tabla ni archivo. RAG también queda fuera. **Nunca** se estima cloro a partir de imágenes.

## Capabilities

### New Capabilities
- `medicion-cloro`: registro manual de una lectura de cloro residual con trazabilidad (JASS, autor, método, hora de toma y de recepción) y validación determinística de su integridad estructural.
- `registro-idempotente`: un único efecto de negocio por operación, con resultado explícito, conflicto ante contenido distinto, atomicidad de la reserva con la escritura y comportamiento definido ante envíos concurrentes.
- `persistencia-mediciones`: contrato de persistencia de mediciones con error de dominio por duplicado, batería de contrato común a las implementaciones, lecturas aisladas por JASS, esquema PostgreSQL versionado y reversible, restricciones en la base, catálogo coherente con el dominio y verificación contra PostgreSQL real en CI.

### Modified Capabilities
- `prototype-quality-gate` (definida por `s0-saneamiento-prototipo`, aún sin archivar): el requisito «Pruebas ejecutables y deterministas» fija «las cinco pruebas existentes», que este cambio elimina por pertenecer al modelo heredado. El delta generaliza el escenario. **Requiere archivar `s0-saneamiento-prototipo` antes que este cambio** (ver *Workflow follow-up* en `tasks.md`).

## Impact

- **Código** (`tecnologia/siJASS-clean-architecture/`):
  - se reescriben `src/dominio/`, `src/aplicacion/` y `src/infraestructura/memoria.ts`;
  - nuevos adaptadores en `src/infraestructura/postgres/`;
  - nuevas migraciones en `migraciones/`;
  - las pruebas se reorganizan en `src/pruebas/{unitarias,contrato,integracion}/`;
  - se eliminan las pruebas heredadas de `dominio.test.ts`;
  - nuevos scripts `test:integration`, `migrar` y `migrar:revertir`.
- **API interna del prototipo (BREAKING):** cambian `Medicion`, `crearMedicion`, los puertos y `RegistrarMedicionCasoUso`. No existen consumidores externos: no hay API HTTP ni cliente.
- **Base de datos:** primer esquema PostgreSQL del proyecto, solo para desarrollo, CI y prueba. No se despliega en ningún entorno.
- **CI/Herramientas:** nuevo job `integracion` en `.github/workflows/ci.yml` y `docker-compose.yml` para el desarrollo local. Las credenciales son desechables y no hay secretos.
- **Dependencias nuevas:** `pg` (ejecución); `node-pg-migrate` y `@types/pg` (desarrollo).
- **Documentación:** `docs/00-alcance-y-roadmap.md`, `docs/05-trazabilidad-y-validacion/plan-pruebas.md`, `docs/05-trazabilidad-y-validacion/matriz-trazabilidad.md`, `docs/07-evaluacion-final/matriz-cumplimiento.md`, `docs/03-diseno-de-software/diseno-interno/` (sección 4 y principios), `docs/04-modelo-c4/Nivel4-Diagrama-de-Codigo.md`, `docs/02-arquitectura-software/componentes-arquitectonicos.md` y el README del prototipo. Se actualizan solo en el grupo 6 de tareas y con evidencia real.
- **Sin impacto** en la PWA, la API NestJS ni el asistente RAG, que siguen en «Diseño propuesto».
