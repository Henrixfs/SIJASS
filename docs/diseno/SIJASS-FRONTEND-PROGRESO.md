# SIJASS 2026 · Implementación del frontend

La implementación continúa en [`tecnologia/sijass-web`](../../tecnologia/sijass-web/), sobre el cliente HTTP, la sesión, las rutas y los flujos que ya estaban en la rama `feat/s1e-despliegue-evidencia`. La línea base compiló, pasó lint y registró 94 pruebas Vitest. Se conservaron los archivos sin seguimiento que ya existían.

El trabajo se contrastó con el [handoff de UI/UX](./SIJASS-HANDOFF-UIUX.md), el [progreso de Penpot](./SIJASS-PENPOT-PROGRESO.md), [OpenAPI](../api/openapi.yaml) y la [matriz de permisos](../../tecnologia/siJASS-clean-architecture/src/dominio/acceso.ts). Los archivos de aplicación modificados pertenecen al frontend. También se actualizaron las pruebas Playwright que recorrían controles sustituidos por enlaces o diálogos accesibles.

## Implementación y contratos

| Módulo y ruta | Alcance de la interfaz | Contratos empleados |
|---|---|---|
| Ingreso, `/ingresar` | Dos botones («Soy asociado» y «Soy administrador»), DNI y clave, ver u ocultar la clave, tipo de acceso equivocado, bloqueo, JASS suspendida, expiración y cierre de sesión (s2a). | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/yo` |
| Cambio de clave | Pantalla única «Elige tu clave» en el primer ingreso del personal y diálogo voluntario en el perfil; el resto de la interfaz no se carga hasta cambiarla (s2a). | `POST /v1/auth/cambiar-contrasena` |
| Entrega de clave | Cuadro con la clave de tres palabras en letra grande, copiar e imprimir tarjeta; se muestra una sola vez y no se guarda en el navegador (s2a). | Respuestas de alta y restablecimiento |
| Equipo, `/personal/equipo` | Solo Consejo: alta de Tesorería y Operadores por DNI, restablecer clave y desactivar (s2a). | `GET/POST /v1/equipo`, `POST /v1/equipo/{id}/restablecer-clave`, `POST /v1/equipo/{id}/desactivar` |
| Plataforma, `/plataforma` | Cuenta de plataforma: alta de JASS con su primer Consejo, suspensión, reactivación y restablecer la clave del Consejo; sin datos de negocio (s2a). | `GET/POST /v1/plataforma/jass`, `POST /v1/plataforma/jass/{id}/suspender`, `/reactivar`, `/consejo/restablecer-clave` |
| Panel, `/personal/inicio` | Accesos por rol. `/personal` conserva la entrada operativa previa al padrón para Consejo y Tesorería y a mediciones para Operador. | Rol autenticado de la sesión |
| Perfil, `/personal/perfil` | Lectura de perfil y rol, acceso a módulos según la matriz y retorno a la ubicación anterior. La lista de módulos se deriva de la matriz, ya que el endpoint devuelve solo `perfil` y `rol`. | `GET /v1/yo` |
| Padrón, `/personal/asociados` | Alta, búsqueda y filtro local, paginación, cuenta, creación de acceso y baja con confirmación. El acceso se crea por DNI y la clave la genera el servidor (s2a); también se restablece desde la fila del asociado. | `GET/POST /v1/asociados`, `POST /v1/asociados/{id}/acceso`, `POST /v1/asociados/{id}/acceso/restablecer`, `POST /v1/asociados/{id}/baja` |
| Cuotas y pagos, `/personal/cuotas`, `/personal/cuotas/{id}`, `/personal/asociados/{id}` | Generación por periodo, consulta de cuenta, alta de pago idempotente, detalle, auditoría de reversa y retorno al historial conservando el pago original. El motivo de reversa es obligatorio y admite hasta 300 caracteres. Tras una reversa se solicitan al servidor los saldos y estados. | `POST /v1/cuotas/generar`, `GET /v1/asociados/{id}/estado-de-cuenta`, `POST /v1/pagos`, `GET /v1/pagos/{id}`, `POST /v1/pagos/{id}/reversa` |
| Reservorios, `/personal/reservorios` | Catálogo para personal y alta para Consejo. | `GET/POST /v1/reservorios` |
| Mediciones y campo, `/personal/mediciones`, `/personal/campo` | Historial para personal y captura manual idempotente para Operador. Métodos y unidad del catálogo, toma en hora de Lima y valor registrado según contrato. | `GET /v1/reservorios`, `GET /v1/reservorios/{id}/mediciones`, `GET /v1/mediciones/catalogo`, `POST /v1/mediciones` |
| Familias, `/portal` | Saldo, cuotas y pagos propios, actualización al volver a la pestaña, historial de cuenta dada de baja y navegación dentro del portal. | `GET /v1/portal/saldo`, `GET /v1/portal/cuotas`, `GET /v1/portal/pagos` |
| Asistente, `/personal/asistente` | Consulta documental, fuentes, abstención, fuera de alcance y aviso de corpus de ejemplo. | `GET /v1/asistente/documentos`, `POST /v1/asistente/consultas` |

### Base visual y archivos

- [`estilos.css`](../../tecnologia/sijass-web/src/estilos.css) contiene paleta y espaciado del handoff, superficies azul marino y turquesa, contornos de foco, estados semánticos, movimiento reducido y layouts adaptables. Manrope 800 e Inter Tight 400–700 se sirven desde el propio build en WOFF2 latino, con fallback del sistema. La sombra y la duración de transición son decisiones de implementación. [Manrope](https://fonts.google.com/specimen/Manrope) · [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) · [Licencias OFL](../../tecnologia/sijass-web/public/fonts/)
- [`ui.tsx`](../../tecnologia/sijass-web/src/ui.tsx) comparte botones, avisos, esqueleto, reintentos, insignias, región de tabla y diálogo nativo. Inputs y selectores conservan etiquetas y validación HTML. La paginación y los filtros del padrón consumen la colección del contrato existente.
- `TablasFinancieras.tsx` compartía tablas semánticas de cuotas y pagos (por debajo de 1100 px pasaban a tarjetas). Se retiró en `s2b`: cuotas, pagos y cuentas siguen la maqueta v3 en [`CuotasYPagos.tsx`](../../tecnologia/sijass-web/src/paginas/CuotasYPagos.tsx) y [`Cajones.tsx`](../../tecnologia/sijass-web/src/paginas/Cajones.tsx).
- [`Personal.tsx`](../../tecnologia/sijass-web/src/paginas/Personal.tsx) y [`NavegacionPersonal.tsx`](../../tecnologia/sijass-web/src/paginas/NavegacionPersonal.tsx) centralizan rutas por rol, navegación móvil y foco tras cambiar de pantalla. Mediciones y asistente se cargan bajo demanda. [Matriz de rutas](../../tecnologia/sijass-web/src/lib/personal.ts)
- [`ClienteApi`](../../tecnologia/sijass-web/src/api/cliente.ts) reutiliza un refresco concurrente ante `401`, conserva el token de acceso en memoria y el refresco en `sessionStorage`, evita rotaciones dobles ante una respuesta tardía y revoca un refresco que llega después de cerrar sesión. Una respuesta `403` conserva la sesión y las consultas protegidas dejan de mostrar los datos previamente cargados.

## Verificación y recuperación

| Etapa | Evidencia registrada |
|---|---|
| Línea base | Lint y build correctos. Vitest 94/94. JS inicial 251,29 kB, 76,37 kB con gzip. |
| Sistema visual, rutas y módulos | Lint y build correctos tras integrar la estructura. La primera ronda funcional verificó 101/101 casos. |
| Sesión y tablas compactas | Lint, build y 103/103 casos correctos antes de incorporar las fuentes locales y el panel de acceso en el detalle. |
| Revisión final del frontend | Lint y compilación TypeScript/Vite correctos. Vitest 104/104 en cinco archivos. JS inicial 258,07 kB y 79,50 kB con gzip. Asistente 1,37 kB y mediciones 2,51 kB con gzip, bajo demanda. CSS 2,96 kB con gzip. Las dos fuentes locales suman 58,78 kB y sus licencias se incluyeron en la distribución. |
| Navegador | Chrome registró como correctos, antes de la suspensión, los seis casos de 320, 360, 390, 768, 1024 y 1440 px y un caso de navegación y permisos para los otros roles. Las pruebas interceptaron el contrato y observaron navegación por teclado, Escape, devolución del foco, área de 44 px, ausencia de desborde horizontal y actualización posterior a reversa. Se revisaron capturas de la cuenta a 360 y 1440 px y de la reversa compacta a 390 px. Quedó sin resultado consolidado la última ejecución con la comprobación automatizada de fuentes. |
| Contraste | Cálculo directo sobre los tokens de CSS. Texto principal 14,68:1, secundario 6,52:1, acción primaria 6,04:1, reversa 7,15:1, borde de campo 4,94:1 y anillo de foco sobre el lienzo 5,60:1. Los pares de estados revisados están entre 6,09:1 y 6,19:1. |
| API y PostgreSQL reales | La primera corrida, anterior a la suspensión, usó un clúster temporal verificado. Pasaron los cuatro casos de asistente y mediciones. El caso de pagos se detuvo por la coincidencia ambigua de un selector en Playwright. El selector se corrigió. La suite E2E se excluyó del cierre por indicación del usuario, por lo que los demás recorridos carecen de un resultado final contra la API real. |

Comandos de reproducción desde la raíz del repositorio.

```powershell
npm.cmd --prefix tecnologia/sijass-web run lint
npm.cmd --prefix tecnologia/sijass-web test
npm.cmd --prefix tecnologia/sijass-web run build
Push-Location tecnologia/e2e
.\node_modules\.bin\playwright.cmd test --config playwright.responsive.config.ts
Pop-Location
```

El comando de navegador figura como referencia para una futura verificación. La configuración E2E real utiliza un preparador que reemplaza su base de fixtures y queda fuera del alcance actual. [Guía E2E](../../tecnologia/e2e/README.md) · [Suite visual y responsive](../../tecnologia/e2e/responsive/sijass.spec.ts)

## Alcance pendiente

- Incidencias, sincronización offline e indicadores agregados del panel requieren contratos aprobados. El panel disponible usa accesos por rol.
- Los contrastes y los recorridos de teclado medidos se documentan por muestra. La evaluación completa de conformidad WCAG 2.2 AA requiere revisar también lectores de pantalla, zoom, navegadores y dispositivos físicos. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- La sesión de refresco sigue el contrato vigente con token rotatorio. Una transición a otro mecanismo de almacenamiento requiere coordinar el contrato con backend.

## Alineación con Penpot (25 nov 2026)

- **Ingreso** (`paginas/Ingreso.tsx`, `ingreso.css`): rehecho según «04 · Inicio de sesión» (web 1440 y móvil 390) con los cuatro estados de acceso del diseño. Se añadió un selector opcional «Ingresar como» (Asociado, Consejo, Tesorería, Operador) que no existe en Penpot: si se elige un perfil y la cuenta no lo tiene, el cliente revoca el refresco recién emitido, no guarda la sesión y explica el perfil real (`ErrorPerfilDistinto`). Sin selección el comportamiento es el anterior. La autorización sigue siendo del servidor. **Sustituido por `s2a`:** el selector «Ingresar como» con cuatro perfiles y el ingreso por correo se retiraron; ahora hay dos botones y el ingreso es por DNI (ver «Acceso por DNI» abajo).
- **Portal de familias** (`paginas/Portal.tsx`, `portal.css`, `lib/periodos.ts`): separado en Inicio, Pagos (`/portal/pagos`), Historial (`/portal/historial`), Reportes (`/portal/reportes`) y Perfil (`/portal/perfil`), con barra inferior, detalle de cuota, filtros del historial y confirmación de cierre de sesión. Solo muestra datos de `/v1/portal/*`: el diseño incluye «Agua disponible», mantenimiento, notificaciones y datos de contacto sin contrato, y no se implementaron. Reportes muestra un aviso de «Próximamente» hasta que exista el contrato de incidencias.
- **Panel del personal** (`paginas/NavegacionPersonal.tsx`, `Resumen.tsx`, `personal.css`): barra lateral de 240 px con grupos «Gestión» y «Servicio de agua», cabecera con ruta de navegación y dashboard «Dashboard general» según «02 · Dashboard web». Los indicadores salen solo de datos reales: asociados activos, saldo por cobrar y asociados con saldo (`GET /v1/asociados`, solo Consejo y Tesorería) y reservorios con su última lectura y actividad reciente (`GET /v1/reservorios` y `/v1/reservorios/{id}/mediciones`). No se muestran recaudación, gráfico de seis meses, nivel de llenado, incidencias, notificaciones, selector de periodo ni nombre de la JASS y del usuario, porque no hay contrato. El nombre de la sección «Inicio» pasó a «Resumen».
- **Pendiente respecto a Penpot**: restyling de Asociados, Cuotas, Reservorios, Mediciones y Asistente dentro del nuevo marco (siguen con el estilo «Premium 2026»), incidencias web y móvil, notificaciones, selector de periodo, detalle de reservorio y trazabilidad de mediciones, PWA y sincronización sin conexión.

## Acceso por DNI y varias JASS (`s2a-acceso-dni-multi-jass`, 25 nov 2026)

La pantalla de ingreso se simplificó para personas sin estudios: dos botones grandes, el DNI y la clave. El servidor decide quién es la persona; con el botón equivocado la interfaz lo explica y ofrece el otro, sin dar sesión. Las claves las genera el sistema en tres palabras, se muestran una sola vez y el personal las cambia en el primer ingreso. El nombre de la JASS aparece en la barra lateral, el perfil y el portal; la cuenta de plataforma tiene su propio marco sin secciones de negocio. Las pantallas internas (padrón, cuotas, reservorios, mediciones y asistente) conservan su estilo anterior: el restyling según Penpot y la PWA quedan para `s2b`, y la interfaz de incidencias para `s2c`, tras el backend `s1f`.

| Etapa | Evidencia registrada (local, 2026-11-25) |
|---|---|
| Interfaz | `npm run lint`, `tsc -b`, `npm test` y `npm run build` en código 0; 147 pruebas Vitest en 7 archivos, 24 de ellas del acceso por DNI |
| E2E real | 14 pruebas aprobadas (API, PostgreSQL y Chrome): los tres flujos anteriores adaptados y cinco recorridos de acceso |
| Pantallas | 23 pruebas aprobadas con la API simulada, 15 de ellas del ingreso, el cambio y la entrega de clave a 320, 360, 390, 768 y 1440 px. Sin desbordamiento, objetivos de al menos 44 px, contraste mínimo de 5,70:1 y recorrido por teclado. [Capturas y medidas](evidencia/s2a-acceso/README.md) |

```powershell
Push-Location tecnologia/e2e
$env:GUARDAR_EVIDENCIA = '1'
.\node_modules\.bin\playwright.cmd test --config playwright.responsive.config.ts
Pop-Location
```

No hay prueba con personas reales, lectores de pantalla ni dispositivos físicos. Las rutas de plataforma son `/plataforma` y sus subrutas; la guía de operación está en [`docs/08-despliegue`](../08-despliegue/guia-operacion-acceso.md).
