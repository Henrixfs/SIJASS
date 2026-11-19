import {
  BLOQUEO_MS,
  MAX_INTENTOS_FALLIDOS,
  VIGENCIA_ACCESO_S,
  VIGENCIA_REFRESCO_MS,
  type ContextoAcceso,
  type Perfil,
  type Rol,
} from '../../dominio/acceso.js';
import { ErrorAccesoDenegado, ErrorCuentaBloqueada, ErrorNoAutenticado } from '../../dominio/errores.js';
import { auditar, normalizarCorreo, type DependenciasAcceso } from './comun.js';

export interface SesionIniciada {
  readonly tokenAcceso: string;
  readonly tokenRefresco: string;
  readonly venceEnSegundos: number;
  readonly perfil: Perfil;
  readonly rol: Rol | null;
}

type Fallo = { readonly fallo: ErrorNoAutenticado | ErrorCuentaBloqueada | ErrorAccesoDenegado };
type Exito = { readonly sesion: SesionIniciada };

/**
 * Inicio de sesión (spec `acceso-por-perfiles`). Los fallos que deben dejar rastro (contador de
 * intentos, bloqueo, auditoría) se confirman **antes** de lanzar el error: por eso la
 * transacción devuelve el fallo en vez de lanzarlo.
 */
export class AutenticarUsuario {
  private hashFicticio: Promise<string> | undefined;

  constructor(private readonly d: DependenciasAcceso) {}

  /** Hash de relleno para que un correo desconocido cueste lo mismo que una contraseña errónea. */
  private ficticio(): Promise<string> {
    this.hashFicticio ??= this.d.contrasenas.derivar('relleno-para-igualar-tiempos');
    return this.hashFicticio;
  }

  async ejecutar(comando: { correo: unknown; contrasena: unknown }): Promise<SesionIniciada> {
    let correo: string;
    try {
      correo = normalizarCorreo(comando.correo);
    } catch {
      throw new ErrorNoAutenticado('credenciales-invalidas');
    }
    const contrasena = typeof comando.contrasena === 'string' ? comando.contrasena : '';
    const ahora = this.d.reloj.ahora();

    const usuario = await this.d.unidadDeTrabajo.ejecutar(async (r) => r.usuarios.buscarPorCorreo(correo));

    if (!usuario) {
      await this.d.contrasenas.verificar(contrasena, await this.ficticio());
      await this.d.unidadDeTrabajo.ejecutar((r) =>
        auditar(r, null, { accion: 'sesion.fallida', recurso: 'sesion', detalle: { motivo: 'cuenta-desconocida' } }, ahora),
      );
      throw new ErrorNoAutenticado('credenciales-invalidas');
    }

    if (usuario.bloqueadoHasta !== null && new Date(usuario.bloqueadoHasta).getTime() > ahora.getTime()) {
      await this.d.unidadDeTrabajo.ejecutar(async (r) => {
        const m = await r.membresias.activaDeUsuario(usuario.id);
        await auditar(r, m ? { jassId: m.jassId, usuarioId: usuario.id } : null, { accion: 'sesion.bloqueada', recurso: 'sesion', recursoId: usuario.id }, ahora);
      });
      throw new ErrorCuentaBloqueada(usuario.bloqueadoHasta);
    }

    const correcta = await this.d.contrasenas.verificar(contrasena, usuario.hashContrasena);

    const resultado: Fallo | Exito = await this.d.unidadDeTrabajo.ejecutar(async (r): Promise<Fallo | Exito> => {
      const membresia = await r.membresias.activaDeUsuario(usuario.id);
      const actorAuditoria = membresia ? { jassId: membresia.jassId, usuarioId: usuario.id } : null;

      if (!correcta || usuario.estado !== 'activo') {
        const hasta = new Date(ahora.getTime() + BLOQUEO_MS).toISOString();
        const estado = await r.usuarios.registrarFallo(usuario.id, MAX_INTENTOS_FALLIDOS, hasta);
        await auditar(r, actorAuditoria, { accion: 'sesion.fallida', recurso: 'sesion', recursoId: usuario.id, detalle: { motivo: 'credenciales' } }, ahora);
        if (estado.bloqueadoHasta !== null && estado.intentosFallidos >= MAX_INTENTOS_FALLIDOS) {
          await auditar(r, actorAuditoria, { accion: 'sesion.bloqueada', recurso: 'sesion', recursoId: usuario.id, detalle: { hasta } }, ahora);
        }
        return { fallo: new ErrorNoAutenticado('credenciales-invalidas') };
      }
      if (!membresia) {
        await auditar(r, null, { accion: 'sesion.fallida', recurso: 'sesion', recursoId: usuario.id, detalle: { motivo: 'sin-membresia' } }, ahora);
        return { fallo: new ErrorAccesoDenegado('sin-membresia') };
      }

      await r.usuarios.reiniciarIntentos(usuario.id);
      const refresco = this.d.tokens.nuevoRefresco();
      await r.sesiones.crear({
        id: this.d.ids.nuevo(),
        usuarioId: usuario.id,
        familiaId: this.d.ids.nuevo(),
        refreshHash: refresco.hash,
        expiraEn: new Date(ahora.getTime() + VIGENCIA_REFRESCO_MS).toISOString(),
        usadaEn: null,
        revocadaEn: null,
      });
      await auditar(r, actorAuditoria, { accion: 'sesion.iniciada', recurso: 'sesion', recursoId: usuario.id }, ahora);
      return {
        sesion: {
          tokenAcceso: this.d.tokens.emitirAcceso(usuario.id, ahora),
          tokenRefresco: refresco.token,
          venceEnSegundos: VIGENCIA_ACCESO_S,
          perfil: membresia.perfil,
          rol: membresia.rol,
        },
      };
    });

    if ('fallo' in resultado) throw resultado.fallo;
    return resultado.sesion;
  }
}

/** Renovación con rotación del token de refresco; reutilizar uno ya usado revoca la familia. */
export class RenovarSesion {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: { tokenRefresco: unknown }): Promise<SesionIniciada> {
    if (typeof comando.tokenRefresco !== 'string' || comando.tokenRefresco.length === 0 || comando.tokenRefresco.length > 256) {
      throw new ErrorNoAutenticado('sesion-invalida');
    }
    const hash = this.d.tokens.hashDeRefresco(comando.tokenRefresco);
    const ahora = this.d.reloj.ahora();
    const ahoraIso = ahora.toISOString();

    const resultado: Fallo | Exito = await this.d.unidadDeTrabajo.ejecutar(async (r): Promise<Fallo | Exito> => {
      const sesion = await r.sesiones.buscarPorHash(hash);
      if (!sesion || sesion.revocadaEn !== null || new Date(sesion.expiraEn).getTime() <= ahora.getTime()) {
        return { fallo: new ErrorNoAutenticado('sesion-invalida') };
      }
      const usuario = await r.usuarios.buscarPorId(sesion.usuarioId);
      const membresia = usuario ? await r.membresias.activaDeUsuario(sesion.usuarioId) : undefined;
      const actor = membresia ? { jassId: membresia.jassId, usuarioId: sesion.usuarioId } : null;

      const marcada = sesion.usadaEn === null && (await r.sesiones.marcarUsada(sesion.id, ahoraIso));
      if (!marcada) {
        // Un token ya rotado se presenta otra vez: se asume robo y se cierra toda la familia.
        await r.sesiones.revocarFamilia(sesion.familiaId, ahoraIso);
        await auditar(r, actor, { accion: 'sesion.reutilizada', recurso: 'sesion', recursoId: sesion.usuarioId }, ahora);
        return { fallo: new ErrorNoAutenticado('sesion-invalida') };
      }
      if (!usuario || usuario.estado !== 'activo' || !membresia) {
        await r.sesiones.revocarFamilia(sesion.familiaId, ahoraIso);
        return { fallo: new ErrorNoAutenticado('sesion-invalida') };
      }

      const nuevo = this.d.tokens.nuevoRefresco();
      await r.sesiones.crear({
        id: this.d.ids.nuevo(),
        usuarioId: usuario.id,
        familiaId: sesion.familiaId,
        refreshHash: nuevo.hash,
        expiraEn: new Date(ahora.getTime() + VIGENCIA_REFRESCO_MS).toISOString(),
        usadaEn: null,
        revocadaEn: null,
      });
      return {
        sesion: {
          tokenAcceso: this.d.tokens.emitirAcceso(usuario.id, ahora),
          tokenRefresco: nuevo.token,
          venceEnSegundos: VIGENCIA_ACCESO_S,
          perfil: membresia.perfil,
          rol: membresia.rol,
        },
      };
    });

    if ('fallo' in resultado) throw resultado.fallo;
    return resultado.sesion;
  }
}

/** Cierra la sesión (toda la familia del token). Es idempotente: un token desconocido no es un error. */
export class CerrarSesion {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: { tokenRefresco: unknown }): Promise<void> {
    if (typeof comando.tokenRefresco !== 'string' || comando.tokenRefresco.length === 0 || comando.tokenRefresco.length > 256) return;
    const hash = this.d.tokens.hashDeRefresco(comando.tokenRefresco);
    const ahora = this.d.reloj.ahora();
    await this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const sesion = await r.sesiones.buscarPorHash(hash);
      if (!sesion) return;
      await r.sesiones.revocarFamilia(sesion.familiaId, ahora.toISOString());
      const membresia = await r.membresias.activaDeUsuario(sesion.usuarioId);
      await auditar(r, membresia ? { jassId: membresia.jassId, usuarioId: sesion.usuarioId } : null, { accion: 'sesion.cerrada', recurso: 'sesion', recursoId: sesion.usuarioId }, ahora);
    });
  }
}

/**
 * Autoriza una solicitud: valida el token de acceso y lee la membresía **activa** de la base
 * (design.md D3). La JASS, el perfil y el rol nunca salen del token ni del cliente.
 */
export class AutorizarSolicitud {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(tokenAcceso: string | undefined): Promise<ContextoAcceso> {
    if (!tokenAcceso) throw new ErrorNoAutenticado('token-invalido');
    const claims = this.d.tokens.verificarAcceso(tokenAcceso, this.d.reloj.ahora());
    if (!claims) throw new ErrorNoAutenticado('token-invalido');
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const usuario = await r.usuarios.buscarPorId(claims.usuarioId);
      if (!usuario) throw new ErrorNoAutenticado('token-invalido');
      const membresia = usuario.estado === 'activo' ? await r.membresias.activaDeUsuario(usuario.id) : undefined;
      if (!membresia) throw new ErrorAccesoDenegado('membresia-inactiva');
      return {
        usuarioId: usuario.id,
        jassId: membresia.jassId,
        perfil: membresia.perfil,
        rol: membresia.rol,
        asociadoId: membresia.asociadoId,
      };
    });
  }
}

/** Registra `acceso.denegado` sin datos del recurso ni de la solicitud (spec `auditoria-eventos`). */
export class RegistrarAccesoDenegado {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso | null, solicitud: { metodo: string; ruta: string; motivo: string }): Promise<void> {
    const ahora = this.d.reloj.ahora();
    await this.d.unidadDeTrabajo.ejecutar((r) =>
      auditar(
        r,
        actor,
        {
          accion: 'acceso.denegado',
          recurso: 'ruta',
          recursoId: actor?.usuarioId ?? null,
          detalle: { metodo: solicitud.metodo, ruta: solicitud.ruta, motivo: solicitud.motivo },
        },
        ahora,
      ),
    );
  }
}
