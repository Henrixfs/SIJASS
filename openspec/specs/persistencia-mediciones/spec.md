# persistencia-mediciones Specification

## Purpose

Define el contrato de persistencia de las mediciones y de las operaciones idempotentes para que toda implementación (en memoria o PostgreSQL) se comporte igual. También define un esquema PostgreSQL versionado y reversible que hace cumplir las invariantes en la propia base, y la verificación automática contra una base real.

## Requirements

### Requirement: Duplicado señalado con un error de dominio
El contrato de persistencia de mediciones SHALL especificar que guardar una medición cuyo par (JASS, identificador) ya existe falla con un error de dominio específico de duplicado, el mismo en todas las implementaciones, sin modificar la medición existente.

#### Scenario: Identificador repetido en la misma JASS
- **WHEN** se guarda una medición con un identificador que ya existe en la misma JASS
- **THEN** la operación falla con el error de dominio de duplicado y la medición almacenada no cambia

#### Scenario: Mismo identificador en dos JASS
- **WHEN** se guardan dos mediciones con el mismo identificador en JASS distintas
- **THEN** ambas se guardan sin error y cada una se recupera solo desde su JASS

#### Scenario: Error de duplicado en PostgreSQL
- **WHEN** la base de datos rechaza la inserción por violación de la clave primaria de la medición
- **THEN** la implementación PostgreSQL informa el mismo error de dominio de duplicado y no un error genérico del controlador

### Requirement: Batería de contrato común
Toda implementación de la persistencia de mediciones y de la unidad de trabajo idempotente SHALL superar la misma batería de pruebas de contrato. La batería SHALL NOT incluir casos exclusivos de una implementación que alteren el comportamiento esperado.

#### Scenario: Implementación en memoria
- **WHEN** se ejecuta `npm test`
- **THEN** la implementación en memoria supera la batería de contrato completa

#### Scenario: Implementación PostgreSQL
- **WHEN** se ejecuta `npm run test:integration` contra una base migrada
- **THEN** la implementación PostgreSQL supera la misma batería de contrato, con los mismos casos y las mismas aserciones

#### Scenario: Divergencia de comportamiento
- **WHEN** una implementación devuelve un resultado distinto del esperado por un caso de la batería, por ejemplo un error genérico ante un duplicado
- **THEN** la batería falla para esa implementación

### Requirement: Lecturas aisladas por JASS
Toda lectura de mediciones SHALL requerir la JASS y SHALL devolver solo mediciones de esa JASS. Consultar desde otra JASS una medición o un reservorio ajenos SHALL comportarse igual que consultar algo inexistente.

#### Scenario: Búsqueda desde otra JASS
- **WHEN** se busca desde la JASS B el identificador de una medición de la JASS A
- **THEN** el resultado es «no encontrada», igual que para un identificador inexistente

#### Scenario: Listado de un reservorio ajeno
- **WHEN** se listan desde la JASS B las mediciones de un reservorio de la JASS A
- **THEN** el resultado es una lista vacía

#### Scenario: Listado propio ordenado
- **WHEN** se listan desde la JASS A las mediciones de uno de sus reservorios
- **THEN** se obtienen solo las mediciones de ese reservorio en la JASS A, de la toma más reciente a la más antigua y, ante igual hora de toma, ordenadas por identificador

### Requirement: Esquema versionado y reversible
El esquema de PostgreSQL SHALL crearse solo mediante migraciones versionadas en el repositorio y aplicables sobre una base vacía. Cada migración SHALL ser reversible: revertirla SHALL eliminar todos los objetos que creó, y volver a aplicarla SHALL reproducir el mismo esquema.

#### Scenario: Aplicación sobre una base vacía
- **WHEN** se aplican las migraciones sobre una base PostgreSQL vacía
- **THEN** existen las tablas `jass`, `reservorio`, `metodo_medicion`, `medicion` y `operacion_idempotente`, y la migración queda registrada como aplicada

#### Scenario: Aplicar, revertir y volver a aplicar
- **WHEN** se aplican las migraciones, se revierten y se vuelven a aplicar
- **THEN** los tres pasos terminan con código 0 y, tras la reversión, no queda ninguna de las tablas creadas por la migración

#### Scenario: Claves e índice encabezados por la JASS
- **WHEN** se inspecciona el esquema migrado
- **THEN** las claves primarias de `medicion` y de `operacion_idempotente` comienzan por la JASS, y existe un índice sobre JASS, reservorio y hora de toma

### Requirement: Restricciones de integridad en la base
La base de datos SHALL rechazar por sí misma, aun sin pasar por el dominio, toda fila que tenga:
- un valor negativo o no finito;
- una unidad distinta de `mg/L`;
- un método fuera de catálogo;
- un reservorio de otra JASS;
- un estado, un origen o una revisión fuera de su dominio;
- un duplicado de (JASS, identificador) o de (JASS, `operationId`).

#### Scenario: Valor inválido insertado directamente
- **WHEN** se inserta por SQL una medición con valor `-1`, `'NaN'` o `'Infinity'`
- **THEN** la base rechaza la fila por una restricción de verificación

#### Scenario: Unidad o método fuera de catálogo
- **WHEN** se inserta por SQL una medición con unidad `ppm` o con un método ausente de `metodo_medicion`
- **THEN** la base rechaza la fila

#### Scenario: Reservorio de otra JASS
- **WHEN** se inserta por SQL una medición de la JASS A que referencia un reservorio de la JASS B
- **THEN** la base rechaza la fila por la clave foránea compuesta (reservorio, JASS)

#### Scenario: Estado, origen o revisión fuera de dominio
- **WHEN** se inserta por SQL una medición con estado distinto de `vigente` y `anulada`, con origen distinto de `en-linea` y `sincronizada`, o con revisión menor que 1
- **THEN** la base rechaza la fila

#### Scenario: Reserva duplicada
- **WHEN** se inserta por SQL una segunda reserva con la misma JASS y el mismo `operationId`
- **THEN** la base rechaza la fila por la clave primaria

### Requirement: Catálogo de métodos coherente con el dominio
El catálogo de métodos de medición almacenado en la base SHALL contener exactamente los mismos códigos que el catálogo del dominio. Una divergencia entre ambos SHALL detectarse con una prueba automatizada.

#### Scenario: Catálogos iguales
- **WHEN** se ejecutan las pruebas de integración sobre la base migrada
- **THEN** el conjunto de códigos de `metodo_medicion` es igual al del catálogo del dominio

#### Scenario: Catálogo divergente
- **WHEN** se agrega un método al catálogo del dominio sin una migración que lo agregue a la base
- **THEN** la prueba de coherencia del catálogo falla

### Requirement: Pruebas unitarias sin base de datos e integración obligatoria con base real
`npm test` SHALL ejecutarse sin base de datos. `npm run test:integration` SHALL exigir la variable `DATABASE_URL`. Si falta, SHALL terminar con código distinto de 0 y un mensaje que indique la causa. Las pruebas de integración SHALL NOT omitirse en silencio.

#### Scenario: Pruebas unitarias sin base
- **WHEN** se ejecuta `npm test` en un entorno sin PostgreSQL ni `DATABASE_URL`
- **THEN** el comando termina con código 0 tras ejecutar las pruebas unitarias y la batería de contrato en memoria

#### Scenario: Integración sin DATABASE_URL
- **WHEN** se ejecuta `npm run test:integration` sin `DATABASE_URL` definida
- **THEN** el comando termina con código distinto de 0 e imprime un mensaje que indica que falta `DATABASE_URL`, sin reportar pruebas omitidas como exitosas

#### Scenario: Integración con base migrada
- **WHEN** se ejecuta `npm run test:integration` con `DATABASE_URL` apuntando a una base PostgreSQL migrada
- **THEN** el comando termina con código 0 tras ejecutar las pruebas de integración

### Requirement: Verificación contra PostgreSQL en CI
CI SHALL ejecutar en cada push y en cada pull request, contra un PostgreSQL real, la aplicación de las migraciones, su reversión, su reaplicación y las pruebas de integración. SHALL marcar el cambio como fallido si cualquiera de esos pasos falla, en un job independiente de los existentes.

#### Scenario: Pull request conforme
- **WHEN** se abre un pull request cuyas migraciones y pruebas de integración pasan
- **THEN** el job de integración termina en éxito

#### Scenario: Pull request que rompe la persistencia
- **WHEN** un pull request introduce un cambio que hace fallar una prueba de integración o una migración
- **THEN** el job de integración termina en fallo y el fallo es visible en el pull request

#### Scenario: Job independiente
- **WHEN** el job de integración falla
- **THEN** los jobs de prototipo y de documentación se ejecutan igualmente e informan su propio resultado
