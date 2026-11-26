## Purpose

Presentar las operaciones de personal y las finanzas de familias con identidad institucional, jerarquía por rol y lectura accesible en escritorio y móvil.

## ADDED Requirements

### Requirement: P1 Acceso institucional y navegación por rol
El cliente SHALL identificar SIJASS en el ingreso y presentar solamente los destinos autorizados en el panel, cabecera, menú y perfil.

#### Scenario: Entrada móvil de operador
- **WHEN** el operador abre el menú y navega a campo
- **THEN** aparece el formulario de lectura autorizado, con destino activo y acceso al contenido por teclado.

#### Scenario: Sesión expirada
- **WHEN** el cliente retorna al ingreso por sesión expirada
- **THEN** conserva el aviso, correo etiquetado y contraseña enmascarada.

### Requirement: P2 Finanzas comprensibles
El cliente SHALL mostrar saldos, cuotas, estados e historial a partir de las respuestas de la API y conservar las validaciones de alta, registro y reversa.

#### Scenario: Consulta de cuenta en teléfono
- **WHEN** una familia o personal autorizado consulta una cuenta a 360 px
- **THEN** puede relacionar cada importe con periodo, estado y comprobante cuando existen, y leer el saldo exacto.

#### Scenario: Reversa en diálogo
- **WHEN** se abre el detalle o la confirmación de reversa
- **THEN** la hoja compacta mantiene título y foco, acciones visibles, motivo requerido y retorno de foco al cerrar.

### Requirement: P3 Observaciones de campo y consulta técnica
El cliente SHALL distinguir catálogo, medición y documentación e identificar el origen de cada valor representado.

#### Scenario: Lecturas vigentes de un reservorio
- **WHEN** se recibe el historial
- **THEN** la tabla conserva todos los registros y el gráfico identifica unidad y muestra representada sin inferir nivel de agua ni diagnóstico.

#### Scenario: Falta de evidencia
- **WHEN** no existen lecturas comparables o el asistente se abstiene
- **THEN** se presenta el estado correspondiente y se omiten valores sintéticos.

### Requirement: P4 Adaptación y movimiento accesibles
El cliente SHALL conservar foco visible, contraste AA, mensajes de estado, espacio táctil y contenido legible en los siete anchos definidos en el diseño.

#### Scenario: Movimiento reducido
- **WHEN** el navegador solicita movimiento reducido
- **THEN** los valores finales, formularios y diálogos son accesibles sin esperar animaciones.

#### Scenario: Inspección responsive
- **WHEN** se revisa una pantalla a 320, 360, 390, 768, 1024, 1440 y 1920 px
- **THEN** el documento cabe en el viewport, las tablas anchas disponen de región de desplazamiento y la acción principal conserva un objetivo de 44 px.

### Requirement: P5 Evidencia verificable
La entrega SHALL registrar versiones verificadas, comparación por módulo, resultado de las pruebas aisladas y costes del bundle.

#### Scenario: Revisión de entrega
- **WHEN** se consulta el informe
- **THEN** cada comprobación indica si procede de demo, pruebas de componente, código o referencia visual histórica y enumera las validaciones pendientes.
