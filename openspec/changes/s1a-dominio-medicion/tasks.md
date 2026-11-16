# Tasks

Todas las rutas son relativas a `tecnologia/siJASS-clean-architecture/` salvo que se indique otra cosa. Al terminar cada grupo, `npm run lint` y `npm test` deben terminar con código 0.

## 1. Modelo de dominio (DT03, DT04)

- [x] 1.1 Crear `src/dominio/errores.ts` con `ErrorDominio` (con `codigo`), `ErrorValidacion` (motivos cerrados de D1) y `ErrorMedicionDuplicada`. Verificar con una prueba unitaria en `src/pruebas/unitarias/errores.test.ts` que cada clase conserva su `codigo`, que `instanceof` funciona según la jerarquía y que un motivo fuera del conjunto no compila (`// @ts-expect-error`).
- [x] 1.2 Crear `src/dominio/catalogo.ts` con `METODOS_MEDICION = ['comparador-dpd', 'colorimetro']` (congelado) y `UNIDAD_MEDICION = 'mg/L'`. Verificar con una prueba unitaria que el catálogo contiene exactamente esos dos códigos y no se puede modificar.
- [x] 1.3 Implementar la validación estricta de instantes ISO 8601 de D1 (zona obligatoria, de 0 a 3 decimales, horas `00`–`23`, día de calendario existente, normalización a UTC con `toISOString()`). Verificar con una prueba de tabla de casos:
  - `2026-02-30T08:00:00Z`, `2026-02-29T08:00:00Z`, `2026-10-12T08:00:00`, `2026-10-12`, `2026-10-12 08:00:00Z`, `2026-10-12T24:00:00Z` y `2026-10-12T08:00:00.123456Z` dan `fecha-invalida`;
  - `2028-02-29T08:00:00Z` se acepta;
  - `2026-10-12T08:00:00-05:00` da `2026-10-12T13:00:00.000Z`;
  - el resultado no cambia al ejecutar con `TZ=UTC` y con `TZ=America/Lima`.
- [x] 1.4 Reescribir `src/dominio/medicion.ts`:
  - `Medicion` con el contrato del diseño interno §4, sin `cloroMgL`, `confianza`, `confirmada` ni `modeloId`;
  - `crearMedicion(comando, { jassId, usuarioId, origen, id, registradaEn, toleranciaMs })`, con campos permitidos, UUID, valor, unidad, método, fecha y tolerancia en el orden fijo de D1;
  - `-0` normalizado a `0`, estado `vigente`, revisión 1 y resultado congelado.

  Verificar con `src/pruebas/unitarias/medicion.test.ts`, citando PT01 y PT02 en los nombres de las pruebas:
  - PT01: `-0.1`, `NaN`, `Infinity`, `-Infinity` y texto dan `valor-invalido`; `0` y `-0` dan `0`;
  - PT02: `ppm`, `mg/l` y `estimacion-imagen`, además de las fechas inválidas;
  - cada campo obligatorio ausente;
  - `campo-no-permitido` con `jassId`, `registradoPor`, `registradaEn`, `estado`, `revision`, `confianza` y un campo de hash;
  - `evidenciaId` presente, ausente y malformado;
  - tolerancia: exactamente +5 min se acepta, +5 min + 1 ms se rechaza, tolerancia 0 con +1 ms se rechaza, una toma de días atrás se acepta;
  - estado `vigente` y revisión 1.
- [x] 1.5 Eliminar el código y las pruebas que dependen del modelo heredado: `src/pruebas/dominio.test.ts`, `RegistrarMedicionCasoUso`, `OperacionesMemoria` y `RepositorioOperaciones.registrar`. Grupos 2 y 3 los reemplazan. Cambiar el script `test` a `npm run build && node --test dist/pruebas/unitarias/*.test.js`. Verificar:
  - `npm run lint && npm test` terminan con código 0 y ejecutan más de cero pruebas;
  - `grep -rnE "confianza|confirmada|modeloId|cloroMgL" src` solo encuentra las pruebas que comprueban su rechazo.

## 2. Puertos y batería de contrato en memoria (DT06)

- [x] 2.1 Reescribir `src/dominio/puertos.ts` con:
  - `ContextoActor`, `Origen`, `Reloj` y `GeneradorIds`;
  - `RepositorioMediciones`: `guardar` lanza `ErrorMedicionDuplicada` ante el mismo `(jassId, id)`; `buscar(jassId, id)`; `listar(jassId, { reservorioId })` ordenado por `tomadaEn` descendente y luego por `id`;
  - `RepositorioReservorios.existeEnJass(jassId, reservorioId)`;
  - `RepositorioOperaciones`: `reservar` y `registrarResultado`;
  - `UnidadDeTrabajo.ejecutar`.

  Cada contrato y precondición se documenta con TSDoc, en particular que el reservorio pertenece a la JASS. Verificar que `npm run build` y `npm run lint` terminan con código 0.
- [x] 2.2 Crear `src/pruebas/contrato/repositorio-mediciones.ts`, una función que recibe una fábrica de implementación y registra los casos de la spec `persistencia-mediciones`:
  - guardar y buscar con todos los campos (PT03);
  - `ErrorMedicionDuplicada` sin alterar la original;
  - mismo `id` en dos JASS;
  - búsqueda y listado desde otra JASS;
  - listado propio con orden total.

  Verificar que el archivo no coincide con el patrón `*.test.js`, de modo que solo se ejecuta cuando lo invoca una suite.
- [x] 2.3 Reescribir `MedicionesMemoria` (clave `jassId` + `id`) y crear `ReservoriosMemoria` en `src/infraestructura/memoria.ts`, más `src/pruebas/unitarias/contrato-memoria.test.ts`, que ejecuta la batería de 2.2. Verificar que `npm test` pasa la batería. Escenario negativo: hacer temporalmente que `guardar` lance un `Error` genérico, comprobar que la batería falla y revertir.
- [x] 2.4 Crear los adaptadores de sistema `RelojSistema` y `GeneradorIdsAleatorio` (`crypto.randomUUID()`) en `src/infraestructura/sistema.ts`, y los dobles de prueba `RelojFijo` (avanzable) y `GeneradorIdsSecuencial` en `src/pruebas/dobles.ts`. Verificar con pruebas unitarias que el generador produce UUID válidos y distintos, y que el reloj fijo devuelve el instante configurado.

## 3. Idempotencia en dominio y aplicación (DT05)

- [x] 3.1 Implementar `contenidoCanonico(tipo, comando)` en `src/dominio/contenido-canonico.ts` según D5, y el cálculo SHA-256 en hexadecimal en la capa de aplicación con `node:crypto`. Verificar con `src/pruebas/unitarias/contenido-canonico.test.ts`:
  - un vector fijo con su hash esperado;
  - el mismo hash con otro orden de claves;
  - el `operationId` no influye;
  - cambiar cualquier campo cambia el hash;
  - `undefined` se omite;
  - la función es total con `NaN` y `-0`;
  - un campo `tipo` dentro del comando no altera el tipo.
- [x] 3.2 Implementar `OperacionesMemoria` (`reservar`, `registrarResultado`) y `UnidadDeTrabajoMemoria` (mutex, copia del estado publicada solo al confirmar, fábrica decoradora opcional de repositorios) según D6. Verificar con pruebas unitarias que un trabajo resuelto publica sus escrituras, que un trabajo que lanza no deja ninguna, y que dos trabajos simultáneos se ejecutan en serie.
- [x] 3.3 Implementar `RegistrarMedicion` en `src/aplicacion/registrar-medicion.ts`, con `ejecutar(comando, actor, origen)` siguiendo los pasos 1–5 de D6 y `toleranciaMs` por defecto de 5 minutos. Verificar que `npm run build` y `npm run lint` terminan con código 0.
- [x] 3.4 Crear `src/pruebas/contrato/registro-idempotente.ts`, una batería parametrizada por una fábrica de unidad de trabajo y por un número de repeticiones, con todos los escenarios de la spec `registro-idempotente`:
  - `accepted` y `duplicate` con el resultado original (PT04);
  - tres reintentos con exactamente una medición y una reserva (RNF04);
  - `conflict` sin sobrescritura, también con contenido inválido, y `duplicate` tras el conflicto (PT12);
  - `rejected` con cada motivo y sin dejar rastro, y luego `accepted` con el mismo `operationId`;
  - el mismo `operationId` en dos JASS;
  - deduplicación por `operationId` y no por contenido;
  - reservorio de otra JASS;
  - fallo de infraestructura propagado como error.

  Ejecutarla con la memoria en `src/pruebas/unitarias/contrato-memoria.test.ts`. Verificar que `npm test` la pasa.
- [x] 3.5 Añadir a la batería de 3.4 los casos de reversión y concurrencia, cada uno en `repeticiones` rondas:
  - reversión (PT11): fallo inyectado en `guardar` y en `registrarResultado`; sin reserva ni medición; el reintento da `accepted`;
  - concurrencia: 10 envíos idénticos dan 1 `accepted` y 9 `duplicate` con el mismo `medicionId` y una sola medición; 2 envíos con valores distintos dan 1 `accepted` y 1 `conflict`.

  Verificar que `npm test` los pasa con 10 repeticiones contra la memoria, sin base de datos ni `DATABASE_URL`.

## 4. PostgreSQL

- [x] 4.1 Añadir `pg` (dependencia) y `node-pg-migrate` y `@types/pg` (desarrollo), además de:
  - los scripts `migrar` (`node-pg-migrate up -m migraciones`) y `migrar:revertir` (`node-pg-migrate down -m migraciones`);
  - `docker-compose.yml`: servicio `postgres:16` publicado en `127.0.0.1:5432`, credenciales desechables, comprobación de salud y volumen con nombre.

  Verificar:
  - `npm ci` en copia limpia termina con código 0 sin modificar `package-lock.json`;
  - `docker compose up -d --wait` deja el servicio sano;
  - `npm run migrar` conecta con la `DATABASE_URL` local.
- [x] 4.2 Crear `migraciones/0001_esquema-mediciones.sql` con las secciones `-- Up Migration` y `-- Down Migration`, según D9: tablas, restricciones con nombre explícito, índice y las dos filas de `metodo_medicion`. Verificar:
  - `npm run migrar && npm run migrar:revertir && npm run migrar` terminan con código 0;
  - `pgmigrations` registra `0001_esquema-mediciones`; si `node-pg-migrate` no admite el prefijo `0001`, usar su prefijo por marca de tiempo y anotarlo en `design.md` (D8);
  - tras la reversión no queda ninguna de las cinco tablas.
- [x] 4.3 Crear `scripts/exigir-database-url.mjs`, el script `test:integration` de D10 y `src/pruebas/integracion/entorno.ts`. El entorno crea el pool desde `DATABASE_URL` y lanza un error claro si falta; además siembra JASS y reservorios con UUID aleatorios. Verificar:
  - sin `DATABASE_URL`, `npm run test:integration` termina con código distinto de 0 e imprime que falta `DATABASE_URL`;
  - ejecutar directamente `node --test dist/pruebas/integracion/*.test.js` sin la variable también falla;
  - con la variable, el comando se ejecuta.
- [x] 4.4 Crear `src/pruebas/integracion/esquema.test.ts`. Comprueba por SQL directo cada escenario de «Restricciones de integridad en la base», con su SQLSTATE: `23514` para las verificaciones, `23503` para las claves foráneas y `23505` para las duplicidades, incluidos `'NaN'` e `'Infinity'`. También comprueba, mediante `pg_catalog`, que las claves primarias de `medicion` y `operacion_idempotente` empiezan por `jass_id` y que existe el índice `(jass_id, reservorio_id, tomada_en)`, y que el catálogo de la base es igual a `METODOS_MEDICION`. Verificar:
  - `npm run test:integration` lo pasa;
  - escenario negativo: agregar temporalmente un método solo a la constante del dominio hace fallar la prueba de coherencia; revertir.
- [x] 4.5 Implementar en `src/infraestructura/postgres/` los adaptadores de D7 y D8:
  - `MedicionesPostgres`: `23505` sobre `medicion_pkey` se convierte en `ErrorMedicionDuplicada`; conversión local de `numeric` y `timestamptz`; orden del listado;
  - `ReservoriosPostgres`;
  - `OperacionesPostgres`: `INSERT … ON CONFLICT DO NOTHING RETURNING`, lectura de la fila existente y `UPDATE` del resultado;
  - `UnidadDeTrabajoPostgres`: `BEGIN`/`COMMIT`/`ROLLBACK` en `READ COMMITTED`, liberación del cliente en `finally` y fábrica decoradora.

  Verificar que `npm run build` y `npm run lint` terminan con código 0.
- [x] 4.6 Crear `src/pruebas/integracion/contrato-postgres.test.ts`, que ejecuta **sin modificar** las baterías de `src/pruebas/contrato/` contra los adaptadores PostgreSQL. Verificar:
  - `npm run test:integration` las pasa;
  - `npm test` sigue pasando con la memoria;
  - las dos suites importan los mismos módulos de batería;
  - si hubo que corregir la batería durante el grupo, ambas implementaciones la pasan después del cambio.
- [x] 4.7 Ejecutar contra PostgreSQL la reversión y la concurrencia de la batería con 10 repeticiones, un pool de al menos 10 conexiones y el decorador de retardo de D10. Las aserciones van sobre las filas de `medicion` y `operacion_idempotente`. Verificar que tres ejecuciones locales consecutivas y completas de `npm run test:integration` pasan sin fallos intermitentes.
- [x] 4.8 Ejecutar los escenarios negativos de persistencia y revertir cada uno:
  - quitar `valor < 'Infinity'` de la migración hace fallar la prueba de `'NaN'`/`'Infinity'`;
  - que `MedicionesPostgres` deje pasar el error genérico de `pg` ante un duplicado hace fallar la batería (DT06);
  - quitar `ON CONFLICT DO NOTHING` hace fallar la prueba de concurrencia.

  Verificar con `git diff --exit-code` que no queda ningún cambio temporal.

## 5. CI

- [x] 5.1 Añadir el job `integracion` a `.github/workflows/ci.yml` según D11: Node.js 22, `services.postgres` con `postgres:16` y `pg_isready`, `DATABASE_URL` en `env`, y los pasos `npm ci`, `migrar`, `migrar:revertir`, `migrar` y `test:integration`; sin `needs`. Verificar:
  - la sintaxis con `actionlint` si está disponible, o con una revisión del YAML;
  - que los jobs `prototipo` y `documentacion` no cambian (`git diff` limitado al nuevo job);
  - que la secuencia de comandos pasa localmente contra `docker compose`.
- [x] 5.2 Subir la rama `feat/s1a-dominio-medicion` y abrir el pull request contra `main`. Verificar que terminan en verde `prototipo` (Node.js 20 y 22), `documentacion` e `integracion`, y que el registro de `integracion` muestra las tres migraciones y un número de pruebas mayor que cero. Anotar la URL de la ejecución como evidencia.
  - Evidencia: [PR #5](https://github.com/Henrixfs/SIJASS/pull/5), CI del commit `e79b29a` en la ejecución [43899642952](https://github.com/Henrixfs/SIJASS/actions/runs/43899642952) (evento `pull_request`) y [43899584443](https://github.com/Henrixfs/SIJASS/actions/runs/43899584443) (evento `push`): `prototipo` (Node.js 20 y 22), `documentacion` e `integracion` en verde; el registro de `integracion` muestra `UP`, `DOWN` y `UP` de `0001_esquema-mediciones` y 52 pruebas aprobadas, 0 fallidas y 0 omitidas.
- [x] 5.3 Escenario negativo en CI: en una rama temporal `tmp/s1a-ci-negativo`, sin pull request, introducir un fallo deliberado de integración (por ejemplo, quitar una restricción de la migración). Verificar que `integracion` termina en rojo mientras `prototipo` y `documentacion` se ejecutan e informan su propio resultado. Anotar la URL y borrar la rama remota y la local.
  - Evidencia: ejecución [43900014936](https://github.com/Henrixfs/SIJASS/actions/runs/43900014936) de la rama temporal `tmp/s1a-ci-negativo` (commit `898c432`, sin PR; se quitó `medicion_unidad_check` de la migración): `integracion` en rojo (falla `unidad ppm → 23514`, 51 aprobadas y 1 fallida) mientras `prototipo` (Node.js 20 y 22) y `documentacion` terminan en verde. Rama remota, local y worktree borrados.

## 6. Documentación con evidencia (solo tras 5.2)

- [ ] 6.1 Actualizar `tecnologia/siJASS-clean-architecture/README.md`:
  - estado, estructura y qué demuestra;
  - comandos (`npm test`, `docker compose up -d --wait`, `DATABASE_URL` en bash y en PowerShell, `npm run migrar`, `npm run test:integration`);
  - resultado verificado con fecha y URL de 5.2;
  - DT03–DT06 resueltas por `s1a-dominio-medicion`;
  - limitaciones vigentes: sin RF08, RF15, auditoría, usuarios, HTTP ni tabla de evidencia, y catálogo provisional.

  Verificar que `node scripts/verificar-docs.mjs` (desde la raíz) termina con código 0 y que los comandos documentados funcionan tal como están escritos.
- [ ] 6.2 Actualizar `docs/00-alcance-y-roadmap.md`:
  - restaurar el título `# 00. Alcance, hoja de ruta y estado del proyecto — SIJASS`, corrupto desde `f2017e6`;
  - §1, situación del prototipo;
  - §5, Etapa 1 «Parcial» (`s1a` hecho; `s1b` pendiente) con enlace a CI;
  - §6, DT03–DT06 «Resuelta por `s1a-dominio-medicion`» con commit y URL de CI.

  Verificar que `head -1` muestra el título correcto y que `verificar-docs.mjs` termina con código 0.
- [ ] 6.3 Actualizar `docs/05-trazabilidad-y-validacion/plan-pruebas.md`:
  - §1: nueva fila con el resultado de `npm test` y `test:integration`;
  - correspondencia de pruebas reemplazada por la de D10;
  - PT01–PT04, PT11 y PT12 pasan a «Prototipo (automatizada en CI)» con enlace;
  - PT13 sigue «Pendiente».

  Verificar con `verificar-docs.mjs` y comprobar que ningún PT afirma un estado sin enlace.
- [ ] 6.4 Actualizar `docs/07-evaluacion-final/matriz-cumplimiento.md`:
  - filas C02, C04, C05, C09, C12 y C14, con evidencia enlazada y lo pendiente visible: auditoría, RF08 y RF15 en C02 y C05; estrategia de crecimiento en C09; CD en C12;
  - nueva sección «Aporte de S1a»;
  - versión y fecha.

  Verificar con `verificar-docs.mjs` y comprobar con `grep` que ninguna fila figura como *Implementado*.
- [ ] 6.5 Alinear las descripciones del prototipo:
  - nota de desfase del diseño interno §4: sin `RevisionMedicion`, auditoría ni tabla de evidencia, y `SincronizarOperacion` aún no separado;
  - `docs/04-modelo-c4/Nivel4-Diagrama-de-Codigo.md` §1 (diagrama, tabla y limitaciones);
  - `docs/02-arquitectura-software/componentes-arquitectonicos.md` §4;
  - `docs/03-diseno-de-software/diseno-interno/principios-de-diseno.md` §4: LSP respaldado por la batería común, con enlace;
  - HU01 y HU04 en `docs/05-trazabilidad-y-validacion/matriz-trazabilidad.md`.

  Verificar que `grep -rnE "confianza|modeloId|cloroMgL|OperacionesMemoria" docs` solo encuentra menciones históricas (tabla de cambios de RF y descripción de DT03 y DT05), y que `verificar-docs.mjs` termina con código 0.
- [ ] 6.6 Subir los cambios documentales al pull request. Verificar que los cuatro jobs vuelven a terminar en verde y anotar la URL. Si cambia el commit de referencia, actualizar las citas de 6.1–6.4 en el mismo pull request.

## 7. Integración final

- [ ] 7.1 En una copia limpia del commit final (`git worktree` o `git clone`), ejecutar `npm ci`, `npm run lint`, `npm test`, `docker compose up -d --wait`, `npm run migrar`, `npm run migrar:revertir`, `npm run migrar`, `npm run test:integration` y, desde la raíz, `node scripts/verificar-docs.mjs`. Verificar que todo termina con código 0 y que los resultados coinciden con el CI de 6.6.
- [ ] 7.2 Ejecutar `openspec validate s1a-dominio-medicion --strict`. Verificar que no reporta errores. El aviso informativo de que el delta de `prototype-quality-gate` requiere la spec archivada es esperado.
- [ ] 7.3 Ejecutar `docker compose down -v` y `git status`. Verificar que no quedan archivos sin seguimiento ni cambios relevantes (`.env`, `dist/` y `node_modules/` ignorados) y que no se versionó ningún `.env`.

## Workflow follow-up

- Archivar primero `s0-saneamiento-prototipo` (`/opsx:archive`), que crea `openspec/specs/documentation-integrity/` y `openspec/specs/prototype-quality-gate/`, y verificar el resultado.
- Después archivar `s1a-dominio-medicion` tras la revisión del pull request. Su delta MODIFIED de `prototype-quality-gate` solo se aplica si S0 ya está archivado.
- Planificar `s1b-pagos-membresias-auditoria` como un cambio nuevo:
  - decidir allí si RF08 (corrección y anulación, `revision_medicion`, `revisionBase`) y RF15 (advertencias determinísticas) entran en `s1b` o en un cambio propio;
  - incluir el evento de auditoría en la misma unidad de trabajo (diseño interno §5.3 y §7), la clave foránea `registrado_por → usuario` y la auditoría de rechazos (RNF05);
  - decidir la retirada de Node.js 20 de la matriz.
