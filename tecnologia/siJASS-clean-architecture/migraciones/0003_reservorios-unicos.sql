-- Up Migration
-- Reservorios con nombre acotado y único por JASS (s1c-reservorios-mediciones, design.md D5).

ALTER TABLE reservorio
  ADD CONSTRAINT reservorio_nombre_check CHECK (length(btrim(nombre)) BETWEEN 1 AND 80);

-- Único por JASS sin distinguir mayúsculas.
CREATE UNIQUE INDEX reservorio_jass_nombre_key ON reservorio (jass_id, lower(nombre));

-- Down Migration
-- Orden inverso al de creación.

DROP INDEX reservorio_jass_nombre_key;
ALTER TABLE reservorio DROP CONSTRAINT reservorio_nombre_check;
