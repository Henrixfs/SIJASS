# Proposal

## Why

El usuario rechazó la interfaz actual por poco atractiva y aprobó, como maqueta, el diseño «Altiplano» (`docs/diseno/propuesta-altiplano`): fotos reales de lagunas del Perú, agua en movimiento, menú lateral que se abre al pasar el mouse y personas con avatar. Además, el backend de incidencias (`s1f`, PR #16) ya existe pero ninguna pantalla lo usa: las familias aún no pueden reportar problemas.

## What Changes

- Sistema visual «Altiplano» en toda la interfaz web: colores, botones que se llenan de agua, olas y fotos con crédito.
- Ingreso con la foto de la laguna de Llanganuco y agua animada que responde al puntero (WebGL), con alternativa estática.
- Panel del personal con menú lateral que se abre al pasar el mouse o al enfocarlo con el teclado, se cierra al salir y se puede fijar; en pantallas pequeñas conserva el botón «Menú».
- Avatares ilustrados para las personas del padrón y del equipo, asignados por su identificador (no por el nombre).
- Sección «Reportes» del personal: bandeja de incidencias y ficha para atenderlas según el rol.
- Pantalla «Reportes» del asociado: reporte en tres pasos con foto opcional y seguimiento de sus reportes.
- Todo movimiento respeta «reducir movimiento».

## Capabilities

### New Capabilities

- `interfaz-incidencias`: reporte y seguimiento de incidencias en el portal y su atención en el panel del personal.
- `interfaz-visual-altiplano`: identidad visual, ingreso con agua animada, menú lateral por puntero y avatares.

### Modified Capabilities

Ninguna: el ingreso conserva sus textos, campos y mensajes (`interfaz-acceso-y-administracion`).

## Impact

Solo `tecnologia/sijass-web` (componentes, estilos y fotos en `public/fotos`) y pruebas web y E2E. No cambia la API. Las fotos son de Wikimedia Commons con licencia CC BY-SA y se muestran con su crédito. El avatar elegido por la persona y guardado en el servidor queda para otro cambio.
