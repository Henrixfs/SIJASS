-- Up Migration
-- Incidencias de servicio con historial de solo inserción, reglas de prioridad por JASS y una foto
-- opcional (s1f-backend-incidencias). Migración aditiva: no modifica tablas existentes.
-- Sin IF NOT EXISTS: aplicar -> revertir -> aplicar solo termina bien si la reversión elimina todo
-- lo que esta migración crea.

CREATE TABLE incidencia (
  id                    uuid        NOT NULL,
  jass_id               uuid        NOT NULL,
  autor_id              uuid        NOT NULL,
  asociado_id           uuid        NOT NULL,
  categoria             text        NOT NULL,
  alcance_reportado     text        NOT NULL,
  descripcion           text        NOT NULL,
  observada_en          timestamptz NOT NULL,
  ubicacion             text        NOT NULL,
  estado                text        NOT NULL DEFAULT 'registrada',
  sugerencia_prioridad  text        NOT NULL,
  sugerencia_regla      text        NOT NULL,
  sugerencia_version    integer     NOT NULL,
  prioridad_confirmada  text,
  responsable_id        uuid,
  creada_en             timestamptz NOT NULL,
  revision              integer     NOT NULL DEFAULT 1,
  -- Reserva idempotente de la creación: dura lo mismo que la incidencia.
  clave_idempotencia    uuid        NOT NULL,
  payload_hash          text        NOT NULL,
  tiene_foto            boolean     NOT NULL DEFAULT false,
  CONSTRAINT incidencia_pkey PRIMARY KEY (id),
  CONSTRAINT incidencia_id_jass_key UNIQUE (id, jass_id),
  CONSTRAINT incidencia_jass_fkey FOREIGN KEY (jass_id) REFERENCES jass (id),
  CONSTRAINT incidencia_autor_fkey FOREIGN KEY (autor_id) REFERENCES usuario (id),
  CONSTRAINT incidencia_asociado_fkey FOREIGN KEY (asociado_id, jass_id) REFERENCES asociado (id, jass_id),
  CONSTRAINT incidencia_responsable_fkey FOREIGN KEY (responsable_id) REFERENCES usuario (id),
  CONSTRAINT incidencia_clave_key UNIQUE (jass_id, autor_id, clave_idempotencia),
  CONSTRAINT incidencia_categoria_check CHECK (categoria IN ('fuga', 'interrupcion', 'averia', 'presion', 'calidad-observada', 'otra')),
  CONSTRAINT incidencia_alcance_check CHECK (alcance_reportado IN ('individual', 'varias-viviendas', 'general', 'desconocido')),
  CONSTRAINT incidencia_descripcion_check CHECK (length(btrim(descripcion)) BETWEEN 1 AND 2000),
  CONSTRAINT incidencia_ubicacion_check CHECK (length(btrim(ubicacion)) BETWEEN 1 AND 300),
  CONSTRAINT incidencia_estado_check CHECK (estado IN ('registrada', 'en-atencion', 'cerrada')),
  CONSTRAINT incidencia_sugerencia_check CHECK (sugerencia_prioridad IN ('baja', 'media', 'alta') AND sugerencia_version >= 0),
  CONSTRAINT incidencia_prioridad_check CHECK (prioridad_confirmada IS NULL OR prioridad_confirmada IN ('baja', 'media', 'alta')),
  CONSTRAINT incidencia_revision_check CHECK (revision >= 1),
  CONSTRAINT incidencia_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX incidencia_jass_creada_idx ON incidencia (jass_id, creada_en DESC, id DESC);
CREATE INDEX incidencia_autor_idx ON incidencia (jass_id, autor_id, creada_en DESC);

-- Historial de solo inserción: `secuencia` ordena los eventos y sirve de cursor.
CREATE TABLE incidencia_evento (
  secuencia      bigint      GENERATED ALWAYS AS IDENTITY,
  id             uuid        NOT NULL,
  jass_id        uuid        NOT NULL,
  incidencia_id  uuid        NOT NULL,
  tipo           text        NOT NULL,
  actor_id       uuid        NOT NULL,
  publico        boolean     NOT NULL,
  detalle        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_en      timestamptz NOT NULL,
  CONSTRAINT incidencia_evento_pkey PRIMARY KEY (secuencia),
  CONSTRAINT incidencia_evento_id_key UNIQUE (id),
  CONSTRAINT incidencia_evento_incidencia_fkey FOREIGN KEY (incidencia_id, jass_id) REFERENCES incidencia (id, jass_id),
  CONSTRAINT incidencia_evento_actor_fkey FOREIGN KEY (actor_id) REFERENCES usuario (id),
  CONSTRAINT incidencia_evento_tipo_check CHECK (tipo IN ('creada', 'estado', 'prioridad', 'responsable', 'accion', 'foto'))
);

CREATE INDEX incidencia_evento_idx ON incidencia_evento (jass_id, incidencia_id, secuencia);

CREATE FUNCTION incidencia_evento_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'incidencia_evento es de solo inserción' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER incidencia_evento_solo_insercion
  BEFORE UPDATE OR DELETE ON incidencia_evento
  FOR EACH ROW EXECUTE FUNCTION incidencia_evento_inmutable();

CREATE TRIGGER incidencia_evento_sin_truncate
  BEFORE TRUNCATE ON incidencia_evento
  FOR EACH STATEMENT EXECUTE FUNCTION incidencia_evento_inmutable();

-- Matriz de prioridad por JASS: cada versión se conserva para explicar decisiones anteriores.
CREATE TABLE incidencia_reglas (
  jass_id    uuid        NOT NULL,
  version    integer     NOT NULL,
  reglas     jsonb       NOT NULL,
  actor_id   uuid        NOT NULL,
  creada_en  timestamptz NOT NULL,
  CONSTRAINT incidencia_reglas_pkey PRIMARY KEY (jass_id, version),
  CONSTRAINT incidencia_reglas_jass_fkey FOREIGN KEY (jass_id) REFERENCES jass (id),
  CONSTRAINT incidencia_reglas_actor_fkey FOREIGN KEY (actor_id) REFERENCES usuario (id),
  CONSTRAINT incidencia_reglas_version_check CHECK (version >= 1)
);

-- Una foto por incidencia (se sustituye). Solo se guarda sin metadatos.
CREATE TABLE incidencia_foto (
  incidencia_id  uuid        NOT NULL,
  jass_id        uuid        NOT NULL,
  tipo           text        NOT NULL,
  tamano         integer     NOT NULL,
  sha256         text        NOT NULL,
  bytes          bytea       NOT NULL,
  actor_id       uuid        NOT NULL,
  guardada_en    timestamptz NOT NULL,
  CONSTRAINT incidencia_foto_pkey PRIMARY KEY (incidencia_id),
  CONSTRAINT incidencia_foto_incidencia_fkey FOREIGN KEY (incidencia_id, jass_id) REFERENCES incidencia (id, jass_id),
  CONSTRAINT incidencia_foto_actor_fkey FOREIGN KEY (actor_id) REFERENCES usuario (id),
  CONSTRAINT incidencia_foto_tipo_check CHECK (tipo IN ('image/jpeg', 'image/png')),
  CONSTRAINT incidencia_foto_tamano_check CHECK (tamano BETWEEN 1 AND 5242880 AND tamano = octet_length(bytes)),
  CONSTRAINT incidencia_foto_sha_check CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

-- Reserva idempotente de las cargas de foto, por JASS, actor y clave.
CREATE TABLE incidencia_foto_operacion (
  jass_id         uuid        NOT NULL,
  actor_id        uuid        NOT NULL,
  clave           uuid        NOT NULL,
  incidencia_id   uuid        NOT NULL,
  payload_hash    text        NOT NULL,
  resultado       jsonb,
  creada_en       timestamptz NOT NULL,
  CONSTRAINT incidencia_foto_operacion_pkey PRIMARY KEY (jass_id, actor_id, clave),
  CONSTRAINT incidencia_foto_operacion_incidencia_fkey FOREIGN KEY (incidencia_id, jass_id) REFERENCES incidencia (id, jass_id),
  CONSTRAINT incidencia_foto_operacion_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);

-- Privilegios mínimos del rol de aplicación (migración 0005): el historial es de solo inserción.
GRANT SELECT, INSERT, UPDATE ON incidencia, incidencia_foto, incidencia_foto_operacion TO sijass_app;
GRANT SELECT, INSERT ON incidencia_evento, incidencia_reglas TO sijass_app;
REVOKE UPDATE ON incidencia_evento, incidencia_reglas FROM sijass_app;

-- Seguridad por filas: solo se ve y se escribe la JASS de la transacción.
ALTER TABLE incidencia                ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencia_evento         ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencia_reglas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencia_foto           ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencia_foto_operacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY aislamiento_jass ON incidencia
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON incidencia_evento
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON incidencia_reglas
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON incidencia_foto
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);
CREATE POLICY aislamiento_jass ON incidencia_foto_operacion
  USING (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid)
  WITH CHECK (jass_id = nullif(current_setting('app.jass_id', true), '')::uuid);

-- Down Migration
-- Orden inverso al de creación. Solo para bases desechables: con datos reales, respaldar antes.

DROP POLICY aislamiento_jass ON incidencia_foto_operacion;
DROP POLICY aislamiento_jass ON incidencia_foto;
DROP POLICY aislamiento_jass ON incidencia_reglas;
DROP POLICY aislamiento_jass ON incidencia_evento;
DROP POLICY aislamiento_jass ON incidencia;
REVOKE SELECT, INSERT ON incidencia_evento, incidencia_reglas FROM sijass_app;
REVOKE SELECT, INSERT, UPDATE ON incidencia, incidencia_foto, incidencia_foto_operacion FROM sijass_app;
DROP TABLE incidencia_foto_operacion;
DROP TABLE incidencia_foto;
DROP TABLE incidencia_reglas;
DROP TRIGGER incidencia_evento_sin_truncate ON incidencia_evento;
DROP TRIGGER incidencia_evento_solo_insercion ON incidencia_evento;
DROP FUNCTION incidencia_evento_inmutable();
DROP TABLE incidencia_evento;
DROP TABLE incidencia;
