# movimiento-de-interfaz Specification

## Purpose

Define cuándo y cómo se mueve la interfaz de SIJASS para que se sienta viva sin estorbar: el movimiento da retroalimentación o muestra de dónde viene algo, se limita a lo breve y nunca impide la tarea ni a quien pide reducir el movimiento.

## ADDED Requirements

### Requirement: Movimiento con propósito y dentro de un presupuesto
El sistema SHALL usar movimiento solo para dar retroalimentación, mostrar de dónde viene un elemento o hacer legible un cambio de estado; SHALL NOT animar los datos que la persona lee u opera ni las acciones que ejecuta con el teclado; SHALL limitar cada animación o transición a 300 ms; SHALL animar solo `transform`, `opacity` y cambios de color, con la única excepción de la columna del panel lateral; y SHALL NOT usar `transition: all`, partir de `scale(0)` ni usar la curva `ease-in`.

#### Scenario: Revisión de las hojas de estilo
- **WHEN** se revisan las hojas de estilo de la interfaz
- **THEN** no aparecen `transition: all`, `scale(0)` ni `ease-in`, ninguna duración supera 300 ms y las únicas propiedades animadas son `transform`, `opacity`, `color`, `background-color`, `border-color` y la columna del panel

#### Scenario: Datos y teclado sin animación
- **WHEN** la persona cambia de sección con el teclado o abre una tabla de datos
- **THEN** la navegación no espera ninguna animación de salida y los valores de las tablas no se desplazan

### Requirement: Reducir el movimiento significa menos y más suave
El sistema SHALL, cuando el navegador pida reducir el movimiento, eliminar todo desplazamiento, escala y animación continua, y SHALL conservar solo fundidos de 120 ms como máximo en las entradas de página, tarjetas, pasos del ingreso y avisos de estado, además de los cambios de color.

#### Scenario: Preferencia de reducir movimiento
- **WHEN** el navegador pide reducir el movimiento y se abre el Resumen
- **THEN** las tarjetas aparecen con un fundido de 120 ms como máximo, sin escalonar, sin desplazarse y sin escala al pulsar

#### Scenario: Colores con movimiento reducido
- **WHEN** el navegador pide reducir el movimiento y la persona pasa el puntero o pulsa un botón
- **THEN** el botón conserva su cambio de color, no se hunde y no cambia de tamaño

#### Scenario: Ondas y panel con movimiento reducido
- **WHEN** el navegador pide reducir el movimiento y se muestra el ingreso o se pliega el panel
- **THEN** las ondas no se mueven y el panel cambia de ancho sin transición

### Requirement: Panel lateral plegable en escritorio
El sistema SHALL ofrecer, en pantallas de 1024 px o más, un botón que pliegue el panel lateral del personal a una franja de iconos de 80 px como máximo y lo vuelva a desplegar; SHALL recordar la elección en el navegador; SHALL conservar el nombre accesible y un objetivo táctil de al menos 44 px en cada enlace; y SHALL NOT mostrar el botón por debajo de 1024 px, donde sigue el menú actual.

#### Scenario: Plegar el panel
- **WHEN** la persona pulsa «Plegar panel lateral» en una pantalla de 1440 px
- **THEN** el panel mide 80 px como máximo, el contenido ocupa el ancho liberado, el botón indica `aria-expanded` falso y cada enlace conserva su nombre y mide al menos 44 px

#### Scenario: Elección recordada
- **WHEN** la persona recarga la página con el panel plegado
- **THEN** la página abre con el panel plegado y sin animar el cambio de ancho

#### Scenario: Almacenamiento no disponible
- **WHEN** el navegador impide guardar la preferencia
- **THEN** el panel funciona con normalidad y abre desplegado

#### Scenario: Pantalla estrecha
- **WHEN** el ancho de la pantalla es de 390 px
- **THEN** no existe el botón de plegar y el menú móvil funciona como hasta ahora

#### Scenario: Sin desplazamiento horizontal
- **WHEN** el panel está plegado o desplegado en 1024, 1280 y 1440 px
- **THEN** la página no tiene desplazamiento horizontal y ningún texto queda cortado de forma que impida leerlo

### Requirement: Entrada de página y de tarjetas
El sistema SHALL animar la entrada de cada sección del personal con un fundido y un desplazamiento de 6 px como máximo en 180 ms como máximo; SHALL NOT animar la salida de la página anterior; y SHALL escalonar en el Resumen la entrada de las tarjetas con 40 ms entre una y otra y un máximo de 6 pasos. Las tarjetas que solo informan SHALL NOT moverse al pasar el puntero.

#### Scenario: Cambio de sección
- **WHEN** la persona navega de una sección a otra
- **THEN** la nueva página aparece sin esperar una animación de salida y su entrada dura 180 ms como máximo

#### Scenario: Resumen escalonado
- **WHEN** se abre el Resumen
- **THEN** las tarjetas aparecen una tras otra con 40 ms de diferencia y la última termina de aparecer antes de 600 ms

#### Scenario: Tarjeta informativa quieta
- **WHEN** la persona pasa el puntero sobre una tarjeta de indicador
- **THEN** la tarjeta no se mueve ni cambia de tamaño

### Requirement: Microinteracciones de botones, enlaces y sección actual
El sistema SHALL hundir ligeramente un botón habilitado al pulsarlo (escala de 0,97 en 160 ms como máximo) y no mover uno deshabilitado; SHALL cambiar el color al pasar el puntero solo en dispositivos con puntero fino; y SHALL mostrar el indicador de la sección actual del panel con una escala vertical de 180 ms como máximo.

#### Scenario: Pulsar un botón
- **WHEN** la persona pulsa un botón habilitado
- **THEN** el botón se hunde con escala de 0,97 y vuelve a su tamaño al soltar

#### Scenario: Botón deshabilitado
- **WHEN** la persona pulsa un botón deshabilitado
- **THEN** el botón no cambia de tamaño

#### Scenario: Pantalla táctil
- **WHEN** el dispositivo no tiene puntero fino
- **THEN** los colores de pasar el puntero no cambian el aspecto al tocar

### Requirement: Entrada y pasos del ingreso
El sistema SHALL animar en el ingreso la entrada de la tarjeta (fundido y 10 px de desplazamiento en 300 ms como máximo), el cambio entre el paso «tipo de acceso» y el paso «DNI y clave» (desplazamiento horizontal de 16 px como máximo en 220 ms como máximo) y la aparición de los avisos de estado (fundido de 180 ms como máximo).

#### Scenario: Primer paso al cargar
- **WHEN** se abre el ingreso
- **THEN** la tarjeta entra con su animación y el paso «tipo de acceso» no se desplaza por separado

#### Scenario: Elegir el tipo de acceso
- **WHEN** la persona elige «Soy asociado»
- **THEN** el paso del DNI entra con un desplazamiento horizontal breve y el campo del DNI recibe el foco

#### Scenario: Volver al paso anterior
- **WHEN** la persona pulsa «Cambiar» en el paso del DNI
- **THEN** el paso de tipo de acceso entra desde el lado contrario y conserva su foco habitual

#### Scenario: Error de credenciales
- **WHEN** el servidor rechaza el DNI o la clave
- **THEN** el aviso aparece con un fundido, el formulario no se sacude y el aviso se anuncia como alerta

### Requirement: Ondas lentas y formulario estable en el ingreso
El sistema SHALL mover las ondas del panel de marca del ingreso con un ciclo de 12 s o más, y SHALL NOT mover los campos mientras se escribe, sacudir el formulario ante un error ni alterar el foco o los anuncios para lectores de pantalla.

#### Scenario: Escribir en los campos
- **WHEN** la persona escribe su DNI y su clave
- **THEN** los campos y las etiquetas permanecen en su sitio y el foco no cambia por efecto del movimiento

#### Scenario: Ondas del ingreso
- **WHEN** se muestra el ingreso
- **THEN** las ondas se desplazan con un ciclo de 12 s o más y el texto de la tarjeta no se mueve

### Requirement: Ambiente discreto del Resumen
El sistema SHALL mover las ondas del héroe del Resumen con un ciclo de 16 s o más y hacer latir con un fundido de 2,4 s el punto de estado del servicio; SHALL NOT mover texto, cifras ni tarjetas con este ambiente; y SHALL detener ambos movimientos cuando el navegador pida reducir el movimiento.

#### Scenario: Héroe del Resumen
- **WHEN** se abre el Resumen
- **THEN** las ondas del héroe se desplazan con un ciclo de 16 s o más, el punto de estado late con un fundido suave y el texto y las cifras permanecen quietos

#### Scenario: Ambiente con movimiento reducido
- **WHEN** el navegador pide reducir el movimiento
- **THEN** las ondas del héroe y el punto de estado permanecen quietos
