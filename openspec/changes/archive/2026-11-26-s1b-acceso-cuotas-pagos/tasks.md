# Tasks

Las rutas son relativas a `tecnologia/siJASS-clean-architecture/` salvo que se indique otra cosa. Se trabaja en la rama `feat/s1b-acceso-cuotas-pagos`. Las pruebas de integración se ejecutan contra PostgreSQL 16 en Docker con `SIJASS_PG_PUERTO` libre (el 5432 local está ocupado por otro servicio).

## 1. Esquema (D4)

- [x] 1.1 Crear `migraciones/0002_acceso-padron-pagos.sql` con `usuario`, `asociado`, `membresia`, `sesion`, `cuota`, `pago`, `reversa_pago` y `evento_auditoria` (restricciones, claves compuestas y disparador de solo inserción). Verificar:
  - `npm run migrar`, `npm run migrar:revertir` y `npm run migrar` terminan con código 0 y la reversión deja solo las tablas de `0001`;
  - una prueba de integración por SQL directo rechaza: segunda membresía activa de un usuario, membresía de asociado que apunta a un asociado de otra JASS, cuota con importe 0 o periodo mal formado, cuota duplicada por (asociado, periodo), pago con importe 0, clave de idempotencia repetida en la misma JASS (y aceptada en otra), `UPDATE` y `DELETE` sobre `evento_auditoria`.

## 2. Dominio y aplicación (D2, D5, D6, D7, D8)

- [x] 2.1 Contraseñas (`scrypt`), tokens de acceso (HS256) y de refresco, con pruebas unitarias: derivación con sal distinta para igual contraseña, verificación correcta y errónea, formato inválido, token alterado, vencido, firmado con otra clave y con algoritmo `none`. Verificar que `npm test` pasa.
- [x] 2.2 Modelo y reglas de padrón: `Asociado`, `Cuota`, `Pago`, `ReversaPago`, importes en céntimos, periodos, saldo y estado de cuota (D5), con pruebas unitarias de los escenarios de `cuotas-y-pagos` (saldo con cuota exigible y futura, pago revertido, estados `pendiente`/`parcial`/`pagada`, importes inválidos, periodo mal formado, periodo actual en UTC-5 en la frontera de mes).
- [x] 2.3 Puertos y casos de uso: `AutenticarUsuario`, `RenovarSesion`, `CerrarSesion`, `RegistrarAsociado`, `DarDeBajaAsociado`, `CrearAccesoAsociado`, `GenerarCuotas`, `RegistrarPago`, `ReversarPago`, `ConsultarEstadoDeCuenta`, `ConsultarPortal`, con autorización por perfil y rol y escritura de auditoría dentro de la unidad de trabajo. Verificar con pruebas unitarias sobre las implementaciones en memoria:
  - cada escenario de `acceso-por-perfiles` que no depende de HTTP (bloqueo a los 5 intentos y a los 15 minutos con reloj controlado, rotación y reutilización de refresco, membresía desactivada);
  - la matriz perfil/rol × caso de uso completa, con todos los casos denegados.

## 3. Persistencia (D4, D8)

- [x] 3.1 Implementaciones en memoria de los repositorios nuevos, con copia y restauración al revertir.
- [x] 3.2 Implementaciones PostgreSQL y ampliación de `UnidadDeTrabajoPostgres`, con `SELECT … FOR UPDATE` en la cuota (D7).
- [x] 3.3 Batería de contrato común para ambos adaptadores (alta y búsqueda por JASS, aislamiento entre JASS, duplicados, baja lógica, cuotas idempotentes, pagos, reversa, saldo, sesiones, auditoría). Verificar que pasa en `npm test` (memoria) y en `npm run test:integration` (PostgreSQL).
- [x] 3.4 Pruebas de integración de atomicidad y concurrencia: fallo forzado de `auditoria.registrar` revierte pago y reversa; diez `RegistrarPago` simultáneos con la misma clave producen un único pago; dos pagos distintos simultáneos que juntos superan la cuota producen un solo éxito; 10 rondas sin fallos intermitentes.

## 4. API NestJS (D1, D3, D9)

- [x] 4.1 Añadir NestJS (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`), configurar decoradores en `tsconfig.json`, módulo, guardia de autenticación y autorización (D3), filtro de errores con `{ codigo, mensaje }`, auditoría de `403` y arranque con `JWT_SECRET` obligatorio. Verificar que `npm run lint`, `npm run build` y `npm test` terminan con código 0 y que la API no arranca sin `JWT_SECRET` ni con uno de menos de 32 bytes.
- [x] 4.2 Controladores de `auth`, `yo`, `asociados`, `cuotas`, `pagos` y `portal` según D9. Verificar con pruebas HTTP sobre la aplicación real y PostgreSQL cada escenario de `cuotas-y-pagos` y de `acceso-por-perfiles` que tiene código HTTP (`401`, `403`, `409`, `422`, `429`, `200`/`201`).
- [x] 4.3 Pruebas HTTP de aislamiento (`portal-asociado`): matriz con 2 JASS × 2 asociados × tesorero × operador, donde cada cuenta intenta cada ruta con cada recurso. Verificar que solo las combinaciones permitidas devuelven datos, que todo lo demás es `403` sin datos del recurso, que el portal ignora identificadores enviados, y que cada `403` genera `acceso.denegado`.
- [x] 4.4 Prueba HTTP del flujo principal: el tesorero registra un pago y el asociado lee su saldo actualizado; la reversa lo restaura. Verificar saldos 1500 → 1000 → 1500.
- [x] 4.5 Pruebas de seguridad de la bitácora y de las respuestas: ningún evento contiene contraseñas ni tokens tras inicios de sesión fallidos; credenciales inválidas indistinguibles; cuerpos de error sin trazas ni SQL.
- [x] 4.6 Órdenes `crear-jass` y `sembrar-demo` (D12). Verificar que `crear-jass` falla sin `SIJASS_CLAVE_INICIAL`, que crea la JASS y el `consejo` con la contraseña derivada, y que `sembrar-demo` se niega sin `SIJASS_PERMITIR_DEMO=1`.

## 5. Interfaz web (D10)

- [x] 5.1 Crear `tecnologia/sijass-web/` (React + TypeScript + Vite) con inicio de sesión, pantallas del personal y portal del asociado, `package-lock.json` y scripts `lint`, `build` y `test`. Verificar que `npm ci`, `npm run lint`, `npm run build` y `npm test` terminan con código 0.
- [x] 5.2 Pruebas de la interfaz (formato de soles, guardia de rutas por perfil, manejo de `401` con refresco y de `403`).

## 6. E2E en navegador

- [x] 6.1 Pruebas Playwright (`channel: 'chrome'` en local) sobre la API real con PostgreSQL y la interfaz construida: el tesorero registra un pago y el asociado, en otro contexto de navegador, ve 1500 → 1000; la reversa lo restaura; el asociado no ve datos de otro asociado ni puede abrir rutas del personal; un tesorero de otra JASS no ve el padrón ajeno. Verificar que terminan con código 0 en tres ejecuciones seguidas.

## 7. CI (D11)

- [x] 7.1 Añadir el job `api-web` a `.github/workflows/ci.yml` (PostgreSQL, migraciones, pruebas HTTP, construcción de la interfaz y E2E con Chromium de Playwright) y asegurar que `prototipo` ejecuta las pruebas nuevas en memoria. Verificar con `act` o sintaxis YAML válida y que no cambian los demás jobs. **Solo con autorización para subir la rama:** abrir el pull request y anotar la URL de la ejecución con todos los jobs en verde.

## 8. Documentación con evidencia

- [x] 8.1 Actualizar `docs/00-alcance-y-roadmap.md` (§1, §4.1, §4.2, §5), `docs/01-analisis-de-sistema/01-actores.md` (matriz y asociados), `diseno-interno-de-modulos.md` (§2, §3), `plan-pruebas.md` y `matriz-cumplimiento.md` con el estado real y los enlaces a evidencia. No pasar ningún criterio a *Implementado*. Verificar `node scripts/verificar-docs.mjs` con código 0.
- [x] 8.2 Actualizar los README (raíz y paquetes) con el estado, el arranque local y las limitaciones.

## 9. Integración final

- [x] 9.1 Ejecutar `openspec validate s1b-acceso-cuotas-pagos --strict` con código 0.
- [x] 9.2 En una copia limpia del commit final, ejecutar `npm ci`, lint, build, `npm test`, `npm run test:integration`, la construcción de la interfaz y el E2E, y comparar con el CI.

## Workflow follow-up

- Fusionar y archivar con `/opsx:archive s1b-acceso-cuotas-pagos`.
- Planificar `s1c-reservorios-mediciones-ui`.

## 10. Corrección de permisos y revisión de concurrencia

- [x] 10.1 Alinear la especificación y la tabla D9 con los permisos restrictivos existentes; validar OpenSpec estrictamente y comprobar matriz de roles y aislamiento por HTTP.
- [x] 10.2 Probar un inicio correcto concurrente con el fallo que activa el bloqueo; si revela un defecto, documentarlo sin modificar la lógica de negocio.
- [x] 10.3 Ejecutar lint, compilación, unitarias e integración en una base nueva aislada y registrar resultados y limitaciones; no ejecutar E2E destructivas.

## 11. Bloqueo concurrente de autenticación

- [x] 11.1 Extender el puerto de usuarios y sus adaptadores para lectura bloqueante transaccional por cuenta; comprobar equivalencia de contrato en memoria y PostgreSQL y aislamiento entre cuentas.
- [x] 11.2 Revalidar estado, hash y bloqueo bajo el bloqueo por cuenta después de `scrypt`; hacer atómicos contador, sesión y auditoría; verificar que la prueba controlada existente pasa sin debilitarla y que un fallo transaccional revierte todo.
- [x] 11.3 Probar con barreras ambos órdenes del inicio correcto y quinto fallo, múltiples fallos, expiración y primer fallo posterior, y persistencia de `429`; ejecutar al menos diez rondas en PostgreSQL desechable.
- [x] 11.4 Probar dos procesos de backend independientes con pools PostgreSQL separados contra la misma cuenta y otra cuenta, y la rotación concurrente de refresco; comprobar que no se pierden incrementos ni se altera o bloquea indebidamente la otra cuenta.
- [x] 11.5 Ejecutar validación estricta OpenSpec, lint, compilación, unitarias e integración completa; registrar comandos y resultados reales, sin ejecutar E2E destructivas ni modificar frontend.

### Evidencia de revisión aislada

- Copia de `cabdbe2daf8c861ef528d7a3b2dd1d1b3419ff64`: validación estricta OpenSpec, lint y build con código 0; unitarias 256/256. Se reutilizaron mediante junction las dependencias instaladas del árbol s1e, sin ejecutar instalación limpia.
- PostgreSQL 16 en el contenedor de auditoría con tmpfs y sin montajes: base nueva `sijass_s1b_rbac_a1`, verificada vacía antes de aplicar 0001 y 0002. Integración: 216 pruebas, 215 aprobadas y 1 fallida; la matriz HTTP de permisos y aislamiento pasó. No se ejecutó E2E de navegador.
- Hallazgo: la prueba controlada `un inicio correcto iniciado antes del bloqueo no abre sesión después de activarse` falla con `Missing expected rejection (ErrorCuentaBloqueada)`: un inicio que había leído el usuario antes del quinto fallo completa después de activarse el bloqueo. La lógica de autenticación no fue modificada; requiere análisis y autorización para corregirse.

### Evidencia posterior a la corrección de concurrencia

- Validación integral en clon aislado del head `cabdbe2`: `npm ci --no-audit --no-fund`, lint y build con código 0; 259 unitarias y 225 pruebas de integración aprobadas, 0 fallidas. PostgreSQL 16 usó la base nueva `sijass_s1b_pr9_final_a1`, verificada con cero tablas antes de migrar. La nueva prueba confirmó que un bloqueo vigente prevalece aunque cambie el hash. No se ejecutó E2E de navegador local.

- Copia aislada de `cabdbe2`: `npm run lint`, `npm run build` y validación estricta OpenSpec con código 0; `node --test ... dist/pruebas/unitarias/*.test.js`: 259 aprobadas, 0 fallidas.
- PostgreSQL 16: contenedor de auditoría verificado sin montajes y con tmpfs; base nueva `sijass_s1b_auth_fix_a1` con cero tablas antes de aplicar 0001 y 0002. `node --test --test-concurrency=1 ... dist/pruebas/integracion/*.test.js`: 224 aprobadas, 0 fallidas. Las pruebas se repitieron sobre esa misma base exclusiva después de su creación.
- La prueba previamente fallida pasó diez rondas sin debilitar sus aserciones; ambos órdenes, dos procesos independientes, otra cuenta, rotación de refresco, cambio de hash/estado, expiración, reversión y matriz HTTP pasaron. Las dependencias instaladas de s1e se reutilizaron mediante junction; no se ejecutó instalación limpia ni E2E de navegador.

## Evidencia local (2026-11-19, copia limpia del commit `git archive HEAD`)

- `tecnologia/siJASS-clean-architecture/`: `npm ci`, `npm run lint`, `npm run build` con código 0; `npm test` 256/256; `npm run test:integration` 215/215 contra PostgreSQL 16 (Docker, puerto 5433).
- `tecnologia/sijass-web/`: `npm ci`, `npm run lint`, `npm run build` con código 0; `npm test` 56/56 en tres ejecuciones.
- `tecnologia/e2e/`: `npx playwright test` 5/5 con Chrome del sistema en tres ejecuciones consecutivas (más tres en el árbol de trabajo).
- `node scripts/verificar-docs.mjs` y `openspec validate --all --strict` con código 0.
- Hallazgos corregidos durante la verificación: un defecto real del cliente (la renovación de sesión quedaba memorizada como `false` cuando no había refresco) y una comprobación de interfaz con una carrera de temporización.

## Evidencia de GitHub Actions (aparte de la local)

- Rama `feat/s1b-acceso-cuotas-pagos`, commit `97ba688`: [PR #9](https://github.com/Henrixfs/SIJASS/pull/9) (base `chore/archivar-retirar-node-20`, PR #8).
- Ejecución del pull request [44635444554](https://github.com/Henrixfs/SIJASS/actions/runs/44635444554) y del push [44635408106](https://github.com/Henrixfs/SIJASS/actions/runs/44635408106): `Prototipo (Node 22)`, `Prototipo (Node 24)`, `Prototipo (Node 26)`, `Documentación`, `Integración (PostgreSQL)` e `Interfaz y E2E (navegador)` en verde, a la primera.
- PR #8 (commit `f2d5465`, ejecución [44635435022](https://github.com/Henrixfs/SIJASS/actions/runs/44635435022)): sus cinco jobs en verde.
