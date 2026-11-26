# SIJASS 2026 · Handoff de UI/UX para React

## Alcance y disponibilidad

Fuente visual: archivo Penpot **SIJASS UI/UX 2026**. Fuente de operaciones: [OpenAPI](../api/openapi.yaml) y reglas del backend. Se completaron el flujo principal de reversa, el perfil del personal y la composición compacta de la cuenta con su detalle. La auditoría cubrió geometría y una exportación representativa por página. La prueba visual del compacto y el recorrido integral entre páginas quedan pendientes. [Registro de avance y recuperación](SIJASS-PENPOT-PROGRESO.md)

Las rutas React actuales parten de `/ingresar`, `/personal` y `/portal`. El detalle con cuenta del asociado se resuelve en `/personal/asociados/{id}`. Las entradas de módulo de este documento son destinos de diseño hasta que el frontend implemente la navegación correspondiente. [Guardia de pantallas](../../tecnologia/sijass-web/src/lib/rutas.ts) · [Composición actual](../../tecnologia/sijass-web/src/App.tsx) · [Vista de personal](../../tecnologia/sijass-web/src/paginas/Personal.tsx)

## Inventario y correspondencia con la API

Los nombres e IDs de las 13 páginas se confirmaron en la reanudación con Penpot MCP. Se revisó una exportación representativa por página, además de los frames específicos indicados. Las operaciones declaradas se basan en el OpenAPI del árbol de trabajo.

| Página | ID en Penpot | Pantallas y operaciones | Evidencia |
|---|---|---|---|
| 01 · Sistema de diseño | `7b7d55f9-965b-8000-8008-fcea45871667` | Fundamentos y biblioteca local de componentes | Sistema exportado y revisado. Se corrigió el límite del campo «Lectura actual». |
| 02 · Dashboard web | `2b246fa5-b31a-803d-8008-fcfdbd75c0fe` | Inicio de personal y navegación por rol. `GET /v1/yo` para determinar perfil y rol. Para los indicadores, usar solo las lecturas autorizadas que provean los datos. | Dashboard y perfil exportados y revisados. Entrada y regreso del perfil guardados. El contrato no declara un endpoint agregado de dashboard. |
| 03 · Home móvil | `2b246fa5-b31a-803d-8008-fcfdbd7b36de` | Portal de familias. `GET /v1/portal/saldo`, `GET /v1/portal/cuotas` y `GET /v1/portal/pagos`. | Revisada la pantalla de familias a 390 px. «Agua disponible» y actividad operativa son contenido de muestra que necesita fuente contractual antes de implementarse. |
| 04 · Inicio de sesión | `2b246fa5-b31a-803d-8008-fd8fb956fd59` | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout` y `GET /v1/yo`. Destino según perfil. | Contrato y rutas React revisados. Se revisó la pantalla web. Interacciones de prototipo pendientes. |
| 05 · Asociados web | `2b246fa5-b31a-803d-8008-fd8fb95b3132` | Padrón y detalle contextual, alta, baja, creación de acceso. `GET/POST /v1/asociados`, `POST /v1/asociados/{id}/baja`, `POST /v1/asociados/{id}/acceso`, `GET /v1/asociados/{id}/estado-de-cuenta`. | Baja y creación de acceso guardadas. Prototipo de creación verificado por lectura. Modal y tablero de creación exportados y revisados en la sesión anterior. |
| 06 · Cuotas y pagos web | `2b246fa5-b31a-803d-8008-fd8fb95dc294` | Cuotas, registro, historial, detalle y reversa. `POST /v1/cuotas/generar`, `POST /v1/pagos`, `GET /v1/pagos/{id}`, `POST /v1/pagos/{id}/reversa`, `GET /v1/asociados/{id}/estado-de-cuenta`. | Escritorio revisado visualmente. Cuenta compacta, historial, detalle y formulario compacto guardados y medidos. La exportación de las variantes compactas sigue pendiente. |
| 07 · Reservorios web | `2b246fa5-b31a-803d-8008-fd99380e632c` | `GET/POST /v1/reservorios` y `GET /v1/reservorios/{id}/mediciones`. | Listado web exportado y revisado. Contrato y permisos verificados. |
| 08 · Mediciones web | `2b246fa5-b31a-803d-8008-fd993811aca8` | Listado por reservorio, catálogo y registro. `GET /v1/reservorios/{id}/mediciones`, `GET /v1/mediciones/catalogo`, `POST /v1/mediciones`. | Resumen e historial exportados y revisados. Contrato corroborado. |
| 09 · Operaciones de campo móvil | `2b246fa5-b31a-803d-8008-fd993813ec49` | Navegación operativa. Para medición, se reutilizan los contratos de reservorios y mediciones. | Listado de campo revisado a 390 px. La propuesta PWA se mantiene como propuesta. |
| 10 · Incidencias web | `2b246fa5-b31a-803d-8008-fd9eb58302cf` | Diseños administrativos de incidencias. | Listado revisado y marcado como prototipo. El OpenAPI consultado no declara rutas de incidencias. La propuesta S1f del árbol local documenta candidatas. |
| 11 · Incidencias móvil | `2b246fa5-b31a-803d-8008-fd9eb58690ea` | Reportes de familias. | «Mis incidencias» revisada a 390 px y marcada como prototipo. Mismo límite contractual que la página 10. |
| 12 · Asistente técnico web | `2b246fa5-b31a-803d-8008-fdbe69db4160` | `GET /v1/asistente/documentos` y `POST /v1/asistente/consultas`. Pregunta de 1 a 500 caracteres, respuesta documentada con citas o abstención según el contrato. | Consulta inicial revisada. Los documentos de muestra están señalados. |
| 13 · Asistente técnico móvil | `2b246fa5-b31a-803d-8008-fdbe69df66e4` | Misma API y estados documentales que en web. | Consulta inicial revisada a 390 px. Falta comprobar la lectura de citas en los anchos estrechos. |

## Flujos de React y restricciones funcionales

### Sesión, navegación y perfil

- Usar `GET /v1/yo` para identificar `perfil` y `rol`. El endpoint solo devuelve esos dos campos. El perfil de personal está en **02 · Dashboard web**. Se verificaron el modal de consulta `ace2b755-743f-8055-8008-fe154ced61b1`, las variantes y estados `ace2b755-743f-8055-8008-fe154d13ecf7`, la entrada desde la cuenta y el cierre de retorno.
- La cabecera de perfil muestra «Perfil del personal». El contenido presenta «Tipo de perfil» y «Rol». El bloque «Qué puedes hacer» usa una descripción estática validada con la matriz local para el rol devuelto. El servidor sigue tomando la decisión de autorización. Mostrar solo los permisos del rol actual.
- Consejo y tesorería pueden consultar y gestionar el padrón, crear accesos, generar cuotas, gestionar pagos, consultar reservorios y ver historial de mediciones. Consejo también puede dar de alta reservorios. Operador puede consultar reservorios, ver el historial de mediciones y registrar mediciones. Los tres roles de personal pueden usar el asistente.
- Carga del perfil: mostrar «Consultando perfil…» sin datos anteriores. Error de consulta: «No pudimos consultar tu perfil» y «Reintentar». En `401`, usar la política vigente de renovación y, si la sesión no se recupera, regresar a ingreso. En `403`, mostrar acceso restringido sin exponer datos.
- El contrato de perfil no incluye nombre, correo, avatar, organización, tokens ni permisos detallados. El alcance del perfil es de lectura. La navegación conserva la ubicación previa cuando se entra desde una vista distinta del dashboard. [OpenAPI de acceso](../api/openapi.yaml) · [Controlador de perfil](../../tecnologia/siJASS-clean-architecture/src/api/controladores.ts) · [Matriz de permisos](../../tecnologia/siJASS-clean-architecture/src/dominio/acceso.ts)

### Asociados

- Baja lógica con confirmación, estado de envío y resultado. Tras `204`, volver a consultar padrón y detalle. Conservar cuotas y pagos. El motor impide nuevas cuotas y pagos al asociado dado de baja según las reglas de negocio.
- Creación de acceso para un asociado activo sin cuenta. Enviar `correo` y `contrasena`, ambos requeridos. Correo válido y hasta 254 caracteres en el backend. Contraseña entre 10 y 128 caracteres. Mantener la contraseña enmascarada en la implementación y no incluirla en la confirmación.
- `201` devuelve `usuarioId`. Distinguir `409` de cuenta existente, correo en uso o asociado de baja, `422` de datos inválidos y `401/403` de sesión y permisos. El diseño incorpora un mensaje operativo para el `500` del filtro global, aunque esta respuesta no esté enumerada para el endpoint. Si el resultado es indeterminado, consultar el estado antes de volver a enviar.

### Detalle, reversa y cuenta

1. Abrir el detalle desde un pago del historial. Solicitar `GET /v1/pagos/{id}`. Utilizar comprobante, ID, monto, fecha, estado y, si existe, `reversa.motivo` y `reversa.creadaEn`. Resolver el nombre y el periodo desde el estado de cuenta usando el pago y `cuotaId`. El comprobante es referencia de texto.
2. Mostrar «Reversar pago» a consejo y tesorería cuando el pago esté vigente. Confirmar con `POST /v1/pagos/{id}/reversa` y cuerpo `{ motivo }`. Al validar, recortar espacios y exigir de 1 a 300 caracteres. Respetar el campo de varias líneas, su contador, los errores junto al campo y el foco tras una validación fallida. Bloquear el envío repetido mientras se procesa.
3. En `200`, conservar el pago, mostrar «Revertido» y pedir de nuevo el detalle y `GET /v1/asociados/{id}/estado-de-cuenta`. `409` indica que una reversa ya se aplicó. Volver a consultar el detalle. `422` permite corregir el motivo. `401` requiere resolver sesión. `403` debe mantener un mensaje genérico de acceso. Ante una respuesta incierta del servidor, actualizar el detalle antes de ofrecer otro envío.
4. Formatear montos en soles desde enteros en céntimos. Conservar la fecha, el comprobante y el importe original en el historial. Mostrar el saldo exigible, valores de la cuota y estados que entrega el backend. El saldo es cuotas exigibles menos pagos vigentes. La cuota es pendiente, parcial o pagada según la suma de sus pagos vigentes.
5. En la muestra del prototipo, octubre y noviembre tienen S/ 18,00 pendientes cada uno después de reversar el pago de octubre. El saldo exigible de muestra es S/ 36,00. Este resultado no es un valor predeterminado para React. Carga, historial vacío y error de consulta deben distinguirse de un pago sin reversa registrada.

[Contrato de pagos](../api/openapi.yaml) · [Casos de uso de pagos](../../tecnologia/siJASS-clean-architecture/src/aplicacion/padron/pagos.ts) · [Reglas de cuota y saldo](../../tecnologia/siJASS-clean-architecture/src/dominio/padron.ts)

### Operaciones y asistente

- Consejo puede crear un reservorio con nombre. El personal autorizado puede listar reservorios y ver mediciones. El historial por reservorio devuelve hasta 200 observaciones, más recientes primero.
- El registro de mediciones corresponde al operador. Enviar `reservorioId`, `metodo`, `valor`, `unidad`, `tomadaEn` y cabecera `Idempotency-Key` de acuerdo con el contrato. Tomar método y unidad del catálogo. Preservar la misma clave al reintentar la misma operación. La medición es manual. No derivar un dictamen ni estimar el valor en la interfaz.
- En incidencias, mantener etiquetas de demostración y limitar la conexión a navegación visual hasta verificar un contrato publicado. El [diseño S1f local](../../openspec/changes/s1f-backend-incidencias/design.md) es evidencia de una propuesta en el árbol de trabajo.
- El asistente muestra citas y estados de abstención según la respuesta. No atribuir acciones en el sistema ni cálculos de dosis al asistente documental. [Operaciones de mediciones y asistente](../api/openapi.yaml)

## Componentes y tokens de diseño

| Elemento | Reutilización o especificación |
|---|---|
| Cabecera y navegación | Encabezado, menú de administración, barra inferior móvil y rutas disponibles según el rol. Distinguir selección, foco y destino. |
| Acciones | Botón primario turquesa, secundario con borde y acción financiera de reversa en Urgente. Replicar estados normal, hover, foco, deshabilitado y procesamiento. Botones de 44 px de alto observados en los flujos revisados. |
| Formularios | Etiqueta visible, entrada, ayuda, error asociado y resumen cuando existan varios errores. Correo, contraseña, importe, selectores y campo de motivo. Usar controles nativos o equivalentes accesibles. |
| Tablas | Historial y cuotas con encabezado, fila, etiquetas de estado, acción visible y paginación cuando la fuente de datos lo permita. Tablas pequeñas se convierten en listas de tarjetas con sus etiquetas en móvil. |
| Modales | Fondo blanco, esquinas redondeadas, sombra suave y acciones alineadas al pie. Conservar foco dentro del diálogo y devolverlo al disparador al cerrar. Confirmaciones financieras muestran importe, referencia, consecuencia y cancelación. |
| Estados | Carga, vacío, éxito, información, atención, error y acceso restringido. Texto y, cuando ayude a escanear, icono. Un error de consulta no se presenta como una lista vacía. |
| Tipografía | **Manrope** para títulos (24 px y 32 px en muestras web, peso 800). **Inter Tight** para controles y texto de interfaz (12–14 px habituales en las muestras, pesos 400 y 600). Son muestras, no sustituyen la auditoría de estilos de Penpot. |
| Espaciado | Patrón observado en modales de la página 05: margen interior de 24 px, acciones separadas por 12 px y radio de panel de 20 px. Botones con radio aproximado de 11 px. En React usar escala compartida de 4 px y adaptar gutters al ancho de pantalla. |
| Superficie | Lienzo `#F2F7FA`, superficie `#FFFFFF`, borde decorativo `#D8E6EC`. Azul profundo `#08263A` y azul agua `#0B4154` en superficies de marca muestreadas. |

### Paleta y contraste de pares sólidos

Los valores son pares observados en el diseño o en su biblioteca. El contraste se calculó con luminancia relativa sRGB. Un valor de un par sólido no certifica pantallas completas, transparencias, gradientes ni estados de foco.

| Uso | Primer plano | Fondo | Contraste |
|---|---|---|---:|
| Texto principal | `#102B3B` | `#FFFFFF` | 14,68:1 |
| Texto secundario | `#466174` | `#FFFFFF` | 6,52:1 |
| Enlace o acción primaria, texto blanco | `#FFFFFF` | `#006F69` | 6,04:1 |
| Acción de reversa, texto blanco | `#FFFFFF` | `#9B314C` | 7,15:1 |
| Éxito | `#116457` | `#E1F5ED` | 6,19:1 |
| Error | `#9B314C` | `#FBEAF0` | 6,17:1 |
| Atención | `#80500B` | `#FFF0D8` | 6,09:1 |
| Información | `#235D87` | `#E5F2FB` | 6,17:1 |
| Texto auxiliar o contorno de campo | `#587485` | `#FFFFFF` | 4,94:1 |
| Borde neutro sobre blanco | `#D8E6EC` | `#FFFFFF` | 1,28:1 |

El borde neutro es decorativo. Para comunicar el límite de un control sobre blanco, el ejemplo de campo revisado usa `#587485`. Comprobar en React 4,5:1 para texto normal, 3:1 para texto grande y 3:1 para indicadores visuales requeridos según el criterio aplicable. Mantener objetivos de 44 × 44 px para los controles táctiles principales como regla de diseño. Comprobar teclado, foco visible sin ocultamiento, orden de lectura, anuncio de estados y redimensionamiento. Para reflow, incluir también una prueba a 320 CSS px además de los tamaños de producto. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Especificación responsive para React

Esta especificación reutiliza las composiciones web y móvil existentes. El compacto financiero `ace2b755-743f-8055-8008-fe18accce6f6` conserva las cuotas y el historial en tarjetas. Se probó redimensionando el mismo frame a 360, 390, 768 y 1024 px, sin desborde geométrico. A 1440 px la composición de cuenta de 1128 px y su tabla de 1080 px caben en el área disponible de 1152 px. El detalle y formulario compactos se guardaron en 328 px con botones de 44 px de alto. Estas mediciones no sustituyen la revisión visual y de interacción de los frames secundarios.

| Ancho de referencia | Comportamiento adaptable |
|---:|---|
| 360 px | Una columna. La cuenta compacta conserva márgenes de 20 px y la acción de detalle mide 288 × 44 px. El diálogo de 328 px deja 16 px a cada lado. Colapsar la navegación lateral y reutilizar la barra inferior donde ya existe. |
| 390 px | Misma estructura móvil. Los márgenes de la cuenta siguen en 20 px y su acción mide 318 × 44 px. En el formulario compacto las acciones quedan apiladas. |
| 768 px | Navegación colapsable. Las tarjetas financieras se mantienen cuando no cabe la tabla. La muestra compacta se midió a 768 px completos. El formulario conserva un ancho máximo y los grupos independientes pueden usar dos columnas. |
| 1024 px | Navegación lateral compacta. Los filtros saltan de renglón al faltar espacio. La muestra de tarjetas se midió a 1024 px completos. Cambiar a tabla únicamente cuando el área interior admite las columnas y su acción. |
| 1440 px | Reutilizar el layout administrativo web. Menú lateral existente de 240 px y área principal flexible. Mostrar las columnas completas. Limitar el ancho del formulario para conservar legibilidad. |

Reglas comunes de implementación:

- Usar grid y flex con `min-width: 0`, saltos de línea para cadenas como UUID y contenedores de scroll local cuando una tabla requiera dos dimensiones. Evitar scroll horizontal de página.
- Conservar filtros, selección y posición de lectura al cambiar de ancho. El menú plegable y los diálogos deben manejar foco, escape y retorno al disparador.
- En un modal, limitar la altura al viewport disponible. Con teclado virtual, mantener la acción alcanzable. Evitar que barras fijas oculten el elemento con foco.
- Validar con nombres y referencias largos, cuota y pago reversado, errores de formularios, historial de 0/1/múltiples filas, zoom y cuenta de cada rol. Sobre 360 y 390 px, confirmar que el detalle conserva la información que antes ocupaba columnas.
- Reutilizar las restricciones horizontales del compacto y el patrón de modales de 328 px para los cambios de estructura. Conservar la tabla de escritorio cuando el espacio útil la admite.

## Navegación y prototipo

| Trayecto | Estado |
|---|---|
| Inicio de sesión → Dashboard de personal o portal | Contrato y guardia React verificados. Enlace integral Penpot pendiente. |
| Dashboard → Perfil → Dashboard | Entrada y retorno guardados y verificados por lectura de interacciones. Falta reproducción en el visor. |
| Dashboard → Asociados, Cuotas y pagos, Reservorios, Mediciones, Incidencias y Asistente | Mapa documentado. Conexión y prueba integral entre páginas pendientes. |
| Asociados → Crear acceso → Cancelar o carga → Confirmación → Detalle | Propiedades de interacción guardadas en la página 05. Secuencia simulada con datos de muestra. |
| Historial de octubre → Ver detalle → Reversar → Cancelar o Confirmar → Procesamiento → Confirmación → Cuenta actualizada | Interacciones guardadas por lectura MCP. El pago de muestra y el motivo no ejecutan una operación real. |
| Cuenta actualizada → Detalle revertido → Volver al historial | Apertura al frame correcto y `close-overlay` de retorno guardados y verificados por lectura. Falta reproducción en el visor. |
| Historial compacto → Detalle revertido compacto → Volver | Apertura a `ace2b755-743f-8055-8008-fe1c332dc774` y cierre guardados y verificados. Falta reproducción en el visor. |
| Detalle vigente compacto → Reversa compacta | La escritura devolvió el frame `ace2b755-743f-8055-8008-fe226022229e` y la acción `open-overlay` al formulario compacto. La lectura independiente quedó pendiente tras el reinicio y la suspensión de Penpot. Confirmar el destino antes de repetir la escritura. |
| Reversa compacta → Procesamiento | Confirmación y cancelación guardadas en `ace2b755-743f-8055-8008-fe1ca2b775fe`. |
| Operaciones de campo, Incidencias y Asistente | Existen interacciones locales. Falta revisar el recorrido integral por actor en el visor. |

Usar transiciones breves para abrir y cerrar paneles cuando se comprueben en el visor. Los destinos nativos de las interacciones se resuelven por página. Verificar los enlaces entre páginas y sus retornos en el visor con el acceso existente. En React respetar `prefers-reduced-motion`. El prototipo representa navegación y estados. La autenticación, autorización, persistencia y respuestas del servidor se verifican en la aplicación. [Prototipos en Penpot](https://help.penpot.app/user-guide/prototyping-testing/prototyping/)

### Matriz de recorridos por rol

| Rol | Entrada y recorrido para implementar | Restricciones |
|---|---|---|
| Consejo | Ingreso → superficie de personal → padrón, cuenta y pagos. También consulta y alta de reservorios, historial de mediciones, asistente y perfil. | Puede registrar y reversar pagos. El registro de mediciones corresponde al operador. |
| Tesorería | Ingreso → superficie de personal → padrón, cuenta, cuotas, pagos y perfil. Puede consultar reservorios, mediciones y asistente. | La creación de reservorios corresponde a Consejo. Mantener la consulta separada del ejemplo de alta. |
| Operador | Ingreso → superficie de personal → operaciones de campo o mediciones web → reservorio → historial o registro de medición. Acceso a asistente y perfil. | Mantenerlo en navegación de personal. Las operaciones de padrón y pagos están reservadas a Consejo y Tesorería. |
| Asociado | Ingreso → portal de familias → saldo, cuotas e historial propios. | Sin enlaces de operación de campo, asistente de personal ni gestión de terceros. Los reportes de incidencias actuales son prototipos pendientes de contrato publicado. |

El mecanismo de navegación entre páginas en Penpot es `open-url`, que abre otra pestaña. Para enlazar el archivo privado, verificar primero en el visor los destinos autenticados por `page-id` y `frame-id`. Esta alternativa se documentó durante el cierre. Las conexiones entre páginas no se escribieron ni se probaron tras el bloqueo de la sesión. En React, usar la guardia de perfil que ya existe y añadir la selección de módulos a partir del rol de `GET /v1/yo`, manteniendo la autorización en el backend. [Prototipos en Penpot](https://help.penpot.app/user-guide/prototyping-testing/prototyping/) · [Resolución del destino en el visor de Penpot](https://github.com/penpot/penpot/blob/develop/frontend/src/app/main/data/viewer.cljs) · [Matriz de permisos de SIJASS](../../tecnologia/siJASS-clean-architecture/src/dominio/acceso.ts)

## Preparación para implementar React

El inventario, los tokens y los contratos de este documento permiten empezar por los módulos con comportamiento respaldado. Una conexión pendiente en Penpot puede comprobarse en React cuando el destino y sus permisos están especificados en la matriz de recorridos.

| Módulo | Preparado para empezar | Límite del alcance inicial |
|---|---|---|
| Base visual, inicio de sesión, navegación y perfil del personal | Tokens, controles, entrada, guardia por perfil y vista de `GET /v1/yo`. | Usar el rol devuelto para elegir módulos. Los indicadores agregados del dashboard requieren una fuente contractual. |
| Asociados | Padrón, detalle, alta, baja lógica y creación de acceso. | Probar las restricciones de cuenta y los estados de error al integrar. |
| Cuotas y pagos | Generación, registro, historial, detalle, reversa y composición adaptable de la cuenta. | En React mostrar «Reversar» en el detalle compacto de un pago vigente solo al rol autorizado. La entrada del prototipo se escribió, con verificación posterior pendiente. |
| Reservorios, mediciones y operaciones de campo | Listado, alta por Consejo, consulta de historial y registro manual por Operador. | Mantener sincronización sin conexión en alcance de propuesta. |
| Portal de familias | Consultas de saldo, cuotas y pagos propios. | La disponibilidad del servicio y la actividad operativa de muestra requieren su propia fuente. Mantener el portal separado de Personal. |
| Asistente técnico | Consulta documental, citas, abstención y fuera de alcance. | Revisar navegación y lectura de citas en pantallas estrechas. |
| Incidencias | Referencia de UI y prototipo para revisión. | La integración de operaciones depende de un contrato publicado. |

### Verificaciones de aceptación durante la implementación

| Comprobación | Resultado esperado |
|---|---|
| Sesión y rutas por rol | Probar Consejo, Tesorería, Operador y Asociado con credenciales de prueba. Comprobar acceso directo por URL, regreso, renovación, sesión vencida, cierre de sesión y respuestas `401/403`. Tras autenticarse, conservar las rutas base existentes y separar el portal de familias de las operaciones de campo. |
| Acciones por rol | Consejo y Tesorería gestionan padrón y pagos. Solo Consejo registra reservorios y solo Operador registra mediciones. Los controles siguen el permiso y el backend decide ante una solicitud directa. |
| Pagos y reversa | El detalle resuelve los datos del pago y la cuota, el motivo se valida tras recortar espacios, se evita el doble envío y se distingue `409`, `422` y resultado incierto. Tras confirmar, consultar de nuevo la cuenta y el detalle. Mantener el importe y comprobante originales, mostrar el estado Revertido y renderizar el saldo que devuelve el servidor. |
| Asociados, mediciones y asistente | Verificar la baja lógica y sus efectos, los conflictos al crear acceso, la idempotencia del registro de medición y los estados de cita, abstención y error del asistente. |
| Adaptación de la interfaz | Probar 360, 390, 768, 1024 y 1440 px con datos largos y estados vacíos, en carga y con error. Verificar la transición entre lista y tabla, el menú plegable, el teclado virtual y el acceso a la acción principal. |
| Accesibilidad de la aplicación | Revisar teclado, retorno de foco, anuncio de errores y resultados, nombres de controles, estados de foco, contraste sobre los fondos finales y reflow a 320 CSS px. |

## Evidencia visual pendiente en Penpot

- Se midieron 2.274 capas de texto y 367 frames identificados por nombre como controles en las 13 páginas. Se corrigieron cuatro límites de frames de ayuda en las páginas 01 y 06. Queda pendiente validar el área activa real, los estados secundarios, el teclado, el foco y los contrastes sobre fondos complejos.
- Reproducir reversa y perfil en el visor. La descripción de las interacciones se verificó mediante MCP. La prueba de uso de extremo a extremo y la navegación entre páginas siguen abiertas.
- Leer el detalle vigente compacto por ID para confirmar el destino de reversa y el retorno. Si la conexión es estable, revisar de forma selectiva la legibilidad y los controles en el visor. Las verificaciones de uso pueden hacerse al implementar React.
- Los diseños guardados de 05 y 06, la geometría responsive financiera y el perfil de 02 sirven como referencia para implementar por partes. Para el cierre global falta el prototipo integral, la revisión de frames secundarios y el contrato de incidencias. Las pruebas de teclado, sesión, manejo de errores, sincronización de cuenta y autorización corresponden a React.
