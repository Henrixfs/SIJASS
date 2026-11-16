# Spec Delta

## MODIFIED Requirements

### Requirement: Pruebas ejecutables y deterministas
El prototipo SHALL ejecutar sus pruebas unitarias con `npm test` y SHALL reportar fallo (código distinto de 0) cuando cualquiera de ellas falle.

#### Scenario: Todas las pruebas existentes pasan
- **WHEN** se ejecuta `npm test` tras `npm ci`
- **THEN** pasan todas las pruebas unitarias versionadas del prototipo, se ejecuta al menos una prueba y el comando termina con código 0

#### Scenario: Una prueba falla
- **WHEN** una aserción de una prueba deja de cumplirse
- **THEN** `npm test` termina con código distinto de 0
