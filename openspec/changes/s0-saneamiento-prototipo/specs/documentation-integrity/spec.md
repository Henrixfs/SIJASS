# Spec Delta

## Purpose

Mantiene la documentación del proyecto coherente y verificable: enlaces relativos que resuelven e identificadores de requisitos, pruebas y deuda técnica que existen en su documento fuente, comprobado automáticamente en CI.

## ADDED Requirements

### Requirement: Enlaces relativos válidos
Todo enlace relativo en un archivo Markdown versionado (excluidos `node_modules` y `openspec/`) SHALL apuntar a un archivo o carpeta existente del repositorio.

#### Scenario: Todos los enlaces resuelven
- **WHEN** se ejecuta la comprobación de documentación sobre el repositorio
- **THEN** termina con código 0 e informa el número de enlaces revisados

#### Scenario: Enlace roto
- **WHEN** un `.md` enlaza a una ruta relativa que no existe
- **THEN** la comprobación termina con código distinto de 0 e indica el archivo de origen y el destino inexistente

### Requirement: Identificadores de requisitos, decisiones y pruebas existentes
Todo identificador `HUnn`, `RFnn`, `RNFnn`, `ADR-nnn` o `PTnn` referenciado en la documentación SHALL estar definido en su documento fuente (historias, requisitos funcionales, atributos de calidad, decisiones arquitectónicas y plan de pruebas, respectivamente).

#### Scenario: Identificadores consistentes
- **WHEN** la documentación solo referencia identificadores definidos en sus documentos fuente
- **THEN** la comprobación termina con código 0

#### Scenario: Referencia a identificador inexistente
- **WHEN** un documento referencia `RF99`, `PT99`, `HU99`, `RNF99` o `ADR-099` sin definición en su documento fuente
- **THEN** la comprobación termina con código distinto de 0 e indica el identificador y el archivo que lo referencia

### Requirement: Rúbrica y matriz de cumplimiento completas
La rúbrica del trabajo final y la matriz de cumplimiento SHALL contener exactamente los 16 criterios `C01`–`C16`, cada uno una sola vez, y todo código `Cnn` referenciado en la documentación SHALL existir en la rúbrica.

#### Scenario: Los 16 criterios presentes en ambos documentos
- **WHEN** se ejecuta la comprobación de documentación
- **THEN** `docs/07-evaluacion-final/rubrica-trabajo-final.md` y `docs/07-evaluacion-final/matriz-cumplimiento.md` contienen cada código de `C01` a `C16` exactamente una vez como fila de tabla, y el comando termina con código 0

#### Scenario: Criterio faltante o inexistente
- **WHEN** la matriz omite `C07` o referencia `C17`
- **THEN** la comprobación termina con código distinto de 0 e indica el código y el archivo

### Requirement: Identificadores de deuda técnica consistentes
Todo identificador `DTnn` referenciado en la documentación SHALL estar definido en la tabla de deuda técnica de `docs/00-alcance-y-roadmap.md`, y las deudas marcadas como resueltas SHALL indicar el cambio que las resolvió.

#### Scenario: DT referenciado y definido
- **WHEN** `README.md` del prototipo referencia `DT01`
- **THEN** `DT01` aparece definido en la tabla de deuda técnica del roadmap

#### Scenario: Deuda resuelta con trazabilidad
- **WHEN** una deuda técnica se marca como resuelta
- **THEN** su fila en el roadmap nombra el cambio `s0-saneamiento-prototipo` (o el cambio que corresponda) como evidencia

### Requirement: Estado documental alineado con la evidencia
La documentación SHALL declarar el estado de la Etapa 0 y de cada deuda técnica de acuerdo con la evidencia disponible, y SHALL mantener como abiertas las deudas no resueltas por este cambio.

#### Scenario: Etapa 0 tras cumplir los criterios de salida
- **WHEN** `npm ci`, lint, build y pruebas pasan en CI sobre el commit del cambio
- **THEN** el roadmap marca DT01, DT02 y DT07 como resueltas y la Etapa 0 como completada con referencia a esa ejecución de CI

#### Scenario: Matriz de cumplimiento actualizada con evidencia
- **WHEN** se cierran DT01, DT02 y DT07 con CI en verde
- **THEN** las filas C05, C12 y C14 de la matriz de cumplimiento enlazan esa evidencia y conservan como pendiente lo que el cambio no cubre (integración, CD y esquema de base de datos), sin declarar el criterio como cumplido

#### Scenario: Deuda no resuelta
- **WHEN** DT03, DT04, DT05 o DT06 siguen sin corrección en el código
- **THEN** el roadmap y el README del prototipo las mantienen como abiertas, asignadas a la Etapa 1

### Requirement: Comprobación documental en CI
La comprobación de documentación SHALL ejecutarse en CI junto con la verificación del prototipo y SHALL hacer fallar la ejecución cuando detecte una inconsistencia.

#### Scenario: Inconsistencia documental en un pull request
- **WHEN** un pull request introduce un enlace roto
- **THEN** la ejecución de CI termina en fallo
