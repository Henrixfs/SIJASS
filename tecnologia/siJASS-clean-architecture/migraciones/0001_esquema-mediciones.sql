-- Up Migration
-- Esquema de mediciones e idempotencia (s1a-dominio-medicion, design.md D9).
-- Sin IF NOT EXISTS: aplicar -> revertir -> aplicar solo termina bien si la reversión
-- elimina todo lo que esta migración crea.

CREATE TABLE jass (
  id     uuid CONSTRAINT jass_pkey PRIMARY KEY,
  nombre text NOT NULL
);

CREATE TABLE reservorio (
  id      uuid NOT NULL,
  jass_id uuid NOT NULL,
  nombre  text NOT NULL,
  CONSTRAINT reservorio_pkey PRIMARY KEY (id),
  CONSTRAINT reservorio_jass_fkey FOREIGN KEY (jass_id) REFERENCES jass (id),
  -- Objetivo de la clave foránea compuesta de `medicion`: un reservorio solo se puede
  -- referenciar junto con la JASS a la que pertenece.
  CONSTRAINT reservorio_id_jass_key UNIQUE (id, jass_id)
);

-- Catálogo PROVISIONAL (roadmap §7). Debe coincidir con METODOS_MEDICION del dominio;
-- una prueba de integración lo comprueba.
CREATE TABLE metodo_medicion (
  codigo      text CONSTRAINT metodo_medicion_pkey PRIMARY KEY,
  descripcion text NOT NULL
);

INSERT INTO metodo_medicion (codigo, descripcion) VALUES
  ('comparador-dpd', 'Comparador de color con reactivo DPD'),
  ('colorimetro',    'Colorímetro');

CREATE TABLE medicion (
  jass_id        uuid        NOT NULL,
  id             uuid        NOT NULL,
  reservorio_id  uuid        NOT NULL,
  metodo         text        NOT NULL,
  -- Sin escala fija: conserva el decimal tal como lo escribe JavaScript.
  valor          numeric     NOT NULL,
  unidad         text        NOT NULL,
  tomada_en      timestamptz NOT NULL,
  registrada_en  timestamptz NOT NULL,
  registrado_por uuid        NOT NULL, -- sin clave foránea hasta s1b (tabla usuario)
  origen         text        NOT NULL,
  evidencia_id   uuid,                 -- sin clave foránea: aún no existe la tabla evidencia
  estado         text        NOT NULL DEFAULT 'vigente',
  revision       integer     NOT NULL DEFAULT 1,
  CONSTRAINT medicion_pkey PRIMARY KEY (jass_id, id),
  CONSTRAINT medicion_metodo_fkey FOREIGN KEY (metodo) REFERENCES metodo_medicion (codigo),
  CONSTRAINT medicion_reservorio_fkey FOREIGN KEY (reservorio_id, jass_id) REFERENCES reservorio (id, jass_id),
  -- En PostgreSQL 'NaN' e 'Infinity' cumplen `valor >= 0` (NaN se ordena por encima de
  -- todo número), por eso hace falta la cota superior explícita.
  CONSTRAINT medicion_valor_check CHECK (valor >= 0 AND valor < 'Infinity'),
  CONSTRAINT medicion_unidad_check CHECK (unidad = 'mg/L'),
  CONSTRAINT medicion_origen_check CHECK (origen IN ('en-linea', 'sincronizada')),
  CONSTRAINT medicion_estado_check CHECK (estado IN ('vigente', 'anulada')),
  CONSTRAINT medicion_revision_check CHECK (revision >= 1)
);

-- Sirve al listado por reservorio (recorrido inverso para el orden descendente) y a la
-- clave foránea compuesta.
CREATE INDEX medicion_jass_reservorio_tomada_idx ON medicion (jass_id, reservorio_id, tomada_en);

CREATE TABLE operacion_idempotente (
  jass_id      uuid        NOT NULL,
  operation_id uuid        NOT NULL,
  tipo         text        NOT NULL,
  payload_hash text        NOT NULL,
  resultado    jsonb,
  creada_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operacion_idempotente_pkey PRIMARY KEY (jass_id, operation_id),
  CONSTRAINT operacion_idempotente_jass_fkey FOREIGN KEY (jass_id) REFERENCES jass (id),
  CONSTRAINT operacion_idempotente_tipo_check CHECK (tipo IN ('registrar-medicion')),
  CONSTRAINT operacion_idempotente_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);

-- Down Migration
-- Orden inverso al de creación.

DROP TABLE operacion_idempotente;
DROP TABLE medicion;
DROP TABLE metodo_medicion;
DROP TABLE reservorio;
DROP TABLE jass;
