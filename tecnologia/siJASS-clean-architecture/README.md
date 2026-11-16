# Prototipo TypeScript de dominio — SIJASS

**Estado:** prototipo. Demuestra, con pruebas reproducibles en CI, el registro **manual** e **idempotente** de mediciones de cloro residual y su persistencia en PostgreSQL, bajo Clean Architecture. **No** es una aplicación SIJASS operable: no tiene API HTTP, usuarios, interfaz ni sincronización, y no es un componente del MVP.

## Estructura

```text
tecnologia/siJASS-clean-architecture/
├── package.json                      # Scripts build, lint, test, test:integration, migrar y migrar:revertir
├── package-lock.json                 # Instalación reproducible con npm ci
├── docker-compose.yml                # PostgreSQL 16 desechable para el desarrollo local
├── .env.example                      # DATABASE_URL de ejemplo (credenciales desechables)
├── eslint.config.mjs                 # ESLint (reglas recommended) sobre src/
├── tsconfig.json                     # ES2022, NodeNext, strict; compila src/ en dist/
├── migraciones/
│   └── 0001_esquema-mediciones.sql   # jass, reservorio, metodo_medicion, medicion, operacion_idempotente (up y down)
├── scripts/
│   └── exigir-database-url.mjs       # Falla con un mensaje claro si falta DATABASE_URL
└── src/
    ├── dominio/                      # Sin red ni base de datos
    │   ├── medicion.ts               #   Medicion inmutable y crearMedicion (reglas RF07)
    │   ├── catalogo.ts               #   Métodos (provisional) y unidad mg/L
    │   ├── instante.ts               #   Validación estricta de instantes ISO 8601, normalizados a UTC
    │   ├── errores.ts                #   ErrorDominio, ErrorValidacion y ErrorMedicionDuplicada
    │   ├── contenido-canonico.ts     #   Contenido canónico del comando (base del hash)
    │   └── puertos.ts                #   Puertos: repositorios, UnidadDeTrabajo, Reloj y GeneradorIds
    ├── aplicacion/
    │   ├── registrar-medicion.ts     #   RegistrarMedicion: accepted, duplicate, conflict o rejected
    │   └── hash-operacion.ts         #   SHA-256 del contenido canónico
    ├── infraestructura/
    │   ├── memoria.ts                #   Implementación en memoria (mutex y copia por transacción)
    │   ├── sistema.ts                #   RelojSistema y GeneradorIdsAleatorio
    │   └── postgres/                 #   Implementación PostgreSQL (pg, READ COMMITTED)
    └── pruebas/
        ├── unitarias/                #   npm test (sin base de datos)
        ├── contrato/                 #   Baterías comunes a ambas implementaciones (no son *.test)
        ├── integracion/              #   npm run test:integration (exige PostgreSQL)
        └── dobles.ts                 #   RelojFijo y GeneradorIdsSecuencial
```

## Qué demuestra

- Separación en capas `dominio`, `aplicacion` e `infraestructura`; el dominio no importa `pg` ni `node:crypto`.
- Registro **manual** de mediciones con JASS, autor, método, unidad (`mg/L`), hora de toma y hora de recepción del servidor. Rechaza valores negativos o no finitos, unidades y métodos desconocidos, fechas imposibles o sin zona horaria, y campos que el cliente no puede fijar (`jassId`, autor, estado, revisión).
- Idempotencia transaccional (ADR-005): la reserva de `(jassId, operationId)` con su hash de contenido y la escritura de la medición ocurren en una sola transacción. Un reenvío da `duplicate` con el resultado original; el mismo `operationId` con otro contenido da `conflict`; un rechazo no deja rastro.
- Una **única batería de contrato** que pasa contra la implementación en memoria y contra PostgreSQL, incluida la reversión ante un fallo (PT11) y 10 envíos concurrentes en 10 rondas contra la base real.
- Un esquema que impone en la base las mismas invariantes que el dominio (valores no finitos, unidad, método, reservorio de la misma JASS, duplicados).

## Ejecución

Desde esta carpeta, con Node.js 20 o superior.

**Pruebas unitarias** (no requieren base de datos):

```bash
npm ci
npm run lint
npm test
```

`npm test` compila con `tsc` y ejecuta las pruebas unitarias y la batería de contrato en memoria con `node:test`.

**Pruebas de integración** (requieren PostgreSQL y Docker):

```bash
docker compose up -d --wait
export DATABASE_URL=postgres://sijass:sijass@127.0.0.1:5432/sijass   # bash
npm run migrar
npm run test:integration
docker compose down -v                                               # al terminar
```

En PowerShell, la variable se define con `$env:DATABASE_URL = "postgres://sijass:sijass@127.0.0.1:5432/sijass"`. Las credenciales son desechables y solo existen en el contenedor local.

Si el puerto 5432 ya lo usa otro PostgreSQL (por ejemplo, un servicio instalado en Windows), arranca el contenedor con otro puerto y usa el mismo en la URL:

```bash
SIJASS_PG_PUERTO=5433 docker compose up -d --wait
export DATABASE_URL=postgres://sijass:sijass@127.0.0.1:5433/sijass
```

(PowerShell: `$env:SIJASS_PG_PUERTO = "5433"` antes de `docker compose up`.) `npm run migrar:revertir` deshace la migración. Sin `DATABASE_URL`, `npm run test:integration` termina con código 1 y un mensaje que lo indica: las pruebas de integración nunca se omiten en silencio.

**Resultado verificado el 2026-11-16** (cambio `s1a-dominio-medicion`), sobre el commit `e79b29a` en el [PR #5](https://github.com/Henrixfs/SIJASS/pull/5):

- En GitHub Actions ([ejecución 43899642952](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952)): `prototipo` (Node.js 20 y 22), `documentacion` e `integracion` en verde. `integracion` aplica la migración, la revierte, la vuelve a aplicar y pasa 52 pruebas contra PostgreSQL 16.
- En local (Node.js 24 y PostgreSQL 16 en Docker): `npm test` pasa 73 pruebas y `npm run test:integration` pasa 52, en tres ejecuciones consecutivas sin fallos intermitentes.
- Escenario negativo en CI: una rama temporal sin la restricción `medicion_unidad_check` puso en rojo solo el job `integracion` ([ejecución 43900014936](https://github.com/Henrixfs/SIJASS/actions/runs/43900014936)).

Esto respalda el dominio de medición, la idempotencia y la persistencia del prototipo. No valida PWA, API, autenticación, sincronización ni RAG.

## Deuda resuelta

| Deuda | Estado |
|---|---|
| DT01 — falta `@types/node` | Resuelta por `s0-saneamiento-prototipo`: `@types/node@^20` declarado |
| DT02 — sin `package-lock.json` | Resuelta por `s0-saneamiento-prototipo`: lockfile versionado; `npm ci` funciona |
| DT03 — `Medicion` con campos del diseño por IA | Resuelta por `s1a-dominio-medicion`: modelo manual sin `cloroMgL`, `confianza`, `confirmada` ni `modeloId` |
| DT04 — sin JASS, método, unidad, autor ni hora de toma | Resuelta por `s1a-dominio-medicion`: todos los campos y sus invariantes, con clave `(jassId, id)` |
| DT05 — idempotencia sin transacción ni hash | Resuelta por `s1a-dominio-medicion`: reserva con hash y escritura en una sola unidad de trabajo, probada en PostgreSQL |
| DT06 — duplicado como `Error` genérico | Resuelta por `s1a-dominio-medicion`: `ErrorMedicionDuplicada` en el puerto y una batería común a ambas implementaciones |
| DT07 — sin CI ni lint | Resuelta por `s0-saneamiento-prototipo`: ESLint y GitHub Actions; `s1a-dominio-medicion` añade el job `integracion` |

## Limitaciones

- **Sin** corrección ni anulación de mediciones (RF08: `RevisionMedicion`, `revisionBase`) ni advertencias determinísticas (RF15).
- **Sin** auditoría: no se escribe `evento_auditoria` en la transacción ni se registran los rechazos (RNF05). `registrado_por` no tiene clave foránea porque aún no existe la tabla `usuario`.
- **Sin** usuarios, autenticación, API HTTP ni lotes de sincronización: el `ContextoActor` lo construyen las pruebas. `SincronizarOperacion` no está separado de `RegistrarMedicion`.
- **Sin** tabla de evidencia: `evidencia_id` se valida como UUID pero no tiene clave foránea.
- El **catálogo de métodos** (`comparador-dpd`, `colorimetro`) es **provisional** hasta conocer los métodos de las JASS piloto.
- Se conserva el **instante** de `tomadaEn` (UTC), no el desplazamiento horario declarado.
- El esquema es el de este cambio, no una estrategia de crecimiento, respaldo ni particionado.
- `npm audit` informa 9 vulnerabilidades moderadas solo en dependencias de desarrollo (8 de `typescript-eslint` y 1 de `node-pg-migrate` a través de `glob`); las dependencias de ejecución tienen 0.

No implementa React, PWA, IndexedDB, NestJS, API HTTP, autorización, sincronización ni RAG. Las deudas se describen en el [alcance y hoja de ruta](../../docs/00-alcance-y-roadmap.md#6-deuda-técnica-conocida).

## Migración prevista

1. ~~Corregir DT01 y DT02 e incorporar CI con build, pruebas y lint.~~ Hecho en `s0-saneamiento-prototipo`.
2. ~~Rediseñar `Medicion` según el [diseño interno](../../docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md) e integrar la idempotencia y la persistencia en PostgreSQL (PT01–PT04, PT11, PT12).~~ Hecho en `s1a-dominio-medicion`.
3. `s1b-pagos-membresias-auditoria`: pagos, membresías y auditoría; decidir si RF08 y RF15 entran allí o en un cambio propio; clave foránea `registrado_por → usuario`.
4. Pruebas de correcciones y pertenencia a JASS entre usuarios (PT09, PT10).
5. Diseñar el contrato OpenAPI y probar los escenarios entre JASS (PT13, PT25).

**No hacer:** añadir un predictor ONNX «de demostración» que devuelva concentraciones DPD sin dataset de referencia ni evaluación independiente.
