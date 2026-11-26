# Validación de los atributos de calidad — SIJASS (Sprint 2)

**Estado:** evidencia **local** del 2026-11-25. Compara cada escenario de calidad del [Sprint 1](../01-analisis-de-sistema/08-escenarios-atributos-calidad.md) con lo que se ejecutó, con el resultado y con lo que **no** se pudo validar y por qué. Ninguna cifra es del despliegue: no existe despliegue.

## 1. Resumen por escenario

| Escenario | Atributo | Resultado | Evidencia |
|---|---|---|---|
| EC-02 Idempotencia y recuperación | RNF04 | **Validado** para el registro en línea | §2 |
| EC-03 Aislamiento entre JASS | RNF05 | **Validado** (aplicación y base de datos) | §2 |
| EC-08 Pregunta sin evidencia o maliciosa | RNF09 | **Validado con el corpus de EJEMPLO** | §2 |
| EC-05 y EC-07 Nuevo módulo y nuevo cliente | RNF07 | **Parcial**: contrato verificado y un segundo cliente (Postman/Newman) | §2 |
| EC-12 Nueva versión de un documento | RNF09 | **Parcial**: corpus versionado con manifiesto validado | §2 |
| EC-01 Captura sin conexión | RNF01, RNF08 | **No validado**: no hay PWA ni cola local | §4 |
| EC-04 Corrección auditada | RNF03 | **No validado**: la corrección (RF08) no está implementada | §4 |
| EC-06 Asistente no disponible | RNF01 | **No validado**: depende del registro sin conexión | §4 |
| EC-09 Guardado local en gama baja | RNF02 | **No validado**: no hay almacenamiento local | §4 |
| EC-10 Operador nuevo | RNF06 | **No validado**: requiere prueba con personas | §4 |
| EC-11 Protección de datos personales | RNF10 | **Parcial**: el asistente no recibe datos del padrón; no hay fotos todavía | §4 |

Además se midieron atributos que no estaban en los escenarios: capacidad y latencia (§3), seguridad del acceso y accesibilidad técnica (§2).

## 2. Escenarios validados

**EC-02 — Idempotencia (RNF04).** Meta: 0 duplicados y 0 operaciones `accepted` sin dato persistido.
- Reenvío del mismo `operationId` → `duplicate`; mismo identificador con otro contenido → `conflict`; fallo entre la reserva y la escritura → reversión completa, repetido en 10 rondas: [`registro-idempotente.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/registro-idempotente.ts) (PT04, PT11, PT12) sobre memoria (Jest) y PostgreSQL.
- Pagos: diez reintentos simultáneos con la misma `Idempotency-Key` producen un solo pago, y dos pagos que juntos superan la cuota no se aceptan ([`acceso-concurrencia.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/acceso-concurrencia.test.ts), PT14).
- **Límite:** el escenario habla de un lote en `POST /sync`; esa ruta no existe. Se validó `POST /v1/mediciones` y `POST /v1/pagos` con `Idempotency-Key`.

**EC-03 — Aislamiento entre JASS (RNF05).** Meta: 100 % de los casos negativos rechazados.
- Matriz por HTTP: cada cuenta × cada ruta × recurso propio, ajeno e inexistente; todo `403` idéntico y auditado ([`api-aislamiento.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-aislamiento.test.ts), [`api-mediciones.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-mediciones.test.ts)).
- **En la base de datos** (`s2a`): con la seguridad por filas, una consulta de la JASS A sobre filas de la JASS B devuelve 0 filas y una inserción con otra JASS se rechaza ([`aislamiento-filas.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/aislamiento-filas.test.ts)); comprobado también a mano con `EXPLAIN` bajo el rol de la aplicación ([análisis](analisis-bd-y-cache.md)).
- En navegador real: un Consejo de otra JASS no ve el padrón ni los reservorios ajenos y el servidor le niega el recurso aunque conozca su identificador ([E2E](../../tecnologia/e2e/pruebas/flujo-acceso.spec.ts)).

**EC-08 — Pregunta sin evidencia o maliciosa (RNF09).** Con el corpus de **EJEMPLO**: 16 preguntas con evidencia citada (cada fragmento es subcadena literal de su página), 8 abstenciones, 25 pedidos de dosis bloqueados y 15 preguntas legítimas no bloqueadas; las instrucciones maliciosas de una página se citan como texto y no producen escrituras (PT15 a PT17, [`asistente-dominio.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/asistente-dominio.test.ts)). **No** valida la calidad con documentos reales ni con un modelo de lenguaje.

**EC-05 y EC-07 — Nuevo módulo y nuevo cliente (RNF07).**
- El contrato [OpenAPI](../api/openapi.yaml) (35 operaciones) se compara automáticamente con los controladores y con los estados observados ([`contrato-openapi.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/unitarias/contrato-openapi.test.ts), PT25).
- **Segundo cliente:** la [colección de Postman](../api/sijass.postman_collection.json), generada desde el contrato, se ejecutó con Newman contra la API: **35 peticiones, 70 aserciones, 0 fallos**, respuesta media de 70 ms. Consume el mismo contrato sin tocar el dominio.
- **Límite:** «añadir un módulo o un cliente móvil sin modificar el dominio» no se probó con un módulo ni un cliente reales (PT25 queda parcial).

**EC-12 — Nueva versión de un documento (RNF09).** El corpus se carga desde un manifiesto con documento, versión, páginas y estado, y un manifiesto inválido impide el arranque de la API. No hay flujo de carga ni aprobación por un administrador.

**Seguridad del acceso (`s2a`).** Tipo de acceso equivocado sin sesión, clave generada solo en la respuesta, bloqueo de la cuenta tras 5 intentos y límite por origen, cambio obligatorio de clave, restablecimiento que quita el bloqueo y cierra sesiones, JASS suspendida: [`api-identidad.test.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/integracion/api-identidad.test.ts) y [E2E](../../tecnologia/e2e/pruebas/flujo-acceso.spec.ts) (PT26).

**Accesibilidad técnica (`s2a`).** Ingreso, cambio de clave y entrega de clave a 320–1440 px: sin desbordamiento, objetivos de 44 px, contraste mínimo de 5,70:1 y recorrido por teclado ([evidencia](../diseno/evidencia/s2a-acceso/README.md), PT28). **No** sustituye la prueba con personas (PT23).

## 3. Capacidad y latencia con k6 (local)

> **Advertencia.** Cifras **locales**: k6, la API (contenedor) y PostgreSQL (contenedor) comparten una máquina de desarrollo (AMD Ryzen 7 5700U, 16 hilos, 14 GB de RAM, Docker Desktop con 16 CPU y 7 GB). **No representan el despliegue ni una JASS real.** Registro completo: [`carga/local-2026-11-26-02-17-32.json`](carga/local-2026-11-26-02-17-32.json).

**Requisito del Sprint 2:** simular progresivamente hasta 2.000 usuarios virtuales concurrentes. **Se ejecutó**: rampa de seis escalones de 60 s (50, 200, 500, 1.000, 1.500 y 2.000), mantenimiento de 120 s en 2.000 y descenso; 2.000 cuentas de asociado distintas, cada una entra con su DNI y consulta `saldo`, `cuotas` y `pagos` con 1 a 3 s de pensamiento.

| Escalón (60 s) | Usuarios virtuales al final | Mediana | p95 | p99 | Errores de lectura |
|---|---|---|---|---|---|
| 1 | 50 | 14 ms | 28 ms | 42 ms | 0,00 % |
| 2 | 200 | 154 ms | 512 ms | 616 ms | 0,00 % |
| 3 | 500 | 1,31 s | 2,08 s | 2,15 s | 0,00 % |
| 4 | 1.000 | 3,40 s | 5,14 s | 5,49 s | 0,00 % |
| 5 | 1.500 | 6,42 s | 8,52 s | 9,21 s | 0,00 % |
| 6 | 2.000 | 9,13 s | 10,09 s | 10,13 s | 0,00 % |
| 7 (mantenimiento 120 s) | 2.000 | 9,12 s | 9,49 s | 9,64 s | 0,00 % |

Total: 86.450 solicitudes, 165 solicitudes por segundo de media, 2.000 inicios de sesión, **0 errores** en lecturas y en inicios de sesión.

**Lectura honesta:**
- **Corrección bajo carga:** ninguna solicitud falló, ni siquiera a 2.000 usuarios virtuales; el sistema degrada la latencia, no la corrección.
- **Umbral propio de latencia (p95 de lectura < 800 ms):** se cumple a carga ligera y en los primeros escalones (hasta unos 200 usuarios virtuales); **no se cumple** a partir de 500. k6 terminó con código 99 por ese umbral y se informa así.
- **Dónde se satura (observación, no perfilado):** un solo proceso Node.js a ~207 % de CPU y PostgreSQL a ~121 % (observados a unos 250 usuarios virtuales); las consultas son rápidas ([análisis](analisis-bd-y-cache.md)), así que la cola se forma en la CPU de la API.
- **El inicio de sesión es el punto caro:** con los 2.000 usuarios entrando durante la subida, su mediana fue de 5,12 s (p95 9,98 s). La derivación `scrypt` (N = 2^15) es costosa a propósito; en una JASS real los ingresos no son simultáneos.
- **Sin regresión por `s2a`:** a carga ligera la lectura mantiene una mediana de 14 ms, igual que antes del ingreso por DNI y de la seguridad por filas (13–17 ms el 2026-11-20).
- **Realismo [Opinión]:** 2.000 usuarios simultáneos es una **meta de la asignatura**, mucho mayor que lo que genera una JASS (decenas de familias consultando en un mismo día de cobro); solo ocurriría sumando muchas JASS en un mismo instante. No hay datos de piloto que lo confirmen.

## 4. Lo que no se pudo validar

- **EC-01, EC-06 y EC-09 (sin conexión y guardado local):** requieren la PWA con almacenamiento local y cola de envío (cambio planificado `s2b`). No se simula ni se afirma.
- **EC-04 (corrección auditada):** la corrección de mediciones (RF08) no está implementada; PT09 y PT10 siguen pendientes.
- **EC-10 (operador nuevo):** exige una prueba de tareas con personas reales (PT23).
- **EC-11:** no hay fotografías; los metadatos de ubicación no se pueden probar. Se verificó que el asistente no recibe datos del padrón.
- **Todo lo del despliegue:** dominio, DNS, HTTPS real, CDN y carga contra el servicio real (criterios C10, C11 y C13 «contra despliegue») siguen en blanco.

## Flags

**Red Flags:** ninguna que impida entregar el Sprint 2; los escenarios no validados dependen de funciones aún no construidas.

**Yellow Flags:**
- Cinco de los doce escenarios no están validados y otros cuatro lo están solo en parte; casi todos dependen de la PWA.
- La capacidad con el umbral propio de latencia es de unos 200 usuarios virtuales en una máquina local.
- El corpus del asistente es de ejemplo.
