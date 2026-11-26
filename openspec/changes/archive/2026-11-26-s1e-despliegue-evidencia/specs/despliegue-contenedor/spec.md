# despliegue-contenedor Specification

## Purpose

Permite construir y ejecutar SIJASS como un contenedor reproducible que sirve la API y la interfaz con caché estática correcta, con una sonda de salud y una verificación automatizable del despliegue, sin incluir secretos.

## ADDED Requirements

### Requirement: Sonda de salud pública
El sistema SHALL exponer `GET /v1/salud` sin autenticación, que responda `200` con `{ estado: "ok", base: "ok" }` cuando la base de datos responde y `503` con `{ estado: "degradado", base: "error" }` cuando no, sin revelar direcciones, credenciales ni mensajes de error de la base.

#### Scenario: Base disponible
- **WHEN** se solicita `/v1/salud` con PostgreSQL disponible
- **THEN** la respuesta es `200` con `estado` y `base` en `ok`

#### Scenario: Base caída
- **WHEN** la base de datos no responde
- **THEN** la respuesta es `503`, el cuerpo no contiene el nombre del servidor, el usuario ni el texto del error de la base

#### Scenario: Sin datos
- **WHEN** se solicita sin sesión
- **THEN** la respuesta no contiene ningún dato de negocio ni de configuración

### Requirement: Caché estática de la interfaz
Cuando la API sirve la interfaz construida, SHALL responder `index.html` con `Cache-Control: no-cache`, los archivos de `/assets/` (con hash en el nombre) con `Cache-Control: public, max-age=31536000, immutable` y `ETag`, y toda ruta `/v1/*` con `Cache-Control: no-store`. SHALL responder `304` a una solicitud condicional con el `ETag` vigente.

#### Scenario: Archivo con hash
- **WHEN** se solicita un archivo de `/assets/`
- **THEN** la respuesta lleva `public, max-age=31536000, immutable` y un `ETag`

#### Scenario: Página principal
- **WHEN** se solicita `/` o una ruta de la interfaz
- **THEN** la respuesta es `index.html` con `no-cache`

#### Scenario: Solicitud condicional
- **WHEN** se repite la solicitud de un archivo con `If-None-Match` igual a su `ETag`
- **THEN** la respuesta es `304` sin cuerpo

#### Scenario: API sin caché
- **WHEN** se solicita cualquier ruta `/v1/*`
- **THEN** la respuesta lleva `no-store`

### Requirement: Imagen reproducible sin secretos
El repositorio SHALL incluir un `Dockerfile` multietapa que construya la API y la interfaz, produzca una imagen final sin dependencias de desarrollo ni código fuente de pruebas, la ejecute con un usuario no root y no contenga contraseñas, claves ni archivos `.env`. La configuración SHALL llegar solo por variables de entorno.

#### Scenario: Construcción y arranque
- **WHEN** se construye la imagen y se ejecuta con una base migrada y las variables `JWT_SECRET` y `DATABASE_URL`
- **THEN** `/v1/salud` responde `200` y `/` sirve la interfaz

#### Scenario: Sin secretos en la imagen
- **WHEN** se inspeccionan las capas de la imagen
- **THEN** no hay archivos `.env`, claves privadas ni el valor de `JWT_SECRET`

#### Scenario: Usuario no root
- **WHEN** se ejecuta `id` dentro del contenedor
- **THEN** el usuario no es `root`

#### Scenario: Arranque sin secreto
- **WHEN** se ejecuta el contenedor sin `JWT_SECRET`
- **THEN** termina con código distinto de 0 y un mensaje que lo explica

### Requirement: Verificación automatizable del despliegue
El repositorio SHALL incluir `scripts/verificar-despliegue.mjs <url>` que compruebe, e informe por separado y con código de salida distinto de 0 si falla alguna, la resolución DNS del nombre, la validez del certificado TLS, `Strict-Transport-Security`, la redirección de HTTP a HTTPS, las cabeceras de seguridad, la caché de estáticos y `/v1/salud`.

#### Scenario: Contra la API local sin TLS
- **WHEN** se ejecuta contra `http://127.0.0.1:<puerto>`
- **THEN** las comprobaciones de salud, cabeceras y caché pasan y las de DNS, TLS, HSTS y redirección se informan como **no aplicables** (no como aprobadas)

#### Scenario: Contra un sitio mal configurado
- **WHEN** falta una cabecera de seguridad o la caché de estáticos es incorrecta
- **THEN** el script termina con código distinto de 0 y nombra la comprobación fallida
