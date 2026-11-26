-- Análisis de las consultas del portal y del padrón con EXPLAIN (ANALYZE, BUFFERS) sobre la base de carga (2.000 asociados).
-- Reproducir: crear una base, `npm run migrar`, `SIJASS_CLAVE_CARGA=… node scripts/sembrar-carga.mjs 2000` y
--   docker exec -i <contenedor-postgres> psql -U sijass -d <base> -v ON_ERROR_STOP=1 < tecnologia/carga/analisis-bd.sql
-- Se ejecuta con el rol de la aplicación (`sijass_app`) y la JASS fijada, como lo hace la API en cada transacción.
\pset pager off
\timing off
SELECT 'jass' t, count(*) FROM jass UNION ALL SELECT 'usuario', count(*) FROM usuario UNION ALL SELECT 'asociado', count(*) FROM asociado
UNION ALL SELECT 'membresia', count(*) FROM membresia UNION ALL SELECT 'cuota', count(*) FROM cuota UNION ALL SELECT 'pago', count(*) FROM pago;
ANALYZE;
SET ROLE sijass_app;
SELECT set_config('app.jass_id', md5('carga-jass')::uuid::text, false);
\echo === Q1 inicio de sesion: usuario por DNI
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) SELECT * FROM usuario WHERE documento = '90000777';
\echo === Q2 membresia activa del usuario
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) SELECT * FROM membresia WHERE usuario_id = md5('carga-usuario-777')::uuid AND estado = 'activa';
\echo === Q3 portal: cuotas del asociado
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) SELECT * FROM cuota WHERE jass_id = md5('carga-jass')::uuid AND asociado_id = md5('carga-asociado-777')::uuid ORDER BY periodo;
\echo === Q4 portal: pagos del asociado
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) SELECT p.* FROM pago p JOIN cuota c ON c.id = p.cuota_id AND c.jass_id = p.jass_id WHERE p.jass_id = md5('carga-jass')::uuid AND c.asociado_id = md5('carga-asociado-777')::uuid ORDER BY p.pagado_en, p.id;
\echo === Q5 padron: asociados de la JASS
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) SELECT * FROM asociado WHERE jass_id = md5('carga-jass')::uuid ORDER BY documento COLLATE "C";
\echo === Q6 aislamiento: la misma consulta con OTRA JASS fijada no ve filas
SELECT set_config('app.jass_id', md5('otra-jass')::uuid::text, false);
SELECT count(*) AS filas_visibles_de_otra_jass FROM cuota WHERE asociado_id = md5('carga-asociado-777')::uuid;
SELECT set_config('app.jass_id', md5('carga-jass')::uuid::text, false);
SELECT count(*) AS filas_visibles_de_la_propia_jass FROM cuota WHERE asociado_id = md5('carga-asociado-777')::uuid;
