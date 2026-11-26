# Design

## Context

- La interfaz (`tecnologia/sijass-web`, React 19 + Vite + CSS propio) sigue a Penpot. Hoy el movimiento vive en `premium.css`: `entrar` (fundido y 5 px, 280 ms) en cada página, listas con retardo, diálogos y barras de lecturas; los importes cuentan con `motion` (`Importe.tsx`). Las variables existentes son `--duracion-corta` (160 ms), `--duracion-entrada` (280 ms), `--curva` y `--transicion`.
- El panel lateral (`NavegacionPersonal.tsx`, `personal.css`) es una columna fija de 240 px en escritorio; por debajo de 1024 px se oculta tras el botón «Menú».
- La preferencia de reducir movimiento hoy **apaga todo** con reglas globales repartidas en cuatro hojas (`estilos.css`, `premium.css`, `personal.css`, `portal.css`, `ingreso.css`).
- Las pruebas que no se deben romper: 147 de Vitest, 14 E2E con la API real y 23 de adaptación a pantallas. jsdom no evalúa hojas de estilo, así que el movimiento se verifica con una prueba de guardia sobre el texto del CSS y con Playwright en Chrome.
- Audiencia: personas con poca experiencia digital y teléfonos de gama baja (RNF02, RNF06). El movimiento tiene que ayudar a entender, no a lucir.

## Goals / Non-Goals

**Goals:**
- Que la interfaz se sienta viva en los momentos que la persona nota (ingreso, abrir el Resumen, plegar el panel, pulsar un botón) sin ralentizar lo que hace decenas de veces al día.
- Un presupuesto de movimiento comprobable por una prueba automática, no por buena voluntad.
- Reducir movimiento sigue dando una interfaz comprensible.

**Non-Goals:**
- Cambiar paleta, estructura, textos o rutas (Penpot manda).
- Animaciones de salida de página, píldora deslizante en el panel, efectos con el puntero, parallax o rebotes.
- Animar datos (tablas, gráficos, importes ya animados) o acciones con teclado.
- Reescribir el menú móvil ni los diálogos (se conservan tal cual).
- Medir fotogramas en un teléfono real de gama baja (queda declarado como no medido).

## Decisions

**D1 — Qué se anima, por frecuencia y propósito.**

| Elemento | Frecuencia | Decisión | Propósito |
|---|---|---|---|
| Entrada de la tarjeta de ingreso | primera vez por sesión | Sí, 300 ms | Dar la bienvenida (margen para deleite) |
| Paso tipo de acceso → DNI | una vez por ingreso | Sí, 220 ms | Mostrar de dónde viene el siguiente paso |
| Aviso de error o estado | ocasional | Sí, fundido 180 ms | Que el cambio no «aparezca de golpe» |
| Plegar o desplegar el panel | ocasional | Sí, 220 ms | Coherencia espacial: el contenido se ensancha |
| Cambio de sección | decenas al día | Casi imperceptible: 180 ms, 4 px, **sin salida** | Evitar que el contenido «salte» |
| Tarjetas del Resumen | una o dos veces al día | Sí, escalonadas | Orientar la lectura de arriba abajo |
| Pulsar un botón | decenas al día | Sí, 140 ms | Retroalimentación inmediata |
| Color al pasar el puntero | decenas al día | Sí, 120 ms, solo puntero fino | Estado |
| Ondas del héroe del Resumen y punto de estado | ambiente continuo, solo en esa pantalla | Sí, muy lento (16 s) y fundido de 2,4 s | Dar vida sin tocar datos ni retrasar ninguna acción |
| Píldora deslizante entre secciones | decenas al día | **No** | Añade espera percibida a la navegación más frecuente |
| Elevación de tarjetas informativas | — | **No** | Una tarjeta que no se puede pulsar no debe parecer pulsable |
| Cambios por atajo de teclado | cientos al día | **No** | Se vuelve molesto |
| Tablas, importes, gráficos | lectura | **No** (los importes ya cuentan) | El dato no debe moverse |

**D2 — Herramienta: CSS puro.** Transiciones para estados que se activan con un atributo (panel, botones, enlaces) y animaciones para entradas de montaje (página, tarjetas, pasos del ingreso). Son predeterminadas, corren en el compositor para `transform` y `opacity` y no suman bytes. Alternativas descartadas: animaciones de diseño de `motion` (no hace falta un muelle ni salidas; añade JavaScript y riesgo en gama baja) y `@starting-style` (menos soporte en navegadores antiguos que el teléfono de una JASS puede tener). `motion` queda solo para `Importe.tsx`.

**D3 — Variables, extendiendo las existentes.** Se conservan `--curva` (la curva de salida fuerte de la base) y `--duracion-corta`; se añaden `--duracion-pagina: 180ms`, `--duracion-panel: 220ms`, `--duracion-pulsar: 140ms` y `--curva-mover: cubic-bezier(0.77, 0, 0.175, 1)` (movimiento de un elemento que ya está en pantalla). Ningún valor suelto en las hojas. Se descarta crear un sistema paralelo.

**D4 — Panel plegable.** Estado de React con valor inicial leído de `localStorage` (envuelto en `try/catch`; sin almacenamiento, desplegado) y atributo `data-plegado` en `.marco-personal`. En CSS, la columna cambia de 240 px a 76 px con `transition: grid-template-columns var(--duracion-panel) var(--curva-mover)`. Los textos de los enlaces pasan a un `<span class="lateral-texto">` que se desvanece (opacidad, 120 ms) y se recorta; **no** se usa `display: none`, de modo que los nombres accesibles se conservan. En el riel, los enlaces llevan `title` con el nombre (descripción nativa al pasar el puntero, sin recortes por el desplazamiento del panel). La transición se activa con `data-listo`, que se pone tras el primer pintado, para que la página no «se pliegue sola» al cargar.
- *Excepción documentada:* la columna es una propiedad de diseño, no de compositor. Se acepta porque ocurre pocas veces por sesión, solo en pantallas de 1024 px o más, dura 220 ms y el contenido que se reacomoda es acotado. Si la comprobación de sensación muestra saltos, el plan B es cambiar el ancho sin transición y mantener solo el fundido de los textos.
- *Alternativas:* panel que se desliza sobre el contenido con `transform` (el contenido no gana espacio), cambio de ancho sin transición (brusco), `motion` con animación de diseño (innecesario).
- *Interrupción:* es una transición CSS, así que pulsar dos veces seguidas la reorienta desde el ancho actual.

**D5 — Entrada de página y del Resumen.** `.pagina-personal` pasa a `--duracion-pagina` con 4 px (hoy 280 ms y 5 px); no hay salida. En el Resumen el contenedor entra solo con opacidad y cada bloque (cabecera, héroe, indicadores, columnas) usa la animación de entrada con `animation-delay: calc(min(var(--i), 6) * 40ms)` y `backwards`; `--i` se fija en CSS con `:nth-child`, sin tocar el JSX. El peor caso es 6 × 40 ms + 280 ms = 520 ms. El inicio del portal de familias reutiliza la misma entrada (cuota pendiente, accesos, actividad).

**D6 — Microinteracciones.** El botón pasa de `translateY(1px)` a `scale(0.97)` con `transition: transform var(--duracion-pulsar) var(--curva)` (se amplía la transición que ya existe en `estilos.css`, sin duplicarla). Los colores de hover nuevos van dentro de `@media (hover: hover) and (pointer: fine)`. El indicador de la sección actual deja de ser una sombra interior instantánea y pasa a un `::before` con `transform: scaleY()` de 0 a 1 en 180 ms.

**D7 — Ingreso.** Cada paso se envuelve en un contenedor con `key` y `data-sentido` («adelante» o «atras») para animar con `translateX(16px)` o `translateX(-16px)` hacia 0 y fundido en 220 ms; la tarjeta entra con 10 px y 300 ms; `.estado-acceso` aparece con fundido de 180 ms y sin sacudida. Las ondas de la marca derivan 18 px en un ciclo de 16 s (`transform`, `alternate`, sin `will-change`). El foco y los roles (`alert`, `status`) no cambian.

**D7b — Ambiente del Resumen.** Es la pantalla de inicio del personal y la que más se mira sin hacer nada, así que es donde un movimiento ambiente cuesta menos y aporta más. Las ondas del héroe reutilizan el `@keyframes` de deriva del ingreso (`transform: translateX`, `alternate`, ciclo de 18 s, solo `transform`) y el punto de estado (`.hero-etiqueta::before`) late con un fundido de opacidad de 2,4 s. No hay movimiento de texto, cifras ni tarjetas. *Plan B:* si la comprobación de sensación o el consumo en un equipo de gama baja muestran costo o distracción, se quita el ambiente y el resto del cambio no se ve afectado. *Descartado:* ondas animadas en las demás secciones (más tiempo en pantalla, sin beneficio) y partículas o degradados animados (costo de pintado).

**D8 — Reducir movimiento = menos y más suave.** Se sustituye el apagado global por reglas por módulo: las entradas pasan a un fundido de 120 ms (se cambia el nombre de la animación a una que solo usa opacidad), se anula el escalonado, el panel cambia sin transición, no hay escala al pulsar y las ondas se detienen. Se comprueba con Chrome emulando `prefers-reduced-motion: reduce`.

**D9 — Guardia automática.** Una función pura `revisarMovimiento(css)` (con pruebas de casos buenos y malos) recorre las hojas reales y rechaza: `transition: all`, `transition-property: all`, `scale(0)`, `ease-in` (que no sea `ease-in-out`), duraciones de más de 300 ms (también las que salen de variables), propiedades animadas fuera de la lista permitida y archivos con animaciones sin bloque `prefers-reduced-motion`. Convierte el presupuesto de movimiento en algo que el CI vigila.

**D10 — Evidencia.** Capturas del panel desplegado y plegado en 1024 y 1440 px, el ingreso en móvil y escritorio, medidas de las duraciones calculadas por Chrome y una lista de comprobación de sensación (reproducir a 2 a 5 veces más lento en las herramientas de desarrollo, mirar cuadro por cuadro y volver a mirar al día siguiente). La parte de «cómo se siente» no se puede certificar desde el código y se declara.

## Risks / Trade-offs

- **Layout al plegar el panel.** Reacomodar el contenido durante 220 ms puede verse entrecortado en equipos lentos. Mitigación: pocas veces por sesión, solo escritorio y plan B de D4.
- **Texto cortado en el riel.** Recortar textos con opacidad puede dejar restos. Mitigación: pruebas de pantallas en 1024, 1280 y 1440 px y revisión de capturas.
- **Pruebas más lentas.** Playwright espera a que un elemento deje de moverse antes de pulsarlo; con 520 ms máximos el efecto es leve.
- **`title` duplicado.** El nombre accesible ya viene del texto; `title` solo se añade con el panel plegado y se acepta la posible doble lectura.
- **La sensación no es medible por código.** Se declara como pendiente de revisión humana y no se afirma que «se siente bien».
- **Rendimiento en gama baja sin medir.** Todo el movimiento continuo es `transform`; no se midió en un teléfono real.

## Open Questions

Ninguna. La decisión «mantener la paleta y la estructura de Penpot y solo sumar movimiento» la tomó la persona usuaria el 2026-11-26. Las referencias para `/taste` no se necesitan para este cambio; si se aportan después, se aplican como un ajuste de ritmo y no de estructura.
