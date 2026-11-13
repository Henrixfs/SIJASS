# Spec Delta

## Purpose

Garantiza que el prototipo de dominio de SIJASS se instale de forma reproducible, compile, pase el análisis estático y sus pruebas, y que esa verificación se ejecute automáticamente en cada cambio, de modo que cualquier estado «Implementado» tenga evidencia de CI.

## ADDED Requirements

### Requirement: Instalación reproducible desde el lockfile
El prototipo SHALL declarar todas las dependencias necesarias para compilar y probar, y SHALL versionar un `package-lock.json` consistente con `package.json`, de modo que `npm ci` funcione en una copia limpia del repositorio.

#### Scenario: Instalación limpia exitosa
- **WHEN** se clona el repositorio y se ejecuta `npm ci` en la carpeta del prototipo con Node.js 20 o superior
- **THEN** la instalación termina con código de salida 0 sin modificar `package.json` ni `package-lock.json`

#### Scenario: Lockfile desincronizado
- **WHEN** `package.json` declara una dependencia que `package-lock.json` no refleja y se ejecuta `npm ci`
- **THEN** la instalación falla con código de salida distinto de 0

### Requirement: Compilación en instalación limpia
El prototipo SHALL compilar sin errores de tipos en una instalación limpia, incluidas las pruebas que usan los módulos integrados de Node.js.

#### Scenario: Build sin errores de tipos
- **WHEN** se ejecuta `npm run build` tras `npm ci`
- **THEN** TypeScript termina con código 0 y no emite `TS2307` sobre `node:test` ni sobre `node:assert`

### Requirement: Pruebas ejecutables y deterministas
El prototipo SHALL ejecutar sus pruebas unitarias con `npm test` y SHALL reportar fallo (código distinto de 0) cuando cualquiera de ellas falle.

#### Scenario: Todas las pruebas existentes pasan
- **WHEN** se ejecuta `npm test` tras `npm ci`
- **THEN** pasan las cinco pruebas existentes del prototipo y el comando termina con código 0

#### Scenario: Una prueba falla
- **WHEN** una aserción de una prueba deja de cumplirse
- **THEN** `npm test` termina con código distinto de 0

### Requirement: Análisis estático del código
El prototipo SHALL exponer un comando `npm run lint` que analice el código TypeScript de `src/` y falle ante violaciones de las reglas configuradas.

#### Scenario: Código conforme
- **WHEN** se ejecuta `npm run lint` sobre el código versionado
- **THEN** el comando termina con código 0 y sin advertencias que se traten como error

#### Scenario: Violación de regla
- **WHEN** se introduce en `src/` código que infringe una regla de lint configurada como error
- **THEN** `npm run lint` termina con código distinto de 0 e indica archivo y línea

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
- **THEN** usa una versión de Node.js dentro del rango declarado como soportado por el prototipo (20 o superior)
