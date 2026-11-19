# Design

## Context

Estado observado al 2026-11-19 en `tecnologia/siJASS-clean-architecture/` (rama `feat/s1b-acceso-cuotas-pagos`, sobre el archivado de `retirar-node-20`):

- Paquete TypeScript CommonJS (`module: NodeNext`, sin `"type": "module"`), dependencia de ejecución única `pg`, pruebas con `node:test` sobre `dist/`, migraciones con `node-pg-migrate` y una migración `0001` (jass, reservorio, método, medición, operación idempotente).
- Dominio y aplicación sin dependencias de framework; puertos en `src/dominio/puertos.ts`; `UnidadDeTrabajo` con implementación en memoria y en PostgreSQL; batería de contrato compartida.
- No existe usuario, asociado, cuota, pago, auditoría, API ni interfaz. `registrado_por` de `medicion` no tiene clave foránea.
- Docker 29 disponible; en esta máquina el puerto 5432 está ocupado por otro PostgreSQL ajeno al proyecto, por lo que las pruebas locales usan `SIJASS_PG_PUERTO`.
- Docs vigentes: ADR-001 (NestJS monolito modular), ADR-006 (Clean Architecture), ADR-008 (JWT corto, derivación robusta, autorización por JASS en cada caso de uso), ADR-011 (REST/OpenAPI), ADR-013 (pagos solo en línea), diseño interno §2, §3, §7, §8. Roadmap §4.2 y actores consideraban el acceso del asociado como *futuro* (se corrige aquí por decisión del 2026-11-19).
- Verificado: Node.js 24.18, npm 11.16, Chrome y Edge instalados (Playwright puede usar `channel: 'chrome'` sin descargar navegadores).

## Goals / Non-Goals

**Goals:**
- Flujo completo y verificable: el administrador registra un pago, el asociado ve su saldo actualizado desde el navegador y otra cuenta no puede acceder a esos datos.
- Aislamiento por JASS y por cuenta impuesto en servidor, en cada repositorio (filtro por `jass_id`) y en el esquema (claves compuestas).
- Dominio y casos de uso sin NestJS; el framework solo en la capa de interfaz.
- La misma batería de contrato para las implementaciones en memoria y PostgreSQL de los repositorios nuevos.

**Non-Goals:**
- Recuperación de contraseña, verificación de correo, MFA, varias JASS por cuenta, administración de plataforma por HTTP (se usa una orden de línea de comandos para crear la JASS y su primer `consejo`).
- Pasarelas de pago, pagos offline, notificaciones, reportes de morosidad por periodo (solo saldo por asociado).
- Mediciones en la interfaz (`s1c`) y asistente (`s1d`).
- Despliegue, HTTPS, CDN y carga (paso 5 del plan; ver `s1e`).

## Decisions

**D1 — Estructura.** Se amplía el paquete existente con módulos por contexto, manteniendo capas: `src/dominio/{identidad,padron}/…`, `src/aplicacion/…`, `src/infraestructura/{memoria,postgres}/…` y `src/api/` (NestJS: controladores, guardias, filtros, módulo). La interfaz es un paquete aparte, `tecnologia/sijass-web/`, que habla solo con la API.

**D2 — Contraseñas y tokens.** `scrypt` de `node:crypto` (N=2^15, r=8, p=1, 64 bytes, sal de 16 bytes) como función de derivación robusta de ADR-008, sin dependencias nativas; se almacena `scrypt$N$r$p$sal$hash` y se compara en tiempo constante. Token de acceso JWT HS256 (15 min) firmado con `JWT_SECRET` (obligatorio, ≥ 32 bytes; la API no arranca sin él), con `sub` (usuario), `iat`, `exp`, `jti`; no lleva JASS, perfil ni rol (D3). Token de refresco opaco de 32 bytes aleatorios, almacenado como SHA-256 en `sesion`, de 7 días, rotado en cada uso; reutilizar uno ya rotado revoca la familia de la sesión.

**D3 — Autorización en cada solicitud.** Un guardia lee el token, verifica firma y vigencia, carga de PostgreSQL la membresía activa del usuario y construye el `ContextoActor { usuarioId, jassId, perfil, rol, asociadoId? }`. Cada ruta declara el perfil y los roles permitidos con un decorador; el guardia compara. Toda consulta de repositorio recibe `jassId` del contexto. Un recurso inexistente y uno de otra JASS devuelven el mismo `403` sin cuerpo informativo (RF01). Un filtro global audita cada `403` (`acceso.denegado`) fuera de la transacción de negocio, con actor, método, ruta con identificadores y motivo, nunca el cuerpo ni los encabezados.

**D4 — Esquema (migración `0002`).**
- `usuario(id, correo único en minúsculas, hash_contrasena, estado, intentos_fallidos, bloqueado_hasta, creado_en)`.
- `asociado(id, jass_id, nombre, documento, estado, creado_en)` con `UNIQUE (id, jass_id)` y `UNIQUE (jass_id, documento)`.
- `membresia(id, usuario_id, jass_id, perfil, rol, asociado_id, estado)` con `CHECK` de coherencia (`personal` ⇒ rol no nulo y asociado nulo; `asociado` ⇒ rol nulo y asociado no nulo), clave foránea compuesta `(asociado_id, jass_id)` a `asociado (id, jass_id)` y `UNIQUE (usuario_id) WHERE estado = 'activa'`.
- `sesion(id, usuario_id, familia_id, refresh_hash único, expira_en, usada_en, revocada_en, creada_en)`.
- `cuota(id, jass_id, asociado_id, periodo, importe_centimos, creada_en)` con `UNIQUE (jass_id, asociado_id, periodo)`, `CHECK (importe_centimos > 0)`, `CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$')` y clave foránea compuesta del asociado y `UNIQUE (id, jass_id)`.
- `pago(id, jass_id, cuota_id, importe_centimos, pagado_en, comprobante, clave_idempotencia, payload_hash, estado, registrado_por, ...)` con `UNIQUE (jass_id, clave_idempotencia)`, `CHECK (importe_centimos > 0)`, `CHECK (estado IN ('vigente','revertido'))` y clave foránea compuesta `(cuota_id, jass_id)`.
- `reversa_pago(id, jass_id, pago_id UNIQUE, motivo, actor_id, creada_en)`.
- `evento_auditoria(id, jass_id nullable, actor_id nullable, accion, recurso, recurso_id, detalle jsonb, origen, creada_en)` con disparador que rechaza `UPDATE` y `DELETE`.
- Se añade la clave foránea `medicion.registrado_por → usuario(id)` **no** en este cambio: las mediciones existentes de las pruebas usan UUID arbitrarios; se hará en `s1c` junto con la interfaz.
- La reversión elimina todo en orden inverso; aplicar → revertir → aplicar debe terminar bien (patrón de `0001`).

**D5 — Importes y saldo.** Enteros en céntimos de sol (`Number.isSafeInteger`, límite por pago 10^9). La API los recibe y devuelve como enteros; la interfaz formatea. Saldo del asociado = Σ cuotas con `periodo <= periodoActual` − Σ pagos `vigente`, con `periodoActual` tomado de `Reloj` en UTC-5 (América/Lima, sin horario de verano). Estado de cuota derivado, no almacenado, para que no pueda desincronizarse.

**D6 — Idempotencia del pago.** Cada pago lleva su `clave_idempotencia` (UUID del encabezado) y el `payload_hash` SHA-256 del contenido canónico (cuota, importe, comprobante). `INSERT … ON CONFLICT (jass_id, clave_idempotencia) DO NOTHING` seguido de lectura: igual hash → `200` con el pago original; distinto hash → `409`. No se reutiliza `operacion_idempotente`, cuya restricción de tipo y su resultado están acotados a mediciones. La concurrencia se prueba con 10 solicitudes simultáneas contra PostgreSQL.

**D7 — Control del sobrepago.** Dentro de la transacción del pago se bloquea la fila de la cuota (`SELECT … FOR UPDATE`) y se calcula el saldo pendiente con los pagos vigentes antes de insertar; así dos pagos distintos concurrentes no pueden superar juntos el importe de la cuota. Se prueba con dos pagos concurrentes que juntos exceden la cuota (uno debe fallar con `422`).

**D8 — Unidad de trabajo y auditoría.** `RepositoriosTransaccion` se amplía con `asociados`, `cuotas`, `pagos`, `usuarios`, `membresias`, `sesiones` y `auditoria`; los casos de uso escriben el evento dentro de `ejecutar`. La implementación en memoria hace copia y restauración de todos los almacenes (como hoy) para revertir. La costura `DecoradorRepositorios` existente permite probar la atomicidad forzando el fallo de `auditoria.registrar`.

**D9 — API (`/v1`).**

| Ruta | Quién | Notas |
|---|---|---|
| `POST /auth/login`, `/auth/refresh`, `/auth/logout` | público / refresh | respuesta uniforme de credenciales inválidas; `429` por bloqueo |
| `GET /yo` | autenticado | perfil, rol y nombre; nunca JASS ni tokens |
| `GET/POST /asociados`, `POST /asociados/:id/baja`, `POST /asociados/:id/acceso` | personal (lectura), `tesorero`/`consejo` (escritura) | `acceso` crea usuario + membresía de asociado |
| `GET /asociados/:id/estado-de-cuenta` | personal | `403` si no es de la JASS |
| `POST /cuotas/generar` | `tesorero`/`consejo` | `{ periodo, importeCentimos }` |
| `POST /pagos` (`Idempotency-Key`), `GET /pagos/:id`, `POST /pagos/:id/reversa` | `tesorero`/`consejo`; lectura personal | códigos del spec |
| `GET /portal/saldo`, `/portal/cuotas`, `/portal/pagos` | `asociado` | sin identificadores en la ruta |

Errores con cuerpo `{ codigo, mensaje }` estable. El documento OpenAPI (ADR-011) no entra en este cambio: la tabla anterior es el contrato provisional y la prueba HTTP de D11 lo fija; el contrato OpenAPI se produce en `s1e`.

**D10 — Interfaz.** React 19 + TypeScript + Vite; sin biblioteca de estado ni de rutas más allá de un enrutador mínimo; tokens en memoria y refresco en `sessionStorage`; proxy de Vite a la API en desarrollo. Pantallas: inicio de sesión; personal (padrón, cuotas, pagos, estado de cuenta con reversa); portal del asociado. Importes en soles con `Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })`.

**D11 — Pruebas.**
- Unitarias (`node:test`): contraseñas, tokens, reglas de cuota/pago/saldo, permisos.
- Contrato compartido memoria/PostgreSQL para `asociados`, `cuotas`, `pagos`, `usuarios`, `membresias`, `sesiones` y `auditoria`.
- Integración con PostgreSQL: esquema por SQL directo (restricciones, claves compuestas, disparador de auditoría, reversión de la migración), atomicidad y concurrencia.
- API: pruebas HTTP contra la aplicación NestJS real sobre PostgreSQL (`fetch` sobre `listen(0)`), incluida la matriz de aislamiento y el flujo «pago → saldo».
- E2E (Playwright con Chrome del sistema en local; Chromium instalado por Playwright en CI): flujo de dos contextos de navegador.
- CI: los jobs existentes más el job `api-web` (PostgreSQL + API + construcción de la interfaz + E2E).

**D12 — Arranque y datos de demostración.** `npm run crear-jass -- <nombre> <correo>` (contraseña por variable de entorno `SIJASS_CLAVE_INICIAL`, no por argumento, para que no quede en el historial) crea la JASS y el primer `consejo`. `npm run sembrar-demo` crea una JASS de demostración con personal y asociados solo si `SIJASS_PERMITIR_DEMO=1`; las contraseñas de demostración no se versionan y se leen del entorno.

## Risks / Trade-offs

- **NestJS y CommonJS:** Nest 11 exige decoradores experimentales y `emitDecoratorMetadata`. Se activan solo en el `tsconfig` del paquete, y el dominio no importa Nest. Si interfiere con `node:test` sobre `dist/`, las pruebas de la API se ejecutan con un script propio.
- **Hash `scrypt` con N=2^15:** consume ~32 MB y ~50 ms por intento; adecuado para el MVP, pero limita el rendimiento de inicio de sesión bajo carga (se medirá en el paso 5 con k6; el token de acceso evita rehacer el hash en cada solicitud).
- **Membresía única por cuenta:** impide a una persona operar en dos JASS; se registra como decisión abierta del roadmap.
- **Contraseña inicial fijada por el personal:** el asociado debería cambiarla; el cambio de contraseña no entra en este cambio y queda como limitación documentada.
- **`403` en lugar de `404`:** evita enumerar recursos, pero dificulta depurar; se compensa con la bitácora de auditoría.
- **Reloj en UTC-5:** correcto para el Perú; si una JASS operara fuera de esa zona, el periodo exigible diferiría por horas, sin efecto en el saldo de periodos cerrados.

## Migration Plan

Aditiva: la migración `0002` no toca tablas existentes. Reversión: `npm run migrar:revertir` elimina solo lo creado. No hay datos de producción que migrar.

## Open Questions

- ¿Un asociado podrá cambiar su contraseña desde el portal? (propuesto para un cambio posterior).
- ¿El `operador` verá cuotas y pagos? Aquí no tiene permiso alguno sobre ellos (matriz de actores).
- ¿Moneda y formato de comprobantes de las JASS piloto? Se usa texto libre de hasta 60 caracteres.
