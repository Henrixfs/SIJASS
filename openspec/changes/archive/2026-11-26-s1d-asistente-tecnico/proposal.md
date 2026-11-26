# Proposal

## Why

El MVP incluye un asistente documental que responde sobre procedimientos con **documento, versión y página**, o se abstiene (RF13, RF14, ADR-007, ADR-012). Hoy no existe nada. Dos insumos externos aún no están disponibles: el **corpus aprobado** de procedimientos de cloración (con responsable de aprobación, versión y paginación) y la **decisión del proveedor de modelo de lenguaje** (roadmap §7). Este cambio construye todo lo que no depende de ellos —contrato, recuperación con citas verificables, abstención, interfaz y pruebas— usando **documentos de ejemplo claramente identificados**, y deja definidos los puntos de incorporación del corpus real y del proveedor.

Aporta a **C01–C03** (RF13, RF14, DA10/DA11 a especificaciones verificables), **C04** (quinto cambio SDD), **C05** (PT15, PT16, PT17 en su parte determinista), **C06/C07** (tercer flujo E2E y pantalla) y **C14**.

## What Changes

- **Contrato** `POST /v1/asistente/consultas` y `GET /v1/asistente/documentos`: respuesta `respondida` con citas (documento, versión, página, fragmento), `sin-evidencia` (abstención explícita) o `fuera-de-alcance` (cálculo de dosis).
- **Recuperación determinística** sobre un corpus local validado: indexa por página, puntúa por términos (sin acentos, sin palabras vacías) y exige evidencia mínima; **extractiva**, sin modelo de lenguaje: cada frase mostrada es un fragmento literal de la página citada.
- **Corpus y manifiesto.** Formato `manifiesto.json` con documentos (identificador, título, versión, estado `aprobado` o `ejemplo`, responsable, páginas). Se valida al arrancar. Se incluye un corpus de **ejemplo ficticio** que se rotula `EJEMPLO` en el título y en cada respuesta; el corpus real se incorpora apuntando `ASISTENTE_CORPUS_DIR` a un directorio con el mismo formato.
- **Puerto de redacción.** Un `RedactorRespuesta` opcional (por defecto «no configurado») recibe pregunta y fragmentos autorizados cuando exista proveedor; su ausencia no afecta al resto.
- **Sin cálculo de dosis.** Toda consulta que pida dosificar, calcular cantidades de cloro o instrucciones de tratamiento recibe `fuera-de-alcance` y no consulta el corpus: queda condicionado a un protocolo validado y casos de referencia revisados.
- **Permisos y privacidad.** Consultan `operador`, `tesorero` y `consejo`; el asociado no. El texto de la pregunta **no se almacena**; la auditoría guarda solo estado y número de citas.
- **Interfaz.** Pestaña *Asistente* con el aviso permanente de corpus de ejemplo, las citas y los mensajes de abstención y de fuera de alcance.

Fuera de alcance: el servicio Python/FastAPI, embeddings y pgvector (ADR-015, sujetos a evaluación con el corpus real), modelo de lenguaje, documentos privados por JASS, carga de documentos desde la interfaz, evaluación de calidad con el corpus real.

## Capabilities

### New Capabilities
- `asistente-documental`: consulta documental con citas verificables, abstención y límites sanitarios.

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- **Código:** `tecnologia/siJASS-clean-architecture/` (dominio y aplicación del asistente, cargador de corpus, controlador), `tecnologia/siJASS-clean-architecture/corpus-ejemplo/`, `tecnologia/sijass-web/` (pestaña), `tecnologia/e2e/` (flujo).
- **Dependencias:** ninguna nueva.
- **Bloqueos externos que este cambio no resuelve:** (1) corpus aprobado y su responsable; (2) proveedor y credencial del modelo de lenguaje; (3) casos de referencia y protocolo validado para dosis.
- **Riesgo principal:** que el corpus de ejemplo se confunda con uno real; se mitiga con el rótulo `EJEMPLO` en título, respuesta y pantalla, y con una prueba que impide presentar un corpus de ejemplo sin esa marca.
