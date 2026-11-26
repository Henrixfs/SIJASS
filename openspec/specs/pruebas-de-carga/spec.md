# pruebas-de-carga Specification

## Purpose
Define los escenarios de carga k6 del portal del asociado, sus umbrales y la forma de registrar cada ejecución sin confundir entornos, para sustentar el criterio de capacidad (C13) con evidencia honesta.

## Requirements

### Requirement: Escenario del portal con rampa gradual
El repositorio SHALL incluir un escenario k6 versionado que, con cuentas de asociado ya sembradas, inicie sesión una vez por usuario virtual y consulte repetidamente `portal/saldo`, `portal/cuotas` y `portal/pagos` con tiempo de pensamiento, aumentando la carga por etapas hasta una meta configurable (2.000 usuarios virtuales concurrentes por defecto), con una etapa de mantenimiento y otra de descenso.

#### Scenario: Etapas
- **WHEN** se lista el escenario
- **THEN** tiene al menos cuatro etapas de subida crecientes antes de la meta, una de mantenimiento y una de descenso

#### Scenario: Cuentas suficientes
- **WHEN** la meta es 2.000 usuarios virtuales
- **THEN** existen 2.000 cuentas distintas y cada usuario virtual usa la suya

### Requirement: Umbrales y datos observados
El escenario SHALL declarar umbrales de percentil 95 de latencia de lectura y de tasa de error, SHALL informar al terminar la latencia (p50, p95, p99), el rendimiento (solicitudes por segundo), la tasa de error y el máximo de usuarios virtuales alcanzado, y SHALL distinguir los errores de inicio de sesión de los de lectura.

#### Scenario: Informe
- **WHEN** termina una ejecución
- **THEN** se guarda un resumen JSON con latencias, rendimiento, errores por tipo y usuarios virtuales máximos

### Requirement: Registro por entorno
Cada resultado SHALL registrarse con su entorno (`local`, `ci` o `despliegue`), la fecha, la versión (commit), las características de la máquina o del servicio y la meta de usuarios virtuales. La documentación SHALL mantener una columna distinta para cada entorno y SHALL NOT presentar una cifra `local` como capacidad del despliegue. Una cifra de `despliegue` SHALL existir solo si la ejecución se hizo contra el servicio desplegado.

#### Scenario: Sin despliegue
- **WHEN** aún no existe un despliegue
- **THEN** la columna del despliegue dice «sin medir» y no contiene ninguna cifra

#### Scenario: Cifra local
- **WHEN** se registra una ejecución en la máquina de desarrollo
- **THEN** el registro indica `local`, el hardware y que no representa el despliegue
