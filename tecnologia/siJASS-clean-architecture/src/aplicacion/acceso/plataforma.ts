import { exigirPermisoPlataforma, type ContextoPlataforma } from '../../dominio/acceso.js';
import { enmascararDocumento } from '../../dominio/documento.js';
import { ErrorConflicto, ErrorDatoInvalido } from '../../dominio/errores.js';
import { esUuid } from '../../dominio/padron.js';
import type { UbicacionJass } from '../../dominio/puertos-acceso.js';
import { CrearJassConConsejo, type ComandoAltaJass } from './administracion.js';
import { aplicarClaveTemporal, auditar, prepararClaveTemporal, type DependenciasAcceso } from './comun.js';
import { ORIGEN_API } from './comun.js';

export interface VistaJass {
  readonly id: string;
  readonly nombre: string;
  readonly estado: 'activa' | 'suspendida';
  readonly ubicacion: UbicacionJass;
  readonly cuentasActivas: number;
}

/**
 * Las operaciones de plataforma tocan solo datos de identidad y de JASS: nunca padrón, cuotas,
 * pagos, reservorios ni mediciones (spec `plataforma-jass`). Corren en modo de sistema porque no
 * pertenecen a ninguna JASS; las tablas de negocio no tienen escape para ese modo (design.md D11).
 */
export class ListarJass {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoPlataforma): Promise<VistaJass[]> {
    exigirPermisoPlataforma(actor, 'jass.gestionar');
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const lista = await r.jass.listar();
      return lista.map((j) => ({
        id: j.id,
        nombre: j.nombre,
        estado: j.estado,
        ubicacion: { departamento: j.departamento, provincia: j.provincia, distrito: j.distrito, centroPoblado: j.centroPoblado },
        cuentasActivas: j.cuentasActivas,
      }));
    }, { plataforma: true });
  }
}

export class CrearJassPlataforma {
  private readonly alta: CrearJassConConsejo;

  constructor(d: DependenciasAcceso) {
    this.alta = new CrearJassConConsejo(d);
  }

  async ejecutar(actor: ContextoPlataforma, comando: Omit<ComandoAltaJass, 'contrasena'>): Promise<{ jassId: string; usuarioId: string; claveTemporal: string }> {
    exigirPermisoPlataforma(actor, 'jass.gestionar');
    const r = await this.alta.ejecutar(comando, { actorId: actor.usuarioId, origen: ORIGEN_API });
    return { jassId: r.jassId, usuarioId: r.usuarioId, claveTemporal: r.claveTemporal as string };
  }
}

function jassValida(jassId: string): string {
  if (!esUuid(jassId)) throw new ErrorDatoInvalido('jass-inexistente');
  return jassId;
}

class CambiarEstadoJass {
  constructor(
    private readonly d: DependenciasAcceso,
    private readonly estado: 'activa' | 'suspendida',
    private readonly accion: string,
  ) {}

  async ejecutar(actor: ContextoPlataforma, jassId: string): Promise<void> {
    exigirPermisoPlataforma(actor, 'jass.gestionar');
    jassValida(jassId);
    const ahora = this.d.reloj.ahora();
    await this.d.unidadDeTrabajo.ejecutar(async (r) => {
      if (!(await r.jass.cambiarEstado(jassId, this.estado))) throw new ErrorDatoInvalido('jass-inexistente');
      await auditar(r, { jassId, usuarioId: actor.usuarioId }, { accion: this.accion, recurso: 'jass', recursoId: jassId }, ahora);
    }, { plataforma: true });
  }
}

/** Suspender no borra datos ni cierra sesiones: el siguiente uso de sus cuentas responde `jass-suspendida`. */
export class SuspenderJass extends CambiarEstadoJass {
  constructor(d: DependenciasAcceso) {
    super(d, 'suspendida', 'jass.suspendida');
  }
}

export class ReactivarJass extends CambiarEstadoJass {
  constructor(d: DependenciasAcceso) {
    super(d, 'activa', 'jass.reactivada');
  }
}

export class RestablecerClaveConsejo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoPlataforma, jassId: string, usuarioId?: string): Promise<{ usuarioId: string; nombre: string; documento: string; claveTemporal: string }> {
    exigirPermisoPlataforma(actor, 'jass.gestionar');
    jassValida(jassId);
    const preparada = await prepararClaveTemporal(this.d);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      if (!(await r.jass.existe(jassId))) throw new ErrorDatoInvalido('jass-inexistente');
      const consejo = (await r.membresias.listarPersonal(jassId)).filter((m) => m.rol === 'consejo' && m.estado === 'activo');
      const elegido = usuarioId === undefined ? consejo[0] : consejo.find((m) => m.usuarioId === usuarioId);
      if (!elegido) throw new ErrorConflicto('sin-consejo-activo');
      const claveTemporal = await aplicarClaveTemporal(r, elegido.usuarioId, preparada, true, ahora);
      await auditar(r, { jassId, usuarioId: actor.usuarioId }, { accion: 'clave.restablecida', recurso: 'usuario', recursoId: elegido.usuarioId, detalle: { rol: 'consejo' } }, ahora);
      return { usuarioId: elegido.usuarioId, nombre: elegido.nombre, documento: enmascararDocumento(elegido.documento) ?? '', claveTemporal };
    }, { plataforma: true });
  }
}
