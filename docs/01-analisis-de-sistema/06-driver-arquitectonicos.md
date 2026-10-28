# 06. Drivers arquitectónicos — SIJASS

Los drivers articulan requisitos, atributos de calidad y restricciones con las decisiones arquitectónicas. No implican que ningún módulo esté implementado.

## 1. Catálogo

| ID | Driver | Origen | Consecuencia arquitectónica | ADR |
|---|---|---|---|---|
| DA01 | Captura de mediciones sin conexión | RC01, RC13, RNF01, RF10 | PWA con Dexie/IndexedDB, cola local visible y reintentos explícitos | ADR-002, ADR-005 |
| DA02 | Ausencia de dataset fotográfico DPD | RC06, RC07, RF06, RF07 | Registro manual; visión artificial solo como investigación futura | ADR-003 |
| DA03 | Teléfonos de recursos limitados | RC02, RNF02, RNF08 | Frontend liviano, sin modelos de IA locales obligatorios | ADR-002, ADR-003 |
| DA04 | Integridad y trazabilidad de los registros | RF07, RF08, RF11, RNF03 | Revisiones, auditoría, autor, método y valor original conservado | ADR-004, ADR-006 |
| DA05 | Equipo pequeño y presupuesto limitado | RC03, RC04 | Monolito modular NestJS y despliegue sencillo; sin infraestructura opcional | ADR-001, ADR-009 |
| DA06 | Acceso segmentado por JASS | RC05, RC10, RNF05 | JASS en el modelo de datos, autorización por recurso y auditoría | ADR-008 |
| DA07 | Evolución independiente de clientes | RC14, RNF07 | API REST/OpenAPI, puertos y adaptadores, contratos versionados | ADR-006, ADR-011 |
| DA08 | Acceso web instalable | RC08, RNF08 | React + TypeScript + Vite con `vite-plugin-pwa` (Workbox) | ADR-002 |
| DA09 | Consistencia ante reintentos | RC09, RNF04 | UUID por operación, hash de contenido e idempotencia en la misma transacción | ADR-004, ADR-005, ADR-013 |
| DA10 | Información técnica confiable | RC11, RC12, RF09, RF13, RF14 | RAG sobre corpus aprobado y versionado, con permisos, citas y abstención | ADR-007, ADR-010, ADR-012, ADR-015 |
| DA11 | Riesgos de la IA generativa | RNF09, RNF10 | Defensa ante *prompt injection*, sin herramientas de escritura, datos minimizados y auditoría | ADR-007, ADR-012 |
| DA12 | Analítica progresiva basada en evidencia | HU13, RF15 | Reglas determinísticas en el MVP; aprendizaje automático solo con historial validado | ADR-014 |

## 2. Drivers decisivos para el MVP

- **DA01 + DA09:** el sistema acepta capturas sin conexión, pero nunca marca una operación como sincronizada sin una transacción confirmada en el servidor.
- **DA06:** toda solicitud y todo fragmento documental se filtra por la JASS autorizada.
- **DA02 + DA10 + DA11:** la IA del MVP es documental; se basa en fuentes, se abstiene sin evidencia y no extrapola recomendaciones sanitarias.
- **DA05:** cada componente adicional (servicio, caché, cola) debe justificarse con una necesidad comprobada.
