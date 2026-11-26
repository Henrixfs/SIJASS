# Proposal

## Why

SIJASS debe poder ofrecerse como plataforma a varias JASS sin que una vea los datos de otra, y las personas que lo usan (muchas asociadas y asociados con poca experiencia digital) deben entrar sin fricción. Hoy el acceso exige un correo electrónico y una contraseña de 10 caracteres elegida por el personal; no existe cambio ni restablecimiento de clave; las cuentas del personal y las JASS solo se crean con un comando en el servidor; y el aislamiento entre JASS depende únicamente de que cada consulta filtre por `jass_id`. Antes de abrir el sistema a otras JASS hay que simplificar el ingreso y cerrar esos huecos.

Aporta a los criterios **C01–C02** (RF01 llevado a especificaciones verificables), **C03** y **C09** (aislamiento por JASS reforzado en la base de datos), **C04** (cuarto cambio SDD), **C05** (pruebas unitarias, de contrato, de integración y de aislamiento), **C06** (E2E de ingreso por perfil) y **C07** (interfaz de ingreso y administración sencilla y adaptable).

## What Changes

- **Ingreso con DNI.** La identificación es el número de DNI (8 dígitos) y una clave. El correo deja de ser requisito y de usarse para entrar. **BREAKING:** `POST /v1/auth/login` recibe `documento` y `contrasena` en lugar de `correo` y `contrasena`.
- **Dos tipos de acceso en pantalla.** «Soy asociado» y «Soy administrador». El servidor decide el perfil y el rol por la membresía de la cuenta, nunca por lo que elija la persona. Si el tipo elegido no coincide con la cuenta (y las credenciales son correctas) no se emite ninguna sesión y se explica cuál es el tipo real.
- **Claves de tres palabras.** El sistema genera la clave temporal («río-luna-maíz» sin tildes) al crear o restablecer un acceso, y la muestra una sola vez a quien la entrega. Las claves generadas se aceptan sin distinguir mayúsculas ni separadores. Las cuentas de personal deben cambiarla en el primer ingreso; las de asociados pueden conservarla.
- **Cambio y restablecimiento de clave.** Cambio de la propia clave (con la actual) y restablecimiento por quien corresponde: Tesorería o Consejo para asociados, el Consejo para su equipo y la plataforma para el Consejo. Ambos cierran las sesiones anteriores de la cuenta.
- **Gestión del equipo de la JASS.** El Consejo da de alta, lista y desactiva cuentas de Tesorería y Operador (hoy solo existe un comando).
- **Rol de plataforma.** Perfil nuevo, sin JASS propia, que da de alta, lista, suspende y reactiva JASS y restablece la clave de su Consejo. No puede leer padrón, cuotas, pagos, reservorios ni mediciones de ninguna JASS. Se crea solo por comando de servidor (`crear-plataforma`); `crear-jass` pasa a usar DNI.
- **Datos de la sesión.** `GET /v1/yo` añade nombre de la persona, DNI enmascarado, nombre de la JASS y la marca de cambio de clave pendiente.
- **Aislamiento multi-JASS reforzado en PostgreSQL.** Seguridad por filas (RLS) en las tablas con `jass_id`, aplicada con un rol de aplicación sin privilegios de propietario y con la JASS de la solicitud fijada en cada transacción, de modo que una consulta sin filtro no devuelva filas ajenas. Límite de intentos fallidos de inicio de sesión también por origen.
- **Interfaz.** Pantalla de ingreso de dos botones (sustituye al selector de cuatro perfiles), cambio de clave (obligatorio en el primer ingreso del personal), creación y restablecimiento de acceso del asociado mostrando la clave temporal e imprimible, sección «Equipo» del Consejo, área de «Plataforma», y nombre de la JASS visible en el panel y en el portal.
- **Documentación y contrato.** OpenAPI, matriz de cumplimiento, plan de pruebas y guía de operación se actualizan con evidencia verificable.

Fuera de alcance: recuperación de clave por correo o SMS, verificación en dos pasos, una persona con membresía en varias JASS (se rechaza con un conflicto genérico), documentos distintos del DNI de 8 dígitos como identificador de acceso, panel de facturación, incidencias y notificaciones, y la reorganización visual de las pantallas internas (cambios `s2b` y `s2c`).

## Capabilities

### New Capabilities
- `acceso-por-documento`: inicio de sesión con DNI y clave, tipo de acceso elegido frente al real, claves generadas, cambio de clave, limitación de intentos por cuenta y por origen, y datos de sesión (`/v1/yo`).
- `gestion-de-accesos`: alta, listado, desactivación y restablecimiento de accesos del equipo de la JASS y de los asociados, con clave temporal de un solo uso visible.
- `plataforma-jass`: rol de plataforma, alta, listado, suspensión y reactivación de JASS, restablecimiento de la clave del Consejo y comandos de arranque.
- `aislamiento-multi-jass`: garantía de que ninguna cuenta lee o escribe datos de otra JASS, también ante una consulta sin filtro, y de que la plataforma no accede a datos de negocio.
- `interfaz-acceso-y-administracion`: pantallas de ingreso, cambio de clave, entrega de claves, equipo y plataforma, sencillas, accesibles y adaptables a celular.

### Modified Capabilities
- `acceso-por-perfiles` (archivada desde `s1b`): se sustituyen «Inicio de sesión con credenciales individuales» (ahora con el DNI) y «Política mínima de contraseñas» (ahora de 10 a 128 caracteres y distinta del DNI, con claves temporales generadas) por sus equivalentes con DNI (tarea 9.2). El resto de la capacidad (limitación de intentos, renovación y cierre de sesión, perfiles y membresía única, autorización) no cambia.

## Impact

- **Backend** (`tecnologia/siJASS-clean-architecture`): dominio de acceso (nuevo perfil `plataforma`, claves, documento), casos de uso de sesiones y administración, controladores y guardia, repositorios en memoria y PostgreSQL, unidad de trabajo con rol y JASS por transacción, comandos de plataforma.
- **Base de datos:** migraciones `0004` (documento, nombre, clave generada y marca de cambio en `usuario`; estado y ubicación en `jass`; membresía de plataforma) y `0005` (rol de aplicación y políticas RLS). Ambas con reversión.
- **API:** `docs/api/openapi.yaml` (login, `yo`, `auth/cambiar-contrasena`, accesos de asociados, `equipo`, `plataforma`) con **ruptura** en el login.
- **Frontend** (`tecnologia/sijass-web`): ingreso, cliente de API, guardia de rutas, perfil, asociados, equipo, plataforma y pruebas.
- **Pruebas:** unitarias, de contrato (memoria y PostgreSQL), de integración (HTTP y RLS), Vitest y E2E con Playwright.
- **Dependencias entre cambios:** parte de la base de `s1b` (acceso, padrón, pagos) y de `s1e` (despliegue). No modifica el dominio de mediciones ni el asistente. `s2b` (rediseño de pantallas internas y PWA) y `s2c` (incidencias) quedan para cambios posteriores.
- **Riesgos:** conocer el DNI permite intentar entrar con la cuenta ajena (mitigado con mensajes idénticos, bloqueo por cuenta y límite por origen) y la migración de cuentas existentes con correo (ver `design.md`).
