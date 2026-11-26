# interfaz-acceso-y-administracion Specification

## Purpose

Define las pantallas de ingreso, cambio de clave, entrega de claves, equipo y plataforma para que sean muy sencillas de usar por personas con poca experiencia digital, accesibles y utilizables desde un celular.

## ADDED Requirements

### Requirement: Ingreso con dos botones, DNI y clave
La pantalla de ingreso SHALL ofrecer dos botones grandes, «Soy asociado» y «Soy administrador», un campo de DNI con teclado numérico y de 8 dígitos como máximo, un campo de clave con opción de mostrarla y un único botón «Ingresar». SHALL enviar el tipo elegido y SHALL llevar a cada persona a su pantalla según el perfil real que devuelva el servidor.

#### Scenario: Asociado entra
- **WHEN** una persona elige «Soy asociado», escribe su DNI y su clave y pulsa «Ingresar»
- **THEN** entra al portal de familias

#### Scenario: Administrador entra
- **WHEN** una persona elige «Soy administrador» con una cuenta de personal
- **THEN** entra al panel de su rol, o a cambiar su clave si la tiene pendiente

#### Scenario: Tipo equivocado
- **WHEN** el servidor responde que el tipo elegido no corresponde a la cuenta
- **THEN** se muestra un mensaje breve que nombra el tipo real y propone usar el otro botón, sin iniciar sesión

#### Scenario: Teclado del celular
- **WHEN** se enfoca el campo de clave en un celular
- **THEN** no se autocapitalizan ni se autocorrigen las letras, y el campo de DNI abre el teclado numérico

### Requirement: Mensajes de acceso en lenguaje común
La interfaz SHALL mostrar los resultados del ingreso con mensajes cortos y claros para: verificando, datos incorrectos, bloqueo temporal con el tiempo de espera, JASS suspendida, tipo de acceso distinto, sesión vencida y error del servicio, y SHALL NOT mostrar códigos técnicos ni distinguir un DNI inexistente de una clave errónea.

#### Scenario: Datos incorrectos
- **WHEN** el servidor responde `401`
- **THEN** la pantalla dice «Revisa tu DNI y tu clave» sin indicar cuál falló

#### Scenario: JASS suspendida
- **WHEN** el servidor responde `403` con `jass-suspendida`
- **THEN** la pantalla indica que la JASS está suspendida y que debe comunicarse con SIJASS

### Requirement: Pantalla de cambio de clave
La interfaz SHALL ofrecer una pantalla para cambiar la clave, SHALL mostrarla de forma obligatoria y única al personal con cambio pendiente hasta que lo complete, SHALL validar la longitud y la coincidencia de la confirmación antes de enviar y SHALL permitir cambiarla de forma voluntaria desde el perfil.

#### Scenario: Cambio obligatorio
- **WHEN** una cuenta de personal con cambio pendiente inicia sesión
- **THEN** solo ve la pantalla de cambio de clave y, al completarla, entra a su panel

#### Scenario: Confirmación distinta
- **WHEN** la clave nueva y su confirmación no coinciden
- **THEN** el error aparece junto al campo y no se envía nada

### Requirement: Entrega de la clave temporal
Al crear o restablecer un acceso, la interfaz SHALL mostrar la clave temporal en letra grande, con el DNI y el nombre de la persona, SHALL ofrecer copiarla e imprimir una tarjeta de entrega, SHALL avisar que no se podrá ver de nuevo y SHALL no conservarla en almacenamiento del navegador.

#### Scenario: Acceso creado
- **WHEN** Tesorería crea el acceso de un asociado
- **THEN** ve la clave temporal con las acciones «Copiar» e «Imprimir tarjeta» y el aviso de que no se mostrará otra vez

#### Scenario: Cierre del diálogo
- **WHEN** cierra el diálogo
- **THEN** la clave desaparece de la pantalla y de la memoria de la aplicación

### Requirement: Sección Equipo del Consejo
La interfaz SHALL ofrecer solo al Consejo una sección «Equipo» para listar, agregar, desactivar y restablecer la clave de Tesorería y Operador, mostrando el DNI enmascarado, el rol y el estado, y SHALL pedir confirmación antes de desactivar.

#### Scenario: Agregar Operador
- **WHEN** el Consejo agrega un Operador con nombre y DNI
- **THEN** aparece en la lista y se muestra su clave temporal para entregarla

#### Scenario: Otros roles
- **WHEN** Tesorería o un Operador abren el panel
- **THEN** no ven la sección «Equipo»

### Requirement: Área de plataforma
La interfaz SHALL ofrecer a la cuenta de plataforma un área propia para listar, crear, suspender y reactivar JASS y restablecer la clave de su Consejo, SHALL llevarla allí al iniciar sesión y SHALL no mostrarle ninguna pantalla de padrón, pagos ni mediciones.

#### Scenario: Alta de JASS
- **WHEN** la plataforma completa nombre, ubicación y datos del Consejo
- **THEN** la JASS aparece en la lista y se muestra la clave temporal del Consejo para entregarla

#### Scenario: Ruta de otro perfil
- **WHEN** una cuenta de plataforma abre una ruta del personal o del portal
- **THEN** vuelve a su área

### Requirement: Nombre de la JASS visible
El panel del personal y el portal de familias SHALL mostrar el nombre de la JASS de la sesión y el nombre de la persona, y SHALL mostrar el DNI solo enmascarado.

#### Scenario: Panel con nombre de JASS
- **WHEN** el personal entra al panel
- **THEN** la barra lateral muestra el nombre de su JASS y su rol

### Requirement: Uso desde celular y accesibilidad
Las pantallas de este cambio SHALL funcionar sin desbordamiento horizontal desde 320 px de ancho, SHALL tener controles de al menos 44 px, SHALL tener etiquetas visibles, foco visible, contraste mínimo de 4,5:1 en el texto y SHALL poder usarse con teclado.

#### Scenario: Ingreso en 320 px
- **WHEN** se abre el ingreso a 320 px de ancho
- **THEN** no hay desplazamiento horizontal y todos los controles son alcanzables y legibles

#### Scenario: Navegación con teclado
- **WHEN** se recorre el ingreso con el teclado
- **THEN** el orden es los dos tipos de acceso, DNI, clave, mostrar clave e ingresar, con el foco visible en cada uno
