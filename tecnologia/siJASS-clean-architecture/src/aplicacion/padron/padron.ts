import { exigirPermiso, type ContextoAcceso } from '../../dominio/acceso.js';
import { ErrorAccesoDenegado, ErrorConflicto } from '../../dominio/errores.js';
import {
  esUuid,
  estadoCuota,
  pendienteDeCuota,
  periodoActual,
  saldoAsociado,
  totalVigente,
  validarDocumento,
  validarImporte,
  validarNombre,
  validarPeriodo,
  type Asociado,
  type Cuota,
  type EstadoCuota,
  type Pago,
} from '../../dominio/padron.js';
import type { RepositoriosAcceso } from '../../dominio/puertos-acceso.js';
import { esDni } from '../../dominio/documento.js';
import { ErrorDatoInvalido } from '../../dominio/errores.js';
import { aplicarClaveTemporal, auditar, enJass, prepararClaveTemporal, recursoAjeno, type DependenciasAcceso } from '../acceso/comun.js';

/** Estado del acceso de un asociado, sin exponer datos de su cuenta. */
export type EstadoAcceso = 'sin-acceso' | 'activo' | 'inactivo';

export interface VistaCuota {
  readonly id: string;
  readonly periodo: string;
  readonly importeCentimos: number;
  readonly pagadoCentimos: number;
  readonly pendienteCentimos: number;
  readonly estado: EstadoCuota;
}

export interface VistaPago {
  readonly id: string;
  readonly cuotaId: string;
  readonly periodo: string;
  readonly importeCentimos: number;
  readonly pagadoEn: string;
  readonly comprobante: string;
  readonly estado: 'vigente' | 'revertido';
}

export interface EstadoDeCuenta {
  readonly asociado: { readonly id: string; readonly nombre: string; readonly documento: string; readonly estado: 'activo' | 'baja' };
  /** Solo en la consulta del personal; el portal no lo trae. */
  readonly acceso?: EstadoAcceso;
  /** Positivo cuando el asociado debe. */
  readonly saldoCentimos: number;
  readonly periodoActual: string;
  readonly cuotas: readonly VistaCuota[];
  readonly pagos: readonly VistaPago[];
}

/** Arma el estado de cuenta de un asociado de esa JASS dentro de la transacción en curso. */
export async function armarEstadoDeCuenta(
  repos: RepositoriosAcceso,
  jassId: string,
  asociado: Asociado,
  ahora: Date,
): Promise<EstadoDeCuenta> {
  const cuotas = await repos.cuotas.listarPorAsociado(jassId, asociado.id);
  const pagos = await repos.pagos.listarPorAsociado(jassId, asociado.id);
  const periodo = periodoActual(ahora);
  const periodoDe = new Map(cuotas.map((c) => [c.id, c.periodo]));
  return {
    asociado: { id: asociado.id, nombre: asociado.nombre, documento: asociado.documento, estado: asociado.estado },
    saldoCentimos: saldoAsociado(cuotas, pagos, periodo),
    periodoActual: periodo,
    cuotas: cuotas.map((c) => {
      const delaCuota = pagos.filter((p) => p.cuotaId === c.id);
      return {
        id: c.id,
        periodo: c.periodo,
        importeCentimos: c.importeCentimos,
        pagadoCentimos: totalVigente(delaCuota),
        pendienteCentimos: pendienteDeCuota(c, delaCuota),
        estado: estadoCuota(c, delaCuota),
      };
    }),
    // Del más reciente al más antiguo, que es como se lee un historial.
    pagos: [...pagos].reverse().map((p) => ({
      id: p.id,
      cuotaId: p.cuotaId,
      periodo: periodoDe.get(p.cuotaId) ?? '',
      importeCentimos: p.importeCentimos,
      pagadoEn: p.pagadoEn,
      comprobante: p.comprobante,
      estado: p.estado,
    })),
  };
}

export class RegistrarAsociado {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, comando: { nombre: unknown; documento: unknown }): Promise<Asociado> {
    exigirPermiso(actor, 'padron.escribir');
    const nombre = validarNombre(comando.nombre);
    const documento = validarDocumento(comando.documento);
    const ahora = this.d.reloj.ahora();
    const asociado: Asociado = { id: this.d.ids.nuevo(), jassId: actor.jassId, nombre, documento, estado: 'activo' };
    return enJass(this.d, actor)(async (r) => {
      await r.asociados.crear(asociado);
      await auditar(r, actor, { accion: 'asociado.registrado', recurso: 'asociado', recursoId: asociado.id }, ahora);
      return asociado;
    });
  }
}

export class DarDeBajaAsociado {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, asociadoId: string): Promise<void> {
    exigirPermiso(actor, 'padron.escribir');
    if (!esUuid(asociadoId)) throw recursoAjeno();
    const ahora = this.d.reloj.ahora();
    await enJass(this.d, actor)(async (r) => {
      const asociado = await r.asociados.buscar(actor.jassId, asociadoId);
      if (!asociado) throw recursoAjeno();
      if (asociado.estado === 'baja') return; // idempotente
      await r.asociados.darDeBaja(actor.jassId, asociadoId);
      await auditar(r, actor, { accion: 'asociado.baja', recurso: 'asociado', recursoId: asociadoId }, ahora);
    });
  }
}

export interface ResumenAsociado {
  readonly id: string;
  readonly nombre: string;
  readonly documento: string;
  readonly estado: 'activo' | 'baja';
  readonly saldoCentimos: number;
  readonly acceso: EstadoAcceso;
}

/** `activa` y con la cuenta activa es `activo`; una membresía inactiva, `inactivo`; ninguna, `sin-acceso`. */
function estadoDeAcceso(membresias: readonly { asociadoId: string | null; estado: 'activa' | 'inactiva' }[], asociadoId: string): EstadoAcceso {
  const propias = membresias.filter((m) => m.asociadoId === asociadoId);
  if (propias.length === 0) return 'sin-acceso';
  return propias.some((m) => m.estado === 'activa') ? 'activo' : 'inactivo';
}

export class ListarAsociados {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso): Promise<ResumenAsociado[]> {
    exigirPermiso(actor, 'padron.leer');
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      // Cuatro consultas por JASS, sin importar cuántos asociados haya (antes eran dos por asociado).
      const asociados = await r.asociados.listar(actor.jassId);
      const membresias = await r.membresias.listarDeAsociados(actor.jassId);
      const cuotas = await r.cuotas.listarPorJass(actor.jassId);
      const pagos = await r.pagos.listarPorJass(actor.jassId);
      const periodo = periodoActual(ahora);
      const cuotasDe = new Map<string, Cuota[]>();
      for (const c of cuotas) cuotasDe.set(c.asociadoId, [...(cuotasDe.get(c.asociadoId) ?? []), c]);
      const asociadoDeCuota = new Map(cuotas.map((c) => [c.id, c.asociadoId]));
      const pagosDe = new Map<string, Pago[]>();
      for (const p of pagos) {
        const dueno = asociadoDeCuota.get(p.cuotaId);
        if (dueno !== undefined) pagosDe.set(dueno, [...(pagosDe.get(dueno) ?? []), p]);
      }
      return asociados.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        documento: a.documento,
        estado: a.estado,
        saldoCentimos: saldoAsociado(cuotasDe.get(a.id) ?? [], pagosDe.get(a.id) ?? [], periodo),
        acceso: estadoDeAcceso(membresias, a.id),
      }));
    }, { jassId: actor.jassId });
  }
}

export class ConsultarEstadoDeCuenta {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, asociadoId: string): Promise<EstadoDeCuenta> {
    exigirPermiso(actor, 'padron.leer');
    if (!esUuid(asociadoId)) throw recursoAjeno();
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const asociado = await r.asociados.buscar(actor.jassId, asociadoId);
      if (!asociado) throw recursoAjeno();
      const cuenta = await armarEstadoDeCuenta(r, actor.jassId, asociado, ahora);
      return { ...cuenta, acceso: estadoDeAcceso(await r.membresias.listarDeAsociados(actor.jassId), asociado.id) };
    }, { jassId: actor.jassId });
  }
}

/** Portal del asociado: la identidad sale de la membresía, nunca de un parámetro (spec `portal-asociado`). */
export class ConsultarPortal {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso): Promise<EstadoDeCuenta> {
    exigirPermiso(actor, 'portal.consultar');
    if (actor.asociadoId === null) throw new ErrorAccesoDenegado('cuenta-sin-asociado');
    const asociadoId = actor.asociadoId;
    const ahora = this.d.reloj.ahora();
    return enJass(this.d, actor)(async (r) => {
      const asociado = await r.asociados.buscar(actor.jassId, asociadoId);
      if (!asociado) throw recursoAjeno();
      return armarEstadoDeCuenta(r, actor.jassId, asociado, ahora);
    });
  }
}

export interface AccesoAsociadoEntregado {
  readonly usuarioId: string;
  /** Visible una sola vez: solo se devuelve en la respuesta que la genera. */
  readonly claveTemporal: string;
}

/**
 * Crea la cuenta de acceso (perfil asociado) de un asociado de la JASS del actor. La cuenta se
 * identifica por el DNI del padrón y la clave la genera el sistema (spec `gestion-de-accesos`).
 */
export class CrearAccesoAsociado {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, asociadoId: string): Promise<AccesoAsociadoEntregado> {
    exigirPermiso(actor, 'acceso-asociado.crear');
    if (!esUuid(asociadoId)) throw recursoAjeno();
    const preparada = await prepararClaveTemporal(this.d);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const asociado = await r.asociados.buscar(actor.jassId, asociadoId);
      if (!asociado) throw recursoAjeno();
      if (asociado.estado !== 'activo') throw new ErrorConflicto('asociado-de-baja');
      if (!esDni(asociado.documento)) throw new ErrorDatoInvalido('documento-no-es-dni', 'el documento del padrón debe tener 8 dígitos');
      if ((await r.membresias.listarDeAsociados(actor.jassId)).some((m) => m.asociadoId === asociadoId && m.estado === 'activa')) {
        throw new ErrorConflicto('asociado-con-cuenta');
      }
      const usuarioId = this.d.ids.nuevo();
      await r.usuarios.crear({
        id: usuarioId,
        documento: asociado.documento,
        nombre: asociado.nombre,
        correo: null,
        hashContrasena: preparada.hash,
        estado: 'activo',
        intentosFallidos: 0,
        bloqueadoHasta: null,
        // Una familia puede conservar la clave de tres palabras: no se le obliga a cambiarla.
        claveGenerada: true,
        debeCambiarContrasena: false,
      });
      await r.membresias.crear({
        id: this.d.ids.nuevo(),
        usuarioId,
        jassId: actor.jassId,
        perfil: 'asociado',
        rol: null,
        asociadoId,
        estado: 'activa',
      });
      await auditar(r, actor, { accion: 'acceso.creado', recurso: 'usuario', recursoId: usuarioId, detalle: { asociadoId, perfil: 'asociado' } }, ahora);
      return { usuarioId, claveTemporal: preparada.clave };
    }, { jassId: actor.jassId });
  }
}

/** Restablece la clave de un asociado con acceso: clave nueva, sin bloqueo y sin sesiones previas. */
export class RestablecerClaveAsociado {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, asociadoId: string): Promise<AccesoAsociadoEntregado> {
    exigirPermiso(actor, 'acceso-asociado.restablecer');
    if (!esUuid(asociadoId)) throw recursoAjeno();
    const preparada = await prepararClaveTemporal(this.d);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const asociado = await r.asociados.buscar(actor.jassId, asociadoId);
      if (!asociado) throw recursoAjeno();
      const membresia = (await r.membresias.listarDeAsociados(actor.jassId)).find((m) => m.asociadoId === asociadoId && m.estado === 'activa');
      if (!membresia) throw new ErrorConflicto('asociado-sin-acceso');
      const claveTemporal = await aplicarClaveTemporal(r, membresia.usuarioId, preparada, false, ahora);
      await auditar(r, actor, { accion: 'clave.restablecida', recurso: 'usuario', recursoId: membresia.usuarioId, detalle: { asociadoId, perfil: 'asociado' } }, ahora);
      return { usuarioId: membresia.usuarioId, claveTemporal };
    }, { jassId: actor.jassId });
  }
}

export class GenerarCuotas {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, comando: { periodo: unknown; importeCentimos: unknown }): Promise<{ creadas: number; existentes: number }> {
    exigirPermiso(actor, 'padron.escribir');
    const periodo = validarPeriodo(comando.periodo);
    const importeCentimos = validarImporte(comando.importeCentimos);
    const ahora = this.d.reloj.ahora();
    return enJass(this.d, actor)(async (r) => {
      const activos = (await r.asociados.listar(actor.jassId)).filter((a) => a.estado === 'activo');
      let creadas = 0;
      for (const a of activos) {
        const nueva = await r.cuotas.crearSiNoExiste({ id: this.d.ids.nuevo(), jassId: actor.jassId, asociadoId: a.id, periodo, importeCentimos });
        if (nueva) creadas++;
      }
      const existentes = activos.length - creadas;
      await auditar(r, actor, { accion: 'cuotas.generadas', recurso: 'cuota', detalle: { periodo, importeCentimos, creadas, existentes } }, ahora);
      return { creadas, existentes };
    });
  }
}
