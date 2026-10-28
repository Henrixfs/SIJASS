# Estilos arquitectónicos adoptados — SIJASS

**Estado:** diseño propuesto.

## 1. Estilos combinados

| Estilo o patrón arquitectónico | Ámbito | Decisión operativa | ADR |
|---|---|---|---|
| Monolito modular | Backend NestJS | Módulos por capacidad de negocio y despliegue único | ADR-001 |
| Clean Architecture | Interior de cada módulo | Dominio y casos de uso aislados de frameworks | ADR-006 |
| API-first y multi-cliente | React web y clientes móviles futuros | REST/JSON con OpenAPI, versionado y pruebas de contrato | ADR-011 |
| Offline-first acotado | PWA, solo para **mediciones** | IndexedDB, estados visibles y sincronización idempotente | ADR-002, ADR-005 |
| Consistencia eventual | Copias locales de mediciones | Rechazos y conflictos se resuelven de forma explícita, nunca en silencio | ADR-005 |
| Cliente-servidor con servicio auxiliar | Servicio RAG Python | Un único servicio auxiliar sin datos transaccionales | ADR-007 |
| Generación aumentada por recuperación (RAG) | Consultas documentales en línea | Fuentes aprobadas, citas y abstención | ADR-012, ADR-015 |
| Validación por reglas | Calidad del registro | Reglas determinísticas versionadas, no aprendizaje automático | ADR-014 |

## 2. Estilos que no se adoptan en el MVP

- Microservicios por módulo, CQRS o *event sourcing* integral, Redis obligatorio o *brokers* de mensajería.
- Inferencia de modelos de visión en el navegador (ONNX Runtime Web) como requisito de ejecución.
- Pagos u operaciones administrativas complejas sin conexión.
- Agentes de IA con capacidad de modificar saldos, parámetros de calidad o instrucciones técnicas.

## 3. Comportamiento ante fallos

| Falla | Comportamiento esperado |
|---|---|
| Sin conexión | Registro y corrección de mediciones en la cola local; las demás funciones muestran que requieren conexión |
| Error en una operación del lote | Se informa individualmente; las demás operaciones se confirman |
| Proveedor de LLM o servicio RAG caído | El asistente informa indisponibilidad; no se generan respuestas sin fuentes |
| Sesión vencida durante la operación sin conexión | Los registros quedan pendientes y se envían tras reautenticación |
| Usuario desactivado mientras tenía registros pendientes | El servidor los rechaza (`rejected`) y quedan visibles para revisión del consejo |
