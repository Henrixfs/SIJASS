import type {
  AlcanceReportado,
  CategoriaIncidencia,
  EstadoIncidencia,
  EventoIncidencia,
  Incidencia,
  MatrizPrioridad,
  Prioridad,
  ReglasPrioridad,
  TipoEventoIncidencia,
  TipoFoto,
} from '../../dominio/incidencia.js';
import type {
  CambiosIncidencia,
  EventoGuardado,
  FiltroIncidencias,
  FotoGuardada,
  RepositorioIncidencias,
  ReservaFoto,
  ResultadoCreacionIncidencia,
} from '../../dominio/puertos-acceso.js';
import type { Consultable } from './consultable.js';

interface FilaIncidencia {
  id: string;
  jass_id: string;
  autor_id: string;
  asociado_id: string;
  categoria: CategoriaIncidencia;
  alcance_reportado: AlcanceReportado;
  descripcion: string;
  observada_en: Date;
  ubicacion: string;
  estado: EstadoIncidencia;
  sugerencia_prioridad: Prioridad;
  sugerencia_regla: string;
  sugerencia_version: number;
  prioridad_confirmada: Prioridad | null;
  responsable_id: string | null;
  creada_en: Date;
  revision: number;
  clave_idempotencia: string;
  payload_hash: string;
  tiene_foto: boolean;
}

const COLUMNAS = `id, jass_id, autor_id, asociado_id, categoria, alcance_reportado, descripcion, observada_en, ubicacion, estado,
  sugerencia_prioridad, sugerencia_regla, sugerencia_version, prioridad_confirmada, responsable_id, creada_en, revision,
  clave_idempotencia, payload_hash, tiene_foto`;

const aIncidencia = (f: FilaIncidencia): Incidencia =>
  Object.freeze({
    id: f.id,
    jassId: f.jass_id,
    autorId: f.autor_id,
    asociadoId: f.asociado_id,
    categoria: f.categoria,
    alcanceReportado: f.alcance_reportado,
    descripcion: f.descripcion,
    observadaEn: new Date(f.observada_en).toISOString(),
    ubicacion: f.ubicacion,
    estado: f.estado,
    sugerencia: Object.freeze({ prioridad: f.sugerencia_prioridad, regla: f.sugerencia_regla, version: f.sugerencia_version }),
    prioridadConfirmada: f.prioridad_confirmada,
    responsableId: f.responsable_id,
    creadaEn: new Date(f.creada_en).toISOString(),
    revision: f.revision,
    claveIdempotencia: f.clave_idempotencia,
    payloadHash: f.payload_hash,
    tieneFoto: f.tiene_foto,
  });

interface FilaEvento {
  secuencia: string;
  id: string;
  jass_id: string;
  incidencia_id: string;
  tipo: TipoEventoIncidencia;
  actor_id: string;
  publico: boolean;
  detalle: Record<string, string | number | null>;
  creado_en: Date;
}

/**
 * Implementación PostgreSQL de `RepositorioIncidencias`. Como el resto de repositorios de acceso,
 * corre dentro de la transacción de la unidad de trabajo, con la seguridad por filas activa.
 */
export class IncidenciasPostgres implements RepositorioIncidencias {
  constructor(private readonly db: Consultable) {}

  async crear(i: Incidencia, evento: EventoIncidencia): Promise<ResultadoCreacionIncidencia> {
    // Un reintento concurrente con la misma clave espera aquí a que la primera transacción
    // confirme (y entonces no inserta) o revierta (y entonces inserta): índice único.
    const { rowCount } = await this.db.query(
      `INSERT INTO incidencia (id, jass_id, autor_id, asociado_id, categoria, alcance_reportado, descripcion, observada_en, ubicacion, estado,
         sugerencia_prioridad, sugerencia_regla, sugerencia_version, prioridad_confirmada, responsable_id, creada_en, revision,
         clave_idempotencia, payload_hash, tiene_foto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (jass_id, autor_id, clave_idempotencia) DO NOTHING`,
      [
        i.id, i.jassId, i.autorId, i.asociadoId, i.categoria, i.alcanceReportado, i.descripcion, i.observadaEn, i.ubicacion, i.estado,
        i.sugerencia.prioridad, i.sugerencia.regla, i.sugerencia.version, i.prioridadConfirmada, i.responsableId, i.creadaEn, i.revision,
        i.claveIdempotencia, i.payloadHash, i.tieneFoto,
      ],
    );
    if (rowCount === 1) {
      await this.registrarEvento(evento);
      return { creada: true };
    }
    const existente = await this.buscarPorClave(i.jassId, i.autorId, i.claveIdempotencia);
    if (!existente) throw new Error('la incidencia en conflicto no es visible; reintentar la operación');
    return { creada: false, existente };
  }

  async buscar(jassId: string, id: string): Promise<Incidencia | undefined> {
    const { rows } = await this.db.query<FilaIncidencia>(`SELECT ${COLUMNAS} FROM incidencia WHERE jass_id = $1 AND id = $2`, [jassId, id]);
    return rows[0] ? aIncidencia(rows[0]) : undefined;
  }

  async buscarPorClave(jassId: string, autorId: string, clave: string): Promise<Incidencia | undefined> {
    const { rows } = await this.db.query<FilaIncidencia>(
      `SELECT ${COLUMNAS} FROM incidencia WHERE jass_id = $1 AND autor_id = $2 AND clave_idempotencia = $3`,
      [jassId, autorId, clave],
    );
    return rows[0] ? aIncidencia(rows[0]) : undefined;
  }

  async listar(jassId: string, f: FiltroIncidencias): Promise<Incidencia[]> {
    const condiciones = ['jass_id = $1'];
    const valores: unknown[] = [jassId];
    const agregar = (sql: string, valor: unknown) => {
      valores.push(valor);
      condiciones.push(sql.replace('?', `$${valores.length}`));
    };
    if (f.autorId !== undefined) agregar('autor_id = ?', f.autorId);
    if (f.estado !== undefined) agregar('estado = ?', f.estado);
    if (f.categoria !== undefined) agregar('categoria = ?', f.categoria);
    if (f.desde !== undefined) agregar('creada_en >= ?', f.desde);
    if (f.hasta !== undefined) agregar('creada_en <= ?', f.hasta);
    if (f.despuesDe !== undefined) {
      valores.push(f.despuesDe.creadaEn, f.despuesDe.id);
      condiciones.push(`(creada_en, id) < ($${valores.length - 1}::timestamptz, $${valores.length}::uuid)`);
    }
    valores.push(f.limite);
    const { rows } = await this.db.query<FilaIncidencia>(
      `SELECT ${COLUMNAS} FROM incidencia WHERE ${condiciones.join(' AND ')} ORDER BY creada_en DESC, id DESC LIMIT $${valores.length}`,
      valores,
    );
    return rows.map(aIncidencia);
  }

  async actualizar(jassId: string, id: string, revision: number, cambios: CambiosIncidencia): Promise<Incidencia | undefined> {
    const asignaciones = ['revision = revision + 1'];
    const valores: unknown[] = [jassId, id, revision];
    const poner = (columna: string, valor: unknown) => {
      valores.push(valor);
      asignaciones.push(`${columna} = $${valores.length}`);
    };
    if (cambios.estado !== undefined) poner('estado', cambios.estado);
    if (cambios.prioridadConfirmada !== undefined) poner('prioridad_confirmada', cambios.prioridadConfirmada);
    if (cambios.responsableId !== undefined) poner('responsable_id', cambios.responsableId);
    if (cambios.tieneFoto !== undefined) poner('tiene_foto', cambios.tieneFoto);
    // La comparación de la revisión y el cambio son una sola sentencia: dos escrituras simultáneas
    // sobre la misma revisión no pueden ganar las dos.
    const { rows } = await this.db.query<FilaIncidencia>(
      `UPDATE incidencia SET ${asignaciones.join(', ')} WHERE jass_id = $1 AND id = $2 AND revision = $3 RETURNING ${COLUMNAS}`,
      valores,
    );
    return rows[0] ? aIncidencia(rows[0]) : undefined;
  }

  async registrarEvento(e: EventoIncidencia): Promise<void> {
    await this.db.query(
      `INSERT INTO incidencia_evento (id, jass_id, incidencia_id, tipo, actor_id, publico, detalle, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [e.id, e.jassId, e.incidenciaId, e.tipo, e.actorId, e.publico, JSON.stringify(e.detalle), e.creadoEn],
    );
  }

  async listarEventos(jassId: string, incidenciaId: string, o: { soloPublicos: boolean; despuesDe?: number; limite: number }): Promise<EventoGuardado[]> {
    const { rows } = await this.db.query<FilaEvento>(
      `SELECT secuencia, id, jass_id, incidencia_id, tipo, actor_id, publico, detalle, creado_en
         FROM incidencia_evento
        WHERE jass_id = $1 AND incidencia_id = $2 AND ($3::boolean = false OR publico) AND secuencia > $4
        ORDER BY secuencia LIMIT $5`,
      [jassId, incidenciaId, o.soloPublicos, o.despuesDe ?? 0, o.limite],
    );
    return rows.map((f) => Object.freeze({
      secuencia: Number(f.secuencia),
      id: f.id,
      jassId: f.jass_id,
      incidenciaId: f.incidencia_id,
      tipo: f.tipo,
      actorId: f.actor_id,
      publico: f.publico,
      detalle: Object.freeze({ ...f.detalle }),
      creadoEn: new Date(f.creado_en).toISOString(),
    }));
  }

  async reglasVigentes(jassId: string): Promise<ReglasPrioridad | undefined> {
    const { rows } = await this.db.query<{ version: number; reglas: MatrizPrioridad }>(
      'SELECT version, reglas FROM incidencia_reglas WHERE jass_id = $1 ORDER BY version DESC LIMIT 1',
      [jassId],
    );
    return rows[0] ? { version: rows[0].version, reglas: rows[0].reglas } : undefined;
  }

  async guardarReglas(jassId: string, version: number, reglas: MatrizPrioridad, actorId: string, creadaEn: string): Promise<boolean> {
    // La clave primaria (jass, versión) decide entre dos actualizaciones simultáneas de la misma versión.
    const { rowCount } = await this.db.query(
      `INSERT INTO incidencia_reglas (jass_id, version, reglas, actor_id, creada_en) VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (jass_id, version) DO NOTHING`,
      [jassId, version, JSON.stringify(reglas), actorId, creadaEn],
    );
    return rowCount === 1;
  }

  async guardarFoto(jassId: string, incidenciaId: string, foto: FotoGuardada, actorId: string, guardadaEn: string): Promise<void> {
    await this.db.query(
      `INSERT INTO incidencia_foto (incidencia_id, jass_id, tipo, tamano, sha256, bytes, actor_id, guardada_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (incidencia_id) DO UPDATE SET tipo = EXCLUDED.tipo, tamano = EXCLUDED.tamano, sha256 = EXCLUDED.sha256,
         bytes = EXCLUDED.bytes, actor_id = EXCLUDED.actor_id, guardada_en = EXCLUDED.guardada_en`,
      [incidenciaId, jassId, foto.tipo, foto.bytes.length, foto.sha256, foto.bytes, actorId, guardadaEn],
    );
  }

  async leerFoto(jassId: string, incidenciaId: string): Promise<FotoGuardada | undefined> {
    const { rows } = await this.db.query<{ tipo: TipoFoto; bytes: Buffer; sha256: string }>(
      'SELECT tipo, bytes, sha256 FROM incidencia_foto WHERE jass_id = $1 AND incidencia_id = $2',
      [jassId, incidenciaId],
    );
    return rows[0] ? { tipo: rows[0].tipo, bytes: rows[0].bytes, sha256: rows[0].sha256 } : undefined;
  }

  async reservarFoto(jassId: string, actorId: string, clave: string, incidenciaId: string, payloadHash: string, creadaEn: string): Promise<ReservaFoto> {
    const insertada = await this.db.query(
      `INSERT INTO incidencia_foto_operacion (jass_id, actor_id, clave, incidencia_id, payload_hash, creada_en)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (jass_id, actor_id, clave) DO NOTHING`,
      [jassId, actorId, clave, incidenciaId, payloadHash, creadaEn],
    );
    if (insertada.rowCount === 1) return { nueva: true };
    const { rows } = await this.db.query<{ payload_hash: string; resultado: Record<string, unknown> | null }>(
      'SELECT payload_hash, resultado FROM incidencia_foto_operacion WHERE jass_id = $1 AND actor_id = $2 AND clave = $3',
      [jassId, actorId, clave],
    );
    if (rows.length === 0 || rows[0].resultado === null) throw new Error(`reserva de foto sin resultado: ${jassId}/${clave}`);
    return { nueva: false, payloadHash: rows[0].payload_hash, resultado: Object.freeze({ ...rows[0].resultado }) };
  }

  async registrarResultadoFoto(jassId: string, actorId: string, clave: string, resultado: Readonly<Record<string, unknown>>): Promise<void> {
    const { rowCount } = await this.db.query(
      'UPDATE incidencia_foto_operacion SET resultado = $4::jsonb WHERE jass_id = $1 AND actor_id = $2 AND clave = $3',
      [jassId, actorId, clave, JSON.stringify(resultado)],
    );
    if (rowCount !== 1) throw new Error(`operación de foto no reservada: ${jassId}/${clave}`);
  }
}
