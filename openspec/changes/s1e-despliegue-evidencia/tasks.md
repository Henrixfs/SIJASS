# Tasks

Rutas relativas a `tecnologia/siJASS-clean-architecture/` salvo que se indique otra cosa. Rama `feat/s1e-despliegue-evidencia`, sobre `feat/s1d-asistente-tecnico`. Cada resultado se etiqueta con su entorno: **local**, **CI** o **despliegue**; el despliegue queda «sin medir».

## 1. Contrato OpenAPI (D3)

- [x] 1.1 Escribir `docs/api/openapi.yaml` con todas las rutas `/v1` y añadir la prueba de coherencia (rutas del código ↔ documento y estados observados ↔ declarados). Verificar: `npm test` pasa; quitar una ruta del documento o añadir un controlador de prueba hace fallar la prueba nombrando la ruta (comprobado con ambos sentidos en pruebas del propio comparador).

## 2. Salud y caché estática (D1, D2)

- [x] 2.1 `GET /v1/salud`. Verificar por HTTP sobre PostgreSQL: `200 ok`; con la base inaccesible, `503` sin direcciones, usuario ni texto de error; sin sesión no devuelve datos.
- [x] 2.2 Caché estática de la interfaz. Verificar por HTTP con una carpeta de interfaz de prueba: `/assets/*` con `immutable` y `ETag`, `304` con `If-None-Match`, `index.html` y rutas de la SPA con `no-cache`, `/v1/*` con `no-store`, y que un `/assets/` inexistente responde `404` (no `index.html`).

## 3. Contenedor y verificación (D4, D5)

- [x] 3.1 `Dockerfile`, `.dockerignore`, `docker-compose.despliegue.yml` y `Caddyfile`. Verificar en local: la imagen se construye; con PostgreSQL migrado arranca y `/v1/salud` y `/` responden; corre como usuario no root; no contiene `.env` ni el valor de `JWT_SECRET`; sin `JWT_SECRET` termina con código distinto de 0.
- [x] 3.2 `scripts/verificar-despliegue.mjs`. Verificar contra el contenedor local: salud, cabeceras y caché pasan, y DNS, TLS, HSTS y redirección se informan «no aplicable»; contra un servidor de prueba mal configurado termina con código distinto de 0 nombrando la comprobación.

## 4. CI y CD (D6)

- [ ] 4.1 Job `imagen` en `ci.yml` y workflow manual `publicar-imagen.yml`. Verificar: YAML válido; el job `imagen` pasa en GitHub Actions; el workflow de publicación **no se ejecuta** (requiere autorización explícita).

## 5. Carga k6 (D7–D9)

- [x] 5.1 `tecnologia/carga/portal.js`, `scripts/sembrar-carga.mjs` y `tecnologia/carga/registrar.mjs`. Verificar: la siembra crea 2.000 cuentas distintas y cada una inicia sesión; una ejecución de humo (10 usuarios, 30 s) pasa los umbrales y produce el resumen con su entorno.
- [x] 5.2 Rampa gradual hasta 2.000 usuarios virtuales **en local** contra el contenedor. Registrar capacidad observada, latencia, rendimiento y errores, por etapa, con el hardware y la advertencia de que no representa el despliegue.

## 6. Documentación con evidencia

- [ ] 6.1 Actualizar la matriz C01–C16 (columnas de evidencia local, CI y despliegue), el plan de pruebas (PT25), el roadmap, los README y un documento `docs/08-despliegue/` con lo que falta para desplegar (servicio, acceso o dato exacto). `node scripts/verificar-docs.mjs` con código 0.

## 7. Integración final

- [ ] 7.1 `openspec validate s1e-despliegue-evidencia --strict` con código 0.
- [ ] 7.2 Copia limpia del commit final: instalación, lint, build, pruebas, interfaz, E2E y construcción de la imagen.
- [ ] 7.3 Subir la rama, abrir el PR contra `feat/s1d-asistente-tecnico` y anotar el CI.

## Workflow follow-up

- Con dominio, DNS, hosting y credenciales: desplegar, ejecutar `verificar-despliegue.mjs` y la rampa k6 contra el servicio real y completar la columna «despliegue».
- Fusionar y archivar con `/opsx:archive s1e-despliegue-evidencia`.
