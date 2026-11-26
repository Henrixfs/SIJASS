-- Up Migration
-- Acceso por DNI, claves generadas, JASS con estado y ubicación y membresía de plataforma
-- (s2a-acceso-dni-multi-jass, design.md D1, D2 y D10).
-- Sin IF NOT EXISTS: aplicar -> revertir -> aplicar solo termina bien si la reversión
-- elimina todo lo que esta migración crea.

-- ---------------------------------------------------------------------------
-- Usuario: el DNI identifica la cuenta; el correo pasa a ser opcional.
-- ---------------------------------------------------------------------------
ALTER TABLE usuario
  ADD COLUMN documento                text,
  ADD COLUMN nombre                   text,
  -- La clave actual la generó el sistema: se compara sin distinguir mayúsculas ni separadores.
  ADD COLUMN clave_generada           boolean NOT NULL DEFAULT false,
  -- Hasta que cambie su clave solo puede cambiarla, consultar `yo` o cerrar sesión.
  ADD COLUMN debe_cambiar_contrasena  boolean NOT NULL DEFAULT false,
  ALTER COLUMN correo DROP NOT NULL;

ALTER TABLE usuario
  ADD CONSTRAINT usuario_documento_key UNIQUE (documento),
  ADD CONSTRAINT usuario_documento_check CHECK (documento IS NULL OR documento ~ '^[0-9]{8}$'),
  ADD CONSTRAINT usuario_nombre_check CHECK (nombre IS NULL OR length(btrim(nombre)) BETWEEN 1 AND 120);

-- Cuentas de asociados existentes: toman el DNI y el nombre del padrón cuando el documento tiene
-- 8 dígitos y no se repite entre JASS (un mismo DNI en dos cuentas no se puede asignar a ambas).
WITH candidatos AS (
  SELECT m.usuario_id, a.documento, a.nombre,
         count(*) OVER (PARTITION BY a.documento) AS veces
    FROM membresia m
    JOIN asociado a ON a.id = m.asociado_id AND a.jass_id = m.jass_id
   WHERE m.perfil = 'asociado' AND a.documento ~ '^[0-9]{8}$'
)
UPDATE usuario u
   SET documento = c.documento, nombre = c.nombre
  FROM candidatos c
 WHERE c.usuario_id = u.id AND c.veces = 1;

-- ---------------------------------------------------------------------------
-- JASS: estado y ubicación opcional.
-- ---------------------------------------------------------------------------
ALTER TABLE jass
  ADD COLUMN estado         text NOT NULL DEFAULT 'activa',
  ADD COLUMN departamento   text,
  ADD COLUMN provincia      text,
  ADD COLUMN distrito       text,
  ADD COLUMN centro_poblado text,
  ADD CONSTRAINT jass_estado_check CHECK (estado IN ('activa', 'suspendida'));

-- Una JASS no se repite con el mismo nombre y la misma ubicación, sin distinguir mayúsculas.
CREATE UNIQUE INDEX jass_nombre_ubicacion_key
  ON jass (lower(nombre), lower(coalesce(distrito, '')), lower(coalesce(centro_poblado, '')));

-- ---------------------------------------------------------------------------
-- Membresía: perfil de plataforma, sin JASS.
-- ---------------------------------------------------------------------------
ALTER TABLE membresia
  DROP CONSTRAINT membresia_coherencia_check,
  DROP CONSTRAINT membresia_perfil_check,
  ALTER COLUMN jass_id DROP NOT NULL;

ALTER TABLE membresia
  ADD CONSTRAINT membresia_perfil_check CHECK (perfil IN ('personal', 'asociado', 'plataforma')),
  ADD CONSTRAINT membresia_coherencia_check CHECK (
    (perfil = 'personal'   AND jass_id IS NOT NULL AND rol IS NOT NULL AND asociado_id IS NULL)
    OR (perfil = 'asociado'   AND jass_id IS NOT NULL AND rol IS NULL AND asociado_id IS NOT NULL)
    OR (perfil = 'plataforma' AND jass_id IS NULL AND rol IS NULL AND asociado_id IS NULL)
  );

-- Down Migration
-- Orden inverso al de creación.

-- La plataforma no existe en el esquema anterior: se retiran sus membresías (las cuentas quedan sin perfil).
DELETE FROM membresia WHERE perfil = 'plataforma';

ALTER TABLE membresia
  DROP CONSTRAINT membresia_coherencia_check,
  DROP CONSTRAINT membresia_perfil_check;

ALTER TABLE membresia
  ALTER COLUMN jass_id SET NOT NULL,
  ADD CONSTRAINT membresia_perfil_check CHECK (perfil IN ('personal', 'asociado')),
  ADD CONSTRAINT membresia_coherencia_check CHECK (
    (perfil = 'personal' AND rol IS NOT NULL AND asociado_id IS NULL)
    OR (perfil = 'asociado' AND rol IS NULL AND asociado_id IS NOT NULL)
  );

DROP INDEX jass_nombre_ubicacion_key;

ALTER TABLE jass
  DROP CONSTRAINT jass_estado_check,
  DROP COLUMN centro_poblado,
  DROP COLUMN distrito,
  DROP COLUMN provincia,
  DROP COLUMN departamento,
  DROP COLUMN estado;

-- Las cuentas creadas sin correo reciben uno inválido y único para poder volver a exigirlo.
UPDATE usuario SET correo = 'sin-correo-' || id || '@invalido.local' WHERE correo IS NULL;

ALTER TABLE usuario
  DROP CONSTRAINT usuario_nombre_check,
  DROP CONSTRAINT usuario_documento_check,
  DROP CONSTRAINT usuario_documento_key,
  ALTER COLUMN correo SET NOT NULL,
  DROP COLUMN debe_cambiar_contrasena,
  DROP COLUMN clave_generada,
  DROP COLUMN nombre,
  DROP COLUMN documento;
