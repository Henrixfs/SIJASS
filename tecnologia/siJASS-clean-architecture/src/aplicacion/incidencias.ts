/**
 * Casos de uso de incidencias (s1f-backend-incidencias). La JASS y el actor salen siempre de la
 * membresía; cada cambio y su evento de historial y de auditoría se escriben en una transacción.
 */
import { createHash } from 'node:crypto';
import { exigirPermiso, tienePermiso, type ContextoAcceso } from '../dominio/acceso.js';
import { ErrorAccesoDenegado, ErrorConflicto, ErrorDatoInvalido, ErrorTipoNoAdmitido } from '../dominio/errores.js';
import {
  CATEGORIAS_INCIDENCIA,
  ESTADOS_INCIDENCIA,
  limpiarFoto,
  REGLAS_POR_DEFECTO,
  sugerirPrioridad,
  validarMatriz,
  validarPrioridad,
  validarRevision,
  validarTexto,
  validarTransicion,
  validarVisibilidad,
  validarReporte,
  type CategoriaIncidencia,
  type ContenidoReporte,
  type EstadoIncidencia,
  type EventoIncidencia,
  type Incidencia,
  type MatrizPrioridad,
  type TipoEventoIncidencia,
  type TipoFoto,
} from '../dominio/incidencia.js';
import { normalizarInstante } from '../dominio/instante.js';
import { esUuid } from '../dominio/padron.js';
import type { CambiosIncidencia, EventoGuardado, RepositoriosAcceso } from '../dominio/puertos-acceso.js';
import { auditar, enJass, recursoAjeno, type DependenciasAcceso } from './acceso/comun.js';

// ---------------------------------------------------------------------------
// Vistas: el asociado no ve prioridad, responsable ni notas internas.
// ---------------------------------------------------------------------------

export interface VistaIncidenciaAsociado {
  readonly id: string;
  readonly categoria: CategoriaIncidencia;
  readonly alcanceReportado: string;
  readonly descripcion: string;
  readonly observadaEn: string;
  readonly ubicacion: string;
  readonly estado: EstadoIncidencia;
  readonly creadaEn: string;
  readonly revision: number;
  readonly tieneFoto: boolean;
}

export interface VistaIncidenciaPersonal extends VistaIncidenciaAsociado {
  readonly sugerencia: { readonly prioridad: string; readonly regla: string; readonly version: number };
  readonly prioridadConfirmada: string | null;
  readonly responsableId: string | null;
  readonly reportadoPor: { readonly asociadoId: string; readonly nombre: string | null };
}

export type VistaIncidencia = VistaIncidenciaAsociado | VistaIncidenciaPersonal;

const vistaAsociado = (i: Incidencia): VistaIncidenciaAsociado => ({
  id: i.id,
  categoria: i.categoria,
  alcanceReportado: i.alcanceReportado,
  descripcion: i.descripcion,
  observadaEn: i.observadaEn,
  ubicacion: i.ubicacion,
  estado: i.estado,
  creadaEn: i.creadaEn,
  revision: i.revision,
  tieneFoto: i.tieneFoto,
});

const vistaPersonal = (i: Incidencia, nombre: string | null): VistaIncidenciaPersonal => ({
  ...vistaAsociado(i),
  sugerencia: { ...i.sugerencia },
  prioridadConfirmada: i.prioridadConfirmada,
  responsableId: i.responsableId,
  reportadoPor: { asociadoId: i.asociadoId, nombre },
});

async function vista(r: RepositoriosAcceso, actor: ContextoAcceso, i: Incidencia): Promise<VistaIncidencia> {
  if (actor.perfil === 'asociado') return vistaAsociado(i);
  const asociado = await r.asociados.buscar(actor.jassId, i.asociadoId);
  return vistaPersonal(i, asociado?.nombre ?? null);
}

export interface VistaEvento {
  readonly tipo: TipoEventoIncidencia;
  readonly detalle: Readonly<Record<string, string | number | null>>;
  readonly creadoEn: string;
  /** Solo para el personal. */
  readonly publico?: boolean;
  readonly actorId?: string;
}

const vistaEvento = (actor: ContextoAcceso, e: EventoGuardado): VistaEvento =>
  actor.perfil === 'asociado'
    ? { tipo: e.tipo, detalle: e.detalle, creadoEn: e.creadoEn }
    : { tipo: e.tipo, detalle: e.detalle, creadoEn: e.creadoEn, publico: e.publico, actorId: e.actorId };

// ---------------------------------------------------------------------------
// Utilidades comunes.
// ---------------------------------------------------------------------------

function exigirLectura(actor: ContextoAcceso): void {
  exigirPermiso(actor, actor.perfil === 'asociado' ? 'incidencias.leer-propias' : 'incidencias.leer');
}

/** Una incidencia inexistente, de otra JASS o de otro asociado responden igual (403). */
async function obtener(r: RepositoriosAcceso, actor: ContextoAcceso, id: string): Promise<Incidencia> {
  if (!esUuid(id)) throw recursoAjeno();
  const i = await r.incidencias.buscar(actor.jassId, id.toLowerCase());
  if (!i) throw recursoAjeno();
  if (actor.perfil === 'asociado' && i.autorId !== actor.usuarioId) throw recursoAjeno();
  return i;
}

function claveDe(valor: unknown): string {
  const clave = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (!esUuid(clave)) throw new ErrorDatoInvalido('clave-idempotencia-invalida', 'Idempotency-Key debe ser un UUID');
  return clave;
}

/** SHA-256 del contenido canónico del reporte (claves en orden fijo). Incluye el alcance. */
export function hashDeReporte(c: ContenidoReporte): string {
  const canonico = JSON.stringify({
    alcanceReportado: c.alcanceReportado,
    categoria: c.categoria,
    descripcion: c.descripcion,
    observadaEn: c.observadaEn,
    ubicacion: c.ubicacion,
  });
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

const codificar = (o: object) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
function decodificar(cursor: unknown): Record<string, unknown> {
  if (typeof cursor !== 'string' || cursor === '' || cursor.length > 300) throw new ErrorDatoInvalido('cursor-invalido');
  try {
    const o: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof o === 'object' && o !== null && !Array.isArray(o)) return o as Record<string, unknown>;
  } catch {
    // cae al error de abajo
  }
  throw new ErrorDatoInvalido('cursor-invalido');
}

function limiteDe(valor: unknown): number {
  if (valor === undefined || valor === '') return 20;
  const n = typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : typeof valor === 'number' ? valor : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new ErrorDatoInvalido('limite-invalido', 'de 1 a 100');
  return n;
}

function fechaDe(valor: unknown, codigo: string): string | undefined {
  if (valor === undefined || valor === '') return undefined;
  try {
    return normalizarInstante(valor);
  } catch {
    throw new ErrorDatoInvalido(codigo, 'ISO 8601 con zona horaria');
  }
}

function evento(d: DependenciasAcceso, actor: ContextoAcceso, i: Incidencia, tipo: TipoEventoIncidencia, publico: boolean, detalle: EventoIncidencia['detalle'], ahora: Date): EventoIncidencia {
  return { id: d.ids.nuevo(), jassId: actor.jassId, incidenciaId: i.id, tipo, actorId: actor.usuarioId, publico, detalle, creadoEn: ahora.toISOString() };
}

/**
 * Pasos comunes a toda modificación: permiso de gestión, incidencia visible, revisión vigente y
 * (salvo la reapertura) incidencia abierta. Aplica los cambios con la revisión como condición,
 * registra los eventos de historial y la auditoría, todo en la misma transacción.
 */
async function modificar(
  d: DependenciasAcceso,
  actor: ContextoAcceso,
  id: string,
  revisionCruda: unknown,
  decidir: (actual: Incidencia, r: RepositoriosAcceso) => Promise<{ cambios: CambiosIncidencia; eventos: Array<{ tipo: TipoEventoIncidencia; publico: boolean; detalle: EventoIncidencia['detalle'] }>; accion: string }>,
  admiteCerrada = false,
): Promise<VistaIncidencia> {
  exigirPermiso(actor, 'incidencias.gestionar');
  const revision = validarRevision(revisionCruda);
  const ahora = d.reloj.ahora();
  return enJass(d, actor)(async (r) => {
    const actual = await obtener(r, actor, id);
    if (actual.revision !== revision) throw new ErrorConflicto('revision-desactualizada', `vigente: ${actual.revision}`);
    if (actual.estado === 'cerrada' && !admiteCerrada) throw new ErrorConflicto('incidencia-cerrada', 'reábrala antes de modificarla');
    const { cambios, eventos, accion } = await decidir(actual, r);
    const nueva = await r.incidencias.actualizar(actor.jassId, actual.id, revision, cambios);
    if (!nueva) throw new ErrorConflicto('revision-desactualizada');
    for (const e of eventos) await r.incidencias.registrarEvento(evento(d, actor, nueva, e.tipo, e.publico, e.detalle, ahora));
    await auditar(r, actor, { accion, recurso: 'incidencia', recursoId: nueva.id, detalle: { revision: nueva.revision } }, ahora);
    return vista(r, actor, nueva);
  });
}

// ---------------------------------------------------------------------------
// Casos de uso.
// ---------------------------------------------------------------------------

export interface ResultadoReporte {
  readonly incidencia: VistaIncidencia;
  /** `true` si es el reintento de un reporte ya aceptado (misma clave y mismo contenido). */
  readonly duplicado: boolean;
}

/** Reporte de un asociado, idempotente por JASS, autor y clave. */
export class RegistrarIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, cuerpo: Readonly<Record<string, unknown>>, claveIdempotencia: unknown): Promise<ResultadoReporte> {
    exigirPermiso(actor, 'incidencias.reportar');
    if (actor.asociadoId === null) throw new ErrorAccesoDenegado('sin-asociado');
    const clave = claveDe(claveIdempotencia);
    const ahora = this.d.reloj.ahora();
    // Validar antes de tocar la base: un rechazo no reserva la clave.
    const contenido = validarReporte(cuerpo, ahora);
    const payloadHash = hashDeReporte(contenido);
    const asociadoId = actor.asociadoId;

    return enJass(this.d, actor)(async (r): Promise<ResultadoReporte> => {
      const decidir = (existente: Incidencia): ResultadoReporte => {
        if (existente.payloadHash !== payloadHash) throw new ErrorConflicto('clave-idempotencia-reutilizada');
        return { incidencia: vistaAsociado(existente), duplicado: true };
      };
      // Reintento ya confirmado: el resultado original, sin volver a evaluar las reglas.
      const previa = await r.incidencias.buscarPorClave(actor.jassId, actor.usuarioId, clave);
      if (previa) return decidir(previa);

      const reglas = (await r.incidencias.reglasVigentes(actor.jassId)) ?? REGLAS_POR_DEFECTO;
      const incidencia: Incidencia = {
        id: this.d.ids.nuevo(),
        jassId: actor.jassId,
        autorId: actor.usuarioId,
        asociadoId,
        ...contenido,
        estado: 'registrada',
        sugerencia: sugerirPrioridad(contenido.categoria, contenido.alcanceReportado, reglas),
        prioridadConfirmada: null,
        responsableId: null,
        creadaEn: ahora.toISOString(),
        revision: 1,
        claveIdempotencia: clave,
        payloadHash,
        tieneFoto: false,
      };
      const creacion = await r.incidencias.crear(incidencia, evento(this.d, actor, incidencia, 'creada', true, { estado: 'registrada' }, ahora));
      if (!creacion.creada) return decidir(creacion.existente); // otra solicitud con la misma clave ganó la carrera
      await auditar(r, actor, { accion: 'incidencia.registrada', recurso: 'incidencia', recursoId: incidencia.id, detalle: { categoria: incidencia.categoria, alcanceReportado: incidencia.alcanceReportado } }, ahora);
      return { incidencia: vistaAsociado(incidencia), duplicado: false };
    });
  }
}

export interface ConsultaListado {
  readonly desde?: unknown;
  readonly hasta?: unknown;
  readonly estado?: unknown;
  readonly categoria?: unknown;
  readonly limite?: unknown;
  readonly cursor?: unknown;
}

export class ListarIncidencias {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, q: ConsultaListado): Promise<{ incidencias: VistaIncidencia[]; siguienteCursor: string | null }> {
    exigirLectura(actor);
    const limite = limiteDe(q.limite);
    const desde = fechaDe(q.desde, 'fecha-invalida');
    const hasta = fechaDe(q.hasta, 'fecha-invalida');
    if (q.estado !== undefined && q.estado !== '' && !(ESTADOS_INCIDENCIA as readonly unknown[]).includes(q.estado)) throw new ErrorDatoInvalido('estado-invalido');
    if (q.categoria !== undefined && q.categoria !== '' && !(CATEGORIAS_INCIDENCIA as readonly unknown[]).includes(q.categoria)) throw new ErrorDatoInvalido('categoria-invalida');
    let despuesDe: { creadaEn: string; id: string } | undefined;
    if (q.cursor !== undefined && q.cursor !== '') {
      const c = decodificar(q.cursor);
      if (typeof c.c !== 'string' || !esUuid(c.i)) throw new ErrorDatoInvalido('cursor-invalido');
      despuesDe = { creadaEn: fechaDe(c.c, 'cursor-invalido') as string, id: c.i };
    }
    return enJass(this.d, actor)(async (r) => {
      // Se filtra por permisos antes de paginar: el asociado solo pide las suyas.
      const pagina = await r.incidencias.listar(actor.jassId, {
        autorId: actor.perfil === 'asociado' ? actor.usuarioId : undefined,
        estado: q.estado ? (q.estado as EstadoIncidencia) : undefined,
        categoria: q.categoria ? (q.categoria as CategoriaIncidencia) : undefined,
        desde,
        hasta,
        despuesDe,
        limite: limite + 1,
      });
      const visibles = pagina.slice(0, limite);
      const ultima = visibles.at(-1);
      const siguienteCursor = pagina.length > limite && ultima ? codificar({ c: ultima.creadaEn, i: ultima.id }) : null;
      let nombres = new Map<string, string>();
      if (actor.perfil === 'personal' && visibles.length > 0) nombres = new Map((await r.asociados.listar(actor.jassId)).map((a) => [a.id, a.nombre]));
      return {
        incidencias: visibles.map((i) => (actor.perfil === 'asociado' ? vistaAsociado(i) : vistaPersonal(i, nombres.get(i.asociadoId) ?? null))),
        siguienteCursor,
      };
    });
  }
}

export class ConsultarIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, id: string): Promise<VistaIncidencia> {
    exigirLectura(actor);
    return enJass(this.d, actor)(async (r) => vista(r, actor, await obtener(r, actor, id)));
  }
}

export class HistorialIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, id: string, q: { limite?: unknown; cursor?: unknown }): Promise<{ eventos: VistaEvento[]; siguienteCursor: string | null }> {
    exigirLectura(actor);
    const limite = limiteDe(q.limite);
    let despuesDe: number | undefined;
    if (q.cursor !== undefined && q.cursor !== '') {
      const c = decodificar(q.cursor);
      if (typeof c.s !== 'number' || !Number.isInteger(c.s) || c.s < 0) throw new ErrorDatoInvalido('cursor-invalido');
      despuesDe = c.s;
    }
    return enJass(this.d, actor)(async (r) => {
      const i = await obtener(r, actor, id);
      const pagina = await r.incidencias.listarEventos(actor.jassId, i.id, { soloPublicos: actor.perfil === 'asociado', despuesDe, limite: limite + 1 });
      const visibles = pagina.slice(0, limite);
      const ultimo = visibles.at(-1);
      return { eventos: visibles.map((e) => vistaEvento(actor, e)), siguienteCursor: pagina.length > limite && ultimo ? codificar({ s: ultimo.secuencia }) : null };
    });
  }
}

/** Inicio de atención, cierre (con acción) y reapertura (con motivo). Todos son públicos. */
export class CambiarEstadoIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  ejecutar(actor: ContextoAcceso, id: string, c: { revision: unknown; estado: unknown; detalle: unknown }): Promise<VistaIncidencia> {
    return modificar(this.d, actor, id, c.revision, async (actual) => {
      const { estado, detalle } = validarTransicion(actual.estado, c.estado, c.detalle);
      const accion = estado === 'cerrada' ? 'incidencia.cerrada' : actual.estado === 'cerrada' ? 'incidencia.reabierta' : 'incidencia.en-atencion';
      return { cambios: { estado }, eventos: [{ tipo: 'estado', publico: true, detalle: { de: actual.estado, a: estado, detalle } }], accion };
    }, true);
  }
}

/** Confirmación o corrección humana de la prioridad sugerida (la sugerencia original se conserva). */
export class ConfirmarPrioridadIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  ejecutar(actor: ContextoAcceso, id: string, c: { revision: unknown; prioridad: unknown; motivo: unknown }): Promise<VistaIncidencia> {
    return modificar(this.d, actor, id, c.revision, async (actual) => {
      const { prioridad, motivo } = validarPrioridad(actual.sugerencia.prioridad, c.prioridad, c.motivo);
      return {
        cambios: { prioridadConfirmada: prioridad },
        eventos: [{ tipo: 'prioridad', publico: false, detalle: { sugerida: actual.sugerencia.prioridad, confirmada: prioridad, motivo } }],
        accion: 'incidencia.prioridad',
      };
    });
  }
}

/** Asigna (o con `null` quita) un responsable: personal con cuenta y membresía activas de la JASS. */
export class AsignarResponsableIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  ejecutar(actor: ContextoAcceso, id: string, c: { revision: unknown; responsableId: unknown }): Promise<VistaIncidencia> {
    return modificar(this.d, actor, id, c.revision, async (actual, r) => {
      let responsableId: string | null = null;
      if (c.responsableId !== null) {
        if (!esUuid(c.responsableId)) throw new ErrorDatoInvalido('responsable-invalido');
        responsableId = c.responsableId.toLowerCase();
        const membresia = await r.membresias.activaDeUsuario(responsableId);
        const usuario = await r.usuarios.buscarPorId(responsableId);
        const valido = membresia !== undefined && membresia.jassId === actor.jassId && membresia.perfil === 'personal' && usuario?.estado === 'activo';
        if (!valido) throw new ErrorDatoInvalido('responsable-invalido', 'debe ser personal activo de la JASS');
      }
      return {
        cambios: { responsableId },
        eventos: [{ tipo: 'responsable', publico: false, detalle: { anterior: actual.responsableId, responsable: responsableId } }],
        accion: 'incidencia.responsable',
      };
    });
  }
}

/** Acción realizada: pública (la familia la ve) o interna (solo el personal). */
export class RegistrarAccionIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  ejecutar(actor: ContextoAcceso, id: string, c: { revision: unknown; descripcion: unknown; visibilidad: unknown }): Promise<VistaIncidencia> {
    return modificar(this.d, actor, id, c.revision, async () => {
      const descripcion = validarTexto(c.descripcion, 'descripcion-invalida', 2000);
      const visibilidad = validarVisibilidad(c.visibilidad);
      return { cambios: {}, eventos: [{ tipo: 'accion', publico: visibilidad === 'publica', detalle: { descripcion } }], accion: 'incidencia.accion' };
    });
  }
}

export interface ResultadoFoto {
  readonly incidenciaId: string;
  readonly tipo: TipoFoto;
  readonly tamano: number;
  readonly sha256: string;
  readonly revision: number;
}

/** Revisión de la cabecera `If-Match` (`3`, `"3"` o `W/"3"`). */
function revisionDeIfMatch(valor: unknown): number {
  const texto = typeof valor === 'string' ? valor.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1') : '';
  if (!/^\d+$/.test(texto)) throw new ErrorDatoInvalido('revision-invalida', 'If-Match debe llevar la revisión vigente');
  return validarRevision(Number(texto));
}

/** Carga o sustitución de la foto: el autor, Consejo u Operación. Idempotente por clave. */
export class SubirFotoIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, id: string, contenido: unknown, tipoDeclarado: string | undefined, claveIdempotencia: unknown, ifMatch: unknown): Promise<{ resultado: ResultadoFoto; duplicado: boolean }> {
    const gestiona = tienePermiso(actor, 'incidencias.gestionar');
    if (!gestiona) exigirPermiso(actor, 'incidencias.reportar');
    const clave = claveDe(claveIdempotencia);
    const revision = revisionDeIfMatch(ifMatch);
    if (!Buffer.isBuffer(contenido)) throw new ErrorTipoNoAdmitido();
    // Se valida y limpia antes de tocar la base: un archivo inválido no reserva la clave.
    const foto = limpiarFoto(contenido, tipoDeclarado);
    const payloadHash = createHash('sha256').update(contenido).digest('hex');
    const sha256 = createHash('sha256').update(foto.bytes).digest('hex');
    const ahora = this.d.reloj.ahora();

    return enJass(this.d, actor)(async (r) => {
      const actual = await obtener(r, actor, id);
      const reserva = await r.incidencias.reservarFoto(actor.jassId, actor.usuarioId, clave, actual.id, payloadHash, ahora.toISOString());
      if (!reserva.nueva) {
        if (reserva.payloadHash !== payloadHash) throw new ErrorConflicto('clave-idempotencia-reutilizada');
        return { resultado: reserva.resultado as unknown as ResultadoFoto, duplicado: true };
      }
      if (actual.estado === 'cerrada') throw new ErrorConflicto('incidencia-cerrada', 'reábrala antes de modificarla');
      if (actual.revision !== revision) throw new ErrorConflicto('revision-desactualizada', `vigente: ${actual.revision}`);
      await r.incidencias.guardarFoto(actor.jassId, actual.id, { tipo: foto.tipo, bytes: foto.bytes, sha256 }, actor.usuarioId, ahora.toISOString());
      const nueva = await r.incidencias.actualizar(actor.jassId, actual.id, revision, { tieneFoto: true });
      if (!nueva) throw new ErrorConflicto('revision-desactualizada');
      await r.incidencias.registrarEvento(evento(this.d, actor, nueva, 'foto', false, { tipo: foto.tipo, tamano: foto.bytes.length, sustituida: actual.tieneFoto ? 'si' : 'no' }, ahora));
      await auditar(r, actor, { accion: 'incidencia.foto', recurso: 'incidencia', recursoId: nueva.id, detalle: { tipo: foto.tipo, tamano: foto.bytes.length } }, ahora);
      const resultado: ResultadoFoto = { incidenciaId: nueva.id, tipo: foto.tipo, tamano: foto.bytes.length, sha256, revision: nueva.revision };
      await r.incidencias.registrarResultadoFoto(actor.jassId, actor.usuarioId, clave, resultado as unknown as Record<string, unknown>);
      return { resultado, duplicado: false };
    });
  }
}

/** Lectura protegida con los mismos permisos que el reporte; `undefined` si no tiene foto. */
export class LeerFotoIncidencia {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, id: string): Promise<{ tipo: TipoFoto; bytes: Buffer } | undefined> {
    exigirLectura(actor);
    return enJass(this.d, actor)(async (r) => {
      const i = await obtener(r, actor, id);
      const foto = await r.incidencias.leerFoto(actor.jassId, i.id);
      return foto ? { tipo: foto.tipo, bytes: foto.bytes } : undefined;
    });
  }
}

export class ConsultarReglasPrioridad {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso): Promise<{ version: number; reglas: MatrizPrioridad }> {
    exigirPermiso(actor, 'incidencias.reglas.leer');
    return enJass(this.d, actor)(async (r) => (await r.incidencias.reglasVigentes(actor.jassId)) ?? REGLAS_POR_DEFECTO);
  }
}

/** Sustituye la matriz completa; la versión enviada debe ser la vigente (control optimista). */
export class ActualizarReglasPrioridad {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, c: { version: unknown; reglas: unknown }): Promise<{ version: number; reglas: MatrizPrioridad }> {
    exigirPermiso(actor, 'incidencias.reglas.modificar');
    if (typeof c.version !== 'number' || !Number.isInteger(c.version) || c.version < 0) throw new ErrorDatoInvalido('version-invalida');
    const version = c.version;
    const reglas = validarMatriz(c.reglas);
    const ahora = this.d.reloj.ahora();
    return enJass(this.d, actor)(async (r) => {
      const vigente = (await r.incidencias.reglasVigentes(actor.jassId)) ?? REGLAS_POR_DEFECTO;
      if (vigente.version !== version) throw new ErrorConflicto('version-desactualizada', `vigente: ${vigente.version}`);
      if (!(await r.incidencias.guardarReglas(actor.jassId, version + 1, reglas, actor.usuarioId, ahora.toISOString()))) throw new ErrorConflicto('version-desactualizada');
      await auditar(r, actor, { accion: 'incidencia.reglas', recurso: 'incidencia-reglas', recursoId: null, detalle: { version: version + 1 } }, ahora);
      return { version: version + 1, reglas };
    });
  }
}
