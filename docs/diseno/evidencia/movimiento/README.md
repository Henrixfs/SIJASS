# Evidencia de `ui-movimiento-panel-plegable`

Capturas y comprobaciones del movimiento de la interfaz, tomadas con Chrome (Playwright, API simulada) el 2026-11-26. Cambio de OpenSpec: [`ui-movimiento-panel-plegable`](../../../../openspec/changes/ui-movimiento-panel-plegable/proposal.md); especificación: `movimiento-de-interfaz`.

| Archivo | Qué muestra |
|---|---|
| `panel-desplegado-{1024,1280,1440}.png` | Panel lateral de 240 px con el Resumen ya terminado de entrar |
| `panel-plegado-{1024,1280,1440}.png` | Panel plegado a una franja de iconos de 76 px; el contenido ocupa el ancho liberado |
| `panel-transicion-1440.png` | Un cuadro a mitad de la transición del panel (para revisar a ojo que nada salta ni se corta) |
| `resumen-1440.png` | Resumen con las ondas del héroe y las tarjetas en su estado final |
| `ingreso-1440.png` | Ingreso con la tarjeta ya asentada |

## Qué se comprobó (pasa o la prueba falla)

Pruebas en [`tecnologia/e2e/responsive/movimiento.spec.ts`](../../../../tecnologia/e2e/responsive/movimiento.spec.ts), que miden lo que **el navegador aplica** (`document.getAnimations()` y estilos calculados):

- **Panel:** se pliega a 80 px o menos y se despliega a más de 230 px en 1024, 1280 y 1440 px; cada enlace conserva su nombre y mide al menos 44 × 44 px; el contenido gana más de 140 px; sin desplazamiento horizontal. La transición dura 220 ms, con la curva de movimiento y solo sobre `grid-template-columns`. Recargar con el panel plegado abre ya plegado, **sin** pasar por el ancho de 240 px. Por debajo de 1024 px no hay botón y el menú móvil funciona.
- **Resumen:** entrada escalonada con retardos múltiplos de 40 ms, tope de 240 ms, duración de 280 ms y todo terminado antes de 600 ms; solo `transform` y `opacity`. La página del Resumen no se anima (una sola entrada por contenedor).
- **Resto de secciones:** entrada de 180 ms, sin animación de salida.
- **Ambiente:** ondas del héroe de 18 s y punto de estado de 2,4 s (`transform` y `opacity`).
- **Ingreso:** tarjeta de 280 ms, ondas de 16 s, el primer paso **no** se anima al cargar, y los pasos entran de 220 ms hacia adelante y hacia atrás; el foco pasa al campo del DNI.
- **Botones:** a 0,97 al pulsar y de vuelta al soltar.
- **Movimiento reducido:** ninguna animación mueve ni escala, ninguna dura más de 120 ms ni se escalona; las ondas y el latido se detienen; el panel cambia de ancho sin transición; los botones no se hunden pero **conservan** el cambio de color.
- **Consola:** sin errores en el recorrido del Resumen.
- **Hojas de estilo** (Vitest, `movimiento.test.ts`): ninguna usa `transition: all`, `scale(0)` ni `ease-in`; ninguna duración pasa de 300 ms (también las que salen de variables); solo se animan `transform`, `opacity` y colores (más la columna del panel); todo archivo con movimiento declara su regla de movimiento reducido; los colores de «pasar el puntero» de las tres hojas principales van dentro de `@media (hover: hover)`.

## Revisión de diseño (`emil-design-eng`)

La revisión encontró tres defectos propios que se corrigieron antes de entregar:

1. El primer paso del ingreso se animaba de lado al cargar, además de la tarjeta (doble entrada).
2. En el Resumen se desvanecían a la vez el contenedor y las tarjetas (doble desvanecimiento).
3. «Reducir movimiento» apagaba también los cambios de color, que ayudan a entender y no mueven nada.

## Lo que **no** demuestra

- **Cómo se siente.** El ritmo, el peso de las ondas y la calidad de la transición del panel necesitan ojos humanos: reproducirlos 2 a 5 veces más lentos en las herramientas de desarrollo de Chrome, mirarlos cuadro por cuadro y volver a mirarlos al día siguiente. No se hizo.
- **Rendimiento en un teléfono de gama baja real.** Todo el movimiento continuo es `transform` u `opacity`, pero no se midieron fotogramas en un dispositivo físico. El plegado del panel cambia una columna de diseño (excepción documentada, solo en pantallas de 1024 px o más).
- **Navegadores distintos de Chrome** ni lectores de pantalla.
- **Tablets y teléfonos en horizontal por encima de 1024 px:** se usan las mismas reglas de escritorio; no se probaron en dispositivo.
- La escala de retardos es uniforme (40 ms); un escalonado no uniforme se descartó porque la especificación fija 40 ms.

## Reproducir

```powershell
Push-Location tecnologia/sijass-web; npm run build; Pop-Location
Push-Location tecnologia/e2e
$env:GUARDAR_EVIDENCIA = '1'
.\node_modules\.bin\playwright.cmd test --config playwright.responsive.config.ts responsive/movimiento.spec.ts
Pop-Location
```
