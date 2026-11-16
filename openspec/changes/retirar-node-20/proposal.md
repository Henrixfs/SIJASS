# Proposal

## Why

Node.js 20 llegó a fin de vida el 2026-04-30 y hoy (2026-11-16) el CI del prototipo sigue probándolo en su matriz `[20, 22]`, mientras `engines` declara `>=20`. Se verifica el prototipo en una versión sin parches de seguridad y se omite la línea LTS activa (Node.js 26, LTS desde el 2026-10-28). Conviene corregirlo ahora, antes de `s1b`, para que los cambios de la Etapa 1 nazcan con la matriz de CI definitiva y no la modifiquen a mitad de camino.

Aporta a los criterios **C12** (CI/CD: la matriz de CI refleja las versiones realmente soportadas) y **C14** (reproducibilidad: el rango de `engines` y los tipos de Node coinciden con lo que se prueba).

## What Changes

- `engines.node` pasa de `>=20` a `>=22`: la línea mínima soportada por el prototipo es la más antigua que aún recibe soporte upstream (Node.js 22, hasta el 2027-04-30).
- `@types/node` pasa de `^20` a `^22`, alineado con esa línea mínima para que el compilador no admita APIs ausentes en Node.js 22. Se regenera `package-lock.json`.
- La matriz del job `prototipo` de `.github/workflows/ci.yml` pasa de `[20, 22]` a `[22, 24, 26]`: la mínima declarada y las dos líneas LTS posteriores.
- Los jobs `documentacion` e `integracion` ya usan Node.js 22 y no cambian.
- La documentación **prospectiva** deja de afirmar «Node.js 20 o superior» (README raíz y README del prototipo). Las menciones de ejecuciones pasadas con Node.js 20 en el plan de pruebas, la matriz de cumplimiento, el roadmap y los README **no se reescriben**: son evidencia fechada de lo que se ejecutó.
- Se actualiza la spec `prototype-quality-gate` donde fija «Node.js 20 o superior».

Fuera de alcance: cambios de código en `src/`, actualizar otras dependencias, y la política de qué hacer cuando una línea LTS entre o salga de soporte (se decide caso por caso).

## Capabilities

### New Capabilities
<!-- Ninguna: no se introduce un comportamiento nuevo del sistema. -->

### Modified Capabilities
- `prototype-quality-gate`: dos requisitos fijan hoy «20 o superior» como rango soportado: *Instalación reproducible desde el lockfile* (escenario de `npm ci`) y *Verificación automática en CI* (escenario de versión soportada). Pasan a «22 o superior» y se añade que la matriz incluya la versión mínima declarada.

## Impact

- **Código y configuración:** `tecnologia/siJASS-clean-architecture/package.json` y `package-lock.json`, `.github/workflows/ci.yml`. Sin cambios en `src/`.
- **Documentación:** `README.md` (raíz) y `tecnologia/siJASS-clean-architecture/README.md`.
- **CI:** el job `prototipo` pasa de 2 a 3 ejecuciones por evento.
- **Riesgo:** una dependencia puede no soportar Node.js 26 todavía; se detecta en el propio CI y el diseño define cómo proceder.
- **Compatibilidad:** quien use Node.js 20 localmente verá solo una advertencia de `npm` por `engines`; no se bloquea la instalación. Es un cambio **BREAKING** únicamente respecto del rango declarado.
