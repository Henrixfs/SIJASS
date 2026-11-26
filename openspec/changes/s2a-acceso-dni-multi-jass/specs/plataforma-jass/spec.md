# plataforma-jass Specification

## Purpose

Permite que el equipo que ofrece SIJASS dé de alta, identifique, suspenda y reactive cada JASS cliente y entregue su primer acceso, sin tener acceso a los datos de negocio de ninguna.

## ADDED Requirements

### Requirement: Perfil de plataforma sin JASS propia
El sistema SHALL ofrecer un perfil `plataforma` cuya cuenta no pertenece a ninguna JASS, SHALL crearlo solo por un comando de servidor con su clave leída del entorno y SHALL rechazar con `403` que ese perfil use operaciones propias de una JASS.

#### Scenario: Arranque de la plataforma
- **WHEN** quien administra el servidor ejecuta el comando de creación de la plataforma con un DNI, un nombre y una clave en el entorno
- **THEN** se crea la cuenta con perfil `plataforma`, con cambio de clave pendiente, y el comando no imprime la clave

#### Scenario: Plataforma sin acceso a datos de negocio
- **WHEN** la cuenta de plataforma consulta el padrón, las cuotas, los pagos, los reservorios, las mediciones o el asistente
- **THEN** la respuesta es `403` en todos los casos

### Requirement: Alta de una JASS con su primer Consejo
El sistema SHALL permitir a la plataforma crear una JASS indicando nombre, ubicación opcional (departamento, provincia, distrito y centro poblado) y los datos de su primer Consejo (nombre y DNI), SHALL generar la clave temporal del Consejo devuelta una sola vez y SHALL crear todo en una única transacción.

#### Scenario: Alta correcta
- **WHEN** la plataforma crea una JASS con nombre y un Consejo con DNI válido y sin cuenta
- **THEN** la JASS queda activa, el Consejo queda con cambio de clave pendiente y la respuesta trae la clave temporal una sola vez

#### Scenario: Fallo a medias
- **WHEN** el DNI del Consejo ya tiene una cuenta
- **THEN** la respuesta es `409` y no se crea la JASS ni ningún otro registro

#### Scenario: Nombre duplicado
- **WHEN** ya existe una JASS con el mismo nombre y la misma ubicación
- **THEN** la respuesta es `409` y no se crea nada

### Requirement: Listado, suspensión y reactivación de JASS
El sistema SHALL permitir a la plataforma listar las JASS con su estado y cantidad de cuentas activas, y suspender o reactivar una JASS. Una JASS suspendida SHALL impedir iniciar sesión, renovar sesiones y operar a todas sus cuentas, y SHALL conservar todos sus datos.

#### Scenario: Suspensión
- **WHEN** la plataforma suspende una JASS
- **THEN** sus cuentas reciben `403` con el código `jass-suspendida` al iniciar sesión o renovar, sus datos permanecen y el hecho queda auditado

#### Scenario: Reactivación
- **WHEN** la plataforma reactiva la JASS
- **THEN** sus cuentas vuelven a iniciar sesión con sus claves de siempre

#### Scenario: Listado sin datos de negocio
- **WHEN** la plataforma lista las JASS
- **THEN** cada fila trae nombre, ubicación, estado y cantidad de cuentas, y ningún dato de asociados, cuotas, pagos ni mediciones

### Requirement: Restablecimiento de la clave del Consejo
El sistema SHALL permitir a la plataforma restablecer la clave de un Consejo activo de una JASS con una clave temporal nueva devuelta una sola vez y cambio pendiente, y SHALL auditarlo.

#### Scenario: Restablecimiento correcto
- **WHEN** la plataforma restablece la clave del Consejo de una JASS
- **THEN** recibe la clave temporal, las sesiones anteriores del Consejo se invalidan y debe cambiarla al entrar

### Requirement: Comando de alta de JASS por DNI
El sistema SHALL mantener un comando de servidor para crear una JASS con su primer Consejo identificado por nombre y DNI, con la clave inicial leída del entorno y sin imprimirla, para instalaciones sin acceso a la interfaz de plataforma.

#### Scenario: Alta por comando
- **WHEN** se ejecuta el comando con nombre de JASS, nombre y DNI del Consejo y la clave en el entorno
- **THEN** la JASS y el Consejo existen, el Consejo puede entrar con su DNI y la clave del entorno y debe cambiarla
