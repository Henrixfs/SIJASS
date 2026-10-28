# Matriz de trazabilidad — SIJASS

**Base:** alcance definido en [alcance y hoja de ruta](../00-alcance-y-roadmap.md). La columna *Estado* se refiere a la **implementación**, no a la documentación.

**Identificadores vigentes:** HU01–HU13 · RF01–RF15 · RNF01–RNF10 · RC01–RC14 · DA01–DA12 · ADR-001–ADR-015 · EC-01–EC-12 · PT01–PT25.

## 1. Historias → requisitos → arquitectura → pruebas

| HU | Prioridad | RF | RNF | DA | ADR | Componentes | Pruebas | Estado |
|---|---|---|---|---|---|---|---|---|
| HU01 Registro manual | Must | RF06, RF07 | RNF03, RNF06 | DA02, DA04 | ADR-003, ADR-006 | CapturaMedicionManual, ValidacionDatos, MedicionesAuditoria | PT01, PT02, PT03, PT09, PT23 | Prototipo parcial (modelo heredado) |
| HU02 Corrección auditada | Must | RF08 | RNF03 | DA04 | ADR-005, ADR-006 | MedicionesAuditoria, auditoria | PT10 | Diseño propuesto |
| HU03 Procedimientos aprobados | Should | RF09, RF14 | RNF09 | DA10 | ADR-010 | CatalogoDocumentos | PT08 | Diseño propuesto |
| HU04 Medición sin conexión | Must | RF10 | RNF01, RNF02, RNF04, RNF08 | DA01, DA03, DA09 | ADR-002, ADR-005 | RegistroOffline, Sincronizador, SincronizacionServidor | PT04, PT05, PT07, PT11, PT12, PT20, PT22 | Prototipo parcial (idempotencia en memoria) |
| HU05 Padrón de asociados | Must | RF03 | RNF05, RNF10 | DA06 | ADR-008 | AsociadosCuotasPagos | PT13, PT24 | Diseño propuesto |
| HU06 Cuotas y pagos en línea | Must | RF04 | RNF04, RNF05 | DA09 | ADR-004, ADR-013 | AsociadosCuotasPagos | PT14 | Diseño propuesto |
| HU07 Morosidad | Must | RF05 | RNF03 | DA04 | ADR-004 | AsociadosCuotasPagos, Reportes | PT14 | Diseño propuesto |
| HU08 JASS y reservorios | Must | RF02 | RNF05 | DA06 | ADR-008 | OrganizacionJass | PT13 | Diseño propuesto |
| HU09 Usuarios y roles | Must | RF01 | RNF05 | DA06 | ADR-008 | IdentidadYPermisos | PT06, PT13 | Diseño propuesto |
| HU10 Historial y reportes | Must | RF11 | RNF03, RNF05 | DA04, DA06 | ADR-004 | MedicionesAuditoria, Reportes | PT10, PT13 | Diseño propuesto |
| HU11 Alertas | Could | RF12 | RNF04 | DA10 | ADR-010 | Notificador | PT18 | Futuro |
| HU12 Asistente RAG | Must | RF13, RF14 | RNF09, RNF10 | DA10, DA11 | ADR-007, ADR-012, ADR-015 | ConsultaAsistente, IngestaDocumental, RecuperadorRAG, GeneradorRespuesta | PT08, PT15, PT16, PT17, PT20, PT24 | Diseño propuesto |
| HU13 Advertencias de integridad | Should | RF15 | RNF03 | DA12 | ADR-014 | ValidacionDatos | PT19 | Diseño propuesto |
| Transversal | — | — | RNF07 | DA05, DA07 | ADR-001, ADR-006, ADR-009, ADR-011 | API NestJS, contrato OpenAPI | PT21, PT25 | Diseño propuesto |

## 2. Cobertura de requisitos funcionales

| RF | HU | Pruebas | Alcance |
|---|---|---|---|
| RF01 | HU09 | PT06, PT13 | MVP |
| RF02 | HU08 | PT13 | MVP |
| RF03 | HU05 | PT13, PT24 | MVP |
| RF04 | HU06 | PT14 | MVP |
| RF05 | HU07 | PT14 | MVP |
| RF06 | HU01 | PT03, PT09 | MVP |
| RF07 | HU01 | PT01, PT02 | MVP |
| RF08 | HU02 | PT10 | MVP |
| RF09 | HU03 | PT08 | MVP |
| RF10 | HU04 | PT04, PT05, PT11, PT12, PT20 | MVP |
| RF11 | HU10 | PT10, PT13 | MVP |
| RF12 | HU11 | PT18 | Futuro |
| RF13 | HU12 | PT15, PT16, PT17 | MVP |
| RF14 | HU12, HU03 | PT08, PT16 | MVP |
| RF15 | HU13 | PT19 | MVP |

Todos los requisitos RF01–RF15 tienen al menos una historia y una prueba prevista.

## 3. Cobertura de atributos de calidad

| RNF | Escenarios | Pruebas |
|---|---|---|
| RNF01 Disponibilidad sin conexión | EC-01, EC-06 | PT05, PT20 |
| RNF02 Rendimiento local | EC-09 | PT22 |
| RNF03 Integridad de mediciones | EC-04 | PT01, PT02, PT09, PT10, PT19 |
| RNF04 Idempotencia | EC-02 | PT04, PT11, PT12, PT14 |
| RNF05 Seguridad y aislamiento | EC-03 | PT06, PT13, PT17 |
| RNF06 Usabilidad | EC-10 | PT23 |
| RNF07 Modificabilidad | EC-05, EC-07 | PT25 |
| RNF08 Compatibilidad | EC-01 | PT07 |
| RNF09 Trazabilidad RAG | EC-08, EC-12 | PT08, PT15, PT16, PT17 |
| RNF10 Privacidad | EC-11 | PT24 |

## 4. Reglas de mantenimiento

- Un cambio en una HU o un RF obliga a actualizar **simultáneamente** esta matriz, los criterios de aceptación, la arquitectura, los contratos y las pruebas.
- Ninguna fila se marca como *Implementado* sin evidencia de CI y pruebas de aceptación reproducibles.
- No se declaran como logradas la estimación fotográfica de cloro ni la detección de anomalías por aprendizaje automático.
- La dosificación automática y los pagos sin conexión requieren una nueva decisión de alcance (ADR) y nuevas pruebas antes de desarrollarse.
