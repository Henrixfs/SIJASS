import type { Membresia, Perfil, Rol, Sesion, Usuario } from '../../dominio/acceso.js';
import { ErrorConflicto } from '../../dominio/errores.js';
import type { Asociado, Cuota, Pago, ReversaPago } from '../../dominio/padron.js';
import type { Reservorio } from '../../dominio/reservorio.js';
import type {
  EventoAuditoria,
  RepositorioAsociados,
  RepositorioAuditoria,
  RepositorioCuotas,
  RepositorioJass,
  RepositorioMembresias,
  RepositorioPagos,
  RepositorioReservoriosJass,
  RepositorioSesiones,
  RepositorioUsuarios,
  ResultadoCreacionPago,
} from '../../dominio/puertos-acceso.js';
import type { Consultable } from './consultable.js';

const DUPLICADO = '23505';

/** Traduce una violación de unicidad de PostgreSQL al conflicto de dominio que le corresponde. */
async function conConflictos<T>(operacion: () => Promise<T>, porRestriccion: Readonly<Record<string, string>>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    const e = error as { code?: string; constraint?: string };
    if (e.code === DUPLICADO && e.constraint !== undefined && porRestriccion[e.constraint] !== undefined) {
      throw new ErrorConflicto(porRestriccion[e.constraint]);
    }
    throw error;
  }
}

const iso = (valor: Date | string | null): string | null => (valor === null ? null : new Date(valor).toISOString());

export class JassPostgres implements RepositorioJass {
  constructor(private readonly db: Consultable) {}
  async crear(jass: { id: string; nombre: string }): Promise<void> {
    await conConflictos(() => this.db.query('INSERT INTO jass (id, nombre) VALUES ($1, $2)', [jass.id, jass.nombre]), { jass_pkey: 'jass-duplicada' });
  }
  async existe(id: string): Promise<boolean> {
    const { rowCount } = await this.db.query('SELECT 1 FROM jass WHERE id = $1', [id]);
    return rowCount === 1;
  }
}

export class ReservoriosJassPostgres implements RepositorioReservoriosJass {
  constructor(private readonly db: Consultable) {}
  async crear(r: Reservorio): Promise<void> {
    await conConflictos(() => this.db.query('INSERT INTO reservorio (id, jass_id, nombre) VALUES ($1, $2, $3)', [r.id, r.jassId, r.nombre]), {
      reservorio_jass_nombre_key: 'reservorio-duplicado',
    });
  }
  async listar(jassId: string): Promise<Reservorio[]> {
    const { rows } = await this.db.query<{ id: string; jass_id: string; nombre: string }>(
      'SELECT id, jass_id, nombre FROM reservorio WHERE jass_id = $1 ORDER BY lower(nombre) COLLATE "C", id',
      [jassId],
    );
    return rows.map((f) => ({ id: f.id, jassId: f.jass_id, nombre: f.nombre }));
  }
}

interface FilaUsuario {
  id: string;
  correo: string;
  hash_contrasena: string;
  estado: 'activo' | 'inactivo';
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
}
const aUsuario = (f: FilaUsuario): Usuario => ({
  id: f.id,
  correo: f.correo,
  hashContrasena: f.hash_contrasena,
  estado: f.estado,
  intentosFallidos: f.intentos_fallidos,
  bloqueadoHasta: iso(f.bloqueado_hasta),
});

export class UsuariosPostgres implements RepositorioUsuarios {
  constructor(private readonly db: Consultable) {}
  async crear(u: Usuario): Promise<void> {
    await conConflictos(
      () =>
        this.db.query('INSERT INTO usuario (id, correo, hash_contrasena, estado, intentos_fallidos, bloqueado_hasta) VALUES ($1, $2, $3, $4, $5, $6)', [
          u.id, u.correo, u.hashContrasena, u.estado, u.intentosFallidos, u.bloqueadoHasta,
        ]),
      { usuario_correo_key: 'correo-duplicado' },
    );
  }
  async buscarPorCorreo(correo: string): Promise<Usuario | undefined> {
    const { rows } = await this.db.query<FilaUsuario>('SELECT * FROM usuario WHERE correo = $1', [correo]);
    return rows[0] ? aUsuario(rows[0]) : undefined;
  }
  async buscarPorId(id: string): Promise<Usuario | undefined> {
    const { rows } = await this.db.query<FilaUsuario>('SELECT * FROM usuario WHERE id = $1', [id]);
    return rows[0] ? aUsuario(rows[0]) : undefined;
  }
  async registrarFallo(id: string, umbral: number, bloqueadoHasta: string) {
    // Atómico: dos fallos concurrentes se suman y ninguno pisa el contador del otro.
    const { rows } = await this.db.query<{ intentos_fallidos: number; bloqueado_hasta: Date | null }>(
      `UPDATE usuario
          SET intentos_fallidos = intentos_fallidos + 1,
              bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2 THEN $3::timestamptz ELSE bloqueado_hasta END
        WHERE id = $1
    RETURNING intentos_fallidos, bloqueado_hasta`,
      [id, umbral, bloqueadoHasta],
    );
    if (!rows[0]) throw new Error(`usuario inexistente: ${id}`);
    return { intentosFallidos: rows[0].intentos_fallidos, bloqueadoHasta: iso(rows[0].bloqueado_hasta) };
  }
  async reiniciarIntentos(id: string): Promise<void> {
    await this.db.query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [id]);
  }
}

interface FilaMembresia {
  id: string;
  usuario_id: string;
  jass_id: string;
  perfil: Perfil;
  rol: Rol | null;
  asociado_id: string | null;
  estado: 'activa' | 'inactiva';
}
const aMembresia = (f: FilaMembresia): Membresia => ({
  id: f.id, usuarioId: f.usuario_id, jassId: f.jass_id, perfil: f.perfil, rol: f.rol, asociadoId: f.asociado_id, estado: f.estado,
});

export class MembresiasPostgres implements RepositorioMembresias {
  constructor(private readonly db: Consultable) {}
  async crear(m: Membresia): Promise<void> {
    await conConflictos(
      () =>
        this.db.query('INSERT INTO membresia (id, usuario_id, jass_id, perfil, rol, asociado_id, estado) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
          m.id, m.usuarioId, m.jassId, m.perfil, m.rol, m.asociadoId, m.estado,
        ]),
      { membresia_usuario_activa_key: 'membresia-activa-existente', membresia_asociado_activa_key: 'asociado-con-cuenta' },
    );
  }
  async activaDeUsuario(usuarioId: string): Promise<Membresia | undefined> {
    const { rows } = await this.db.query<FilaMembresia>("SELECT * FROM membresia WHERE usuario_id = $1 AND estado = 'activa'", [usuarioId]);
    return rows[0] ? aMembresia(rows[0]) : undefined;
  }
  async desactivarDeUsuario(usuarioId: string): Promise<boolean> {
    const { rowCount } = await this.db.query("UPDATE membresia SET estado = 'inactiva' WHERE usuario_id = $1 AND estado = 'activa'", [usuarioId]);
    return rowCount === 1;
  }
}

interface FilaSesion {
  id: string;
  usuario_id: string;
  familia_id: string;
  refresh_hash: string;
  expira_en: Date;
  usada_en: Date | null;
  revocada_en: Date | null;
}
const aSesion = (f: FilaSesion): Sesion => ({
  id: f.id,
  usuarioId: f.usuario_id,
  familiaId: f.familia_id,
  refreshHash: f.refresh_hash,
  expiraEn: iso(f.expira_en) as string,
  usadaEn: iso(f.usada_en),
  revocadaEn: iso(f.revocada_en),
});

export class SesionesPostgres implements RepositorioSesiones {
  constructor(private readonly db: Consultable) {}
  async crear(s: Sesion): Promise<void> {
    await this.db.query(
      'INSERT INTO sesion (id, usuario_id, familia_id, refresh_hash, expira_en, usada_en, revocada_en) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [s.id, s.usuarioId, s.familiaId, s.refreshHash, s.expiraEn, s.usadaEn, s.revocadaEn],
    );
  }
  async buscarPorHash(refreshHash: string): Promise<Sesion | undefined> {
    const { rows } = await this.db.query<FilaSesion>('SELECT * FROM sesion WHERE refresh_hash = $1', [refreshHash]);
    return rows[0] ? aSesion(rows[0]) : undefined;
  }
  async marcarUsada(id: string, ahora: string): Promise<boolean> {
    // La condición en el UPDATE hace atómica la rotación: solo una solicitud concurrente la gana.
    const { rowCount } = await this.db.query('UPDATE sesion SET usada_en = $2 WHERE id = $1 AND usada_en IS NULL AND revocada_en IS NULL', [id, ahora]);
    return rowCount === 1;
  }
  async revocarFamilia(familiaId: string, ahora: string): Promise<void> {
    await this.db.query('UPDATE sesion SET revocada_en = $2 WHERE familia_id = $1 AND revocada_en IS NULL', [familiaId, ahora]);
  }
}

interface FilaAsociado {
  id: string;
  jass_id: string;
  nombre: string;
  documento: string;
  estado: 'activo' | 'baja';
}
const aAsociado = (f: FilaAsociado): Asociado => ({ id: f.id, jassId: f.jass_id, nombre: f.nombre, documento: f.documento, estado: f.estado });

export class AsociadosPostgres implements RepositorioAsociados {
  constructor(private readonly db: Consultable) {}
  async crear(a: Asociado): Promise<void> {
    await conConflictos(
      () => this.db.query('INSERT INTO asociado (id, jass_id, nombre, documento, estado) VALUES ($1, $2, $3, $4, $5)', [a.id, a.jassId, a.nombre, a.documento, a.estado]),
      { asociado_documento_key: 'documento-duplicado' },
    );
  }
  async buscar(jassId: string, id: string): Promise<Asociado | undefined> {
    const { rows } = await this.db.query<FilaAsociado>('SELECT * FROM asociado WHERE jass_id = $1 AND id = $2', [jassId, id]);
    return rows[0] ? aAsociado(rows[0]) : undefined;
  }
  async listar(jassId: string): Promise<Asociado[]> {
    const { rows } = await this.db.query<FilaAsociado>('SELECT * FROM asociado WHERE jass_id = $1 ORDER BY documento COLLATE "C"', [jassId]);
    return rows.map(aAsociado);
  }
  async darDeBaja(jassId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query("UPDATE asociado SET estado = 'baja' WHERE jass_id = $1 AND id = $2", [jassId, id]);
    return rowCount === 1;
  }
}

interface FilaCuota {
  id: string;
  jass_id: string;
  asociado_id: string;
  periodo: string;
  importe_centimos: number;
}
const aCuota = (f: FilaCuota): Cuota => ({ id: f.id, jassId: f.jass_id, asociadoId: f.asociado_id, periodo: f.periodo, importeCentimos: f.importe_centimos });

export class CuotasPostgres implements RepositorioCuotas {
  constructor(private readonly db: Consultable) {}
  async crearSiNoExiste(c: Cuota): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `INSERT INTO cuota (id, jass_id, asociado_id, periodo, importe_centimos) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (jass_id, asociado_id, periodo) DO NOTHING`,
      [c.id, c.jassId, c.asociadoId, c.periodo, c.importeCentimos],
    );
    return rowCount === 1;
  }
  async buscar(jassId: string, id: string): Promise<Cuota | undefined> {
    const { rows } = await this.db.query<FilaCuota>('SELECT * FROM cuota WHERE jass_id = $1 AND id = $2', [jassId, id]);
    return rows[0] ? aCuota(rows[0]) : undefined;
  }
  async buscarBloqueando(jassId: string, id: string): Promise<Cuota | undefined> {
    const { rows } = await this.db.query<FilaCuota>('SELECT * FROM cuota WHERE jass_id = $1 AND id = $2 FOR UPDATE', [jassId, id]);
    return rows[0] ? aCuota(rows[0]) : undefined;
  }
  async listarPorAsociado(jassId: string, asociadoId: string): Promise<Cuota[]> {
    const { rows } = await this.db.query<FilaCuota>('SELECT * FROM cuota WHERE jass_id = $1 AND asociado_id = $2 ORDER BY periodo', [jassId, asociadoId]);
    return rows.map(aCuota);
  }
}

interface FilaPago {
  id: string;
  jass_id: string;
  cuota_id: string;
  importe_centimos: number;
  pagado_en: Date;
  comprobante: string;
  clave_idempotencia: string;
  payload_hash: string;
  estado: 'vigente' | 'revertido';
  registrado_por: string;
}
const aPago = (f: FilaPago): Pago => ({
  id: f.id,
  jassId: f.jass_id,
  cuotaId: f.cuota_id,
  importeCentimos: f.importe_centimos,
  pagadoEn: iso(f.pagado_en) as string,
  comprobante: f.comprobante,
  claveIdempotencia: f.clave_idempotencia,
  payloadHash: f.payload_hash,
  estado: f.estado,
  registradoPor: f.registrado_por,
});

const COLUMNAS_PAGO = 'p.id, p.jass_id, p.cuota_id, p.importe_centimos, p.pagado_en, p.comprobante, p.clave_idempotencia, p.payload_hash, p.estado, p.registrado_por';

export class PagosPostgres implements RepositorioPagos {
  constructor(private readonly db: Consultable) {}
  async crear(p: Pago): Promise<ResultadoCreacionPago> {
    const { rowCount } = await this.db.query(
      `INSERT INTO pago (id, jass_id, cuota_id, importe_centimos, pagado_en, comprobante, clave_idempotencia, payload_hash, estado, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (jass_id, clave_idempotencia) DO NOTHING`,
      [p.id, p.jassId, p.cuotaId, p.importeCentimos, p.pagadoEn, p.comprobante, p.claveIdempotencia, p.payloadHash, p.estado, p.registradoPor],
    );
    if (rowCount === 1) return { creado: true };
    const existente = await this.buscarPorClave(p.jassId, p.claveIdempotencia);
    if (!existente) throw new Error('el pago en conflicto no es visible; reintentar la operación');
    return { creado: false, existente };
  }
  async buscar(jassId: string, id: string): Promise<Pago | undefined> {
    const { rows } = await this.db.query<FilaPago>(`SELECT ${COLUMNAS_PAGO} FROM pago p WHERE p.jass_id = $1 AND p.id = $2`, [jassId, id]);
    return rows[0] ? aPago(rows[0]) : undefined;
  }
  async buscarPorClave(jassId: string, clave: string): Promise<Pago | undefined> {
    const { rows } = await this.db.query<FilaPago>(`SELECT ${COLUMNAS_PAGO} FROM pago p WHERE p.jass_id = $1 AND p.clave_idempotencia = $2`, [jassId, clave]);
    return rows[0] ? aPago(rows[0]) : undefined;
  }
  async listarPorCuota(jassId: string, cuotaId: string): Promise<Pago[]> {
    const { rows } = await this.db.query<FilaPago>(`SELECT ${COLUMNAS_PAGO} FROM pago p WHERE p.jass_id = $1 AND p.cuota_id = $2 ORDER BY p.pagado_en, p.id`, [jassId, cuotaId]);
    return rows.map(aPago);
  }
  async listarPorAsociado(jassId: string, asociadoId: string): Promise<Pago[]> {
    const { rows } = await this.db.query<FilaPago>(
      `SELECT ${COLUMNAS_PAGO} FROM pago p JOIN cuota c ON c.id = p.cuota_id AND c.jass_id = p.jass_id
        WHERE p.jass_id = $1 AND c.asociado_id = $2 ORDER BY p.pagado_en, p.id`,
      [jassId, asociadoId],
    );
    return rows.map(aPago);
  }
  async marcarRevertido(jassId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.db.query("UPDATE pago SET estado = 'revertido' WHERE jass_id = $1 AND id = $2 AND estado = 'vigente'", [jassId, id]);
    return rowCount === 1;
  }
  async crearReversa(r: ReversaPago): Promise<void> {
    await conConflictos(
      () => this.db.query('INSERT INTO reversa_pago (id, jass_id, pago_id, motivo, actor_id, creada_en) VALUES ($1, $2, $3, $4, $5, $6)', [r.id, r.jassId, r.pagoId, r.motivo, r.actorId, r.creadaEn]),
      { reversa_pago_pago_key: 'pago-ya-revertido' },
    );
  }
  async buscarReversa(jassId: string, pagoId: string): Promise<ReversaPago | undefined> {
    const { rows } = await this.db.query<{ id: string; jass_id: string; pago_id: string; motivo: string; actor_id: string; creada_en: Date }>(
      'SELECT * FROM reversa_pago WHERE jass_id = $1 AND pago_id = $2',
      [jassId, pagoId],
    );
    const f = rows[0];
    return f ? { id: f.id, jassId: f.jass_id, pagoId: f.pago_id, motivo: f.motivo, actorId: f.actor_id, creadaEn: iso(f.creada_en) as string } : undefined;
  }
}

interface FilaEvento {
  jass_id: string | null;
  actor_id: string | null;
  accion: string;
  recurso: string;
  recurso_id: string | null;
  detalle: Record<string, unknown>;
  origen: string;
  creada_en: Date;
}
const aEvento = (f: FilaEvento): EventoAuditoria => ({
  jassId: f.jass_id,
  actorId: f.actor_id,
  accion: f.accion,
  recurso: f.recurso,
  recursoId: f.recurso_id,
  detalle: f.detalle,
  origen: f.origen,
  creadaEn: iso(f.creada_en) as string,
});

export class AuditoriaPostgres implements RepositorioAuditoria {
  constructor(private readonly db: Consultable) {}
  async registrar(e: EventoAuditoria): Promise<void> {
    await this.db.query(
      'INSERT INTO evento_auditoria (jass_id, actor_id, accion, recurso, recurso_id, detalle, origen, creada_en) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)',
      [e.jassId, e.actorId, e.accion, e.recurso, e.recursoId, JSON.stringify(e.detalle), e.origen, e.creadaEn],
    );
  }
  async listarPorJass(jassId: string): Promise<EventoAuditoria[]> {
    const { rows } = await this.db.query<FilaEvento>('SELECT * FROM evento_auditoria WHERE jass_id = $1 ORDER BY creada_en', [jassId]);
    return rows.map(aEvento);
  }
  async listarSinJass(): Promise<EventoAuditoria[]> {
    const { rows } = await this.db.query<FilaEvento>('SELECT * FROM evento_auditoria WHERE jass_id IS NULL ORDER BY creada_en');
    return rows.map(aEvento);
  }
}
