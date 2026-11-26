import type { Membresia, Sesion, Usuario } from '../dominio/acceso.js';
import { ErrorConflicto } from '../dominio/errores.js';
import type { Asociado, Cuota, Pago, ReversaPago } from '../dominio/padron.js';
import type { Reservorio } from '../dominio/reservorio.js';
import type {
  ContextoTransaccion,
  CredencialesNuevas,
  DecoradorRepositoriosAcceso,
  EstadoJass,
  EventoAuditoria,
  Jass,
  MiembroEquipo,
  ResumenJass,
  UbicacionJass,
  RepositorioAsociados,
  RepositorioAuditoria,
  RepositorioCuotas,
  RepositorioJass,
  RepositorioMembresias,
  RepositorioPagos,
  RepositorioReservoriosJass,
  RepositorioSesiones,
  RepositorioUsuarios,
  RepositoriosAcceso,
  ResultadoCreacionPago,
  UnidadDeTrabajoAcceso,
} from '../dominio/puertos-acceso.js';

/** Estado confirmado de la base en memoria del contexto de acceso y padrón. */
export interface EstadoAcceso {
  jass: Map<string, Jass>;
  reservorios: Map<string, Reservorio>;
  usuarios: Map<string, Usuario>;
  membresias: Map<string, Membresia>;
  sesiones: Map<string, Sesion>;
  asociados: Map<string, Asociado>;
  cuotas: Map<string, Cuota>;
  pagos: Map<string, Pago>;
  reversas: Map<string, ReversaPago>;
  auditoria: EventoAuditoria[];
}

export function estadoAccesoVacio(): EstadoAcceso {
  return {
    jass: new Map(),
    reservorios: new Map(),
    usuarios: new Map(),
    membresias: new Map(),
    sesiones: new Map(),
    asociados: new Map(),
    cuotas: new Map(),
    pagos: new Map(),
    reversas: new Map(),
    auditoria: [],
  };
}

function copiar(e: EstadoAcceso): EstadoAcceso {
  return {
    jass: new Map(e.jass),
    reservorios: new Map(e.reservorios),
    usuarios: new Map(e.usuarios),
    membresias: new Map(e.membresias),
    sesiones: new Map(e.sesiones),
    asociados: new Map(e.asociados),
    cuotas: new Map(e.cuotas),
    pagos: new Map(e.pagos),
    reversas: new Map(e.reversas),
    auditoria: [...e.auditoria],
  };
}

class JassMemoria implements RepositorioJass {
  constructor(private readonly e: EstadoAcceso) {}
  async crear(jass: { id: string; nombre: string } & Partial<UbicacionJass>): Promise<void> {
    if (this.e.jass.has(jass.id)) throw new ErrorConflicto('jass-duplicada');
    const clave = (j: { nombre: string; distrito?: string | null; centroPoblado?: string | null }) =>
      [j.nombre, j.distrito ?? '', j.centroPoblado ?? ''].map((s) => s.trim().toLowerCase()).join('|');
    for (const otra of this.e.jass.values()) if (clave(otra) === clave(jass)) throw new ErrorConflicto('jass-duplicada');
    this.e.jass.set(jass.id, {
      id: jass.id,
      nombre: jass.nombre,
      estado: 'activa',
      departamento: jass.departamento ?? null,
      provincia: jass.provincia ?? null,
      distrito: jass.distrito ?? null,
      centroPoblado: jass.centroPoblado ?? null,
    });
  }
  async existe(id: string): Promise<boolean> {
    return this.e.jass.has(id);
  }
  async buscar(id: string): Promise<Jass | undefined> {
    return this.e.jass.get(id);
  }
  async listar(): Promise<ResumenJass[]> {
    return [...this.e.jass.values()]
      .map((j) => ({
        ...j,
        cuentasActivas: [...this.e.membresias.values()].filter(
          (m) => m.jassId === j.id && m.estado === 'activa' && this.e.usuarios.get(m.usuarioId)?.estado === 'activo',
        ).length,
      }))
      .sort((a, b) => {
        const x = a.nombre.toLowerCase();
        const y = b.nombre.toLowerCase();
        return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1;
      });
  }
  async cambiarEstado(id: string, estado: EstadoJass): Promise<boolean> {
    const j = this.e.jass.get(id);
    if (!j) return false;
    this.e.jass.set(id, { ...j, estado });
    return true;
  }
}

class ReservoriosJassMemoria implements RepositorioReservoriosJass {
  constructor(private readonly e: EstadoAcceso) {}
  async crear(r: Reservorio): Promise<void> {
    for (const o of this.e.reservorios.values()) {
      if (o.jassId === r.jassId && o.nombre.toLowerCase() === r.nombre.toLowerCase()) throw new ErrorConflicto('reservorio-duplicado');
    }
    this.e.reservorios.set(r.id, r);
  }
  async listar(jassId: string): Promise<Reservorio[]> {
    return [...this.e.reservorios.values()]
      .filter((r) => r.jassId === jassId)
      .sort((a, b) => {
        const x = a.nombre.toLowerCase();
        const y = b.nombre.toLowerCase();
        return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1;
      });
  }
}

class UsuariosMemoria implements RepositorioUsuarios {
  constructor(private readonly e: EstadoAcceso) {}
  async crear(usuario: Usuario): Promise<void> {
    for (const u of this.e.usuarios.values()) {
      if (usuario.documento !== null && u.documento === usuario.documento) throw new ErrorConflicto('documento-con-acceso');
      if (usuario.correo !== null && u.correo === usuario.correo) throw new ErrorConflicto('correo-duplicado');
    }
    this.e.usuarios.set(usuario.id, usuario);
  }
  async buscarPorDocumento(documento: string): Promise<Usuario | undefined> {
    return [...this.e.usuarios.values()].find((u) => u.documento === documento);
  }
  async buscarPorCorreo(correo: string): Promise<Usuario | undefined> {
    return [...this.e.usuarios.values()].find((u) => u.correo === correo);
  }
  async buscarPorId(id: string): Promise<Usuario | undefined> {
    return this.e.usuarios.get(id);
  }
  async actualizarCredenciales(id: string, nuevas: CredencialesNuevas): Promise<void> {
    const u = this.e.usuarios.get(id);
    if (!u) throw new Error(`usuario inexistente: ${id}`);
    this.e.usuarios.set(id, { ...u, ...nuevas, intentosFallidos: 0, bloqueadoHasta: null });
  }
  async cambiarEstado(id: string, estado: 'activo' | 'inactivo'): Promise<boolean> {
    const u = this.e.usuarios.get(id);
    if (!u) return false;
    this.e.usuarios.set(id, { ...u, estado });
    return true;
  }
  async asignarDocumento(id: string, documento: string, nombre: string): Promise<boolean> {
    const u = this.e.usuarios.get(id);
    if (!u) return false;
    for (const o of this.e.usuarios.values()) if (o.id !== id && o.documento === documento) throw new ErrorConflicto('documento-con-acceso');
    this.e.usuarios.set(id, { ...u, documento, nombre });
    return true;
  }
  async registrarFallo(id: string, umbral: number, bloqueadoHasta: string) {
    const u = this.e.usuarios.get(id);
    if (!u) throw new Error(`usuario inexistente: ${id}`);
    const intentosFallidos = u.intentosFallidos + 1;
    const bloqueo = intentosFallidos >= umbral ? bloqueadoHasta : u.bloqueadoHasta;
    this.e.usuarios.set(id, { ...u, intentosFallidos, bloqueadoHasta: bloqueo });
    return { intentosFallidos, bloqueadoHasta: bloqueo };
  }
  async reiniciarIntentos(id: string): Promise<void> {
    const u = this.e.usuarios.get(id);
    if (u) this.e.usuarios.set(id, { ...u, intentosFallidos: 0, bloqueadoHasta: null });
  }
}

class MembresiasMemoria implements RepositorioMembresias {
  constructor(private readonly e: EstadoAcceso) {}
  async crear(m: Membresia): Promise<void> {
    if (m.estado === 'activa') {
      for (const otra of this.e.membresias.values()) {
        if (otra.estado !== 'activa') continue;
        if (otra.usuarioId === m.usuarioId) throw new ErrorConflicto('membresia-activa-existente');
        if (m.asociadoId !== null && otra.asociadoId === m.asociadoId) throw new ErrorConflicto('asociado-con-cuenta');
      }
    }
    this.e.membresias.set(m.id, m);
  }
  async activaDeUsuario(usuarioId: string): Promise<Membresia | undefined> {
    return [...this.e.membresias.values()].find((m) => m.usuarioId === usuarioId && m.estado === 'activa');
  }
  async desactivarDeUsuario(usuarioId: string): Promise<boolean> {
    const m = await this.activaDeUsuario(usuarioId);
    if (!m) return false;
    this.e.membresias.set(m.id, { ...m, estado: 'inactiva' });
    return true;
  }
  async listarPersonal(jassId: string): Promise<MiembroEquipo[]> {
    const orden = { consejo: 0, tesorero: 1, operador: 2 } as const;
    const nombreDe = (x: MiembroEquipo) => x.nombre.toLowerCase();
    return [...this.e.membresias.values()]
      .filter((m) => m.jassId === jassId && m.perfil === 'personal' && m.rol !== null)
      .map((m): MiembroEquipo => {
        const u = this.e.usuarios.get(m.usuarioId);
        return {
          usuarioId: m.usuarioId,
          nombre: u?.nombre ?? '',
          documento: u?.documento ?? '',
          rol: m.rol as NonNullable<typeof m.rol>,
          estado: m.estado === 'activa' && u?.estado === 'activo' ? 'activo' : 'inactivo',
        };
      })
      .sort((a, b) => orden[a.rol] - orden[b.rol] || (nombreDe(a) < nombreDe(b) ? -1 : nombreDe(a) > nombreDe(b) ? 1 : a.usuarioId < b.usuarioId ? -1 : 1));
  }
  async listarDeAsociados(jassId: string): Promise<Membresia[]> {
    return [...this.e.membresias.values()].filter((m) => m.jassId === jassId && m.perfil === 'asociado');
  }
}

class SesionesMemoria implements RepositorioSesiones {
  constructor(private readonly e: EstadoAcceso) {}
  async crear(s: Sesion): Promise<void> {
    this.e.sesiones.set(s.id, s);
  }
  async buscarPorHash(refreshHash: string): Promise<Sesion | undefined> {
    return [...this.e.sesiones.values()].find((s) => s.refreshHash === refreshHash);
  }
  async marcarUsada(id: string, ahora: string): Promise<boolean> {
    const s = this.e.sesiones.get(id);
    if (!s || s.usadaEn !== null || s.revocadaEn !== null) return false;
    this.e.sesiones.set(id, { ...s, usadaEn: ahora });
    return true;
  }
  async revocarFamilia(familiaId: string, ahora: string): Promise<void> {
    for (const s of this.e.sesiones.values()) {
      if (s.familiaId === familiaId && s.revocadaEn === null) this.e.sesiones.set(s.id, { ...s, revocadaEn: ahora });
    }
  }
  async revocarDeUsuario(usuarioId: string, ahora: string): Promise<void> {
    for (const s of this.e.sesiones.values()) {
      if (s.usuarioId === usuarioId && s.revocadaEn === null) this.e.sesiones.set(s.id, { ...s, revocadaEn: ahora });
    }
  }
}

class AsociadosMemoria implements RepositorioAsociados {
  constructor(private readonly e: EstadoAcceso) {}
  async crear(a: Asociado): Promise<void> {
    for (const o of this.e.asociados.values()) {
      if (o.jassId === a.jassId && o.documento === a.documento) throw new ErrorConflicto('documento-duplicado');
    }
    this.e.asociados.set(a.id, a);
  }
  async buscar(jassId: string, id: string): Promise<Asociado | undefined> {
    const a = this.e.asociados.get(id);
    return a && a.jassId === jassId ? a : undefined;
  }
  async listar(jassId: string): Promise<Asociado[]> {
    return [...this.e.asociados.values()]
      .filter((a) => a.jassId === jassId)
      .sort((x, y) => (x.documento < y.documento ? -1 : x.documento > y.documento ? 1 : 0));
  }
  async darDeBaja(jassId: string, id: string): Promise<boolean> {
    const a = await this.buscar(jassId, id);
    if (!a) return false;
    this.e.asociados.set(id, { ...a, estado: 'baja' });
    return true;
  }
}

class CuotasMemoria implements RepositorioCuotas {
  constructor(private readonly e: EstadoAcceso) {}
  async crearSiNoExiste(c: Cuota): Promise<boolean> {
    for (const o of this.e.cuotas.values()) {
      if (o.jassId === c.jassId && o.asociadoId === c.asociadoId && o.periodo === c.periodo) return false;
    }
    this.e.cuotas.set(c.id, c);
    return true;
  }
  async buscar(jassId: string, id: string): Promise<Cuota | undefined> {
    const c = this.e.cuotas.get(id);
    return c && c.jassId === jassId ? c : undefined;
  }
  // La memoria serializa las transacciones, así que el bloqueo es implícito.
  buscarBloqueando(jassId: string, id: string): Promise<Cuota | undefined> {
    return this.buscar(jassId, id);
  }
  async listarPorAsociado(jassId: string, asociadoId: string): Promise<Cuota[]> {
    return [...this.e.cuotas.values()]
      .filter((c) => c.jassId === jassId && c.asociadoId === asociadoId)
      .sort((x, y) => (x.periodo < y.periodo ? -1 : x.periodo > y.periodo ? 1 : 0));
  }
  async listarPorJass(jassId: string): Promise<Cuota[]> {
    return [...this.e.cuotas.values()]
      .filter((c) => c.jassId === jassId)
      .sort((x, y) => (x.periodo < y.periodo ? -1 : x.periodo > y.periodo ? 1 : 0));
  }
}

const porFechaYId = (a: Pago, b: Pago): number =>
  a.pagadoEn === b.pagadoEn ? (a.id < b.id ? -1 : 1) : a.pagadoEn < b.pagadoEn ? -1 : 1;

class PagosMemoria implements RepositorioPagos {
  constructor(private readonly e: EstadoAcceso) {}
  async crear(p: Pago): Promise<ResultadoCreacionPago> {
    const existente = await this.buscarPorClave(p.jassId, p.claveIdempotencia);
    if (existente) return { creado: false, existente };
    this.e.pagos.set(p.id, p);
    return { creado: true };
  }
  async buscar(jassId: string, id: string): Promise<Pago | undefined> {
    const p = this.e.pagos.get(id);
    return p && p.jassId === jassId ? p : undefined;
  }
  async buscarPorClave(jassId: string, clave: string): Promise<Pago | undefined> {
    return [...this.e.pagos.values()].find((p) => p.jassId === jassId && p.claveIdempotencia === clave);
  }
  async listarPorCuota(jassId: string, cuotaId: string): Promise<Pago[]> {
    return [...this.e.pagos.values()].filter((p) => p.jassId === jassId && p.cuotaId === cuotaId).sort(porFechaYId);
  }
  async listarPorAsociado(jassId: string, asociadoId: string): Promise<Pago[]> {
    const cuotas = new Set(
      [...this.e.cuotas.values()].filter((c) => c.jassId === jassId && c.asociadoId === asociadoId).map((c) => c.id),
    );
    return [...this.e.pagos.values()].filter((p) => p.jassId === jassId && cuotas.has(p.cuotaId)).sort(porFechaYId);
  }
  async listarPorJass(jassId: string): Promise<Pago[]> {
    return [...this.e.pagos.values()].filter((p) => p.jassId === jassId).sort(porFechaYId);
  }
  async marcarRevertido(jassId: string, id: string): Promise<boolean> {
    const p = await this.buscar(jassId, id);
    if (!p || p.estado !== 'vigente') return false;
    this.e.pagos.set(id, { ...p, estado: 'revertido' });
    return true;
  }
  async crearReversa(r: ReversaPago): Promise<void> {
    if (this.e.reversas.has(r.pagoId)) throw new ErrorConflicto('pago-ya-revertido');
    this.e.reversas.set(r.pagoId, r);
  }
  async buscarReversa(jassId: string, pagoId: string): Promise<ReversaPago | undefined> {
    const r = this.e.reversas.get(pagoId);
    return r && r.jassId === jassId ? r : undefined;
  }
}

class AuditoriaMemoria implements RepositorioAuditoria {
  constructor(private readonly e: EstadoAcceso) {}
  async registrar(evento: EventoAuditoria): Promise<void> {
    this.e.auditoria.push(Object.freeze({ ...evento, detalle: Object.freeze({ ...evento.detalle }) }));
  }
  async listarPorJass(jassId: string): Promise<EventoAuditoria[]> {
    return this.e.auditoria.filter((ev) => ev.jassId === jassId);
  }
  async listarSinJass(): Promise<EventoAuditoria[]> {
    return this.e.auditoria.filter((ev) => ev.jassId === null);
  }
}

export function repositoriosAccesoMemoria(e: EstadoAcceso): RepositoriosAcceso {
  return {
    jass: new JassMemoria(e),
    reservorios: new ReservoriosJassMemoria(e),
    usuarios: new UsuariosMemoria(e),
    membresias: new MembresiasMemoria(e),
    sesiones: new SesionesMemoria(e),
    asociados: new AsociadosMemoria(e),
    cuotas: new CuotasMemoria(e),
    pagos: new PagosMemoria(e),
    auditoria: new AuditoriaMemoria(e),
  };
}

/** Almacén compartido por todas las unidades de trabajo en memoria de una misma "base". */
export class AlmacenAccesoMemoria {
  estado: EstadoAcceso = estadoAccesoVacio();
  /** Cola que serializa las transacciones (mutex). */
  cola: Promise<unknown> = Promise.resolve();
}

/**
 * `UnidadDeTrabajoAcceso` en memoria: un mutex serializa las transacciones y cada una
 * trabaja sobre una copia del estado que solo se publica al confirmar.
 */
export class UnidadDeTrabajoAccesoMemoria implements UnidadDeTrabajoAcceso {
  constructor(
    readonly almacen: AlmacenAccesoMemoria = new AlmacenAccesoMemoria(),
    private readonly decorar?: DecoradorRepositoriosAcceso,
  ) {}

  // El contexto se ignora: la memoria aísla por filtro en cada repositorio (design.md D11).
  ejecutar<T>(trabajo: (repos: RepositoriosAcceso) => Promise<T>, contexto: ContextoTransaccion): Promise<T> {
    void contexto;
    const resultado = this.almacen.cola.then(() => this.ejecutarEnSerie(trabajo));
    this.almacen.cola = resultado.catch(() => undefined);
    return resultado;
  }

  private async ejecutarEnSerie<T>(trabajo: (repos: RepositoriosAcceso) => Promise<T>): Promise<T> {
    const copia = copiar(this.almacen.estado);
    const repos = repositoriosAccesoMemoria(copia);
    const valor = await trabajo(this.decorar ? this.decorar(repos) : repos);
    this.almacen.estado = copia;
    return valor;
  }
}
