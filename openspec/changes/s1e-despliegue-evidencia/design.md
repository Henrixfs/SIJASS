# Design

## Context

Estado observado al 2026-11-19 (rama `feat/s1e-despliegue-evidencia`, sobre `feat/s1d-asistente-tecnico`):

- La API (NestJS 12, ESM) puede servir la interfaz construida con `WEB_DIR`; hoy lo hace con `maxAge: '1h'` para todo y sin `ETag` explícito ni diferenciación de `index.html`.
- No hay `Dockerfile`, ni sonda de salud, ni documento OpenAPI, ni escenarios de carga, ni workflow de despliegue.
- Máquina de desarrollo: 16 procesadores lógicos, Docker 29 y PostgreSQL 16 en contenedor. `k6` no está instalado; está disponible la imagen `grafana/k6` (descargada).
- `scrypt` (N=2^15) cuesta ~32 MB y decenas de milisegundos por inicio de sesión (s1b, D2): condiciona cualquier prueba de carga que inicie sesión.
- **No existen** dominio, DNS, proveedor de hosting, CDN ni credenciales de despliegue.

## Goals / Non-Goals

**Goals:**
- Todo lo verificable sin servicios externos queda verificado y reproducible.
- Lo que depende de servicios externos queda **preparado** y **nombrado** (qué servicio, qué acceso, qué dato).
- Ninguna cifra local se presenta como capacidad real.

**Non-Goals:** ver la propuesta.

## Decisions

**D1 — `/v1/salud` mínimo.** Controlador público que ejecuta `SELECT 1` con un tiempo límite de 2 s a través de la unidad de trabajo de acceso (una consulta trivial). Cuerpo fijo y sin detalles; el fallo interno se registra solo en el servidor. No usa `@nestjs/terminus` (una dependencia nueva para un `SELECT 1`).

**D2 — Caché estática.** En lugar de `useStaticAssets` con `maxAge` único, un middleware propio para la interfaz: rutas bajo `/assets/` (con hash en el nombre, generado por Vite) → `public, max-age=31536000, immutable` con `ETag` débil basado en tamaño y fecha de modificación, y soporte de `If-None-Match`; el resto (`index.html`, favicon) → `no-cache`. `Cache-Control: no-store` en `/v1/*` ya existe. La caché de CDN (C11) se apoya en estas cabeceras: la CDN puede cachear `/assets/*` indefinidamente porque el nombre cambia con el contenido.

**D3 — OpenAPI a mano, coherencia por prueba.** `docs/api/openapi.yaml` escrito a mano (no se añade `@nestjs/swagger`: obliga a decorar todo el código con metadatos duplicados). La prueba `contrato-openapi.test.ts` lee el YAML (se añade la dependencia de desarrollo `yaml`), extrae los pares método-ruta del documento y los de los controladores mediante los metadatos que Nest guarda (`path` y `method`), normaliza `:id` ↔ `{id}` y compara en ambos sentidos. Además ejecuta un conjunto de solicitudes representativas (éxitos y los errores `401`, `403`, `404`, `409`, `422`, `429`) y comprueba que cada estado observado está declarado para su operación.

**D4 — Imagen.** `Dockerfile` multietapa sobre `node:24-slim` (Node 24 es LTS y está en la matriz de CI): etapa `construir` instala todo, compila API e interfaz; etapa final copia `dist/` de la API, `corpus-ejemplo/`, `migraciones/`, `package.json` y `package-lock.json`, instala con `npm ci --omit=dev`, copia el `dist/` de la interfaz a `/app/web` y fija `WEB_DIR=/app/web`; usuario `node` (no root); `HEALTHCHECK` contra `/v1/salud`; sin `.env` (`.dockerignore`). Las migraciones se aplican con un comando aparte (`node node_modules/node-pg-migrate/bin/node-pg-migrate.js up`) que el compose ejecuta antes de la API, para que la imagen de la API no arranque migrando por su cuenta. `node-pg-migrate` es dependencia de desarrollo: la imagen de migración usa la etapa `construir`.

**D5 — HTTPS y CDN preparados, no verificables.** `Caddyfile` con el dominio como variable (`{$SIJASS_DOMINIO}`) delante de la API: certificado automático, redirección HTTP→HTTPS, HSTS. Se documenta cómo poner una CDN (por ejemplo, con la caché de `/assets/*`) y qué cabeceras la hacen segura. Ni el certificado ni la CDN se prueban sin dominio: el script de verificación informa «no aplicable» en vez de aprobar.

**D6 — CI y CD.** El job `imagen` del CI construye la imagen, levanta API y PostgreSQL con `docker compose`, aplica migraciones y comprueba `/v1/salud`, `/` y las cabeceras con `verificar-despliegue.mjs`. El workflow `publicar-imagen.yml` es **solo manual** (`workflow_dispatch`): construye y publica en GHCR con el `GITHUB_TOKEN`. El despliegue a un host no se automatiza: requiere un destino y credenciales que no existen; queda como paso documentado.

**D7 — Escenario k6.** `tecnologia/carga/portal.js`: cada usuario virtual `VU` toma la cuenta `asociado<N>@carga.sijass.pe` (N = `__VU`), inicia sesión una vez (con la misma contraseña de carga) y repite `saldo`/`cuotas`/`pagos` con pensamiento de 1 a 3 s. Etapas por defecto hasta la meta `META_VU` (2000): 50 → 200 → 500 → 1000 → 1500 → 2000, mantenimiento y descenso. Umbrales: `http_req_duration{tipo:lectura}` p95 < 800 ms y `errores_lectura` < 1 %; el inicio de sesión se mide aparte. `handleSummary` escribe `resultados/<entorno>-<fecha>.json` con las métricas y los metadatos de D8.

**D8 — Siembra de carga y registro por entorno.** `scripts/sembrar-carga.mjs` crea una JASS de carga con N cuentas de asociado por SQL directo, derivando **una** sola vez el hash `scrypt` y reutilizándolo (son datos de prueba; derivar 2.000 hashes distintos solo alargaría la siembra). Se declara en el script y en la documentación. `tecnologia/carga/registrar.mjs` toma el JSON de k6 y añade `entorno`, fecha, commit, máquina (CPU, memoria) y una advertencia fija cuando `entorno === 'local'`. La tabla de `docs/07-evaluacion-final/` tiene una columna por entorno.

**D9 — Ejecución local de la rampa.** La API se ejecuta como contenedor (la misma imagen que se desplegaría) con PostgreSQL en otro contenedor y k6 en un tercero con `--network host` equivalente; todo en la misma máquina de desarrollo, que **comparte CPU entre generador de carga, API y base**. Por eso el resultado es una cota local, no la capacidad del despliegue; se registra con el hardware y esa advertencia.

## Risks / Trade-offs

- **Cifras locales engañosas:** generador de carga, API y base compiten por la misma CPU, y el sistema operativo limita conexiones; se etiquetan y no se extrapolan.
- **Inicio de sesión con `scrypt`:** 2.000 inicios de sesión casi simultáneos saturan el grupo de hilos de `libuv`; la rampa los reparte. Si es el cuello de botella, se informa tal cual (candidato a ajustar parámetros o a limitar por IP), no se oculta.
- **OpenAPI manual:** puede divergir en el detalle de los esquemas; la prueba cubre rutas y estados, no cada campo.
- **Caddy no probado con dominio real:** su configuración es estándar pero **no verificada** aquí.

## Migration Plan

Sin esquema nuevo. Reversible: los archivos añadidos no alteran el comportamiento existente salvo las cabeceras de estáticos.

## Open Questions

- ¿Dominio o subdominio, proveedor de DNS y de hosting? ¿Qué CDN (costo frente a RC03)?
- ¿Qué entorno de carga está autorizado y qué meta realista de usuarios concurrentes reales tiene una JASS (la de 2.000 es la meta de la rúbrica)?
- ¿Qué plan de respaldo y restauración de PostgreSQL se adoptará?
