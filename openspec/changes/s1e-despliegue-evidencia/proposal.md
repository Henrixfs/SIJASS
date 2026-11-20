# Proposal

## Why

El prototipo ya tiene API, interfaz y tres flujos (cobro, mediciones, asistente), pero no hay forma reproducible de **desplegarlo**, ni contrato **OpenAPI** (ADR-011, PT25), ni medición de **capacidad** (C13) ni evidencia de caché y CI/CD (C11, C12). Varias de esas cosas dependen de servicios externos que aún no existen (dominio y DNS, proveedor de hosting, CDN, credenciales). Este cambio construye y **verifica en local** todo lo que no depende de ellos, deja listos los archivos que sí dependen, y **separa estrictamente** la evidencia local, la de GitHub Actions y la del despliegue real.

Aporta a **C08** (contrato y límites medidos), **C10** (preparación de dominio, HTTPS y CDN), **C11** (caché estática implementada y medida), **C12** (CI/CD), **C13** (escenarios k6 y medición local), **C14** y **C04**.

## What Changes

- **Contrato OpenAPI 3.1** (`docs/api/openapi.yaml`) de todas las rutas `/v1`, y una prueba que falla si una ruta del código no está en el documento o al revés.
- **`GET /v1/salud`** público (sin datos): estado del proceso y de la base de datos, para sondas de despliegue.
- **Caché estática** servida por la API: `index.html` con `no-cache`; archivos con nombre con hash en `/assets/` con `public, max-age=31536000, immutable`; la API con `no-store`. Pruebas de cabeceras y de validación condicional (`ETag`/`304`).
- **Contenedor.** `Dockerfile` multietapa (compila API e interfaz; imagen final sin dependencias de desarrollo, usuario no root, sin secretos), `docker-compose.despliegue.yml` (API + PostgreSQL con migraciones previas) y un `Caddyfile` para HTTPS automático delante de la API cuando exista dominio.
- **CI/CD.** Un job que construye la imagen y la prueba (`/v1/salud`, arranque con migraciones) en cada cambio, y un workflow **manual** (`workflow_dispatch`) que publica la imagen en GHCR; el despliegue a un host queda como paso documentado que requiere credenciales.
- **Verificación de despliegue.** `scripts/verificar-despliegue.mjs <url>`: resolución DNS, certificado TLS vigente, HSTS, redirección HTTP→HTTPS, cabeceras de seguridad, caché de estáticos y `/v1/salud`. Se prueba en local contra la API (las comprobaciones que no son de TLS/DNS); las demás quedan pendientes del dominio.
- **Pruebas de carga k6.** Escenario del portal del asociado con rampa gradual hasta 2.000 usuarios virtuales concurrentes, umbrales de latencia y de errores, siembra de 2.000 cuentas, y un procedimiento que registra cada ejecución con su **entorno** (`local`, `ci`, `despliegue`). Se ejecuta la rampa **en local** y se informa lo observado, sin presentarlo como capacidad del despliegue.
- **Documentación.** Matriz C01–C16 y plan de pruebas con tres columnas de evidencia separadas.

Fuera de alcance: contratar y configurar dominio, DNS, hosting y CDN; despliegue real; cualquier cifra de capacidad del despliegue; autoescalado; observabilidad; respaldo y restauración de la base.

## Capabilities

### New Capabilities
- `despliegue-contenedor`: imagen, salud, caché estática y verificación de despliegue.
- `contrato-openapi`: contrato OpenAPI y su coherencia con el código.
- `pruebas-de-carga`: escenarios k6, umbrales y registro de resultados por entorno.

### Modified Capabilities
<!-- Ninguna. -->

## Impact

- **Código:** `tecnologia/siJASS-clean-architecture/` (ruta `/v1/salud`, cabeceras de estáticos, prueba del contrato), `Dockerfile`, `docker-compose.despliegue.yml`, `Caddyfile`, `scripts/`, `tecnologia/carga/` (k6), `docs/api/openapi.yaml`, `.github/workflows/`.
- **Bloqueos externos (no se simulan):** dominio y acceso al DNS; proveedor de hosting; proveedor de CDN; credenciales de despliegue; un entorno de carga representativo y autorizado. Ver `design.md`.
- **Riesgo principal:** que una cifra local se tome por capacidad real. Se mitiga etiquetando cada resultado con su entorno y su máquina, y dejando en blanco la columna del despliegue.
