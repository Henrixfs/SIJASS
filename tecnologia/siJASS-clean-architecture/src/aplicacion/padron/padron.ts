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
  type EstadoCuota,
} from '../../dominio/padron.js';
import type { RepositoriosAcceso } from '../../dominio/puertos-acceso.js';
import { auditar, normalizarCorreo, validarContrasena, type DependenciasAcceso } from '../acceso/comun.js';

/** Un recurso que no existe y uno de otra JASS son indistinguibles (RF01). */
const recursoAjeno = () => new ErrorAccesoDenegado('recurso-ajeno');

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
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
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
    await this.d.unidadDeTrabajo.ejecutar(async (r) => {
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
}

export class ListarAsociados {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso): Promise<ResumenAsociado[]> {
    exigirPermiso(actor, 'padron.leer');
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const asociados = await r.asociados.listar(actor.jassId);
      const resultado: ResumenAsociado[] = [];
      for (const a of asociados) {
        const cuenta = await armarEstadoDeCuenta(r, actor.jassId, a, ahora);
        resultado.push({ id: a.id, nombre: a.nombre, documento: a.documento, estado: a.estado, saldoCentimos: cuenta.saldoCentimos });
      }
      return resultado;
    });
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
      return armarEstadoDeCuenta(r, actor.jassId, asociado, ahora);
    });
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
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const asociado = await r.asociados.buscar(actor.jassId, asociadoId);
      if (!asociado) throw recursoAjeno();
      return armarEstadoDeCuenta(r, actor.jassId, asociado, ahora);
    });
  }
}

/** Crea la cuenta de acceso (perfil asociado) de un asociado de la JASS del actor. */
export class CrearAccesoAsociado {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, asociadoId: string, comando: { correo: unknown; contrasena: unknown }): Promise<{ usuarioId: string }> {
    exigirPermiso(actor, 'acceso-asociado.crear');
    if (!esUuid(asociadoId)) throw recursoAjeno();
    const correo = normalizarCorreo(comando.correo);
    const contrasena = validarContrasena(comando.contrasena);
    const hashContrasena = await this.d.contrasenas.derivar(contrasena);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const asociado = await r.asociados.buscar(actor.jassId, asociadoId);
      if (!asociado) throw recursoAjeno();
      if (asociado.estado !== 'activo') throw new ErrorConflicto('asociado-de-baja');
      const usuarioId = this.d.ids.nuevo();
      await r.usuarios.crear({ id: usuarioId, correo, hashContrasena, estado: 'activo', intentosFallidos: 0, bloqueadoHasta: null });
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
      return { usuarioId };
    });
  }
}

export class GenerarCuotas {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, comando: { periodo: unknown; importeCentimos: unknown }): Promise<{ creadas: number; existentes: number }> {
    exigirPermiso(actor, 'padron.escribir');
    const periodo = validarPeriodo(comando.periodo);
    const importeCentimos = validarImporte(comando.importeCentimos);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
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
