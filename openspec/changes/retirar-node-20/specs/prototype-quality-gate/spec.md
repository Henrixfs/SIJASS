# Spec Delta

## MODIFIED Requirements

### Requirement: Instalación reproducible desde el lockfile
El prototipo SHALL declarar todas las dependencias necesarias para compilar y probar, y SHALL versionar un `package-lock.json` consistente con `package.json`, de modo que `npm ci` funcione en una copia limpia del repositorio.

#### Scenario: Instalación limpia exitosa
- **WHEN** se clona el repositorio y se ejecuta `npm ci` en la carpeta del prototipo con Node.js 22 o superior
- **THEN** la instalación termina con código de salida 0 sin modificar `package.json` ni `package-lock.json`

#### Scenario: Lockfile desincronizado
- **WHEN** `package.json` declara una dependencia que `package-lock.json` no refleja y se ejecuta `npm ci`
- **THEN** la instalación falla con código de salida distinto de 0

#### Scenario: Rango de Node.js declarado
- **WHEN** se inspecciona `package.json` del prototipo
- **THEN** `engines.node` declara `>=22` y la dependencia `@types/node` pertenece a la línea mayor 22, de modo que el compilador no admite APIs ausentes en la versión mínima declarada

### Requirement: Verificación automática en CI
El repositorio SHALL ejecutar en CI, en cada push y en cada pull request, la secuencia `npm ci`, lint, build y pruebas del prototipo, y SHALL marcar el cambio como fallido si cualquier paso falla.

#### Scenario: Pull request que rompe el build
- **WHEN** se abre un pull request cuyo código no compila
- **THEN** la ejecución de CI termina en fallo y el fallo es visible en el pull request

#### Scenario: Pull request conforme
- **WHEN** se abre un pull request cuyo código instala, pasa lint, compila y pasa las pruebas
- **THEN** la ejecución de CI termina en éxito

#### Scenario: Versión de Node soportada
- **WHEN** CI ejecuta la verificación
- **THEN** usa una versión de Node.js dentro del rango declarado como soportado por el prototipo (22 o superior)

#### Scenario: Matriz con la versión mínima y las LTS vigentes
- **WHEN** CI ejecuta el job del prototipo
- **THEN** la verificación corre con la versión mínima declarada en `engines` (22) y con cada línea LTS posterior vigente (hoy 24 y 26), cada una como ejecución independiente cuyo fallo se informa por separado
