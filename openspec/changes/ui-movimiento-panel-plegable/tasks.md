## 1. Base de movimiento y guardia

- [x] 1.1 Añadir a `premium.css` las variables `--duracion-pagina`, `--duracion-panel`, `--duracion-pulsar`, `--duracion-fundido`, `--duracion-tarjeta`, `--paso-escalon` y `--curva-mover`, sin tocar `--curva` ni `--duracion-corta`; reducir la entrada de `.pagina-personal` a `--duracion-pagina` y 4 px, y reemplazar el apagado global de movimiento reducido por la regla de D8 (fundidos de 120 ms, sin desplazamiento ni escala). Hecho: los fotogramas se redefinen solo con opacidad dentro de `prefers-reduced-motion`.
- [x] 1.2 Crear la guardia `revisarMovimiento(hojas)` y `src/pruebas/movimiento.test.ts`: casos negativos (`transition: all`, `scale(0)`, `ease-in`, 400 ms, propiedad fuera de lista, animación sin regla de movimiento reducido, ciclo infinito corto, `:hover` suelto) y positivos, y una comprobación sobre las hojas reales de `src/`. Hecho con la función en `src/pruebas/guardia-movimiento.ts` (es solo de pruebas, no va al paquete) en lugar de `src/lib/`. Se verificó que cada caso malo se rechaza antes de aplicarla a las hojas reales; la primera pasada sobre las reales detectó un `scaleY(0)` en el indicador de sección, que se corrigió.

## 2. Panel lateral plegable

- [x] 2.1 Crear `src/lib/panel.ts` (leer y guardar la preferencia con `try/catch`, valor inicial desplegado) con pruebas de almacenamiento disponible, no disponible y valor inválido.
- [x] 2.2 En `NavegacionPersonal.tsx`: estado del panel, botón «Plegar panel lateral»/«Desplegar panel lateral» con `aria-expanded` y `aria-controls`, `data-plegado` y `data-listo` en `.marco-personal`, `<span class="lateral-texto">` en los enlaces y `title` solo con el panel plegado. Se conservan `data-testid="nombre-jass"` y los nombres de los enlaces; la marca separa su texto en `.marca-texto`.
- [x] 2.3 En `personal.css`: riel de 76 px con la transición de columna (D4), fundido de textos (sin `display: none`, con los títulos de grupo invisibles pero ocupando su espacio para que nada salte en vertical), `overflow-x: hidden`, objetivos de 44 px, botón visible solo desde 1024 px y el indicador de sección actual con `::before` (`scaleY(.25)` a `1` y opacidad; nunca parte de cero). Verificado en Chrome a 1024, 1280 y 1440 px.
- [x] 2.4 Pruebas de componente en Vitest: plegar y desplegar, `aria-expanded`, preferencia recordada al montar, almacenamiento no disponible, nombres accesibles y `title` de los enlaces con el panel plegado, activación de la transición tras el primer pintado y los 147 existentes siguen pasando.

## 3. Páginas, tarjetas y microinteracciones

- [x] 3.1 Escalonado del Resumen en `personal.css` con `--i` por `:nth-child` y retardo con tope de 6 pasos (D5); el contenedor del Resumen **no** se anima (una sola entrada por contenedor, hallazgo de la revisión); el inicio del portal de familias reutiliza la entrada en `portal.css`.
- [x] 3.2 Botones y enlaces: `scale(0.97)` al pulsar con la transición existente ampliada, sin movimiento en botones deshabilitados, colores de hover dentro de `@media (hover: hover) and (pointer: fine)` en el panel, el ingreso y el portal, y tarjetas informativas sin hover (D6).
- [x] 3.3 Ambiente del Resumen en `personal.css`: deriva lenta de `.hero-ondas` (18 s, `transform`) y latido de opacidad del punto de `.hero-etiqueta` (2,4 s); texto y cifras quietos; el `@keyframes` de deriva es compartido con el ingreso (D7b).

## 4. Ingreso

- [x] 4.1 En `Ingreso.tsx`, envolver cada paso en un contenedor con `key` y `data-sentido` sin cambiar el foco ni los roles; en `ingreso.css`, entrada de la tarjeta (280 ms), paso adelante o atrás (220 ms), aviso de estado con fundido (180 ms) y deriva lenta de las ondas (16 s) (D7). El primer paso no se anima al cargar (`data-sentido="inicial"`): lo encontró la revisión de diseño.
- [x] 4.2 Pruebas: el flujo de ingreso de Vitest y los E2E de acceso siguen pasando; añadidas pruebas de que el campo del DNI recibe el foco tras elegir el tipo, de que «Cambiar» devuelve el paso anterior con sentido contrario, de que cambiar de tipo desde el aviso no repite la animación y de que el primer paso no se anima al cargar.

## 5. Movimiento reducido y rendimiento

- [x] 5.1 Reglas de movimiento reducido por módulo (ingreso, personal, portal, estilos base): sin deriva de ondas, sin escalonado, sin escala, panel sin transición y fundidos de 120 ms como máximo; los cambios de color se conservan (hallazgo de la revisión).
- [x] 5.2 Pruebas Playwright en `tecnologia/e2e/responsive/movimiento.spec.ts` con `reducedMotion: 'reduce'` y con movimiento normal, que leen lo que Chrome aplica (`getAnimations()` y estilos calculados): duraciones, retardos, propiedades y nombres de animación.

## 6. Verificación y entrega

- [x] 6.1 Ejecutar en `tecnologia/sijass-web`: `npm run lint`, `npx tsc -b`, `npm run test:cobertura` y `npm run build` con código 0; ninguna prueba previa cambió.
- [x] 6.2 Ejecutar en `tecnologia/e2e`: los 14 E2E con la API real y PostgreSQL, y las pruebas de pantallas (las 23 existentes más 14 de movimiento: panel en 1024, 1280 y 1440 px, sin botón por debajo de 1024 px, sin desbordamiento horizontal, movimiento normal y reducido).
- [x] 6.3 Revisión visual con Playwright en escritorio: capturas del panel desplegado, plegado y a mitad de transición, del Resumen y del ingreso; consola sin errores; revisión de las decisiones con `emil-design-eng`, que encontró tres defectos propios (doble entrada del primer paso, doble desvanecimiento del Resumen y color apagado con movimiento reducido), ya corregidos. Capturas en `docs/diseno/evidencia/movimiento/`.
- [x] 6.4 Documentar la comprobación de sensación pendiente de revisión humana (reproducir a 2 a 5 veces más lento, cuadro por cuadro, equipo de gama baja no medido) en el README de la evidencia; actualizar `docs/diseno/SIJASS-FRONTEND-PROGRESO.md` y el README de la interfaz; `node scripts/verificar-docs.mjs` y `openspec validate ui-movimiento-panel-plegable --strict` con código 0.
- [ ] 6.5 Subir la rama, abrir el PR contra `main`, esperar el CI en verde, fusionar y archivar el cambio.
