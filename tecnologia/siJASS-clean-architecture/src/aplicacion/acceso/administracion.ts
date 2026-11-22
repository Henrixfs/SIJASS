import { ROLES, type Rol } from '../../dominio/acceso.js';
import { ErrorDatoInvalido } from '../../dominio/errores.js';
import { normalizarCorreo, validarContrasena, type DependenciasAcceso } from './comun.js';

function validarRol(valor: unknown): Rol {
  if (typeof valor !== 'string' || !(ROLES as readonly string[]).includes(valor)) throw new ErrorDatoInvalido('rol-invalido');
  return valor as Rol;
}

function validarNombreJass(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  if (nombre.length === 0 || nombre.length > 120) throw new ErrorDatoInvalido('nombre-invalido');
  return nombre;
}

/**
 * Alta de una JASS y de su primer usuario del consejo. Es una operación de plataforma que
 * solo se ofrece por línea de comandos (design.md D12), nunca por HTTP.
 */
export class CrearJassConConsejo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: { nombre: unknown; correo: unknown; contrasena: unknown }): Promise<{ jassId: string; usuarioId: string }> {
    const nombre = validarNombreJass(comando.nombre);
    const correo = normalizarCorreo(comando.correo);
    const hashContrasena = await this.d.contrasenas.derivar(validarContrasena(comando.contrasena));
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const jassId = this.d.ids.nuevo();
      const usuarioId = this.d.ids.nuevo();
      await r.jass.crear({ id: jassId, nombre });
      await r.usuarios.crear({ id: usuarioId, correo, hashContrasena, estado: 'activo', intentosFallidos: 0, bloqueadoHasta: null });
      await r.membresias.crear({ id: this.d.ids.nuevo(), usuarioId, jassId, perfil: 'personal', rol: 'consejo', asociadoId: null, estado: 'activa' });
      await r.auditoria.registrar({
        jassId,
        actorId: null,
        accion: 'jass.creada',
        recurso: 'jass',
        recursoId: jassId,
        detalle: { primerConsejo: usuarioId },
        origen: 'plataforma',
        creadaEn: ahora.toISOString(),
      });
      return { jassId, usuarioId };
    });
  }
}

/** Alta de una cuenta de personal en una JASS existente (operación de plataforma, solo CLI). */
export class CrearPersonal {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: { jassId: string; correo: unknown; contrasena: unknown; rol: unknown }): Promise<{ usuarioId: string }> {
    const rol = validarRol(comando.rol);
    const correo = normalizarCorreo(comando.correo);
    const hashContrasena = await this.d.contrasenas.derivar(validarContrasena(comando.contrasena));
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      if (!(await r.jass.existe(comando.jassId))) throw new ErrorDatoInvalido('jass-inexistente');
      const usuarioId = this.d.ids.nuevo();
      await r.usuarios.crear({ id: usuarioId, correo, hashContrasena, estado: 'activo', intentosFallidos: 0, bloqueadoHasta: null });
      await r.membresias.crear({ id: this.d.ids.nuevo(), usuarioId, jassId: comando.jassId, perfil: 'personal', rol, asociadoId: null, estado: 'activa' });
      // El evento lleva la JASS aunque lo origine la plataforma (sin actor de la JASS).
      await r.auditoria.registrar({
        jassId: comando.jassId,
        actorId: null,
        accion: 'acceso.creado',
        recurso: 'usuario',
        recursoId: usuarioId,
        detalle: { perfil: 'personal', rol },
        origen: 'plataforma',
        creadaEn: ahora.toISOString(),
      });
      return { usuarioId };
    });
  }
}
