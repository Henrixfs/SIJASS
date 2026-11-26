# Tasks

## 1. Contrato y dominio

- [x] 1.1 Actualizar `docs/api/openapi.yaml` con el login por `documento`/`tipo`, `auth/cambiar-contrasena`, `yo` ampliado, accesos de asociados sin contraseña y su restablecimiento, `equipo`, `plataforma` y los códigos `tipo-de-acceso-distinto`, `cambio-de-clave-pendiente`, `jass-suspendida` y `documento-no-es-dni`; comprobar con la prueba de contrato OpenAPI que una ruta no documentada la hace fallar.
- [x] 1.2 Añadir al dominio el documento (validación de 8 dígitos, enmascarado de los 3 últimos), el perfil `plataforma`, el contexto de acceso como unión (JASS o plataforma) y los permisos `equipo.gestionar` y `jass.gestionar`; probar que ningún permiso de negocio incluye a la plataforma y que un caso de JASS no compila con un contexto de plataforma.
- [x] 1.3 Crear la lista de 2048 palabras, el generador de claves (`crypto.randomInt`, palabras configurables) y la canonicalización de claves generadas; probar formato, ausencia de duplicados y de caracteres fuera de `a-z`, que la clave cumple la longitud mínima, que dos claves distintas no coinciden en 1000 generaciones y la tolerancia a mayúsculas, tildes, espacios y guiones.
- [x] 1.4 Definir los puertos nuevos (`buscarPorDocumento`, `revocarDeUsuario`, estado y ubicación de JASS, listado de equipo, `LimitadorDeIntentos`) y el contexto de la unidad de trabajo (`{ jassId } | { sistema } | { plataforma }`); comprobar que el proyecto compila y que la batería de contrato existente sigue pasando con la implementación en memoria.

## 2. Persistencia de identidad

- [x] 2.1 Escribir la migración `0004`: `usuario.documento` único, `nombre`, `clave_generada`, `debe_cambiar_contrasena`, `correo` opcional, rellenado del DNI de asociados, `jass.estado` y ubicación con unicidad por nombre y ubicación, y membresía de plataforma con `jass_id` nulo; comprobar aplicar → revertir → aplicar en PostgreSQL desechable y que las restricciones rechazan documentos inválidos, duplicados y membresías mal formadas.
- [x] 2.2 Implementar los repositorios nuevos en memoria y en PostgreSQL (usuarios por documento, JASS con estado, membresías con listado de equipo y plataforma, sesiones revocadas por usuario); ampliar la batería de contrato y comprobar que pasa con ambas implementaciones, incluido el documento duplicado entre JASS distintas.
- [x] 2.3 Reunir en un solo lugar la derivación de claves y la verificación con y sin canonicalización según `clave_generada`; probar que una clave generada se acepta con variantes de escritura y una elegida solo exacta, y que el costo de verificación no distingue DNI inexistente de clave errónea.

## 3. Inicio de sesión, cambio de clave y sesión

- [x] 3.1 Reescribir `AutenticarUsuario` para entrar por DNI con tipo opcional, `409 tipo-de-acceso-distinto` tras clave correcta y `403 jass-suspendida`; probar los escenarios de la spec: éxito, DNI inexistente frente a clave errónea con cuerpos idénticos, formato inválido, tipo coincidente, tipo distinto sin sesión ni fallo contado, tipo con clave errónea y bloqueo tras 5 fallos.
- [x] 3.2 Implementar `LimitadorDeIntentos` en memoria y aplicarlo al login (50 intentos fallidos por 15 minutos y por origen, IP de `X-Forwarded-For` solo con `TRUST_PROXY=1`); probar el `429` sin consultar la cuenta, que los inicios correctos no cuentan, la ventana deslizante y que un origen no afecta a otro.
- [x] 3.3 Añadir `POST /v1/auth/cambiar-contrasena` y la política de contraseñas elegidas (10–128 y distinta del DNI); probar el cambio correcto con sesiones anteriores invalidadas, clave actual errónea contada como fallo, `422` por política y que la clave anterior deja de servir.
- [x] 3.4 Aplicar en la guardia el cambio pendiente (`403 cambio-de-clave-pendiente` salvo cambiar clave, `yo` y cierre de sesión) y el estado de la JASS en cada solicitud y renovación; probar por HTTP personal con cambio pendiente, asociado sin obligación y renovación de una JASS suspendida.
- [x] 3.5 Ampliar `GET /v1/yo` con nombre, DNI enmascarado, nombre de la JASS y cambio pendiente sin identificadores internos; probar Consejo, asociado y plataforma, y que la respuesta no contiene el identificador de la JASS.
- [x] 3.6 Auditar inicio, fallo, bloqueo, tipo distinto, cambio y restablecimiento sin claves, tokens ni DNI completo; probar leyendo `evento_auditoria` tras cada flujo.

## 4. Gestión de accesos

- [x] 4.1 Cambiar `CrearAccesoAsociado` para generar la clave temporal, rechazar documentos que no son DNI, asociados de baja o con acceso y documentos con cuenta en otra JASS sin revelarla; probar cada escenario de la spec y que la clave aparece solo en la respuesta de alta.
- [x] 4.2 Implementar el restablecimiento de la clave de un asociado y el estado de acceso (`sin-acceso|activo|inactivo`) en padrón y cuenta; probar que Operador recibe `403`, que el bloqueo se levanta, que las sesiones previas se rechazan y que un asociado de otra JASS responde como inexistente.
- [x] 4.3 Implementar el listado, alta, desactivación y restablecimiento del equipo para el Consejo (solo Tesorería y Operador, cambio de clave pendiente, no desactivarse a sí mismo ni a un Consejo); probar roles no permitidos `422`, otros roles `403`, desactivación con sesiones invalidadas y cuentas de otra JASS.
- [x] 4.4 Comprobar con una prueba de integración que ninguna respuesta, auditoría ni registro de la aplicación contiene la clave temporal generada.

## 5. Plataforma y comandos de servidor

- [x] 5.1 Implementar los casos de plataforma: alta de JASS con su primer Consejo en una transacción, listado con cuentas activas, suspensión, reactivación y restablecimiento de la clave del Consejo; probar alta correcta, atomicidad ante DNI duplicado, nombre y ubicación duplicados, suspensión y reactivación con sus efectos, y que el listado no incluye datos de negocio.
- [x] 5.2 Exponer `/v1/plataforma/*` y comprobar por HTTP que la plataforma recibe `403` al consultar padrón, cuotas, pagos, reservorios, mediciones y asistente, y que el personal y los asociados reciben `403` en `/v1/plataforma`.
- [x] 5.3 Añadir los comandos `crear-plataforma`, `crear-jass "<JASS>" <dni> "<nombre>"` y `asignar-documento`, con claves leídas del entorno y sin imprimirlas, y actualizar `sembrar-demo` (DNIs fijos, clave elegida del entorno, una cuenta con clave generada y cambio pendiente y una de plataforma); probar cada comando en una base desechable, incluida la negativa sin variables de entorno.

## 6. Aislamiento multi-JASS en PostgreSQL

- [x] 6.1 Escribir la migración `0005` con el rol `sijass_app`, concesiones, RLS y políticas de las tablas de negocio, `membresia` y `evento_auditoria` según el diseño D11; comprobar aplicar → revertir → aplicar y que la reversión deja las tablas sin RLS.
- [x] 6.2 Hacer que la unidad de trabajo de PostgreSQL ejecute `SET LOCAL ROLE sijass_app` y fije `app.jass_id` o el modo de sistema según el contexto, y adaptar todos los casos de uso y la guardia a la nueva firma; comprobar que `npm test` y `npm run test:integration` base siguen pasando.
- [x] 6.3 Escribir la batería de aislamiento con tres JASS que, para asociados, cuotas, pagos, reversas, reservorios, mediciones y equipo, compruebe lecturas por identificador, listados, escrituras ajenas, consultas sin filtro, inserción con otra JASS y transacción sin JASS, con las implementaciones en memoria y PostgreSQL; comprobar que falla al quitar el filtro de un repositorio y que falla al eliminar una política.
- [x] 6.4 Comprobar que la transacción de plataforma no ve filas de negocio y que una solicitud de negocio no puede activar el modo de sistema; ejecutar la prueba de integración completa contra PostgreSQL.

## 7. Interfaz

- [x] 7.1 Actualizar `ClienteApi`, `Perfil`, `Sesion` y la guardia de rutas: login por documento y tipo con `ErrorTipoDeAcceso` del servidor (se retira la revocación en el cliente), datos de `yo` en la sesión y rutas de plataforma; probar con Vitest la guardia de los cuatro perfiles, el manejo de `409`, `403 jass-suspendida` y `cambio-de-clave-pendiente`.
- [x] 7.2 Rehacer `Ingreso` con los dos botones grandes, DNI numérico de 8 dígitos, clave con opción de mostrar, mensajes en lenguaje común y los atributos de teclado móvil; probar los escenarios de la spec (asociado, administrador, tipo equivocado, datos incorrectos, bloqueo con tiempo, JASS suspendida, sesión vencida) y el orden de teclado.
- [x] 7.3 Crear la pantalla de cambio de clave (obligatoria y única para personal con cambio pendiente, voluntaria desde el perfil) con validación junto al campo; probar la obligatoriedad, la confirmación distinta y el paso al panel.
- [x] 7.4 Crear el diálogo de entrega de clave (letra grande, DNI y nombre, copiar, imprimir tarjeta con `@media print`, aviso de entrega única, borrado al cerrar) y usarlo en alta y restablecimiento de asociados; probar que la clave no queda en el DOM tras cerrar ni en el almacenamiento del navegador.
- [x] 7.5 Actualizar Asociados y Cuenta con estado de acceso, «Crear acceso» sin contraseña y «Restablecer clave»; probar los estados `sin-acceso`, `activo` e `inactivo`, los errores `409` y `422` y la ocultación de acciones para Operador.
- [x] 7.6 Crear la sección «Equipo» del Consejo (lista con DNI enmascarado, alta, restablecer, desactivar con confirmación) y mostrarla solo a ese rol; probar cada acción y que Tesorería y Operador no ven el enlace ni acceden por ruta.
- [x] 7.7 Crear el área de plataforma con su propio marco (lista de JASS, alta con ubicación y Consejo, suspender, reactivar y restablecer la clave del Consejo con entrega de clave) y mostrar el nombre de la JASS y de la persona en el panel, el portal y el perfil; probar el alta, la suspensión y que la plataforma no ve pantallas de negocio.
- [x] 7.8 Ejecutar `lint`, `vitest` y `build` del frontend y comprobar que el tamaño del JS inicial no crece más de 10 kB comprimidos respecto de la línea base registrada en `docs/diseno/SIJASS-FRONTEND-PROGRESO.md`.

## 8. Pruebas de extremo a extremo y de adaptación

- [x] 8.1 Actualizar la preparación E2E y los asistentes de ingreso a DNI y tipo; ejecutar los flujos existentes (pagos, mediciones, asistente) contra la API y PostgreSQL reales y comprobar que pasan.
- [x] 8.2 Añadir E2E de los recorridos nuevos: Consejo crea Tesorería y esta cambia su clave, Tesorería crea el acceso de un asociado que entra con la clave generada, restablecimiento tras bloqueo, tipo equivocado y plataforma que crea una JASS cuyo Consejo no ve datos de otra JASS.
- [x] 8.3 Ejecutar el ingreso, el cambio de clave y la entrega de clave a 320, 360, 390, 768 y 1440 px sin desbordamiento horizontal, con objetivos de al menos 44 px, contraste medido y recorrido por teclado; guardar capturas y medidas en `docs/diseno/evidencia`.

## 9. Documentación y cierre

- [x] 9.1 Actualizar la matriz de cumplimiento (C01–C09 aplicables), el plan de pruebas, el README del backend y una guía breve de operación (arranque de plataforma, alta de JASS, entrega y restablecimiento de claves, rol `sijass_app`), citando solo evidencia ejecutada; comprobar con `node scripts/verificar-docs.mjs`.
- [ ] 9.2 Al archivar `s1b-acceso-cuotas-pagos`, añadir a este cambio un delta `MODIFIED` sobre `acceso-por-perfiles` que sustituya el inicio de sesión con correo y la política de contraseñas por los de `acceso-por-documento`; comprobar con `openspec validate s2a-acceso-dni-multi-jass --strict`.
- [x] 9.3 Ejecutar el conjunto completo (`npm test`, `npm run test:integration`, lint y build del backend; lint, Vitest y build del frontend; E2E) sobre una base limpia y registrar los resultados y los comandos en el documento de avance.

## Workflow follow-up

- Archivar este cambio solo después de `s1b-acceso-cuotas-pagos` y de la reconciliación de la tarea 9.2.
- Los cambios `s2b-interfaz-penpot-completa` (pantallas internas y PWA) y `s2c-incidencias-interfaz` (incidencias, tras `s1f`) parten de este y se proponen por separado.
