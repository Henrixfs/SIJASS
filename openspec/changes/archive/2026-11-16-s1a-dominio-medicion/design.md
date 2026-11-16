# Design

## Context

Estado observado al 2026-11-13 en `tecnologia/siJASS-clean-architecture/` (rama `feat/s1a-dominio-medicion`, sin cambios sobre `main` `7b7760d`):

- Cinco archivos en `src/` con estilo compacto y finales de línea CRLF:
  - `medicion.ts`: interfaz `Medicion` heredada y `crearMedicion`;
  - `puertos.ts`: `RepositorioMediciones` con `guardar`/`buscar` y `RepositorioOperaciones.registrar(uuid)`;
  - `registrar-medicion.ts`;
  - `memoria.ts`: `Map` y `Set`;
  - `dominio.test.ts`: cinco pruebas.
- `crearMedicion` valida la fecha con `Date.parse`. Comprobado con Node.js 24:
  - `2026-02-30T08:00:00Z` se acepta y se convierte en `2026-03-02`;
  - `2026-10-12T08:00:00` (sin zona) se interpreta en la hora local del servidor;
  - también se aceptan `2026-10-12`, `2026-10-12 08:00:00Z` y `T24:00:00Z`;
  - los microsegundos se truncan en silencio.
- Scripts del prototipo:
  - `build`: `tsc`;
  - `lint`: `eslint src`;
  - `test`: `npm run build && node --test dist/pruebas/*.test.js`.
- `engines.node` es `>=20`. CI (`.github/workflows/ci.yml`) tiene dos jobs independientes: `prototipo` (matriz Node.js 20 y 22) y `documentacion`.
- No existe `package.json` en la raíz. El `.gitignore` raíz ya ignora `.env` y `.env.*` y admite `.env.example`.
- Localmente hay Docker 29 y Docker Compose v5; no hay `psql`.
- Versiones publicadas, consultadas en el registro npm el 2026-11-13:
  - `pg` 8.23.1 (Node.js ≥ 16);
  - `node-pg-migrate` 9.0.0, publicada el 2026-07-17, con Node.js ≥ 20.11.0 y dependencia par `pg` < 9;
  - `@types/pg` 8.x.
- Node.js 20 llegó a fin de soporte en abril de 2026; S0 lo mantiene en la matriz.
- El diseño objetivo del C4 de nivel 4 (§2) ya nombra:
  - `RepositorioMediciones.guardar/buscar/listar`;
  - `RepositorioOperaciones.reservar/registrarResultado`;
  - `UnidadDeTrabajo.ejecutar`.

  Este diseño reutiliza esos nombres.
- El diseño interno (§5.3, paso 4) escribe además un evento de auditoría en la misma transacción. La auditoría queda para `s1b`.
- El título de `docs/00-alcance-y-roadmap.md` quedó corrupto en el commit `f2017e6` de S0 (celdas de la tabla de deuda pegadas en el `#`), y así está en `main`.

Ver `proposal.md` para la motivación y `specs/` para los requisitos.

## Goals / Non-Goals

**Goals:**
- Un dominio de medición puro, sin red ni base de datos, cuyas reglas RF07 sean deterministas e independientes de la zona horaria del servidor.
- Una única batería de contrato que fije el comportamiento observable y se ejecute contra la implementación en memoria (`npm test`) y contra PostgreSQL (`npm run test:integration`).
- Atomicidad y concurrencia de la idempotencia demostradas contra un PostgreSQL real en CI, no solo en memoria.
- Un esquema que imponga en la base las mismas invariantes que el dominio (defensa en profundidad).

**Non-Goals:**
- Lotes de sincronización (`POST /v1/sync`) y procesamiento de varias operaciones por solicitud. En este cambio una invocación equivale a una operación.
- Auditoría (`evento_auditoria`) y registro de operaciones rechazadas (van en `s1b`).
- Conservar el desplazamiento horario original de `tomadaEn` (ver *Open Questions*).
- Pool de conexiones afinado, respaldo o particionado (el aporte a C09 es el esquema, no una estrategia de crecimiento).
- Reformatear el resto del repositorio o cambiar las reglas de lint de S0.

## Decisions

**D1 — Modelo inmutable y jerarquía de errores de dominio.** `Medicion` es un objeto congelado con los campos del diseño interno §4. `crearMedicion` aplica solo reglas puras y normaliza antes de congelar:
- `valor`: `-0` pasa a `0`;
- `tomadaEn` y `registradaEn`: instante en UTC con milisegundos (`toISOString()`);
- `operationId`, `reservorioId` y `evidenciaId`: se aceptan en mayúsculas o minúsculas y se normalizan a minúsculas, **antes de calcular el hash (D5) y antes de guardar**. Solo se normaliza un valor que ya es un UUID válido; uno malformado se conserva tal cual y lo rechaza su regla. *Por qué:* PostgreSQL devuelve el tipo `uuid` siempre en minúsculas, de modo que sin esta regla la memoria y PostgreSQL devolverían valores distintos. Además, el mismo UUID escrito con otra capitalización da `duplicate` y no `conflict`, y la clave de idempotencia (JASS, `operationId`) no distingue entre mayúsculas y minúsculas. *Alternativa descartada:* aceptar solo minúsculas, que rechazaría UUID legítimos generados por otros clientes. (Decisión del 2026-11-13, tomada durante la implementación del grupo 2.)

Los errores se organizan así:
- `ErrorDominio` (base, con `codigo`);
- `ErrorValidacion extends ErrorDominio`, con un motivo de un conjunto cerrado: `operacion-invalida`, `campo-no-permitido`, `identificador-invalido`, `valor-invalido`, `unidad-invalida`, `metodo-desconocido`, `fecha-invalida`, `toma-posterior-a-recepcion` y `reservorio-no-encontrado`;
- `ErrorMedicionDuplicada extends ErrorDominio` (DT06).

Cuando hay varias reglas incumplidas se informa la primera, en un orden fijo: campos, identificadores, valor, unidad, método, fecha, tolerancia, reservorio. Las pruebas resultan deterministas.

Para las fechas se usa una expresión ISO 8601 estricta con desplazamiento obligatorio (`Z` o `±hh:mm`), de 0 a 3 decimales y horas de `00` a `23`. Después se comprueba que el instante resultante tenga el mismo año, mes y día declarados, una vez aplicado el desplazamiento; así se rechaza `02-30`.

*Por qué:* las especificaciones exigen motivos estables. `Date.parse` no basta (ver *Context*). Normalizar en el dominio hace que memoria y PostgreSQL devuelvan valores idénticos.

*Alternativas:*
- `Error` con mensajes de texto: imposible de comparar y repite DT06.
- Tipo `Result` en lugar de excepciones: obligaría a reescribir todo el flujo, y las excepciones ya son el mecanismo que hace revertir la unidad de trabajo (D6).
- Biblioteca de fechas (Luxon, date-fns): una dependencia para una sola expresión validable con pruebas.

**D2 — `ContextoActor` y origen por parámetro; comando cerrado.** El caso de uso recibe `ejecutar(comando, actor, origen)`:
- `actor: ContextoActor = { jassId, usuarioId }` lo construye la capa confiable; en este cambio, las pruebas. En la Etapa 2 lo construirá la sesión.
- `origen` lo fija el canal de entrada del servidor.
- El comando contiene solo `operationId`, `reservorioId`, `metodo`, `valor`, `unidad`, `tomadaEn` y `evidenciaId?`. Cualquier otra clave da `campo-no-permitido`.

*Por qué:* el diseño interno §2 establece que un identificador enviado por el cliente no concede acceso. Rechazar campos extra lo hace verificable y evita que el cliente crea haber fijado `jassId`.

*Alternativas:*
- `jassId` en el comando, validado contra el actor: duplica la fuente de verdad.
- Ignorar en silencio los campos extra: oculta errores del cliente.
- `origen` dentro de `ContextoActor`: mezcla quién actúa con por dónde entra.

**D3 — `Reloj`, `GeneradorIds` y tolerancia inyectados.**
- Puertos `Reloj.ahora(): Date` y `GeneradorIds.nuevo(): string`, con adaptadores de sistema (`new Date()`, `crypto.randomUUID()`) y dobles de prueba deterministas.
- La tolerancia es un parámetro del constructor del caso de uso, `toleranciaMs`, con valor por defecto de 5 minutos.
- `registradaEn` se toma una sola vez al inicio de cada invocación y se usa para la regla de tolerancia y para el registro.

*Por qué:* las pruebas de límite (exactamente +5 min, +5 min + 1 ms) exigen un reloj controlable, y el `id` del `accepted` debe ser predecible en las aserciones.

*Alternativas:*
- `now()` de PostgreSQL: es la hora de inicio de la transacción, solo existe en una de las dos implementaciones y saca la regla del dominio.
- Tolerancia en una variable de entorno: configuración global innecesaria para un prototipo sin despliegue.
- Identificador generado por el cliente: el diseño §5.2 dice que el cliente guarda «el identificador del servidor».

**D4 — Catálogo de métodos en el dominio, espejado en la base.**
- `METODOS_MEDICION = ['comparador-dpd', 'colorimetro']` y `UNIDAD = 'mg/L'` son constantes del dominio.
- La migración `0001` crea `metodo_medicion(codigo, descripcion)` con esas dos filas, y `medicion.metodo` la referencia por clave foránea.
- Una prueba de integración compara ambos conjuntos.

*Por qué:* el dominio debe validar sin base de datos (ADR-006) y la base debe rechazar métodos desconocidos aunque se la escriba directamente.

*Alternativas:*
- Catálogo solo en la base, consultado por puerto: el dominio deja de ser puro y las pruebas unitarias necesitan un doble más.
- Solo en el dominio, con `CHECK (metodo IN (...))`: cambiar el catálogo obligaría a reescribir una restricción.
- Enumerado `ENUM` de PostgreSQL: no admite quitar valores sin recrear el tipo.

El catálogo es **provisional** (roadmap §7).

**D5 — Hash canónico calculado por el servidor.**
- `contenidoCanonico(tipo, comando)` es una función pura del dominio. Produce JSON sin espacios de `{ contenido, tipo }`, donde `contenido` es el comando sin `operationId`.
- Reglas de canonización:
  - claves ordenadas de forma recursiva;
  - `undefined` omitido;
  - números no finitos codificados como texto;
  - `-0` escrito como `0`.

  La función es total: también canoniza comandos inválidos, porque el conflicto se decide antes de validar (D6).
- La capa de aplicación calcula el SHA-256 en hexadecimal con `node:crypto`.
- El tipo va anidado para que un campo `tipo` del cliente no pueda sobrescribirlo.

*Por qué:*
- ADR-005 y el diseño §5.1 exigen un hash del contenido.
- El servidor no puede confiar en un hash del cliente.
- Hashear el comando tal como se recibe, sin normalizar su semántica, impide que un cambio futuro de reglas de normalización convierta reenvíos legítimos en conflictos. La única excepción es la capitalización de los UUID (D1), que se normaliza antes del hash.

*Alternativas:*
- Hashear la entidad `Medicion` normalizada: incluye `registradaEn` y el `id`, que cambian en cada reintento.
- Usar el hash enviado por el cliente: manipulable.
- Puerto `FuncionHash`: indirección sin una segunda implementación. `node:crypto` es una primitiva estándar de la plataforma, no un framework (ADR-006 se refiere a NestJS, SQL, React y el LLM).

Una prueba con un vector fijo fija el hash esperado, de modo que un cambio accidental de la canonización se detecta.

**D6 — Unidad de trabajo y un único caso de uso idempotente.** Puerto `UnidadDeTrabajo.ejecutar<T>(trabajo: (repos) => Promise<T>): Promise<T>`:
- confirma si `trabajo` se resuelve y revierte si lanza;
- `repos` agrupa `mediciones`, `operaciones` y `reservorios`, vinculados a la transacción.

`RegistrarMedicion.ejecutar` sigue el diseño interno §5.3:
1. Fuera de la transacción, comprobar que `operationId` sea UUID; si no, `rejected` (`operacion-invalida`). Luego calcular el hash (D5) y leer `registradaEn`.
2. `operaciones.reservar(jassId, operationId, hash, 'registrar-medicion')`. Si ya existía, devolver `duplicate` con el resultado almacenado cuando el hash coincide, o `conflict` cuando difiere, sin validar el contenido nuevo.
3. Validar con `crearMedicion` y comprobar `reservorios.existeEnJass(jassId, reservorioId)`. Si algo falla, se lanza `ErrorValidacion`.
4. `mediciones.guardar(medicion)` y `operaciones.registrarResultado(jassId, operationId, { medicionId, revision, registradaEn })`. Devolver `accepted` con ese mismo objeto.
5. Fuera de la transacción, convertir `ErrorValidacion` en `rejected` con su motivo. Cualquier otro error, incluido `ErrorMedicionDuplicada`, se vuelve a lanzar: es un fallo reintentable, no un dato inválido del cliente.

Implementación en memoria:
- un mutex (cadena de promesas) serializa las transacciones;
- cada transacción trabaja sobre una copia del estado (`Map` de mediciones, operaciones y reservorios) y la publica solo al confirmar;
- la clave de cada `Map` es `jassId` + `id`.

Ambas implementaciones aceptan una fábrica opcional que decora los repositorios de la transacción. Es la costura de pruebas para inyectar fallos (D10).

*Por qué:* la reserva antes de validar es el orden documentado y da `conflict` aunque el contenido nuevo sea inválido (spec `registro-idempotente`). Lanzar dentro de la transacción es lo que revierte la reserva ante un rechazo.

*Alternativas:*
- Separar `SincronizarOperacion` de `RegistrarMedicion`, como el C4 de nivel 4 §2: se pospone hasta que existan lotes y correcciones (Etapa 3 / `s1b`). Hoy solo hay un tipo de operación y se documenta el desfase.
- Validar antes de reservar: un `operationId` aceptado con contenido inválido daría `rejected` en lugar de `conflict`.
- Registrar los rechazos: contradice «revertir todo, incluida la reserva».

**D7 — Reserva con `INSERT … ON CONFLICT DO NOTHING` en `READ COMMITTED`.** `reservar` ejecuta:

```sql
INSERT INTO operacion_idempotente (jass_id, operation_id, tipo, payload_hash)
VALUES ($1, $2, $3, $4)
ON CONFLICT (jass_id, operation_id) DO NOTHING
RETURNING operation_id;
```

Si no devuelve filas, lee `payload_hash` y `resultado` de la fila existente. `registrarResultado` hace un `UPDATE … SET resultado = $3`.

Comportamiento concurrente: una segunda transacción con la misma clave queda bloqueada en el índice único hasta que la primera termina.
- Si la primera confirma, el `INSERT` no inserta y la lectura siguiente, con instantánea nueva en `READ COMMITTED`, ya ve la fila con su resultado.
- Si la primera revierte, el `INSERT` de la segunda procede.

Una fila confirmada siempre tiene `resultado`, porque se escribe antes del `COMMIT`. Si la lectura no encontrara fila o la encontrara sin resultado, se lanza un error interno, nunca un `accepted`.

*Por qué:* es exactamente el paso 2 del diseño §5.3 y deja la serialización a la restricción de unicidad de la base, no a la aplicación.

*Alternativas:*
- `SELECT` previo e `INSERT`: carrera entre ambos.
- `SERIALIZABLE` o `REPEATABLE READ`: la fila confirmada por la otra transacción no es visible en la instantánea y puede producir errores de serialización que habría que reintentar.
- Bloqueo consultivo (`pg_advisory_xact_lock`): segundo mecanismo innecesario.
- Escribir la medición antes de reservar: trabajo desperdiciado y mediciones huérfanas si no se revierte bien.

**D8 — `pg` + `node-pg-migrate` con migraciones SQL.**
- `pg` 8.x para el acceso (dependencia de ejecución).
- `node-pg-migrate` 9.x para versionar migraciones escritas en SQL plano, con secciones `-- Up Migration` y `-- Down Migration`, en `migraciones/`.
- La herramienta lee `DATABASE_URL` y registra lo aplicado en su tabla `pgmigrations`.
- Scripts: `migrar` (`up`) y `migrar:revertir` (`down`).
- `node-pg-migrate` y `@types/pg` van como dependencias de desarrollo.
- Los adaptadores convierten de forma local los valores que devuelve `pg`: `numeric` llega como texto y se convierte a `Number`; `timestamptz` llega como `Date` y se convierte con `toISOString()`. No se registran analizadores de tipos globales.
- El duplicado se reconoce por el código `23505` y el nombre de la restricción `medicion_pkey`.

*Por qué:* SQL legible y revisable, revertible y sin capa de abstracción sobre la base (ADR-004 exige restricciones relacionales explícitas).

*Alternativas:*
- **Prisma:** esquema en un lenguaje propio y cliente generado que oculta el SQL; Prisma Migrate no genera migraciones de reversión.
- **TypeORM:** decoradores en las entidades, que contaminan el dominio (ADR-006); sincronización automática riesgosa.
- **Knex:** viable, pero añade un constructor de consultas que no se necesita.
- **Testcontainers:** exige Docker en cada ejecución de pruebas y duplica lo que ya dan `services` en CI y `docker-compose.yml` en local.
- **Ejecutor de SQL propio:** reinventa el registro de migraciones aplicadas.

La compatibilidad del nombre `0001_esquema-mediciones.sql` con el ordenamiento de `node-pg-migrate` se verifica en la tarea 4.2. Si no lo admite, se usa su prefijo por marca de tiempo.

**D9 — Esquema `0001`.** Bosquejo:

```sql
CREATE TABLE jass (id uuid PRIMARY KEY, nombre text NOT NULL);
CREATE TABLE reservorio (
  id uuid PRIMARY KEY, jass_id uuid NOT NULL REFERENCES jass(id), nombre text NOT NULL,
  CONSTRAINT reservorio_id_jass_key UNIQUE (id, jass_id));
CREATE TABLE metodo_medicion (codigo text PRIMARY KEY, descripcion text NOT NULL);
CREATE TABLE medicion (
  jass_id uuid NOT NULL, id uuid NOT NULL, reservorio_id uuid NOT NULL,
  metodo text NOT NULL REFERENCES metodo_medicion(codigo),
  valor numeric NOT NULL CHECK (valor >= 0 AND valor < 'Infinity'),
  unidad text NOT NULL CHECK (unidad = 'mg/L'),
  tomada_en timestamptz NOT NULL, registrada_en timestamptz NOT NULL,
  registrado_por uuid NOT NULL,                 -- sin FK hasta s1b (usuario)
  origen text NOT NULL CHECK (origen IN ('en-linea', 'sincronizada')),
  evidencia_id uuid,                            -- sin FK: no existe tabla evidencia
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulada')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CONSTRAINT medicion_pkey PRIMARY KEY (jass_id, id),
  CONSTRAINT medicion_reservorio_fkey FOREIGN KEY (reservorio_id, jass_id)
    REFERENCES reservorio (id, jass_id));
CREATE INDEX medicion_jass_reservorio_tomada_idx ON medicion (jass_id, reservorio_id, tomada_en);
CREATE TABLE operacion_idempotente (
  jass_id uuid NOT NULL REFERENCES jass(id), operation_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('registrar-medicion')),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  resultado jsonb, creada_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operacion_idempotente_pkey PRIMARY KEY (jass_id, operation_id));
```

La sección de reversión elimina las cinco tablas en orden inverso. Las migraciones usan `CREATE TABLE` sin `IF NOT EXISTS`, de modo que la secuencia aplicar → revertir → aplicar solo termina en 0 si la reversión eliminó todo.

Decisiones dentro del esquema:
- **`valor numeric` sin escala fija:** conserva exactamente el decimal escrito por JavaScript. `numeric(6,3)` redondearía en silencio un cuarto decimal y haría divergir memoria y PostgreSQL.
- **`valor < 'Infinity'`:** en PostgreSQL, `NaN` e `Infinity` cumplen `valor >= 0`, porque `NaN` se ordena por encima de todo número. Por eso `CHECK (valor >= 0)` no basta.
- **Clave primaria `(jass_id, id)`:** toda búsqueda incluye la JASS. El índice `(jass_id, reservorio_id, tomada_en)` sirve al listado (recorrido inverso para el orden descendente) y a la clave foránea compuesta.
- **Columnas `estado` y `revision`:** se crean ya, con los valores de RF08, para que `s1b` no necesite reescribir filas.
- **`creada_en`:** metadato técnico que el puerto no expone.
- **`jass` y `reservorio`:** tienen solo las columnas que este cambio necesita; `s1b` y la Etapa 2 las amplían con migraciones nuevas.

*Alternativas:*
- Clave primaria simple `id`: no ancla las consultas a la JASS.
- Clave foránea solo a `reservorio(id)`: permitiría una medición de la JASS A sobre un reservorio de la JASS B.
- `resultado` como columnas tipadas: el resultado cambiará con el tipo de operación (corrección en `s1b`).

**D10 — Estrategia de pruebas.**

Organización en `src/pruebas/`:

| Carpeta | Contenido | Se ejecuta con |
|---|---|---|
| `unitarias/*.test.ts` | Dominio (PT01, PT02 en tabla de casos), canonización y hash, caso de uso con la implementación en memoria (PT03, PT04, PT11, PT12, concurrencia) y la batería de contrato en memoria | `npm test` |
| `contrato/*.ts` | Las baterías como funciones que reciben una fábrica de implementación; no son `*.test.ts` | — |
| `integracion/*.test.ts` | Esquema y restricciones por SQL directo, coherencia del catálogo, la misma batería sobre PostgreSQL y las pruebas de reversión y concurrencia | `npm run test:integration` |

Las baterías son dos:
- `contrato/repositorio-mediciones`: guardar, buscar y listar; duplicado; aislamiento.
- `contrato/registro-idempotente`: los resultados `accepted`, `duplicate`, `conflict` y `rejected`; aislamiento por JASS; reversión.

Inyección de fallos:
- con la fábrica decoradora de D6, `guardar` o `registrarResultado` lanzan un error simulado;
- un decorador de retardo en `guardar` (unos 50 ms) mantiene tomada la reserva, para forzar que las demás transacciones esperen sobre el índice.

Reversión (PT11) y concurrencia se repiten **10 veces**, con `operationId` nuevos en cada ronda. La concurrencia usa N = 10 y un pool de al menos N conexiones. Las aserciones revisan las filas reales de la base, no solo los resultados devueltos.

Datos de prueba:
- cada prueba crea su propia JASS y su propio reservorio con UUID aleatorios, así que no se trunca nada entre pruebas;
- `--test-concurrency=1` evita la interferencia entre archivos.

Scripts:
- `test`: `npm run build && node --test dist/pruebas/unitarias/*.test.js`.
- `test:integration`: `npm run build && node scripts/exigir-database-url.mjs && node --test --test-concurrency=1 dist/pruebas/integracion/*.test.js`.
- El script previo termina con código 1 y un mensaje claro si falta `DATABASE_URL`. El módulo auxiliar de integración vuelve a comprobarlo, por si se invoca `node --test` directamente.

`dominio.test.ts` se elimina: sus cinco pruebas validan el modelo heredado, incluida `confianza`.

Correspondencia con el plan:

| PT | Prueba | Nivel |
|---|---|---|
| PT01 | Valores no finitos, negativos y no numéricos | Unitaria |
| PT02 | Fechas, unidad y método | Unitaria |
| PT03 | Registrar y recuperar con autor y JASS | Contrato (memoria y PostgreSQL) |
| PT04 | Duplicado y tres reintentos (RNF04) | Contrato |
| PT11 | Fallo entre la reserva y la escritura | Contrato; repetida en PostgreSQL |
| PT12 | Conflicto | Contrato |

*Alternativas:*
- Simulación de `pg` con dobles: no prueba restricciones ni concurrencia.
- Omitir la integración cuando falte `DATABASE_URL`: un CI mal configurado pasaría en verde.
- Truncar tablas entre pruebas: acopla pruebas y complica la repetición.

**D11 — Job de CI `integracion`.** Se añade a `.github/workflows/ci.yml`, sin `needs`:
- `runs-on: ubuntu-latest`, Node.js 22, `working-directory` del prototipo y caché de npm;
- `services.postgres`: imagen `postgres:16` con usuario, contraseña y base desechables, puerto `5432` y comprobación de salud `pg_isready`;
- `env.DATABASE_URL` apuntando a `localhost`;
- pasos: `npm ci`, `npm run migrar`, `npm run migrar:revertir`, `npm run migrar` y `npm run test:integration`.

Las credenciales no son secretos: solo existen dentro del contenedor efímero del job. `docker-compose.yml` replica el mismo servicio para el desarrollo local, publicado solo en `127.0.0.1`.

*Por qué:*
- un job independiente muestra por separado un fallo de persistencia;
- PostgreSQL 16 admite `Infinity` en `numeric` (desde la versión 14), del que depende la restricción de D9;
- Node.js 22 es la línea vigente de la matriz.

*Alternativas:*
- Añadir PostgreSQL al job `prototipo`: mezclaría pruebas que no necesitan base con las que sí, y duplicaría el servicio en la matriz.
- `needs: prototipo`: ocultaría el estado de la integración cuando falle el lint.
- Testcontainers: ver D8.

**D12 — Documentación al final, con evidencia de CI.** Como en S0 (D6), los estados documentales cambian solo después de ver en verde los cuatro jobs del PR, y cada afirmación enlaza la ejecución.
- **Roadmap** (`docs/00-alcance-y-roadmap.md`):
  - se restaura el título;
  - §1 describe la situación;
  - §5: la Etapa 1 queda «Parcial: medición y persistencia (`s1a`); pagos, membresías y auditoría pendientes (`s1b`)»;
  - §6: DT03–DT06 «Resuelta por `s1a-dominio-medicion` (commit, CI)».
- **Plan de pruebas:** PT01–PT04, PT11 y PT12 pasan a «Prototipo (automatizada en CI)» con enlace, porque el prototipo sigue sin ser un componente del MVP.
- **Matriz de cumplimiento:** C02, C04, C05, C09, C12 y C14 se actualizan con la evidencia y con lo que sigue pendiente; se añade una sección «Aporte de S1a». Ningún criterio pasa a *Implementado*.
- **Otros documentos:** el diseño interno §4 sustituye la nota de desfase por el desfase actual (sin `RevisionMedicion`, auditoría ni tabla de evidencia). El C4 de nivel 4 §1, `componentes-arquitectonicos.md` §4, `principios-de-diseno.md` §4, la matriz de trazabilidad (HU01, HU04) y el README del prototipo se alinean con el código.

*Alternativa:* actualizar la documentación junto con el código. Se descarta porque afirmaría estados sin evidencia.

## Risks / Trade-offs

- **[Divergencia entre memoria y PostgreSQL]** → Una sola batería de contrato para ambas.
  - Normalización en el dominio: instantes UTC con milisegundos, `-0` como `0` y conversión de `numeric` a `Number` en el adaptador.
  - Orden total en los listados: `tomadaEn` descendente y luego `id`.
  - Las precondiciones que el caso de uso garantiza (reservorio de la JASS) las impone en PostgreSQL una clave foránea, pero no la memoria. El puerto las documenta como precondición y la batería siempre siembra datos válidos.
  - La serialización en memoria es trivial (mutex), así que la prueba real de concurrencia es la de PostgreSQL.
- **[Catálogo de métodos provisional (roadmap §7)]** → Los códigos son estables y en minúsculas con guiones. Agregar o quitar un método exige una migración nueva y el cambio de la constante; la prueba de coherencia impide olvidar uno de los dos. No hay datos productivos que migrar.
- **[Supuestos de `revision = 1` y tolerancia de 5 minutos]** → `CHECK (revision >= 1)` deja a `s1b` (RF08) libre para definir `revisionBase`. Si `s1b` decidiera empezar en 0, bastaría una migración, porque no hay datos desplegados. La tolerancia es un parámetro del constructor; su valor debe validarse en el piloto (Etapa 5), y el desfase del reloj se advertirá en RF15, no aquí.
- **[Prueba de concurrencia frágil o trivialmente verde]** → Las 10 transacciones pueden ejecutarse en serie por azar. Por eso se usan N = 10, 10 repeticiones, el decorador de retardo, un pool de al menos N conexiones y aserciones sobre las filas de la base. La prueba nunca se reintenta automáticamente: un fallo intermitente es un defecto que se investiga.
- **[Crecimiento del alcance]** → La lista *Fuera de alcance* de la propuesta es cerrada. Cualquier necesidad nueva (RF08, RF15, auditoría, reservorios con más atributos) se anota para `s1b` y no se implementa aquí.
- **[Archivo del delta MODIFIED]** → `openspec validate` ya informa que el archivo se negaría mientras `prototype-quality-gate` no exista en `openspec/specs/`. Hay que archivar `s0-saneamiento-prototipo` antes que este cambio (*Workflow follow-up*).
- **[Sin auditoría ni registro de rechazos]** → El diseño interno §5.3 escribe un evento de auditoría en la misma transacción, y RNF05 pide auditar las denegaciones. Este cambio no lo hace. La unidad de trabajo admite añadir un repositorio de auditoría en `s1b` sin cambiar el flujo.
- **[Node.js 20 fuera de soporte; `node-pg-migrate` 9 exige ≥ 20.11]** → `npm ci` solo advierte cuando no se cumple `engines`. CI usa la última 20.x y el job de integración usa Node.js 22. Retirar Node.js 20 de la matriz es una decisión aparte (*Open Questions*).
- **[Tamaño del cambio]** → Los siete grupos de tareas son verificables por separado. El código queda en commits por grupo y la documentación en un commit final, como en S0.

## Migration Plan

1. Implementar en la rama `feat/s1a-dominio-medicion`, grupos 1–4. Verificar localmente con `docker compose up -d`, `npm run migrar` y `npm run test:integration`.
2. Subir la rama, abrir el pull request contra `main` y confirmar en verde los jobs `prototipo` (20 y 22), `documentacion` e `integracion`.
3. Actualizar la documentación con la URL de esa ejecución (grupo 6), subir y confirmar de nuevo el CI.
4. **Reversión:** revertir el merge. El esquema solo existe en contenedores de desarrollo y de CI: `npm run migrar:revertir` o `docker compose down -v` lo eliminan sin afectar ningún entorno desplegado.

## Open Questions

- ¿Se retira Node.js 20 (fuera de soporte desde abril de 2026) de la matriz de CI y de `engines`? No cambia este diseño.
- El registro en línea de la Etapa 2 (`POST /v1/mediciones`), ¿derivará el `operationId` del encabezado `Idempotency-Key`? Este cambio solo exige que exista un `operationId`.
- ¿Plazo de retención de `operacion_idempotente`? ADR-005 la conserva como parte de la auditoría.
- Si el piloto necesita conservar el desplazamiento horario declarado de `tomadaEn`, ¿se añade una columna aditiva en una migración posterior? Hoy se conserva el instante, y todas las JASS objetivo están en `America/Lima`.
