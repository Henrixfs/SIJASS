# Análisis de la base de datos y de la estrategia de caché — SIJASS

**Estado:** análisis **medido en local** el 2026-11-25 (criterios C09 y C11; actividad 5 del Sprint 2). **No** es una medición del despliegue: no existe despliegue. Las cifras salen de PostgreSQL 16 y de la API en contenedores en una sola máquina de desarrollo (AMD Ryzen 7 5700U, 16 hilos, 14 GB de RAM, Docker Desktop con 16 CPU y 7 GB), con una JASS de carga de **2.000 asociados**, 6.000 cuotas y 666 pagos.

## 1. Datos y método

| Tabla | Filas | Tabla | Filas |
|---|---|---|---|
| `jass` | 1 | `cuota` | 6.000 |
| `usuario` | 2.001 | `pago` | 666 |
| `asociado` | 2.000 | `membresia` | 2.001 |

- La base se crea con las migraciones y se siembra con [`sembrar-carga.mjs`](../../tecnologia/siJASS-clean-architecture/scripts/sembrar-carga.mjs).
- Los planes se obtienen con `EXPLAIN (ANALYZE, BUFFERS)` ejecutado **con el rol de la aplicación** (`sijass_app`) y la JASS fijada, igual que hace la API en cada transacción, de modo que incluyen el costo de la seguridad por filas. Guion: [`analisis-bd.sql`](../../tecnologia/carga/analisis-bd.sql); salida completa: [`explain-2026-11-25.txt`](carga/explain-2026-11-25.txt).

## 2. Consultas de la ruta caliente

| Consulta (quién la usa) | Plan observado | Tiempo de ejecución |
|---|---|---|
| Usuario por DNI (inicio de sesión) | `Index Scan` en `usuario_documento_key` | 0,91 ms |
| Membresía activa del usuario (guardia, **en cada solicitud**) | `Index Scan` en `membresia_usuario_activa_key` (índice parcial) | 0,04 ms |
| Cuotas del asociado (portal) | `Index Scan` en `cuota_jass_asociado_idx (jass_id, asociado_id, periodo)` | 0,05 ms |
| Pagos del asociado (portal) | `Nested Loop`: índice de cuotas y `pago_jass_cuota_idx (jass_id, cuota_id)` | 0,12 ms |
| Padrón de la JASS (2.000 filas) | `Seq Scan` con filtro por JASS y ordenación en memoria (283 kB) | 2,84 ms |

- **Todas las consultas por clave usan índice** y los índices están encabezados por `jass_id`, como pide el diseño multi-JASS: la misma estructura sirve para el aislamiento y para el rendimiento.
- **La seguridad por filas no cuesta de forma apreciable:** aparece como un filtro o un `One-Time Filter` en el plan, con decenas de microsegundos. El aislamiento comprobado en la misma sesión: con otra JASS fijada la misma consulta devuelve **0** filas, con la propia **3**.
- El `Seq Scan` del padrón es correcto: la consulta devuelve toda la JASS (2.000 filas) y el planificador no gana nada con un índice.

## 3. Hallazgo: consultas por asociado en el padrón (corregido)

El listado del padrón calculaba el saldo de cada asociado con dos consultas por asociado (cuotas y pagos): el patrón «N + 1».

| | Consultas por solicitud | `GET /v1/asociados` con 2.000 asociados (mediana de 5) | Tamaño de la respuesta |
|---|---|---|---|
| Antes | 2 × N + 2 (≈ 4.000) | **13.703 ms** | 318.908 bytes |
| Después | 4 (una por tabla, por JASS) | **243 ms** | 318.908 bytes |

- **Corrección:** `listarPorJass` en los repositorios de cuotas y pagos (puerto, memoria y PostgreSQL) y el cálculo de saldos en memoria en [`ListarAsociados`](../../tecnologia/siJASS-clean-architecture/src/aplicacion/padron/padron.ts). Mejora de unas **56 veces** con la misma respuesta.
- **Garantía de equivalencia:** una prueba de contrato, sobre memoria y PostgreSQL, comprueba que el saldo del listado coincide con el del estado de cuenta individual de cada asociado ([`casos-padron.ts`](../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-padron.ts)).
- El hallazgo salió de este análisis, no de una prueba funcional: con 20 asociados (el tamaño de las pruebas) el defecto no se nota. Una JASS de 500 familias habría esperado cerca de 3,4 s.

## 4. Conexiones y transacciones

- Pool de **10 conexiones** por proceso (`composicion.ts`). Cada lectura del portal usa **dos transacciones** (autorización y consulta) y, con la seguridad por filas, fija el rol y la JASS en cada una.
- Durante la rampa de carga (§7), observado con `docker stats` a unos 250 usuarios virtuales: la API a ~207 % de CPU y PostgreSQL a ~121 %. **Ninguna solicitud falló** hasta 2.000 usuarios; la latencia crece por cola. El límite parece estar en la CPU de un solo proceso Node.js y en el pool, no en las consultas (todas rápidas) [observación, no diagnóstico por perfilado].
- Candidatos a medir **antes** de afirmar mejoras: varias réplicas de la API detrás de un balanceador, reducir las consultas de autorización por solicitud, y el tamaño del pool.

## 5. Estrategia de caché (decisión: ADR-016)

| Nivel | Qué se cachea | Estado |
|---|---|---|
| Archivos estáticos de la interfaz | `/assets/*` con hash: `public, max-age=31536000, immutable` y `ETag` (304); `index.html`: `no-cache` | **Implementado y probado** (`s1e`) |
| Datos de referencia | `GET /v1/mediciones/catalogo` (métodos y unidad, iguales para todos): `private, max-age=300` con `ETag` | **Implementado y probado** (Sprint 2): el encabezado se fija tras autorizar, así que un 401 o un 403 siguen en `no-store`; `Vary: Authorization` |
| Respuestas con datos de personas | Saldos, cuotas, pagos, padrón, equipo: `Cache-Control: no-store` | **Decisión deliberada**: son datos personales y financieros; no deben quedar en el disco de un teléfono compartido |
| Caché de servidor (Redis o memoria del proceso) | — | **No se implementa** (ADR-009 y ADR-016) |

**Por qué no hay caché de datos en el servidor:**
1. La autorización lee la membresía **en cada solicitud** para que una desactivación o un restablecimiento de clave surtan efecto al instante (especificación `acceso-por-documento`). Una caché de esa lectura lo rompería.
2. Los saldos cambian con cada pago: una caché con tiempo de vida mostraría un saldo equivocado a la familia justo después de pagar.
3. Una caché en la memoria del proceso no es coherente entre réplicas, y Redis añade un componente que ADR-009 excluye mientras no haya una necesidad medida.
4. La necesidad real es baja: con 14 ms de mediana en lecturas a carga ligera, las consultas ya son rápidas. El cuello de botella medido es la CPU de un proceso, no la base de datos.

**Cuándo se reevaluaría** (criterios medibles): si con la carga real del piloto el p95 de lectura supera 800 ms, o si un reporte nuevo repite un cálculo caro. El primer candidato sería agregar una **caché de lectura por JASS con invalidación al confirmar cada transacción de esa JASS** (válida con una sola réplica), y solo después una caché compartida.

## 6. Crecimiento de la base de datos (propuesta, no implementada)

- **Hoy:** una sola instancia de PostgreSQL; claves e índices encabezados por `jass_id`; migraciones reversibles; respaldo **sin definir** (depende del servidor, ver [despliegue](../08-despliegue/despliegue-y-bloqueos.md)).
- **Siguiente paso medible:** `pg_stat_statements` en el piloto para ver las consultas reales; revisar el crecimiento de `evento_auditoria` (solo inserciones) y `pago`.
- **Si crece:** réplica de lectura para reportes; particionado de `evento_auditoria` por fecha y, solo si una JASS gigante lo justifica, de `pago` por `jass_id`. El diseño ya aísla por `jass_id`, así que extraer una JASS a otra base sería un cambio de conexión, no de esquema.

## 7. Carga progresiva hasta 2.000 usuarios (local)

Resultado completo en [`carga/`](carga/) (archivo `local-2026-11-26-02-17-32.json`) y lectura en la [matriz de cumplimiento](matriz-cumplimiento.md#pruebas-de-carga-tras-s2a-resultado-local-2026-11-25) y en la [validación de atributos de calidad](validacion-atributos-de-calidad.md). Es una cifra **local**: no representa el despliegue.

## Flags

**Red Flags:** ninguna.

**Yellow Flags:**
- Las cifras son de una máquina de desarrollo con la herramienta de carga, la API y PostgreSQL compartiendo recursos.
- El respaldo, la réplica y el particionado son propuestas; no hay medición de crecimiento real.
- El inicio de sesión (`scrypt`) concentra el costo en ráfagas: ver la validación de atributos de calidad.
