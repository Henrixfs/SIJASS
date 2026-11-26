-- Up Migration
-- Seguridad por filas (RLS) para aislar las JASS en la base de datos
-- (s2a-acceso-dni-multi-jass, design.md D11).
--
-- La aplicación no consulta como propietario: cada transacción ejecuta `SET LOCAL ROLE sijass_app`
-- y fija `app.jass_id` (la JASS de la solicitud) o `app.sistema = 'on'` (inicio y renovación de
-- sesión, guardia, comandos de servidor y plataforma). El propietario y los superusuarios siguen
-- sin verse afectados, de modo que las migraciones y las herramientas de administración no cambian.
--
-- Sin IF NOT EXISTS en las políticas: aplicar -> revertir -> aplicar solo termina bien si la
-- reversión elimina todo lo que esta migración crea.

-- ---------------------------------------------------------------------------
-- Rol de aplicación sin inicio de sesión ni privilegios de propietario. Los roles son del clúster,
-- no de la base: si ya existe (otra base, una aplicación anterior), se reutiliza.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sijass_app') THEN
    CREATE ROLE sijass_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Quien ejecuta las migraciones (el propietario) debe poder asumir el rol con SET ROLE.
  EXECUTE format('GRANT sijass_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO sijass_app;

-- Lo mínimo que la aplicación necesita. La bitácora es de solo inserción (y los disparadores lo exigen).
GRANT SELECT, INSERT, UPDATE ON jass, usuario, membresia, sesion, asociado, cuota, pago, reversa_pago,
  reservorio, medicion, operacion_idempotente TO sijass_app;
GRANT SELECT ON metodo_medicion TO sijass_app;
GRANT SELECT, INSERT ON evento_auditoria TO sijass_app;
-- Las tablas que se creen después también quedan al alcance de la aplicación.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO sijass_app;

-- ---------------------------------------------------------------------------
-- Tablas de negocio: solo se ve y se escribe la JASS de la transacción. No hay salida de sistema:
-- ni la plataforma ni el inicio de sesión leen estas tablas.
-- ---------------------------------------------------------------------------
ALTER TABLE reservorio           ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicion             ENABLE ROW LEVEL SECURITY;
ALTER TABLE operacion_idempotente ENABLE ROW LEVEL SECURITY;
ALTER TABLE asociado             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuota                ENABLE ROW LEVEL SECURITY;
ALTER TABLE pago                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE reversa_pago         ENABLE ROW LEVEL SECURITY;

CREATE POLICY aislamiento_jass ON reservorio
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON medicion
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON operacion_idempotente
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON asociado
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON cuota
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON pago
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON reversa_pago
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Tablas de identidad con JASS (o sin ella, en la plataforma): la JASS de la transacción o el modo
-- de sistema, que solo usan el inicio de sesión, la guardia, los comandos y la plataforma.
-- `usuario`, `sesion` y `jass` no llevan datos de negocio y se consultan por clave: sin RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE membresia        ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY aislamiento_jass ON membresia
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid OR current_setting('app.sistema', true) = 'on')
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid OR current_setting('app.sistema', true) = 'on');
CREATE POLICY aislamiento_jass ON evento_auditoria
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid OR current_setting('app.sistema', true) = 'on')
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid OR current_setting('app.sistema', true) = 'on');

-- Down Migration
-- Orden inverso al de creación. El rol `sijass_app` es del clúster y puede estar en uso por otras
-- bases: se retiran sus concesiones aquí, pero el rol no se elimina.

DROP POLICY aislamiento_jass ON evento_auditoria;
DROP POLICY aislamiento_jass ON membresia;
ALTER TABLE evento_auditoria DISABLE ROW LEVEL SECURITY;
ALTER TABLE membresia        DISABLE ROW LEVEL SECURITY;

DROP POLICY aislamiento_jass ON reversa_pago;
DROP POLICY aislamiento_jass ON pago;
DROP POLICY aislamiento_jass ON cuota;
DROP POLICY aislamiento_jass ON asociado;
DROP POLICY aislamiento_jass ON operacion_idempotente;
DROP POLICY aislamiento_jass ON medicion;
DROP POLICY aislamiento_jass ON reservorio;
ALTER TABLE reversa_pago         DISABLE ROW LEVEL SECURITY;
ALTER TABLE pago                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE cuota                DISABLE ROW LEVEL SECURITY;
ALTER TABLE asociado             DISABLE ROW LEVEL SECURITY;
ALTER TABLE operacion_idempotente DISABLE ROW LEVEL SECURITY;
ALTER TABLE medicion             DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservorio           DISABLE ROW LEVEL SECURITY;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE ON TABLES FROM sijass_app;
REVOKE SELECT, INSERT ON evento_auditoria FROM sijass_app;
REVOKE SELECT ON metodo_medicion FROM sijass_app;
REVOKE SELECT, INSERT, UPDATE ON jass, usuario, membresia, sesion, asociado, cuota, pago, reversa_pago,
  reservorio, medicion, operacion_idempotente FROM sijass_app;
REVOKE USAGE ON SCHEMA public FROM sijass_app;
