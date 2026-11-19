import { exigirPermiso, type ContextoAcceso } from '../dominio/acceso.js';
import { validarNombreReservorio, type Reservorio } from '../dominio/reservorio.js';
import { auditar, type DependenciasAcceso } from './acceso/comun.js';

/** Alta de un reservorio en la JASS del consejo (spec `reservorios-jass`). */
export class CrearReservorio {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, comando: { nombre: unknown }): Promise<Reservorio> {
    exigirPermiso(actor, 'reservorios.crear');
    const nombre = validarNombreReservorio(comando.nombre);
    const ahora = this.d.reloj.ahora();
    const reservorio: Reservorio = { id: this.d.ids.nuevo(), jassId: actor.jassId, nombre };
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      await r.reservorios.crear(reservorio);
      await auditar(r, actor, { accion: 'reservorio.creado', recurso: 'reservorio', recursoId: reservorio.id }, ahora);
      return reservorio;
    });
  }
}

export class ListarReservorios {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso): Promise<Reservorio[]> {
    exigirPermiso(actor, 'reservorios.leer');
    return this.d.unidadDeTrabajo.ejecutar((r) => r.reservorios.listar(actor.jassId));
  }
}
