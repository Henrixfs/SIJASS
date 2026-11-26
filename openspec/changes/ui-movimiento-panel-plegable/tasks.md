## 1. Base de movimiento y guardia

- [ ] 1.1 Añadir a `premium.css` las variables `--duracion-pagina`, `--duracion-panel`, `--duracion-pulsar` y `--curva-mover`, sin tocar `--curva` ni `--duracion-corta`; reducir la entrada de `.pagina-personal` a `--duracion-pagina` y 4 px, y reemplazar el apagado global de movimiento reducido por la regla de D8 (fundidos de 120 ms, sin desplazamiento ni escala).
- [ ] 1.2 Crear `src/lib/movimiento.ts` con `revisarMovimiento(css)` y `src/pruebas/movimiento.test.ts`: casos negativos (`transition: all`, `scale(0)`, `ease-in`, 400 ms, propiedad fuera de lista, animación sin regla de movimiento reducido) y positivos, y una comprobación sobre las hojas reales de `src/`. Verificar con `npm test` que falla ante cada caso malo antes de aplicarla a las hojas reales.

## 2. Panel lateral plegable

- [ ] 2.1 Crear `src/lib/panel.ts` (leer y guardar la preferencia con `try/catch`, valor inicial desplegado) con pruebas de almacenamiento disponible, no disponible y valor inválido.
- [ ] 2.2 En `NavegacionPersonal.tsx`: estado del panel, botón «Plegar panel lateral»/«Desplegar panel lateral» con `aria-expanded` y `aria-controls`, `data-plegado` y `data-listo` en `.marco-personal`, `<span class="lateral-texto">` en los enlaces y `title` solo con el panel plegado. Conservar `data-testid="nombre-jass"` y los nombres de los enlaces.
- [ ] 2.3 En `personal.css`: riel de 76 px con la transición de columna (D4), fundido de textos, separadores en lugar de títulos de grupo, `overflow-x: hidden`, objetivos de 44 px, botón visible solo desde 1024 px y el indicador de sección actual con `::before` y `scaleY` (D6).
- [ ] 2.4 Pruebas de componente en Vitest: plegar y desplegar, `aria-expanded`, preferencia recordada al montar, almacenamiento no disponible, nombres accesibles de los enlaces con el panel plegado y que los 147 existentes sigan pasando.

## 3. Páginas, tarjetas y microinteracciones

- [ ] 3.1 Escalonado del Resumen en `personal.css` con `--i` por `:nth-child` y retardo con tope de 6 pasos (D5); contenedor del Resumen solo con opacidad; el inicio del portal de familias reutiliza la entrada en `portal.css`.
- [ ] 3.2 Botones y enlaces: `scale(0.97)` al pulsar con la transición existente ampliada, sin movimiento en botones deshabilitados, colores de hover nuevos dentro de `@media (hover: hover) and (pointer: fine)` y tarjetas informativas sin hover (D6).

- [ ] 3.3 Ambiente del Resumen en `personal.css`: deriva lenta de `.hero-ondas` (18 s, `transform`) y latido de opacidad del punto de `.hero-etiqueta` (2,4 s); texto y cifras quietos; compartir el `@keyframes` de deriva con el ingreso en lugar de duplicarlo (D7b).

## 4. Ingreso

- [ ] 4.1 En `Ingreso.tsx`, envolver cada paso en un contenedor con `key` y `data-sentido` sin cambiar el foco ni los roles; en `ingreso.css`, entrada de la tarjeta (300 ms), paso adelante o atrás (220 ms), aviso de estado con fundido (180 ms) y deriva lenta de las ondas (16 s) (D7).
- [ ] 4.2 Pruebas: el flujo de ingreso de Vitest y los E2E de acceso siguen pasando; añadir una prueba de que el campo del DNI recibe el foco tras elegir el tipo y de que «Cambiar» devuelve el paso anterior.

## 5. Movimiento reducido y rendimiento

- [ ] 5.1 Reglas de movimiento reducido por módulo (ingreso, personal, portal, estilos base): sin deriva de ondas, sin escalonado, sin escala, panel sin transición y fundidos de 120 ms como máximo.
- [ ] 5.2 Pruebas Playwright con `reducedMotion: 'reduce'` (duraciones y nombres de animación calculados por Chrome) y con movimiento normal (duraciones de página, tarjetas y panel dentro de los límites).

## 6. Verificación y entrega

- [ ] 6.1 Ejecutar en `tecnologia/sijass-web`: `npm run lint`, `npx tsc -b`, `npm run test:cobertura` y `npm run build` con código 0; comprobar que ninguna prueba previa cambió.
- [ ] 6.2 Ejecutar en `tecnologia/e2e`: los 14 E2E y las pruebas de pantallas (las 23 existentes más las del panel en 1024, 1280 y 1440 px, sin botón por debajo de 1024 px y sin desbordamiento horizontal).
- [ ] 6.3 Revisión visual con Playwright en móvil y escritorio: recorrido principal, capturas, consola sin errores, y lista priorizada de fallos con pasos para reproducirlos; revisar las decisiones con `emil-design-eng`. Guardar las capturas en `docs/diseno/evidencia/movimiento/`.
- [ ] 6.4 Documentar la comprobación de sensación pendiente de revisión humana (reproducir a 2 a 5 veces más lento, cuadro por cuadro, equipo de gama baja no medido); actualizar `docs/diseno/SIJASS-FRONTEND-PROGRESO.md` y el README de la interfaz; `node scripts/verificar-docs.mjs` y `openspec validate ui-movimiento-panel-plegable --strict` con código 0.
- [ ] 6.5 Subir la rama, abrir el PR contra `main`, esperar el CI en verde, fusionar y archivar el cambio.
