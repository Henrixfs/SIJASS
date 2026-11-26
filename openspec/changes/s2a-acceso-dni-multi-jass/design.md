# Design

## Context

Estado observado el 2026-11-25 en `tecnologia/siJASS-clean-architecture/` y `tecnologia/sijass-web/` (rama `feat/s1e-despliegue-evidencia`):

- **Identidad.** Tabla `usuario` con `correo` único y obligatorio; `membresia` une usuario, JASS, perfil (`personal` o `asociado`) y rol; una sola membresía activa por cuenta (índice parcial). El servidor resuelve JASS, perfil y rol desde la membresía en cada solicitud (`guardia-y-filtro.ts`). `AutenticarUsuario` entra por correo, bloquea 15 min tras 5 fallos, iguala tiempos con un hash ficticio y audita.
- **Altas.** `CrearAccesoAsociado` recibe correo y contraseña de quien opera. `CrearJassConConsejo` y `CrearPersonal` solo existen como comandos (`cli.ts`). No hay cambio ni restablecimiento de clave, ni listado de equipo.
- **Aislamiento.** Todas las tablas de negocio llevan `jass_id`, con claves compuestas `(id, jass_id)`; los repositorios filtran por JASS; hay `api-aislamiento.test.ts` y una E2E con «otra JASS». No hay seguridad por filas, y la conexión usa el rol propietario (en Docker, superusuario).
- **Datos.** `asociado.documento` es único por JASS (4–20 caracteres); `jass` solo tiene `id` y `nombre`; `evento_auditoria` admite `jass_id` nulo. Migraciones `0001`–`0003` con `-- Up/Down Migration` (`node-pg-migrate`).
- **Frontend.** `ClienteApi.iniciarSesion(correo, contrasena)`, `Perfil = 'personal' | 'asociado'`, guardia de rutas en `lib/rutas.ts`, selector opcional de cuatro perfiles en `Ingreso.tsx` que revoca la sesión en el cliente si no coincide.
- **Entorno local.** PostgreSQL 16 en Docker (puerto 5433), base `sijass_demo` con la API en 3001; contraseñas de demostración fuera del repositorio. Aún no hay datos reales, por lo que las cuentas de demostración se pueden recrear.

Motivación y alcance: ver `proposal.md`. Requisitos verificables: ver `specs/`.

## Goals / Non-Goals

**Goals:**
- Entrar con DNI y clave, con el tipo de acceso decidido por el servidor y verificado, no por la pantalla.
- Que cada nivel cree y recupere los accesos del nivel siguiente sin correo ni conocimientos técnicos.
- Aislamiento entre JASS defendido en dos capas: filtro del repositorio y seguridad por filas, con pruebas que fallen si cualquiera de las dos se quita.
- Cambios compatibles con la arquitectura por capas (dominio y aplicación sin NestJS) y con la batería de contrato compartida entre memoria y PostgreSQL.

**Non-Goals:**
- Recuperación autoservicio de clave (SMS, correo, preguntas), verificación en dos pasos, inicio con proveedor externo.
- Una persona con membresías en varias JASS, o documentos que no sean DNI de 8 dígitos.
- Rediseño visual de las pantallas internas, PWA e incidencias (cambios `s2b` y `s2c`).
- Limitación de intentos compartida entre varias instancias del servidor (ver D9).

## Decisions

**D1 — El DNI es el identificador de la cuenta.** `usuario` gana `documento` (`^[0-9]{8}$`, único), `nombre`, `clave_generada` y `debe_cambiar_contrasena`; `correo` pasa a ser opcional y deja de usarse para entrar (se conserva la columna por si se añade recuperación). Las cuentas de asociados se rellenan desde `asociado.documento` en la migración cuando son de 8 dígitos; las de personal sin DNI no pueden entrar hasta recibir uno con un comando de una sola vez (`asignar-documento`). *Alternativas:* mantener correo y añadir DNI (obliga a tener correo, descartada); tabla aparte de credenciales (más piezas sin ganancia para el MVP). El documento del padrón sigue aceptando 4–20 caracteres, pero solo uno de 8 dígitos permite crear acceso (`documento-no-es-dni`).

**D2 — Perfil `plataforma` como membresía sin JASS.** `membresia.perfil` admite `plataforma` y `jass_id` pasa a ser nulo solo en ese caso (restricción de forma ampliada, mismo índice de «una membresía activa por cuenta»). En código, `ContextoAcceso` pasa a ser una unión: contexto de JASS (con `jassId`) o de plataforma (`jassId: null`). `exigirPermiso` estrecha el tipo, de modo que un caso de uso de JASS no compila con un actor de plataforma. Los permisos nuevos son `equipo.gestionar` (Consejo) y `jass.gestionar` (plataforma); ningún permiso de negocio incluye a la plataforma. *Alternativa:* bandera `es_plataforma` en `usuario` (deja dos mecanismos de autorización y permite combinar con una JASS, descartada).

**D3 — Tipo de acceso verificado en el servidor.** `POST /v1/auth/login` acepta `documento`, `contrasena` y `tipo` opcional (`asociado` | `administrador`; este último vale para `personal` y `plataforma`). El tipo se compara **después** de verificar la clave: si no coincide, `409 tipo-de-acceso-distinto` con `tipoReal`, sin sesión y sin contar como fallo; con clave errónea es `401` genérico. Esto sustituye la revocación en el cliente de `ErrorPerfilDistinto`. *Alternativa:* aceptar el tipo y entrar igual (el botón no serviría de control ni de guía).

**D4 — Claves generadas.** Lista versionada de 2048 palabras españolas de 3 a 7 letras, solo `a-z`, sin homófonos evidentes ni palabras ofensivas, probada por formato y duplicados. Se eligen 3 con `crypto.randomInt` (33 bits) unidas con guiones; el número de palabras es configurable (`SIJASS_PALABRAS_CLAVE`, por defecto 3). Mientras `clave_generada` sea verdadero, la clave escrita se canonicaliza antes de verificar (minúsculas, sin tildes, separadores `[\s-]+` a un guion); al elegir una clave propia la bandera pasa a falso y la comparación es exacta. Así hay una sola derivación `scrypt` por intento. *Alternativas:* PIN de 6 dígitos (20 bits, demasiado débil si se conoce el DNI), 12 caracteres aleatorios (difíciles de teclear), QR de acceso (exige un dispositivo previo).

**D5 — Cambio de clave obligatorio.** `debe_cambiar_contrasena` se lee en la misma consulta de la guardia que resuelve la membresía. Si es verdadera, la guardia responde `403 cambio-de-clave-pendiente` salvo en `POST /v1/auth/cambiar-contrasena`, `GET /v1/yo` y el cierre de sesión. Se activa al crear o restablecer personal, Consejo y plataforma, no para asociados.

**D6 — Emisión de claves temporales en un único servicio de aplicación.** `EmitirClaveTemporal(usuarioId, { forzarCambio })` genera, deriva, guarda hash y banderas, reinicia intentos y bloqueo, revoca las familias de sesión del usuario (`sesiones.revocarDeUsuario`) y devuelve la clave en claro solo al llamador. Lo usan alta y restablecimiento de asociados, equipo, Consejo y arranque de plataforma. La auditoría registra quién, a quién y cuándo, sin la clave ni el DNI completo.

**D7 — Cambio de clave propio.** `POST /v1/auth/cambiar-contrasena` verifica la actual (un fallo cuenta como intento fallido), valida la nueva (D1 de la spec), actualiza hash y banderas, revoca todas las familias, crea una sesión nueva y la devuelve con la forma del inicio de sesión.

**D8 — API nueva.** `GET/POST /v1/equipo`, `POST /v1/equipo/{usuarioId}/desactivar` y `/restablecer-clave` (Consejo); `POST /v1/asociados/{id}/acceso` sin contraseña de entrada y `POST /v1/asociados/{id}/acceso/restablecer`; `GET/POST /v1/plataforma/jass`, `POST /v1/plataforma/jass/{id}/suspender|reactivar` y `/consejo/restablecer-clave`; `acceso` (`sin-acceso|activo|inactivo`) en el padrón y la cuenta; `GET /v1/yo` ampliado. Todo bajo `/v1`, documentado en `docs/api/openapi.yaml` y cubierto por la prueba de contrato OpenAPI existente. El login es un cambio con ruptura: se actualiza el cliente en el mismo cambio y no se mantiene un modo con correo.

**D9 — Límite por origen.** Puerto `LimitadorDeIntentos` con implementación en memoria (ventana deslizante de 50 intentos **fallidos** por 15 minutos y por IP). Solo cuentan los fallos de credenciales: muchas familias entran por datos móviles con una IP compartida y un límite sobre todos los inicios las bloquearía entre sí (se descubrió al probar por HTTP). La IP sale de `X-Forwarded-For` solo si `TRUST_PROXY=1` (detrás de Caddy, `s1e`). Se consulta antes de tocar la cuenta y se anota cada fallo. *Limitación aceptada:* se reinicia con el proceso y no se comparte entre instancias; con una sola instancia es suficiente. *Alternativa:* contador en PostgreSQL (escrituras en cada intento; se difiere).

**D10 — JASS suspendida.** `jass` gana `estado` (`activa|suspendida`) y ubicación (departamento, provincia, distrito, centro poblado, opcionales), con unicidad por nombre y ubicación sin distinguir mayúsculas. La consulta de membresía de la guardia, de `AutenticarUsuario` y de `RenovarSesion` une el estado de la JASS y responde `403 jass-suspendida`. La suspensión no borra datos ni cierra sesiones explícitamente: el siguiente uso falla.

**D11 — Seguridad por filas con rol de aplicación.** La migración `0005` crea el rol `sijass_app` sin inicio de sesión (si no existe), le concede el uso del esquema y `SELECT/INSERT/UPDATE` sobre las tablas, concede el rol al usuario actual y activa RLS. Cada unidad de trabajo ejecuta `SET LOCAL ROLE sijass_app` y fija `app.jass_id` con `set_config(..., true)`; el propietario deja de verse afectado porque los privilegios caen durante la transacción (así funciona también con el superusuario de Docker). Políticas:
- Tablas de negocio (`asociado`, `cuota`, `pago`, `reversa_pago`, `reservorio`, `medicion`, `operacion_idempotente`): solo `jass_id = app.jass_id` en `USING` y `WITH CHECK`. Sin JASS fijada no se ve nada. No existe escape de sistema, por lo que la plataforma tampoco las ve.
- Tablas de identidad con JASS nula posible (`membresia`, `evento_auditoria`): `jass_id = app.jass_id` o `app.sistema = 'on'`. `usuario`, `sesion` y `jass` quedan sin RLS: se acceden por clave y no contienen datos de negocio.
La firma de la unidad de trabajo cambia a `ejecutar(contexto, fn)` con `contexto` = `{ jassId }`, `{ sistema: true }` o `{ plataforma: true }`; `sistema` solo lo usan inicio y renovación de sesión, la guardia al resolver la membresía, los comandos de servidor y el perfil de plataforma. La implementación en memoria acepta el mismo contexto y lo ignora (su aislamiento sigue siendo por filtro). *Alternativas:* conexión con un rol no propietario (obliga a cambiar el despliegue y los scripts), esquema por JASS (migraciones por cliente y consultas entre JASS imposibles), filtro solo en el código (la situación actual).

**D12 — Frontend.** La pantalla de ingreso tiene dos pasos en la misma vista: elegir «Soy asociado» o «Soy administrador» (botones grandes, `role="radiogroup"`), y después DNI y clave, con la opción elegida visible y un enlace «Cambiar». La interfaz exige elegir; la API lo admite opcional. `Perfil` añade `plataforma`; `Sesion` incluye los datos de `yo`; `App` muestra la pantalla de cambio de clave antes de cualquier ruta mientras el cambio esté pendiente. Rutas nuevas: `/personal/equipo`, `/plataforma` y `/plataforma/jass`. El diálogo de entrega de clave solo guarda la clave en estado de React, la borra al cerrar y la tarjeta imprimible usa una hoja de estilo `@media print`. Campos de DNI con `inputMode="numeric"`, `maxLength=8` y `autocomplete="username"`; clave con `autocapitalize="none"`, `autocorrect="off"` y `spellcheck="false"`.

**D13 — Demostración y E2E.** `sembrar-demo` crea DNIs fijos para Consejo, Tesorería, Operador, plataforma y tres asociados (los mismos 8 dígitos del padrón), con la clave del entorno como contraseña **elegida** (sin cambio pendiente) para no complicar las pruebas, más un caso con clave generada y cambio pendiente para probar ese flujo. `crear-jass` pasa a `crear-jass "<JASS>" <dni> "<nombre>"`.

**D14 — Orden de archivo y reconciliación.** Este cambio se escribe como capacidades nuevas porque `acceso-por-perfiles` de `s1b` aún no está en `openspec/specs/`. Al archivar `s1b`, antes de archivar este cambio se añade un delta `MODIFIED` sobre `acceso-por-perfiles` para sustituir «Inicio de sesión con credenciales individuales» (correo) y «Política mínima de contraseñas» por sus equivalentes con DNI (tarea 9.2).

## Risks / Trade-offs

- [El DNI no es secreto: cualquiera puede intentar entrar o bloquear una cuenta ajena] → mismas respuestas para DNI inexistente y clave errónea, bloqueo por cuenta de 15 min que se levanta solo o con restablecimiento, límite por origen, auditoría y claves de dos políticas (generada tolerante, elegida exacta).
- [33 bits de entropía en la clave de tres palabras] → protegida por `scrypt` (N=2^15), por el bloqueo y por el límite por origen; el personal debe cambiarla en el primer ingreso; con `SIJASS_PALABRAS_CLAVE=4` sube a 44 bits sin tocar la interfaz.
- [RLS mal aplicada o evadida por un superusuario] → `SET LOCAL ROLE sijass_app` dentro de cada transacción; pruebas que ejecutan consultas sin filtro y comprueban cero filas ajenas, y pruebas que fallan si se elimina una política o el filtro de un repositorio.
- [Cambio de la firma de la unidad de trabajo toca muchos casos de uso] → se hace con una pasada mecánica guiada por el compilador y la batería de contrato existente (256 unitarias, 215 de integración como base).
- [Ruptura del contrato de login] → cliente, E2E, OpenAPI y demostración cambian en el mismo cambio; no hay clientes externos.
- [La clave en pantalla y en una tarjeta impresa puede filtrarse] → se muestra una sola vez, se advierte que se entregue y destruya, no se guarda en el navegador ni en bitácoras.
- [Los datos personales (DNI, nombre) están protegidos por la Ley 29733] → solo se recogen los necesarios, se muestran enmascarados, no se registran completos en auditoría y la plataforma no accede a datos de asociados.
- [Lista de palabras con términos inapropiados] → curada y revisada, con prueba de formato y sin duplicados.

## Migration Plan

1. Aplicar `0004` (columnas nuevas, `correo` nulo, rellenado de DNI de asociados, `jass` con estado y ubicación, membresía de plataforma) y verificar que `migrar:revertir` y `migrar` repiten sin error, como en las migraciones anteriores.
2. Aplicar `0005` (rol `sijass_app`, concesiones, RLS y políticas). La reversión elimina políticas y desactiva RLS y revoca concesiones; el rol, que es del clúster, no se elimina y queda documentado.
3. Entornos existentes sin datos reales: recrear la base de demostración con `sembrar-demo` actualizado. Si hubiera cuentas de personal con correo, asignarles DNI con `asignar-documento` antes de usar el nuevo ingreso.
4. Crear la cuenta de plataforma con `crear-plataforma` y la JASS con la interfaz de plataforma o `crear-jass`.
5. Desplegar API y frontend juntos (el login cambia). Reversión: volver a la imagen anterior y `migrar:revertir` de `0005` y `0004`; las cuentas creadas con DNI sin correo no podrían usarse en la versión anterior.

## Open Questions

- Diseño final de la tarjeta imprimible (logotipo, tamaño); no cambia los requisitos.
- Si conviene pasar a 4 palabras por defecto tras probar con familias reales.
- Textos en otro idioma para las pantallas de ingreso; se difiere a un cambio posterior.
