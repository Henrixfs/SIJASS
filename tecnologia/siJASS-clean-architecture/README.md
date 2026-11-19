# Prototipo TypeScript de dominio — SIJASS

**Estado:** prototipo. Demuestra, con pruebas reproducibles, (1) el registro **manual** e **idempotente** de mediciones de cloro residual con persistencia en PostgreSQL y (2), desde `s1b-acceso-cuotas-pagos`, el acceso por perfiles (personal de la JASS y asociado), el padrón, las cuotas, los pagos con reversa y el portal del asociado detrás de una API NestJS, bajo Clean Architecture. **No** es una aplicación SIJASS operable: no está desplegada, no tiene OpenAPI, PWA, sincronización ni asistente RAG, y la evidencia de `s1b` es la de CI del [PR #9](https://github.com/Henrixfs/SIJASS/pull/9) ([ejecución](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554)) más la local.

## Estructura

```text
tecnologia/siJASS-clean-architecture/
├── package.json                      # ESM; scripts build, lint, test, test:integration, api, crear-jass, sembrar-demo, migrar y migrar:revertir
├── package-lock.json                 # Instalación reproducible con npm ci
├── docker-compose.yml                # PostgreSQL 16 desechable para el desarrollo local
├── .env.example                      # DATABASE_URL de ejemplo (credenciales desechables)
├── eslint.config.mjs                 # ESLint (reglas recommended) sobre src/
├── tsconfig.json                     # ES2022, NodeNext, strict; compila src/ en dist/
├── migraciones/
│   ├── 0001_esquema-mediciones.sql   # jass, reservorio, metodo_medicion, medicion, operacion_idempotente (up y down)
│   └── 0002_acceso-padron-pagos.sql  # usuario, membresia, sesion, asociado, cuota, pago, reversa_pago, evento_auditoria (up y down)
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
    │   ├── acceso/ y padron/         #   Casos de uso de sesión, padrón, cuotas, pagos y portal (s1b)
    │   ├── registrar-medicion.ts     #   RegistrarMedicion: accepted, duplicate, conflict o rejected
    │   └── hash-operacion.ts         #   SHA-256 del contenido canónico
    ├── api/                          # NestJS 12 (capa de interfaz): guardia, filtro de errores, controladores, composición y órdenes CLI
    ├── infraestructura/
    │   ├── memoria.ts                #   Implementación en memoria (mutex y copia por transacción)
    │   ├── memoria-acceso.ts         #   Ídem para acceso, padrón, pagos y auditoría (s1b)
    │   ├── seguridad/                #   Contraseñas scrypt y tokens HS256 (s1b)
    │   ├── sistema.ts                #   RelojSistema y GeneradorIdsAleatorio
    │   └── postgres/                 #   Implementación PostgreSQL (pg, READ COMMITTED)
    └── pruebas/
        ├── unitarias/                #   npm test (sin base de datos)
        ├── contrato/                 #   Baterías comunes a ambas implementaciones (no son *.test)
        ├── integracion/              #   npm run test:integration (exige PostgreSQL)
        └── dobles.ts                 #   RelojFijo y GeneradorIdsSecuencial
```

## API, órdenes y pruebas de `s1b-acceso-cuotas-pagos`

```bash
export DATABASE_URL=postgres://sijass:sijass@127.0.0.1:5432/sijass   # ver «Pruebas de integración»
export JWT_SECRET="<al menos 32 bytes aleatorios>"                   # la API no arranca sin él
npm run migrar && npm run build
SIJASS_CLAVE_INICIAL='<contraseña>' npm run crear-jass -- "JASS Ejemplo" consejo@ejemplo.pe
npm run api                                                          # http://localhost:3000 (PORT, CORS_ORIGIN, WEB_DIR opcionales)
SIJASS_PERMITIR_DEMO=1 SIJASS_CLAVE_DEMO='<contraseña>' npm run sembrar-demo   # solo desarrollo
```

- Rutas (`/v1`): `auth/login|refresh|logout`, `yo`, `asociados` (+ `:id/baja`, `:id/acceso`, `:id/estado-de-cuenta`), `cuotas/generar`, `pagos` (+ `:id`, `:id/reversa`, con `Idempotency-Key`) y `portal/saldo|cuotas|pagos`. El contrato OpenAPI llega en `s1e`.
- Decisiones: contraseñas `scrypt` (N=2^15), JWT HS256 de 15 min sin JASS ni rol, refresco opaco rotativo guardado como SHA-256, JASS/perfil/rol leídos de la membresía **en cada solicitud**, `403` idéntico para recurso ajeno e inexistente y auditado, importes en céntimos, pagos con bloqueo de la cuota.
- Pruebas (verificadas en local el 2026-11-19): `npm test` pasa 256 pruebas unitarias; `npm run test:integration` pasa 215 (esquema `0002`, baterías compartidas con la memoria, concurrencia en 10 rondas, API HTTP, matriz de aislamiento, seguridad). La interfaz está en [`../sijass-web`](../sijass-web/README.md) y el E2E en [`../e2e`](../e2e/README.md).
- Limitaciones de `s1b`: una membresía activa por cuenta; sin cambio ni recuperación de contraseña; sin correcciones de mediciones ni reservorios por HTTP (`s1c`); `medicion.registrado_por` aún sin clave foránea a `usuario`; el listado de asociados calcula el saldo de cada uno con consultas por asociado (aceptable para el tamaño de una JASS; se medirá en `s1e`).

## Qué demuestra

- Separación en capas `dominio`, `aplicacion` e `infraestructura`; el dominio no importa `pg` ni `node:crypto`.
- Registro **manual** de mediciones con JASS, autor, método, unidad (`mg/L`), hora de toma y hora de recepción del servidor. Rechaza valores negativos o no finitos, unidades y métodos desconocidos, fechas imposibles o sin zona horaria, y campos que el cliente no puede fijar (`jassId`, autor, estado, revisión).
- Idempotencia transaccional (ADR-005): la reserva de `(jassId, operationId)` con su hash de contenido y la escritura de la medición ocurren en una sola transacción. Un reenvío da `duplicate` con el resultado original; el mismo `operationId` con otro contenido da `conflict`; un rechazo no deja rastro.
- Una **única batería de contrato** que pasa contra la implementación en memoria y contra PostgreSQL, incluida la reversión ante un fallo (PT11) y 10 envíos concurrentes en 10 rondas contra la base real.
- Un esquema que impone en la base las mismas invariantes que el dominio (valores no finitos, unidad, método, reservorio de la misma JASS, duplicados).

## Ejecución

Desde esta carpeta, con Node.js 22 o superior.

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
| DT01 — falta `@types/node` | Resuelta por `s0-saneamiento-prototipo`: `@types/node@^20` declarado (hoy `^22`, desde `retirar-node-20`) |
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

No implementa PWA, IndexedDB, sincronización ni RAG; la API y la interfaz de `s1b` cubren solo acceso, padrón, cuotas y pagos. Las deudas se describen en el [alcance y hoja de ruta](../../docs/00-alcance-y-roadmap.md#6-deuda-técnica-conocida).

## Migración prevista

1. ~~Corregir DT01 y DT02 e incorporar CI con build, pruebas y lint.~~ Hecho en `s0-saneamiento-prototipo`.
2. ~~Rediseñar `Medicion` según el [diseño interno](../../docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md) e integrar la idempotencia y la persistencia en PostgreSQL (PT01–PT04, PT11, PT12).~~ Hecho en `s1a-dominio-medicion`.
3. `s1b-acceso-cuotas-pagos`: acceso por perfiles (personal de la JASS y asociado), cuotas, pagos y portal del asociado; clave foránea `registrado_por → usuario`. Después, `s1c` integra reservorios y mediciones con la interfaz y `s1d` el asistente técnico. RF08 y RF15 y la auditoría de rechazos se asignan al planificar esos cambios.
4. Pruebas de correcciones y pertenencia a JASS entre usuarios (PT09, PT10).
5. Diseñar el contrato OpenAPI y probar los escenarios entre JASS (PT13, PT25).

**No hacer:** añadir un predictor ONNX «de demostración» que devuelva concentraciones DPD sin dataset de referencia ni evaluación independiente.
