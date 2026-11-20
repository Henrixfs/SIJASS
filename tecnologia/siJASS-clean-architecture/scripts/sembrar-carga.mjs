#!/usr/bin/env node
/**
 * Siembra datos para las pruebas de carga k6 (s1e, design.md D8): una JASS de carga con N
 * asociados, cada uno con su cuenta (`asociado<N>@carga.sijass.pe`), tres cuotas y, para uno de
 * cada tres, un pago. SOLO para entornos de prueba.
 *
 *   DATABASE_URL=… SIJASS_CLAVE_CARGA=… node scripts/sembrar-carga.mjs [N=2000]   (tras `npm run build`)
 *
 * Se deriva UNA sola vez el hash `scrypt` (con los parámetros de producción, para que el costo del
 * inicio de sesión sea el real) y se reutiliza en las N cuentas: son datos de prueba, y derivar 2.000
 * hashes distintos solo alargaría la siembra sin cambiar lo que se mide. Es idempotente.
 */
import pg from 'pg';
import { ContrasenasScrypt } from '../dist/infraestructura/seguridad/contrasenas-scrypt.js';

const n = Number(process.argv[2] ?? 2000);
const clave = process.env.SIJASS_CLAVE_CARGA;
const url = process.env.DATABASE_URL;
if (!Number.isInteger(n) || n < 1 || n > 20000) throw new Error('N debe ser un entero entre 1 y 20000');
if (!clave) throw new Error('Falta SIJASS_CLAVE_CARGA (contraseña de las cuentas de carga; se lee del entorno)');
if (!url) throw new Error('Falta DATABASE_URL');

const hash = await new ContrasenasScrypt().derivar(clave);
const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  const jass = "md5('carga-jass')::uuid";
  await cliente.query(`INSERT INTO jass (id, nombre) VALUES (${jass}, 'JASS de carga') ON CONFLICT DO NOTHING`);
  await cliente.query(
    `INSERT INTO asociado (id, jass_id, nombre, documento)
     SELECT md5('carga-asociado-' || g)::uuid, ${jass}, 'Asociado de carga ' || g, 'C' || lpad(g::text, 7, '0') FROM generate_series(1, $1) g
     ON CONFLICT DO NOTHING`, [n]);
  await cliente.query(
    `INSERT INTO usuario (id, correo, hash_contrasena)
     SELECT md5('carga-usuario-' || g)::uuid, 'asociado' || g || '@carga.sijass.pe', $2 FROM generate_series(1, $1) g
     ON CONFLICT DO NOTHING`, [n, hash]);
  await cliente.query(
    `INSERT INTO membresia (id, usuario_id, jass_id, perfil, rol, asociado_id, estado)
     SELECT md5('carga-membresia-' || g)::uuid, md5('carga-usuario-' || g)::uuid, ${jass}, 'asociado', NULL, md5('carga-asociado-' || g)::uuid, 'activa' FROM generate_series(1, $1) g
     ON CONFLICT DO NOTHING`, [n]);
  await cliente.query(
    `INSERT INTO cuota (id, jass_id, asociado_id, periodo, importe_centimos)
     SELECT md5('carga-cuota-' || g || '-' || p)::uuid, ${jass}, md5('carga-asociado-' || g)::uuid,
            to_char(date_trunc('month', now() AT TIME ZONE 'America/Lima') - (p || ' months')::interval, 'YYYY-MM'), 1500
       FROM generate_series(1, $1) g, generate_series(0, 2) p
     ON CONFLICT DO NOTHING`, [n]);
  // Un usuario de personal registra los pagos de muestra.
  await cliente.query(`INSERT INTO usuario (id, correo, hash_contrasena) VALUES (md5('carga-tesorero')::uuid, 'tesorero@carga.sijass.pe', $1) ON CONFLICT DO NOTHING`, [hash]);
  await cliente.query(
    `INSERT INTO membresia (id, usuario_id, jass_id, perfil, rol, asociado_id, estado)
     VALUES (md5('carga-membresia-tesorero')::uuid, md5('carga-tesorero')::uuid, ${jass}, 'personal', 'tesorero', NULL, 'activa') ON CONFLICT DO NOTHING`);
  await cliente.query(
    `INSERT INTO pago (id, jass_id, cuota_id, importe_centimos, pagado_en, comprobante, clave_idempotencia, payload_hash, registrado_por)
     SELECT md5('carga-pago-' || g)::uuid, ${jass}, md5('carga-cuota-' || g || '-0')::uuid, 500, now(), 'CARGA-' || g,
            md5('carga-clave-' || g)::uuid, encode(sha256(('carga' || g)::bytea), 'hex'), md5('carga-tesorero')::uuid
       FROM generate_series(1, $1) g WHERE g % 3 = 0
     ON CONFLICT DO NOTHING`, [n]);
  await cliente.query('COMMIT');
  const { rows } = await cliente.query(`SELECT (SELECT count(*) FROM usuario WHERE correo LIKE 'asociado%@carga.sijass.pe')::int AS cuentas, (SELECT count(DISTINCT hash_contrasena) FROM usuario WHERE correo LIKE '%@carga.sijass.pe')::int AS hashes`);
  console.log(`Siembra de carga lista: ${rows[0].cuentas} cuentas de asociado en la JASS de carga (${rows[0].hashes} hash compartido; solo para pruebas).`);
} catch (error) {
  await cliente.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await cliente.end();
}
