-- Up Migration
-- Acceso por perfiles, padrón, cuotas, pagos y auditoría (s1b-acceso-cuotas-pagos, design.md D4).
-- Sin IF NOT EXISTS: aplicar -> revertir -> aplicar solo termina bien si la reversión
-- elimina todo lo que esta migración crea.

CREATE TABLE usuario (
  id                uuid        CONSTRAINT usuario_pkey PRIMARY KEY,
  correo            text        NOT NULL,
  -- Formato scrypt$N$r$p$sal$hash; nunca la contraseña en claro.
  hash_contrasena   text        NOT NULL,
  estado            text        NOT NULL DEFAULT 'activo',
  intentos_fallidos integer     NOT NULL DEFAULT 0,
  bloqueado_hasta   timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuario_correo_key UNIQUE (correo),
  CONSTRAINT usuario_correo_minusculas_check CHECK (correo = lower(correo) AND length(correo) BETWEEN 3 AND 254),
  CONSTRAINT usuario_hash_check CHECK (hash_contrasena LIKE 'scrypt$%'),
  CONSTRAINT usuario_estado_check CHECK (estado IN ('activo', 'inactivo')),
  CONSTRAINT usuario_intentos_check CHECK (intentos_fallidos >= 0)
);

CREATE TABLE asociado (
  id        uuid        NOT NULL,
  jass_id   uuid        NOT NULL,
  nombre    text        NOT NULL,
  documento text        NOT NULL,
  estado    text        NOT NULL DEFAULT 'activo',
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asociado_pkey PRIMARY KEY (id),
  CONSTRAINT asociado_jass_fkey FOREIGN KEY (jass_id) REFERENCES jass (id),
  -- Objetivo de las claves foráneas compuestas de membresia y cuota.
  CONSTRAINT asociado_id_jass_key UNIQUE (id, jass_id),
  CONSTRAINT asociado_documento_key UNIQUE (jass_id, documento),
  CONSTRAINT asociado_nombre_check CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  CONSTRAINT asociado_documento_check CHECK (documento ~ '^[A-Za-z0-9-]{4,20}$'),
  CONSTRAINT asociado_estado_check CHECK (estado IN ('activo', 'baja'))
);

CREATE TABLE membresia (
  id          uuid        CONSTRAINT membresia_pkey PRIMARY KEY,
  usuario_id  uuid        NOT NULL,
  jass_id     uuid        NOT NULL,
  perfil      text        NOT NULL,
  rol         text,
  asociado_id uuid,
  estado      text        NOT NULL DEFAULT 'activa',
  creada_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membresia_usuario_fkey FOREIGN KEY (usuario_id) REFERENCES usuario (id),
  CONSTRAINT membresia_jass_fkey FOREIGN KEY (jass_id) REFERENCES jass (id),
  -- Un asociado solo se puede referenciar junto con su propia JASS.
  CONSTRAINT membresia_asociado_fkey FOREIGN KEY (asociado_id, jass_id) REFERENCES asociado (id, jass_id),
  CONSTRAINT membresia_perfil_check CHECK (perfil IN ('personal', 'asociado')),
  CONSTRAINT membresia_rol_check CHECK (rol IS NULL OR rol IN ('consejo', 'tesorero', 'operador')),
  CONSTRAINT membresia_estado_check CHECK (estado IN ('activa', 'inactiva')),
  CONSTRAINT membresia_coherencia_check CHECK (
    (perfil = 'personal' AND rol IS NOT NULL AND asociado_id IS NULL)
    OR (perfil = 'asociado' AND rol IS NULL AND asociado_id IS NOT NULL)
  )
);

-- Como máximo una membresía activa por cuenta y una cuenta activa por asociado.
CREATE UNIQUE INDEX membresia_usuario_activa_key ON membresia (usuario_id) WHERE estado = 'activa';
CREATE UNIQUE INDEX membresia_asociado_activa_key ON membresia (asociado_id) WHERE estado = 'activa' AND asociado_id IS NOT NULL;

CREATE TABLE sesion (
  id           uuid        CONSTRAINT sesion_pkey PRIMARY KEY,
  usuario_id   uuid        NOT NULL,
  familia_id   uuid        NOT NULL,
  -- SHA-256 hexadecimal del token de refresco; el token nunca se almacena.
  refresh_hash text        NOT NULL,
  expira_en    timestamptz NOT NULL,
  usada_en     timestamptz,
  revocada_en  timestamptz,
  creada_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sesion_usuario_fkey FOREIGN KEY (usuario_id) REFERENCES usuario (id),
  CONSTRAINT sesion_refresh_hash_key UNIQUE (refresh_hash),
  CONSTRAINT sesion_refresh_hash_check CHECK (refresh_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX sesion_familia_idx ON sesion (familia_id);

CREATE TABLE cuota (
  id               uuid        NOT NULL,
  jass_id          uuid        NOT NULL,
  asociado_id      uuid        NOT NULL,
  periodo          text        NOT NULL,
  importe_centimos integer     NOT NULL,
  creada_en        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cuota_pkey PRIMARY KEY (id),
  CONSTRAINT cuota_asociado_fkey FOREIGN KEY (asociado_id, jass_id) REFERENCES asociado (id, jass_id),
  CONSTRAINT cuota_id_jass_key UNIQUE (id, jass_id),
  CONSTRAINT cuota_periodo_key UNIQUE (jass_id, asociado_id, periodo),
  CONSTRAINT cuota_periodo_check CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT cuota_importe_check CHECK (importe_centimos > 0 AND importe_centimos <= 1000000000)
);

CREATE INDEX cuota_jass_asociado_idx ON cuota (jass_id, asociado_id, periodo);

CREATE TABLE pago (
  id                 uuid        NOT NULL,
  jass_id            uuid        NOT NULL,
  cuota_id           uuid        NOT NULL,
  importe_centimos   integer     NOT NULL,
  pagado_en          timestamptz NOT NULL,
  comprobante        text        NOT NULL,
  clave_idempotencia uuid        NOT NULL,
  payload_hash       text        NOT NULL,
  estado             text        NOT NULL DEFAULT 'vigente',
  registrado_por     uuid        NOT NULL,
  CONSTRAINT pago_pkey PRIMARY KEY (id),
  CONSTRAINT pago_cuota_fkey FOREIGN KEY (cuota_id, jass_id) REFERENCES cuota (id, jass_id),
  CONSTRAINT pago_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuario (id),
  CONSTRAINT pago_id_jass_key UNIQUE (id, jass_id),
  -- La clave de idempotencia es única por JASS (la misma clave en otra JASS es otro pago).
  CONSTRAINT pago_clave_key UNIQUE (jass_id, clave_idempotencia),
  CONSTRAINT pago_importe_check CHECK (importe_centimos > 0 AND importe_centimos <= 1000000000),
  CONSTRAINT pago_comprobante_check CHECK (length(btrim(comprobante)) BETWEEN 1 AND 60),
  CONSTRAINT pago_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pago_estado_check CHECK (estado IN ('vigente', 'revertido'))
);

CREATE INDEX pago_jass_cuota_idx ON pago (jass_id, cuota_id);

CREATE TABLE reversa_pago (
  id        uuid        NOT NULL,
  jass_id   uuid        NOT NULL,
  pago_id   uuid        NOT NULL,
  motivo    text        NOT NULL,
  actor_id  uuid        NOT NULL,
  creada_en timestamptz NOT NULL,
  CONSTRAINT reversa_pago_pkey PRIMARY KEY (id),
  CONSTRAINT reversa_pago_pago_fkey FOREIGN KEY (pago_id, jass_id) REFERENCES pago (id, jass_id),
  CONSTRAINT reversa_pago_actor_fkey FOREIGN KEY (actor_id) REFERENCES usuario (id),
  -- Un pago se reversa una sola vez.
  CONSTRAINT reversa_pago_pago_key UNIQUE (pago_id),
  CONSTRAINT reversa_pago_motivo_check CHECK (length(btrim(motivo)) BETWEEN 1 AND 300)
);

CREATE TABLE evento_auditoria (
  id         uuid        CONSTRAINT evento_auditoria_pkey PRIMARY KEY DEFAULT gen_random_uuid(),
  jass_id    uuid,
  actor_id   uuid,
  accion     text        NOT NULL,
  recurso    text        NOT NULL,
  recurso_id text,
  detalle    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  origen     text        NOT NULL DEFAULT 'api',
  creada_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evento_auditoria_jass_fkey FOREIGN KEY (jass_id) REFERENCES jass (id),
  CONSTRAINT evento_auditoria_actor_fkey FOREIGN KEY (actor_id) REFERENCES usuario (id)
);

CREATE INDEX evento_auditoria_jass_idx ON evento_auditoria (jass_id, creada_en);

-- Bitácora de solo inserción: ningún rol puede modificar ni borrar filas.
CREATE FUNCTION evento_auditoria_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'evento_auditoria es de solo inserción' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER evento_auditoria_solo_insercion
  BEFORE UPDATE OR DELETE ON evento_auditoria
  FOR EACH ROW EXECUTE FUNCTION evento_auditoria_inmutable();

CREATE TRIGGER evento_auditoria_sin_truncate
  BEFORE TRUNCATE ON evento_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION evento_auditoria_inmutable();

-- Down Migration
-- Orden inverso al de creación.

DROP TRIGGER evento_auditoria_sin_truncate ON evento_auditoria;
DROP TRIGGER evento_auditoria_solo_insercion ON evento_auditoria;
DROP FUNCTION evento_auditoria_inmutable();
DROP TABLE evento_auditoria;
DROP TABLE reversa_pago;
DROP TABLE pago;
DROP TABLE cuota;
DROP TABLE sesion;
DROP TABLE membresia;
DROP TABLE asociado;
DROP TABLE usuario;
