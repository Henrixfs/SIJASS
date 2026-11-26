import { exigirPermiso, type ContextoAcceso, type Rol } from '../../dominio/acceso.js';
import { enmascararDocumento, validarDni } from '../../dominio/documento.js';
import { ErrorConflicto, ErrorDatoInvalido } from '../../dominio/errores.js';
import { esUuid } from '../../dominio/padron.js';
import {
  aplicarClaveTemporal,
  auditar,
  prepararClaveTemporal,
  recursoAjeno,
  validarNombrePersona,
  type DependenciasAcceso,
} from './comun.js';

/** Roles que el Consejo puede crear: Tesorería y Operador (spec `gestion-de-accesos`). */
const ROLES_DEL_EQUIPO: readonly Rol[] = ['tesorero', 'operador'];

export interface FilaEquipo {
  readonly usuarioId: string;
  readonly nombre: string;
  /** Enmascarado: solo los 3 últimos dígitos. */
  readonly documento: string;
  readonly rol: Rol;
  readonly estado: 'activo' | 'inactivo';
}

export interface AccesoCreado {
  readonly usuarioId: string;
  /** Visible una sola vez: solo se devuelve en la respuesta que la genera. */
  readonly claveTemporal: string;
}

/** Equipo de la JASS: lo ve y lo gestiona solo el Consejo. */
export class ListarEquipo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso): Promise<FilaEquipo[]> {
    exigirPermiso(actor, 'equipo.gestionar');
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const personal = await r.membresias.listarPersonal(actor.jassId);
      return personal.map((m) => ({ usuarioId: m.usuarioId, nombre: m.nombre, documento: enmascararDocumento(m.documento) ?? '', rol: m.rol, estado: m.estado }));
    }, { jassId: actor.jassId });
  }
}

export class CrearMiembroEquipo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, comando: { nombre: unknown; documento: unknown; rol: unknown }): Promise<AccesoCreado> {
    exigirPermiso(actor, 'equipo.gestionar');
    const rol = typeof comando.rol === 'string' && (ROLES_DEL_EQUIPO as readonly string[]).includes(comando.rol) ? (comando.rol as Rol) : undefined;
    if (rol === undefined) throw new ErrorDatoInvalido('rol-invalido', 'tesorero u operador');
    const nombre = validarNombrePersona(comando.nombre);
    const documento = validarDni(comando.documento);
    const preparada = await prepararClaveTemporal(this.d);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const usuarioId = this.d.ids.nuevo();
      await r.usuarios.crear({
        id: usuarioId,
        documento,
        nombre,
        correo: null,
        hashContrasena: preparada.hash,
        estado: 'activo',
        intentosFallidos: 0,
        bloqueadoHasta: null,
        claveGenerada: true,
        debeCambiarContrasena: true,
      });
      await r.membresias.crear({ id: this.d.ids.nuevo(), usuarioId, jassId: actor.jassId, perfil: 'personal', rol, asociadoId: null, estado: 'activa' });
      // La auditoría guarda quién, a quién y qué rol; nunca la clave ni el DNI completo.
      await auditar(r, actor, { accion: 'acceso.creado', recurso: 'usuario', recursoId: usuarioId, detalle: { perfil: 'personal', rol } }, ahora);
      return { usuarioId, claveTemporal: preparada.clave };
    }, { jassId: actor.jassId });
  }
}

/** Busca a un miembro del equipo en la JASS del actor; un usuario ajeno o inexistente se trata igual. */
async function miembroDelEquipo(r: import('../../dominio/puertos-acceso.js').RepositoriosAcceso, actor: ContextoAcceso, usuarioId: string) {
  if (!esUuid(usuarioId)) throw recursoAjeno();
  const membresia = await r.membresias.activaDeUsuario(usuarioId);
  if (!membresia || membresia.jassId !== actor.jassId || membresia.perfil !== 'personal' || membresia.rol === null) throw recursoAjeno();
  if (usuarioId === actor.usuarioId) throw new ErrorConflicto('no-puede-modificarse-a-si-mismo');
  if (membresia.rol === 'consejo') throw new ErrorConflicto('consejo-no-gestionable');
  return membresia;
}

export class DesactivarMiembroEquipo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, usuarioId: string): Promise<void> {
    exigirPermiso(actor, 'equipo.gestionar');
    const ahora = this.d.reloj.ahora();
    await this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const membresia = await miembroDelEquipo(r, actor, usuarioId);
      await r.membresias.desactivarDeUsuario(usuarioId);
      await r.usuarios.cambiarEstado(usuarioId, 'inactivo');
      await r.sesiones.revocarDeUsuario(usuarioId, ahora.toISOString());
      await auditar(r, actor, { accion: 'acceso.desactivado', recurso: 'usuario', recursoId: usuarioId, detalle: { rol: membresia.rol } }, ahora);
    }, { jassId: actor.jassId });
  }
}

export class RestablecerClaveEquipo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, usuarioId: string): Promise<AccesoCreado> {
    exigirPermiso(actor, 'equipo.gestionar');
    const preparada = await prepararClaveTemporal(this.d);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const membresia = await miembroDelEquipo(r, actor, usuarioId);
      const claveTemporal = await aplicarClaveTemporal(r, usuarioId, preparada, true, ahora);
      await auditar(r, actor, { accion: 'clave.restablecida', recurso: 'usuario', recursoId: usuarioId, detalle: { rol: membresia.rol } }, ahora);
      return { usuarioId, claveTemporal };
    }, { jassId: actor.jassId });
  }
}
