# 05. Restricciones — SIJASS

**Estado:** restricciones identificadas en el análisis; deben confirmarse en el piloto.

## 1. Catálogo

| ID | Restricción | Tipo | Implicación de diseño |
|---|---|---|---|
| RC01 | Cobertura de internet irregular o nula en reservorios | Entorno | Formulario de medición y cola local; sincronización posterior |
| RC02 | Teléfonos Android de recursos limitados | Entorno | PWA ligera; sin modelos de IA pesados en el dispositivo durante el MVP |
| RC03 | Presupuesto reducido y equipo de desarrollo pequeño | Organizacional | Monolito modular; mínimo número de servicios e infraestructura |
| RC04 | Desarrollo académico progresivo | Organizacional | Distinguir documentación, prototipo, MVP y piloto; evidencia reproducible |
| RC05 | Datos personales de familias, cobros y fotografías | Legal | Minimización, autorización por JASS, cifrado en tránsito, retención definida (Ley N.° 29733) |
| RC06 | Las lecturas de cloro dependen del procedimiento y equipo de campo | Técnica | Registrar método, operador y evidencia; no afirmar precisión fotográfica |
| RC07 | No existe un dataset etiquetado de imágenes DPD | Técnica | No entrenar ni desplegar predicción de concentración a partir de fotografías |
| RC08 | Instalación sin tiendas de aplicaciones y uso también desde computadora | Técnica | Aplicación web progresiva (PWA) con React; cliente móvil solo si el piloto lo justifica |
| RC09 | Reintentos y transacciones concurrentes | Técnica | Claves de idempotencia y restricciones verificadas en PostgreSQL |
| RC10 | Varias JASS con varios roles en una misma instalación | Organizacional | `jassId` y políticas de autorización en todas las operaciones y consultas |
| RC11 | Marco normativo sanitario sujeto a cambios | Legal | Versionar normas y parámetros; validación por la autoridad o personal competente |
| RC12 | Dependencia de un proveedor de modelo de lenguaje | Técnica | Asistente en línea en el MVP; abstención, cuotas de uso, privacidad y degradación funcional |
| RC13 | Almacenamiento del navegador sin garantía de permanencia | Técnica | Avisos de pendientes, control de cuota, solicitud de persistencia y sincronización temprana |
| RC14 | Tecnología móvil futura no decidida | Técnica | API REST/OpenAPI y reglas de negocio en el servidor, independientes del cliente |

## 2. Restricciones de seguridad y salud

- SIJASS **no** certifica la potabilidad del agua ni sustituye análisis de laboratorio ni instrumentos aprobados.
- No se automatizan recomendaciones de manipulación o dosificación de agentes químicos; los procedimientos aplicables los valida personal competente.
- Las fotografías y datos personales no se envían a proveedores de IA.
- Ningún documento privado de una JASS se expone a usuarios de otra organización durante la búsqueda o la generación de respuestas.

## 3. Marco normativo de referencia

| Norma | Relevancia | Estado verificado |
|---|---|---|
| D. S. N.° 031-2010-SA, Reglamento de la Calidad del Agua para Consumo Humano | Parámetros y responsabilidades de control de calidad del agua | Vigente como reglamento de referencia; confirmar modificaciones antes de configurar límites |
| R. M. N.° 568-2026-MINSA | Dispone la publicación del **proyecto** de un nuevo Reglamento de la Calidad del Agua para Consumo Humano para recibir comentarios | Es un proyecto en consulta, **no** una norma aprobada; hacer seguimiento a su eventual aprobación |
| Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento aprobado por D. S. N.° 016-2024-JUS | Tratamiento de datos de asociados, usuarios y fotografías | Confirmar obligaciones aplicables (consentimiento, seguridad, registro de bancos de datos) antes del piloto |

Fuentes: [D. S. N.° 031-2010-SA](https://www.gob.pe/institucion/minsa/normas-legales/244805-031-2010-sa) · [R. M. N.° 568-2026-MINSA](https://www.gob.pe/institucion/minsa/normas-legales/8274822-568-2026-minsa) · [D. S. N.° 016-2024-JUS](https://www.gob.pe/institucion/smv/normas-legales/6426760-016-2024-jus).

La vigencia de cualquier norma, modificación o protocolo se confirma institucionalmente antes de definir umbrales, alertas o documentos del corpus. El sistema no presume cumplimiento normativo por el solo hecho de usar un rango de referencia.
