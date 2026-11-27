# Interfaz visual Altiplano

## ADDED Requirements

### Requirement: Ingreso con la laguna
El ingreso SHALL mostrar a pantalla completa una foto real con su crédito y, si el navegador lo permite y no se pidió reducir el movimiento, agua animada que responde al puntero. SHALL conservar los dos botones, los campos, los mensajes y el orden de foco del ingreso actual.

#### Scenario: Movimiento reducido
- **WHEN** el sistema pide reducir el movimiento
- **THEN** la foto queda quieta y no corre ningún bucle de animación

### Requirement: Menú lateral por puntero
Con un puntero fino, el menú del personal SHALL abrirse al pasar el puntero o al recibir el foco del teclado, cerrarse al salir sin mover el contenido y poder fijarse abierto. En pantallas estrechas o táctiles SHALL conservar el botón «Menú».

#### Scenario: Abrir y cerrar
- **WHEN** el puntero entra en el menú y luego sale
- **THEN** el menú se abre mostrando los nombres de las secciones y después vuelve a quedar solo con los iconos

### Requirement: Personas con avatar
Las listas de asociados, equipo e incidencias SHALL mostrar un avatar ilustrado por persona, elegido por su identificador (o, en el equipo, por su rol) y nunca deducido del nombre, sin reemplazar el nombre escrito. En el portal, la familia SHALL poder elegir su propio avatar, que se recuerda en su dispositivo.

#### Scenario: Mismo avatar
- **WHEN** la misma persona aparece en dos pantallas
- **THEN** se muestra con el mismo avatar

### Requirement: Fotos con crédito
Cada foto real SHALL mostrar su autor y su licencia, y la interfaz SHALL indicar que es referencial cuando no muestra a la JASS.

#### Scenario: Crédito visible
- **WHEN** una pantalla muestra una foto
- **THEN** el crédito con autor y licencia es legible sobre ella

### Requirement: Pantallas de la maqueta v3 con datos reales
El panel del personal y el portal SHALL reproducir las pantallas de la maqueta v3 (`docs/diseno/propuesta-altiplano`): el inicio de cada rol con foto, saldo, estanque, cobranza por mes y tarjetas de reservorios o de deudores; el padrón en filas con una gota por mes; cuotas y pagos con niveles de agua; «El agua» con fotos y gráfico de gotas; reportes con ficha a color; equipo en tarjetas; y el portal como celular con barra inferior y «Reportar» al centro. Todas las cifras SHALL salir de la API.

#### Scenario: Cifras parciales
- **WHEN** no se puede leer el estado de cuenta de alguna familia
- **THEN** la pantalla lo avisa y no completa cifras que no tiene

#### Scenario: Pantalla estrecha
- **WHEN** el panel o el portal se abren entre 320 y 1440 px de ancho
- **THEN** no hay desplazamiento horizontal y cada control mide al menos 44 px
