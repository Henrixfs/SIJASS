# Proposal

## Why

La interfaz de SIJASS ya sigue el diseño de Penpot, pero se siente estática: el movimiento actual se limita a la entrada de página, algunas listas y los importes, y el panel lateral del personal no se puede plegar en escritorio. La persona que lo usa pidió una interfaz más viva, sin cambiar la paleta ni la estructura aprobadas. Hay que lograrlo sin perjudicar a quien usa el sistema (personas con poca experiencia digital, teléfonos de gama baja, preferencia de reducir movimiento) y sin romper las pruebas que sostienen la entrega.

## What Changes

- **Panel lateral plegable en escritorio** (1024 px o más): botón para reducir el panel a una franja de iconos y volver a desplegarlo; la elección se recuerda en el navegador.
- **Entrada de página más rápida y entrada escalonada de las tarjetas del Resumen** (y del inicio del portal de familias). La página anterior no se anima al salir.
- **Microinteracciones**: los botones se hunden al pulsar, el color cambia al pasar el puntero (solo con puntero fino) y el indicador de la sección actual aparece con una escala vertical breve.
- **Ingreso con entrada suave**: la tarjeta aparece con fundido, el paso «tipo de acceso» → «DNI y clave» se desplaza con suavidad, los avisos aparecen con fundido y las ondas del panel de marca se mueven con lentitud. Nada se sacude ante un error.
- **Ambiente discreto del Resumen**: las ondas del héroe se mueven con mucha lentitud y el punto de estado del servicio late con un fundido suave; el texto y las cifras no se mueven.
- **Una sola base de movimiento**: duraciones y curvas como variables compartidas; **reducir movimiento** pasa de «apagar todo» a «solo fundidos breves».
- **Prueba de guardia** que revisa las hojas de estilo y rechaza `transition: all`, `scale(0)`, `ease-in`, duraciones de más de 300 ms y animaciones sin regla de movimiento reducido.
- Sin cambios de paleta, de estructura, de textos ni de API. **No hay cambios incompatibles.**

## Capabilities

### New Capabilities
- `movimiento-de-interfaz`: reglas observables del movimiento de la interfaz: qué se anima y qué no, el panel lateral plegable, la entrada de páginas y tarjetas, las microinteracciones, el ingreso y el respeto por la preferencia de reducir movimiento.

### Modified Capabilities
<!-- Ninguna: no cambian requisitos de las capacidades existentes; solo se añade presentación con movimiento. -->

## Impact

- **Interfaz** (`tecnologia/sijass-web/src`): `paginas/NavegacionPersonal.tsx`, `paginas/Ingreso.tsx`, `paginas/personal.css`, `paginas/ingreso.css`, `paginas/portal.css`, `premium.css`, `estilos.css`, un módulo pequeño para guardar la preferencia del panel y pruebas nuevas.
- **Pruebas:** Vitest (panel y guardia de estilos), E2E de pantallas en `tecnologia/e2e/responsive` (panel en 1024, 1280 y 1440 px, sin botón por debajo de 1024 px, movimiento reducido) y los 14 E2E existentes sin cambios.
- **Documentación:** evidencia visual y notas de decisión en `docs/diseno/`, progreso del frontend y README de la interfaz.
- **Sin cambios** en backend, base de datos ni contrato OpenAPI.
