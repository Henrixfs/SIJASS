# Design

## Context

Estado observado al 2026-11-19 (rama `feat/s1d-asistente-tecnico`, sobre `feat/s1c-reservorios-mediciones`):

- La API NestJS ya tiene guardia, permisos por rol y auditoría de `403`; la interfaz tiene pestañas por rol; el E2E levanta API, PostgreSQL e interfaz.
- ADR-007 prevé un servicio Python/FastAPI para el RAG; ADR-012, un modelo preentrenado configurable; ADR-015, pgvector «sujeto a evaluación». El roadmap §7 deja abiertos el proveedor y los responsables de aprobar documentos.
- **No existen** el corpus aprobado, el proveedor ni el protocolo de dosis validado. Se dispone solo de este repositorio y de Node.js.

## Goals / Non-Goals

**Goals:**
- Un contrato estable y probado que no cambie cuando lleguen el corpus real y el proveedor.
- Citas **comprobables** (no solo plausibles) y abstención explícita.
- Que nada de ejemplo pueda pasar por aprobado.

**Non-Goals:** ver la propuesta (servicio FastAPI, embeddings, LLM, documentos privados, carga desde la interfaz).

## Decisions

**D1 — Recuperación local y extractiva.** Módulo `asistente` dentro del monolito, con puertos `FuenteCorpus` (carga el corpus validado) y `RedactorRespuesta` (opcional). La recuperación es léxica: normaliza a minúsculas y sin acentos, divide en términos, descarta palabras vacías y términos de menos de 3 caracteres, y puntúa cada **página** con TF-IDF sencillo (frecuencia del término en la página × IDF suavizado sobre las páginas del corpus). Es determinista, no necesita red ni claves y permite pruebas exactas. El servicio FastAPI con embeddings (ADR-007/015) sustituirá a este adaptador detrás del mismo puerto cuando exista corpus real que justifique evaluarlo; no se construye ahora porque sin corpus no puede validarse.

**D2 — Evidencia mínima y abstención.** Una página es evidencia si coincide con al menos 2 términos distintos de la pregunta, o con todos si la pregunta tiene un solo término relevante, **y** al menos la mitad de los términos relevantes. Si ninguna página cumple, estado `sin-evidencia`. Esto privilegia abstenerse: es preferible un falso «sin evidencia» a una cita no relacionada. El umbral se fija en el código con constantes nombradas y se ajustará con el corpus real y su conjunto de evaluación (PT15–PT17).

**D3 — Respuesta extractiva con citas.** Hasta 3 páginas por puntuación (empate: documento y página ascendentes). El fragmento de cada cita es la **frase** de la página con más términos coincidentes (frases separadas por punto, con máximo 300 caracteres; si una frase es más larga se recorta en un límite de palabra y se marca con `…`, y el fragmento sigue siendo una subcadena literal salvo el `…` final). El texto de la respuesta es la concatenación de «Según <título> (versión <v>, p. <n>): <fragmento>». No hay texto generado. Una prueba verifica para todas las consultas de un conjunto que cada fragmento (sin el `…`) es subcadena de su página.

**D4 — Fuera de alcance por intención.** Antes de recuperar, una guarda léxica sobre el texto normalizado detecta pedidos de dosis o tratamiento (raíces `dosi`, `dosific`, `cuanto|cuantos|cuantas` junto a `cloro|hipoclorito|gramos|litros|pastillas|mililitros`, `calcul|estim|recomend` junto a `cloro|dosis|cantidad`, `agregar|echar|aplicar` junto a `cloro|hipoclorito`). Si coincide, `fuera-de-alcance` con mensaje fijo y **sin consultar el corpus**. La guarda es deliberadamente amplia: un falso positivo lleva a «consulte al responsable técnico»; un falso negativo sería entregar contenido de dosificación, que el corpus de ejemplo tampoco contiene.

**D5 — Corpus y manifiesto.** `manifiesto.json`: `{ corpus: { nombre }, documentos: [{ id, titulo, version, estado, responsable, paginas: [{ numero, texto }] }] }`. Validación estricta al cargar (spec). Origen: `ASISTENTE_CORPUS_DIR`; si falta, el corpus de ejemplo del repositorio (`tecnologia/siJASS-clean-architecture/corpus-ejemplo/`), cuyos documentos son ficticios, se titulan `EJEMPLO — …` y **no contienen cantidades ni instrucciones de dosificación**. El estado del corpus (`ejemplo` si algún documento lo es) viaja en cada respuesta.

**D6 — Puerto de redacción.** `RedactorRespuesta.redactar(pregunta, fragmentos)` con adaptador `SinRedactor` (devuelve `undefined`; se usa el texto extractivo). Cuando haya proveedor se implementará un adaptador que **solo** reciba la pregunta y los fragmentos recuperados y cuya salida se vuelva a validar (toda cita sigue siendo la recuperada; la redacción no añade citas). No se implementa un adaptador HTTP: sin proveedor, credencial ni política de privacidad acordados sería código sin verificar.

**D7 — Privacidad y auditoría.** La pregunta no se persiste. `asistente.consulta` guarda `{ estado, citas, corpus }`. La auditoría se escribe en la unidad de trabajo de acceso (misma transacción que nada más: es el único efecto).

**D8 — HTTP.** `POST /v1/asistente/consultas` `{ pregunta }` → `200 { estado, corpus, mensaje, respuesta?, citas }`; `GET /v1/asistente/documentos` → `{ corpus, documentos: [{ id, titulo, version, estado, paginas }] }`. Permiso `asistente.consultar` para `consejo`, `tesorero` y `operador`.

**D9 — Interfaz.** Pestaña *Asistente* para todo el personal. Banner permanente si `corpus === 'ejemplo'`. La respuesta y las citas se renderizan como **texto** (React escapa; sin `dangerouslySetInnerHTML`).

**D10 — Pruebas.** Unitarias: normalización, términos, puntuación, evidencia mínima, abstención, guarda de dosis (conjunto de variantes positivas y de preguntas legítimas que no deben bloquearse), validación del manifiesto, comprobabilidad de citas, inyección en una página. HTTP: permisos, privacidad (la pregunta no está en la base), auditoría y que las tablas de negocio no cambian. E2E: un flujo.

## Risks / Trade-offs

- **Recuperación léxica:** no entiende sinónimos; con el corpus real se evaluará si se justifica FastAPI + embeddings (ADR-015). Se prefiere abstenerse.
- **Guarda de dosis léxica:** puede bloquear preguntas legítimas con «cuántos» y «cloro»; se documenta y se cubre con casos de prueba de ambos lados.
- **Corpus de ejemplo:** podría confundirse con real; rótulo obligatorio en título, respuesta y pantalla, y validación al cargar.
- **Sin LLM:** las respuestas son extractos, menos fluidas, pero verificables.

## Migration Plan

Sin esquema nuevo. Incorporar el corpus real = colocar un directorio con `manifiesto.json` y configurar `ASISTENTE_CORPUS_DIR`; la validación decide si es admisible.

## Open Questions

- ¿Quién aprueba los documentos y con qué formato de versión y página? (roadmap §7).
- ¿Qué proveedor, con qué política de privacidad de datos (Ley N.° 29733)?
- ¿Qué casos de referencia y qué protocolo validan algún cálculo de dosis?
