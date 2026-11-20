# Despliegue de SIJASS: qué está listo y qué falta

**Estado:** el contenedor y su verificación están **listos y probados en local y en CI**. El **despliegue real no existe**: no hay dominio, DNS, hosting ni CDN. Este documento nombra, para cada tarea que depende de un servicio externo, **qué servicio, qué acceso o qué dato se necesita**. Ninguna evidencia de despliegue se simula: la columna «despliegue» de la [matriz de cumplimiento](../07-evaluacion-final/matriz-cumplimiento.md) dice «sin medir».

## 1. Lo que ya funciona

| Pieza | Dónde | Cómo se comprobó |
|---|---|---|
| Imagen multietapa (API + interfaz), usuario no root, sin secretos ni pruebas | [`Dockerfile`](../../Dockerfile) | Local y job `Imagen del contenedor` del CI |
| PostgreSQL + migraciones + API con un comando | [`docker-compose.despliegue.yml`](../../docker-compose.despliegue.yml) | Local y CI |
| Sonda `GET /v1/salud` | `tecnologia/siJASS-clean-architecture/src/api` | Pruebas de integración (incluida la base caída: `503` sin detalles) |
| Caché estática: `/assets/*` inmutable con `ETag`, `index.html` y rutas de la interfaz con `no-cache`, `/v1/*` con `no-store` | `src/api/aplicacion.ts` | Pruebas HTTP y `scripts/verificar-despliegue.mjs` |
| Verificación del despliegue (DNS, TLS, HSTS, redirección, cabeceras, caché, salud) | [`scripts/verificar-despliegue.mjs`](../../scripts/verificar-despliegue.mjs) | Local y CI; DNS, TLS, HSTS y redirección salen como **no aplicable** sin dominio |
| Contrato OpenAPI de las 24 rutas, con prueba de coherencia | [`docs/api/openapi.yaml`](../api/openapi.yaml) | `npm test` |
| Escenario de carga k6 con rampa gradual hasta 2.000 usuarios | [`tecnologia/carga/`](../../tecnologia/carga/) | Humo y rampa **locales** (ver §4) |
| Publicación manual de la imagen en GHCR | [`publicar-imagen.yml`](../../.github/workflows/publicar-imagen.yml) | **No ejecutado** (requiere autorización) |
| Proxy HTTPS (Caddy) preparado | [`Caddyfile`](../../Caddyfile), perfil `https` del compose | **No verificado**: necesita un dominio |

Ejecución local de la pila:

```bash
cp .env.despliegue.example .env.despliegue        # complete JWT_SECRET y SIJASS_DB_CLAVE (no se versiona)
docker compose -f docker-compose.despliegue.yml --env-file .env.despliegue up -d --build
node scripts/verificar-despliegue.mjs http://127.0.0.1:3000
```

## 2. Lo que falta y qué se necesita exactamente

| # | Tarea (criterio) | Qué falta | Qué necesito de usted |
|---|---|---|---|
| 1 | Dominio y DNS (**C10**) | Un nombre de dominio o subdominio y el DNS configurado | **El dominio o subdominio elegido** (por ejemplo `sijass.<su-dominio>`) y **acceso al panel de DNS** del proveedor, o que usted cree los registros `A`/`AAAA` hacia la IP del servidor. Decisión de costo frente a RC03 |
| 2 | Hosting | Un servidor donde ejecutar los contenedores | **Un servidor Linux con Docker** (punto de partida a medir: 2 vCPU y 4 GB de RAM), con los puertos 80 y 443 abiertos y **acceso por SSH con clave**; indique el proveedor y la región (la latencia hacia Ayacucho importa) |
| 3 | HTTPS (**C10**) | Certificado y redirección verificados en un dominio real | Los puntos 1 y 2, y un **correo de contacto** para el certificado de Let's Encrypt. Con eso: `docker compose --profile https up -d` y `verificar-despliegue.mjs https://<dominio>` |
| 4 | CDN (**C10**, **C11**) | Una CDN delante del dominio | **El proveedor de CDN y su cuenta** (por ejemplo Cloudflare) y delegar el DNS o crear el `CNAME`. Reglas necesarias: cachear `/assets/*` (la API ya envía `immutable` y `ETag`) y **no** cachear `/v1/*` ni `index.html` |
| 5 | CD (**C12**) | Despliegue automático a un servidor | El destino del punto 2 y, como secretos de GitHub, `DEPLOY_HOST`, `DEPLOY_USER` y `DEPLOY_SSH_KEY`. Además, **su autorización explícita** para ejecutar `publicar-imagen.yml` (publicar en GHCR es una acción hacia afuera) |
| 6 | Carga contra el despliegue (**C13**) | Medir el servicio real | La **URL del despliegue**, **autorización explícita** para generar hasta 2.000 usuarios virtuales contra él, una **ventana de tiempo** acordada y un entorno equivalente al de producción (no el de desarrollo) |
| 7 | Respaldo y restauración | Política de respaldos de PostgreSQL | Dónde se guardan, con qué frecuencia y quién restaura |
| 8 | Asistente documental (**s1d**) | Corpus aprobado y proveedor de modelo | El **corpus aprobado** (documento, versión, páginas y responsable de aprobación), la **decisión del proveedor** de modelo de lenguaje con su credencial y su política de privacidad (Ley N.° 29733), y el **protocolo validado y casos de referencia revisados** si se desea cálculo de dosis |

## 3. Cómo se completa la evidencia cuando existan esos insumos

1. Desplegar con el compose y el perfil `https`.
2. `node scripts/verificar-despliegue.mjs https://<dominio>`: ahora DNS, TLS, HSTS y redirección se comprueban de verdad.
3. Ejecutar el escenario k6 contra el servicio y registrarlo con `ENTORNO=despliegue` (ver §4).
4. Rellenar la columna «despliegue» de la matriz con enlaces a esas ejecuciones, y solo entonces considerar C10, C11 y C13 para pasar de estado.

## 4. Pruebas de carga: cómo leer los resultados

Cada ejecución se guarda con `tecnologia/carga/registrar.mjs` en `docs/07-evaluacion-final/carga/`, con su **entorno** (`local`, `ci` o `despliegue`), fecha, versión, máquina y la advertencia correspondiente. Una cifra `local` **no** es capacidad del despliegue: el generador de carga, la API y la base comparten la misma máquina de desarrollo. Los resultados y su lectura están en la [matriz de cumplimiento](../07-evaluacion-final/matriz-cumplimiento.md#35-aporte-de-s1e).
