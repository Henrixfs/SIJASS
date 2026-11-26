# SIJASS Premium 2026

El ingreso, las finanzas de familias y las herramientas de personal comparten marca, tipografía y controles. Cada área da prioridad a una tarea distinta. El ingreso presenta la cuenca andina. El panel destaca el destino principal del rol. La cuenta presenta el saldo en soles y el área de campo reúne la toma y su historial.

**Estado de la revisión.** Cambio independiente, activo y sujeto a aprobación final. El ingreso se inspeccionó en la demo. Para las áreas privadas se revisaron renderizados de componentes de la suite Vitest con sus fixtures preexistentes. El navegador compartido no expuso una sesión autenticada. La revisión de los roles con datos de la demo continúa pendiente. [Demo](http://127.0.0.1:5174/ingresar) · [Tareas OpenSpec](../../openspec/changes/redesign-frontend-premium-uiux-2026/tasks.md)

## Evidencia y procedencia

| Vista | Antes | Después |
|---|---|---|
| Ingreso a 1440 px | [Captura de la demo](evidencia/premium-2026/antes/ingreso-1440.png) | [Captura de la demo](evidencia/premium-2026/despues/ingreso-1440.png) |
| Ingreso a 390 px | [Captura de la demo](evidencia/premium-2026/antes/ingreso-390.png) | [Captura de la demo](evidencia/premium-2026/despues/ingreso-390.png) |
| Siete anchos de ingreso | [Capturas y medidas](evidencia/premium-2026/antes/) | [Capturas, teclado, contraste y medidas](evidencia/premium-2026/despues/) |
| Vistas internas | Comparación con el código local previo y el handoff. Las capturas anteriores locales disponibles corresponden al ingreso. | [Muestras de componentes](evidencia/premium-2026/componentes/) |

El archivo Penpot no respondió a la lectura del diseño. El servidor indicó que no había una instancia conectada. La comparación de las páginas 01–13 se basa en el handoff y su acta de progreso. Los cinco PNG de la auditoría anterior muestran el ingreso del cliente React. Las variantes compactas, los estados secundarios y las interacciones del visor de Penpot carecen de verificación directa en esta intervención. [Handoff](SIJASS-HANDOFF-UIUX.md) · [Registro Penpot](SIJASS-PENPOT-PROGRESO.md) · [Línea base documentada](SIJASS-FRONTEND-PROGRESO.md)

## Comparación por módulo

| Área | Punto de partida | Implementación y evidencia de componente |
|---|---|---|
| Ingreso | Columna institucional lisa, marca de texto y tarjeta genérica. | Grabado de cuenca original, marca, formulario sin tarjeta flotante, campos con icono y control de visibilidad de contraseña. [Demo a 320 px](evidencia/premium-2026/despues/ingreso-320.png) |
| Panel administrativo | Todas las entradas tenían la misma superficie y jerarquía. | Destino principal de padrón o campo según rol y directorio secundario. [Panel](evidencia/premium-2026/componentes/panel-1440.png) |
| Sidebar, cabecera y navegación | Enlaces textuales con resaltado de fondo. | Pictogramas, marca, línea de selección, menú compacto y nombre del rol. [Cabecera móvil](evidencia/premium-2026/componentes/panel-390.png) |
| Perfil | Ficha y listado de permisos en texto corrido. | Pares etiqueta–valor y lista de módulos del rol. [Perfil](evidencia/premium-2026/componentes/perfil-1440.png) |
| Padrón | Alta, filtros y resultados con peso parecido. Tabla ancha en teléfono. | Alta con título propio, franja de filtros y ficha por asociado en teléfono. [Padrón móvil](evidencia/premium-2026/componentes/padron-390.png) |
| Detalle del asociado y registro de pago | El saldo y la cuenta de acceso competían con el formulario. | Saldo destacado con numerales tabulares, formulario identificado y accesos contextualizados. [Cuenta](evidencia/premium-2026/componentes/cuenta-1440.png) |
| Cuotas y pagos | La generación por periodo y el selector de cuenta usaban el mismo panel blanco. | Jerarquía de títulos, borde de formulario y acciones por etapa. [Cuotas](evidencia/premium-2026/componentes/cuotas-1440.png) |
| Historial, detalle y reversa | Detalle uniforme y modal centrado también en teléfono. | Importe destacado, comprobante conservado y hoja inferior de reversa. [Detalle](evidencia/premium-2026/componentes/detalle-1440.png) · [Reversa](evidencia/premium-2026/componentes/reversa-390.png) |
| Reservorios | Tarjetas de texto independientes. | Catálogo con nombres, icono de módulo y separadores. El contrato ofrece nombre e identificador. [Catálogo](evidencia/premium-2026/componentes/reservorios-1440.png) |
| Mediciones | Historial tabular con desplazamiento en pantallas estrechas. | Fichas en teléfono. El gráfico aparece con dos o más lecturas vigentes comparables, hasta ocho, con unidad, fechas y máximo de la muestra. La tabla conserva los registros. [Historial](evidencia/premium-2026/componentes/mediciones-1440.png) |
| Campo | Selector y formulario lineales. | Controles táctiles y última lectura accesible con unidad y método. [Campo](evidencia/premium-2026/componentes/campo-390.png) |
| Portal de familias | Saldo en tarjeta clara y enlaces en línea. | Saldo protagonista, cuotas y pagos en fichas y navegación inferior en móvil. [Portal](evidencia/premium-2026/componentes/portal-390.png) |
| Asistente técnico | Consulta y respuesta con el mismo tratamiento de tarjeta. | Editor con contador, citas en bloque y fuentes desplegables. Conserva advertencia de corpus, abstención y límites de la consulta. [Asistente](evidencia/premium-2026/componentes/asistente-1440.png) |
| Incidencias y nivel físico del agua | Diseños de referencia sin operación contractual de incidencias ni medida de llenado. | Se preserva el alcance funcional. Las barras representan exclusivamente lecturas manuales. [Contrato](../api/openapi.yaml) |

## Sistema visual y movimiento

El azul marino organiza la navegación y los saldos. El turquesa oscuro identifica la acción principal. Las superficies de consulta usan un neutro ligeramente verdoso y los formularios tienen una línea superior. Los importes usan numerales tabulares. La marca combina una gota de trazo simple con el nombre de SIJASS. Las fuentes Manrope e Inter Tight se sirven desde el proyecto.

El tema operativo claro sigue la referencia del handoff. Los controles responden en 160 ms, las apariciones de página, menú, gráfico y diálogo duran 280 ms. Un cambio de importe recibido anima la cifra final durante 180 ms. El esqueleto limita la pulsación a dos ciclos. La preferencia de movimiento reducido elimina las transiciones y la animación de importes. [Diseño OpenSpec](../../openspec/changes/redesign-frontend-premium-uiux-2026/design.md)

## Validación y coste de distribución

| Medida | Antes | Después |
|---|---:|---:|
| JavaScript de entrada, bruto | 258,07 kB | 239,41 kB |
| JavaScript de entrada, gzip | 79,50 kB | 76,01 kB |
| CSS, gzip | 2,96 kB | 6,02 kB |
| Fuentes locales | 58,78 kB | 58,78 kB |
| Ilustración de ingreso | — | 68,39 kB móvil o 252,96 kB escritorio |

La referencia anterior de gzip proviene del registro de progreso y coincide en tamaño bruto con el archivo de distribución inventariado antes de editar. El nuevo build divide personal, familias, finanzas, mediciones y asistente en archivos bajo demanda. El ingreso ahorra 3,49 kB de JavaScript comprimido. CSS añade 3,06 kB y la ilustración aumenta la transferencia total. La primera codificación de escritorio ocupaba 371,81 kB. [Línea base](SIJASS-FRONTEND-PROGRESO.md)

En los siete anchos del ingreso el documento coincidió con el ancho del viewport. El botón principal midió 52 px y el control de visibilidad de contraseña 44 px. El orden de teclado fue correo, contraseña, mostrar contraseña e ingresar. El contraste del botón fue 6,87:1, el del texto secundario 6,12:1 y el del borde 3,93:1. La duración de transición computada con movimiento reducido fue 0 s. El criterio de contraste AA para texto normal exige al menos 4,5:1. [Medidas](evidencia/premium-2026/despues/mediciones.json) · [WCAG 2.2, criterio 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

En la muestra local de Vite, el LCP del ingreso pasó de un intervalo de 496–1496 ms a 1208–1544 ms y el CLS máximo pasó de 0 a 0,00039. Se hizo una observación por ancho en Chrome de escritorio con viewport emulado. Estas cifras dependen de la carga del equipo y corresponden a desarrollo. [Medidas anteriores](evidencia/premium-2026/antes/mediciones.json) · [Medidas posteriores](evidencia/premium-2026/despues/mediciones.json)

[Comparación del ingreso](evidencia/premium-2026/comparacion-ingreso.jpg) · [Componentes a 390 px](evidencia/premium-2026/componentes-390.jpg) · [Componentes a 1440 px](evidencia/premium-2026/componentes-1440.jpg)

## Herramientas y comprobaciones

| Recurso | Integración y comprobación |
|---|---|
| OpenSpec 1.14.1 | CLI preexistente del propietario. Raíz local, cinco cambios previos inventariados y validación estricta de la nueva capacidad. |
| UI/UX Pro Max | MIT. Se instaló solo la skill del commit `8db36338810d0942567b97ce439affd1619fcf31`. El buscador Python devolvió dos pautas locales de UX sobre movimiento. La opción de vista previa de la CLI 2.15.0 no estaba disponible. Se utilizó la copia de archivos del instalador local. [Repositorio oficial](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) |
| Frontend Design | Apache 2.0. Skill de autoría de Anthropic instalada con licencia y leída desde el commit `e4bb5d960d87126ff3b3a8af1a104b7db67560ba`. Sus pautas orientaron la dirección artística y la selección de contenido. [Fuente](https://github.com/anthropics/skills/tree/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/frontend-design) |
| shadcn 4.23.0 y Magic UI | CLI MIT aislada en herramientas de desarrollo. El servidor ofreció siete herramientas y enumeró los registros `@shadcn` y `@magicui`. La URL oficial devolvió la ficha `number-ticker`. Se adoptó el registro compartido que documenta Magic UI. [shadcn MCP](https://ui.shadcn.com/docs/mcp) · [Magic UI MCP](https://magicui.design/docs/mcp) |
| Chrome DevTools MCP 1.14.0 | Apache 2.0. El proceso aislado ofreció 33 herramientas y leyó el título del ingreso en el árbol de accesibilidad de Chrome. CrUX y estadísticas de uso desactivados. [Proyecto oficial](https://github.com/ChromeDevTools/chrome-devtools-mcp) |
| Motion 14.14.0 y Lucide React 1.79.0 | Dependencias de producción fijas, MIT e ISC respectivamente. Compatibilidad React 19 contrastada con los peer dependencies. Motion usa su entrada React mini. Lucide se consume por icono. Verificados por build y Vitest. [Motion](https://motion.dev/docs/react-installation) · [Licencias Lucide](https://lucide.dev/license) |
| Aceternity y Recharts | Referencias evaluadas. La composición usa CSS local y la serie de ocho lecturas se resuelve con barras y tabla accesible. Se evitó agregar Tailwind, una segunda biblioteca de movimiento o un motor de gráficas. [Aceternity](https://ui.aceternity.com/) · [Recharts](https://github.com/recharts/recharts) |

Windows, Node 24.18.0, npm 11.16.0, Codex CLI 0.171.0 y Antigravity IDE 1.107.0 verificados. Codex enumeró ambas entradas del proyecto. Los procesos respondieron a solicitudes MCP por stdio. Para que aparezcan como herramientas en el cliente, reabrir la sesión de Codex y recargar el proyecto de Antigravity. El reconocimiento interactivo posterior al reinicio sigue pendiente. Las configuraciones locales contienen las rutas absolutas de esta instalación Windows. [Descubrimiento de herramientas de Antigravity](https://antigravity.google/docs/customization-discovery/)

El inventario de Codex incluía Node REPL, Illustrator, Penpot y Revit, además de herramientas de navegador y los conectores de diseño Adobe y Figma. Se usaron OpenSpec, gestión de plugins, instalación de skills, generación de imagen y control de navegador. Las instalaciones npm desactivaron scripts de ciclo de vida. Los dos servidores de diseño tienen lockfile propio y se excluyen del bundle.

## Archivos de esta intervención

- **OpenSpec** — `openspec/changes/redesign-frontend-premium-uiux-2026/`: metadatos, propuesta, diseño, delta de especificación y tareas.
- **Herramientas** — `.agents/skills/frontend-design/`, `.agents/skills/ui-ux-pro-max/`, `.agents/mcp_config.json` y `.codex/config.toml`. En el frontend, `herramientas-diseno/` contiene manifiesto, lockfile y entrada de shadcn.
- **Frontend y configuración** — `package.json`, `package-lock.json`, `components.json`, `tsconfig.json`, `vite.config.ts`; la compilación actualiza `tsconfig.tsbuildinfo`.
- **Identidad y componentes** — `src/main.tsx`, `src/App.tsx`, `src/premium.css`, `src/identidad.tsx`, `src/Importe.tsx`, `src/paginas/SerieLecturas.tsx`, `public/cuenca-andina.webp` y `public/cuenca-compacta.webp`.
- **Vistas editadas** — `Ingreso`, `NavegacionPersonal`, `Perfil`, `Asociados`, `CuentaAsociado`, `PagoDialogo`, `Mediciones`, `Portal` y `Asistente` en `src/paginas/`. Cuotas y tablas financieras reciben los estilos compartidos.
- **Pruebas** — `src/pruebas/app.test.tsx`, `asistente.test.tsx`, `mediciones.test.tsx` y `premium.test.tsx`. Las pruebas de UI esperan que las importaciones dinámicas se resuelvan. La comprobación del rol en perfil busca su valor en el contenido principal.
- **Evidencia** — este informe, capturas, métricas y scripts de reproducción en [evidencia/premium-2026](evidencia/premium-2026/). El inventario enumera el trabajo de rediseño. El árbol contenía modificaciones locales anteriores.

## Resultado de pruebas y reproducción

Pasaron 111/111 pruebas en seis archivos con `npm.cmd test` desde `tecnologia/sijass-web`. ESLint y la compilación TypeScript/Vite finalizaron con código 0. La ejecución instrumental de Vitest para capturas también pasó 111/111. Se verificaron las guardias, la vigencia de la sesión, el retorno de foco de pagos, los cambios de importe, el gráfico vacío o con datos inválidos y la consulta documental. Se excluyeron E2E y operaciones en PostgreSQL por alcance.

En Chrome se revisaron 12 composiciones estáticas en cada uno de los siete anchos, 84 observaciones sin desborde horizontal del documento. Se guardaron además los recortes del historial. La primera revisión mostró una cabecera de dos filas a 390 px. La versión corregida conserva marca, menú, rol y salida en una fila. La evidencia estática permite revisar presentación y dimensiones. Los tiempos, transiciones y operaciones de una sesión autenticada requieren revisión en la demo. [Anchos por módulo](evidencia/premium-2026/componentes/anchos.json) · [Historial](evidencia/premium-2026/componentes/historial-390.png)

Desde la raíz del proyecto, la reproducción del ingreso utiliza `node docs/diseno/evidencia/premium-2026/capturar-ingreso.cjs despues` con Vite en 5174 y Chrome instalado. El verificador `python docs/diseno/evidencia/premium-2026/verificar-mcp.py` abre un perfil aislado. Para las muestras unitarias, se puede definir `SIJASS_CAPTURAS_UNITARIAS` con una carpeta nueva dentro de TEMP y ejecutar los dos comandos siguientes desde el frontend.

```powershell
node node_modules/vitest/vitest.mjs run --config ../../docs/diseno/evidencia/premium-2026/vitest.capturas.mts
node ../../docs/diseno/evidencia/premium-2026/renderizar-componentes.cjs
```

## Revisión pendiente

Inspeccionar en sesiones ya autorizadas de consejo, tesorería, operador y familia los datos reales de la demo, estados intermedios, menú, detalle y reversa en modo de lectura. Requiere que el navegador compartido exponga esas sesiones. La conformidad WCAG integral, tecnologías de asistencia y dispositivos físicos siguen pendientes. El cambio permanece abierto hasta la revisión final del usuario.
