import {
  BLOQUEO_MS,
  MAX_INTENTOS_FALLIDOS,
  VIGENCIA_ACCESO_S,
  VIGENCIA_REFRESCO_MS,
  type ActorAutenticado,
  type ContextoAcceso,
  type ContextoPlataforma,
  type Membresia,
  type Perfil,
  type Rol,
} from '../../dominio/acceso.js';
import { enmascararDocumento, esDni } from '../../dominio/documento.js';
import {
  ErrorAccesoDenegado,
  ErrorCuentaBloqueada,
  ErrorDatoInvalido,
  ErrorJassSuspendida,
  ErrorLimiteDeOrigen,
  ErrorNoAutenticado,
  ErrorTipoDeAccesoDistinto,
} from '../../dominio/errores.js';
import { VENTANA_ORIGEN_MS } from '../../dominio/acceso.js';
import {
  auditar,
  contextoDe,
  validarContrasenaElegida,
  verificarClave,
  type DependenciasAcceso,
} from './comun.js';
import type { RepositoriosAcceso } from '../../dominio/puertos-acceso.js';

export type TipoDeAcceso = 'asociado' | 'administrador';

export interface SesionIniciada {
  readonly tokenAcceso: string;
  readonly tokenRefresco: string;
  readonly venceEnSegundos: number;
  readonly perfil: Perfil;
  readonly rol: Rol | null;
  /** La cuenta debe cambiar su clave antes de usar el sistema. */
  readonly debeCambiarContrasena: boolean;
}

type Fallo = {
  readonly fallo: ErrorNoAutenticado | ErrorCuentaBloqueada | ErrorAccesoDenegado | ErrorJassSuspendida | ErrorTipoDeAccesoDistinto;
};
/** Sesión ya guardada pero aún sin token de acceso: ese token se emite solo después de confirmar la transacción. */
type SesionPendiente = Omit<SesionIniciada, 'tokenAcceso'> & { readonly usuarioId: string; readonly ahora: Date };
type Exito = { readonly sesion: SesionPendiente };

/** `administrador` vale para el personal de una JASS y para la plataforma. */
export function tipoDeAccesoDe(perfil: Perfil): TipoDeAcceso {
  return perfil === 'asociado' ? 'asociado' : 'administrador';
}

function validarTipo(valor: unknown): TipoDeAcceso | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (valor === 'asociado' || valor === 'administrador') return valor;
  throw new ErrorDatoInvalido('tipo-de-acceso-invalido', 'asociado o administrador');
}

/** `true` si la JASS de la membresía está suspendida. La plataforma no tiene JASS. */
async function jassSuspendida(r: RepositoriosAcceso, membresia: Membresia): Promise<boolean> {
  if (membresia.jassId === null) return false;
  const jass = await r.jass.buscar(membresia.jassId);
  return jass?.estado === 'suspendida';
}

/**
 * Guarda la sesión (refresco nuevo): lo comparten inicio, renovación y cambio de clave. No emite
 * el token de acceso: si la transacción se revierte, ningún token válido debe haber salido.
 */
async function crearSesion(
  d: DependenciasAcceso,
  r: RepositoriosAcceso,
  usuario: { id: string; debeCambiarContrasena: boolean },
  membresia: Membresia,
  familiaId: string,
  ahora: Date,
): Promise<SesionPendiente> {
  const refresco = d.tokens.nuevoRefresco();
  await r.sesiones.crear({
    id: d.ids.nuevo(),
    usuarioId: usuario.id,
    familiaId,
    refreshHash: refresco.hash,
    expiraEn: new Date(ahora.getTime() + VIGENCIA_REFRESCO_MS).toISOString(),
    usadaEn: null,
    revocadaEn: null,
  });
  return {
    usuarioId: usuario.id,
    ahora,
    tokenRefresco: refresco.token,
    venceEnSegundos: VIGENCIA_ACCESO_S,
    perfil: membresia.perfil,
    rol: membresia.rol,
    debeCambiarContrasena: usuario.debeCambiarContrasena,
  };
}

/** Emite el token de acceso de una sesión ya confirmada. */
function conTokenDeAcceso(d: DependenciasAcceso, pendiente: SesionPendiente): SesionIniciada {
  const { usuarioId, ahora, ...resto } = pendiente;
  return { tokenAcceso: d.tokens.emitirAcceso(usuarioId, ahora), ...resto };
}

/**
 * Inicio de sesión con DNI y clave (spec `acceso-por-documento`). Los fallos que deben dejar
 * rastro (contador de intentos, bloqueo, auditoría) se confirman **antes** de lanzar el error:
 * por eso la transacción devuelve el fallo en vez de lanzarlo.
 */
export class AutenticarUsuario {
  private hashFicticio: Promise<string> | undefined;

  constructor(private readonly d: DependenciasAcceso) {}

  /** Hash de relleno para que un DNI desconocido cueste lo mismo que una contraseña errónea. */
  private ficticio(): Promise<string> {
    this.hashFicticio ??= this.d.contrasenas.derivar('relleno-para-igualar-tiempos');
    return this.hashFicticio;
  }

  async ejecutar(comando: { documento: unknown; contrasena: unknown; tipo?: unknown; origen?: string }): Promise<SesionIniciada> {
    const ahora = this.d.reloj.ahora();
    // El límite por origen se consulta antes de tocar la cuenta y solo cuenta los fallos de credenciales.
    if (comando.origen !== undefined && this.d.limitador.excedido(comando.origen, ahora)) {
      throw new ErrorLimiteDeOrigen(Math.ceil(VENTANA_ORIGEN_MS / 1000));
    }
    try {
      return await this.autenticar(comando, ahora);
    } catch (error) {
      if (comando.origen !== undefined && error instanceof ErrorNoAutenticado && error.codigo === 'credenciales-invalidas') {
        this.d.limitador.registrarFallo(comando.origen, ahora);
      }
      throw error;
    }
  }

  private async autenticar(comando: { documento: unknown; contrasena: unknown; tipo?: unknown }, ahora: Date): Promise<SesionIniciada> {
    // Un documento mal formado no consulta ninguna cuenta.
    const documento = typeof comando.documento === 'string' ? comando.documento.trim() : '';
    if (!esDni(documento)) throw new ErrorNoAutenticado('credenciales-invalidas');
    const tipo = validarTipo(comando.tipo);
    const contrasena = typeof comando.contrasena === 'string' ? comando.contrasena : '';

    const usuario = await this.d.unidadDeTrabajo.ejecutar(async (r) => r.usuarios.buscarPorDocumento(documento), { sistema: true });

    if (!usuario) {
      await this.d.contrasenas.verificar(contrasena, await this.ficticio());
      await this.d.unidadDeTrabajo.ejecutar(
        (r) => auditar(r, null, { accion: 'sesion.fallida', recurso: 'sesion', detalle: { motivo: 'cuenta-desconocida' } }, ahora),
        { sistema: true },
      );
      throw new ErrorNoAutenticado('credenciales-invalidas');
    }

    // Descarte temprano de una cuenta ya bloqueada, sin pagar la derivación de la clave. La decisión
    // que cuenta se toma de nuevo dentro de la transacción, con la fila de la cuenta bloqueada.
    if (usuario.bloqueadoHasta !== null && new Date(usuario.bloqueadoHasta).getTime() > ahora.getTime()) {
      await this.d.unidadDeTrabajo.ejecutar(async (r) => {
        const m = await r.membresias.activaDeUsuario(usuario.id);
        await auditar(r, m ? { jassId: m.jassId, usuarioId: usuario.id } : null, { accion: 'sesion.bloqueada', recurso: 'sesion', recursoId: usuario.id }, ahora);
      }, { sistema: true });
      throw new ErrorCuentaBloqueada(usuario.bloqueadoHasta);
    }

    const correcta = await verificarClave(this.d, usuario, contrasena);

    const resultado: Fallo | Exito = await this.d.unidadDeTrabajo.ejecutar(async (r): Promise<Fallo | Exito> => {
      const actual = await r.usuarios.buscarPorIdBloqueando(usuario.id);
      const ahora = this.d.reloj.ahora();
      if (!actual) {
        await auditar(r, null, { accion: 'sesion.fallida', recurso: 'sesion', detalle: { motivo: 'cuenta-desconocida' } }, ahora);
        return { fallo: new ErrorNoAutenticado('credenciales-invalidas') };
      }
      const membresia = await r.membresias.activaDeUsuario(actual.id);
      const actorAuditoria = membresia ? { jassId: membresia.jassId, usuarioId: actual.id } : null;
      if (actual.bloqueadoHasta !== null && new Date(actual.bloqueadoHasta).getTime() > ahora.getTime()) {
        await auditar(r, actorAuditoria, { accion: 'sesion.bloqueada', recurso: 'sesion', recursoId: actual.id }, ahora);
        return { fallo: new ErrorCuentaBloqueada(actual.bloqueadoHasta) };
      }
      if (actual.hashContrasena !== usuario.hashContrasena) {
        await auditar(r, actorAuditoria, { accion: 'sesion.fallida', recurso: 'sesion', recursoId: actual.id, detalle: { motivo: 'credenciales' } }, ahora);
        return { fallo: new ErrorNoAutenticado('credenciales-invalidas') };
      }
      if (actual.bloqueadoHasta !== null) await r.usuarios.reiniciarIntentos(actual.id);

      if (!correcta || actual.estado !== 'activo') {
        const hasta = new Date(ahora.getTime() + BLOQUEO_MS).toISOString();
        const estado = await r.usuarios.registrarFallo(actual.id, MAX_INTENTOS_FALLIDOS, hasta);
        await auditar(r, actorAuditoria, { accion: 'sesion.fallida', recurso: 'sesion', recursoId: actual.id, detalle: { motivo: 'credenciales' } }, ahora);
        if (estado.bloqueadoHasta !== null && estado.intentosFallidos >= MAX_INTENTOS_FALLIDOS) {
          await auditar(r, actorAuditoria, { accion: 'sesion.bloqueada', recurso: 'sesion', recursoId: actual.id, detalle: { hasta } }, ahora);
        }
        return { fallo: new ErrorNoAutenticado('credenciales-invalidas') };
      }
      if (!membresia) {
        await auditar(r, null, { accion: 'sesion.fallida', recurso: 'sesion', recursoId: actual.id, detalle: { motivo: 'sin-membresia' } }, ahora);
        return { fallo: new ErrorAccesoDenegado('sin-membresia') };
      }
      if (await jassSuspendida(r, membresia)) {
        await auditar(r, actorAuditoria, { accion: 'sesion.fallida', recurso: 'sesion', recursoId: usuario.id, detalle: { motivo: 'jass-suspendida' } }, ahora);
        return { fallo: new ErrorJassSuspendida() };
      }
      // Credenciales correctas: el tipo elegido solo es una guía; manda la membresía (design.md D3).
      const tipoReal = tipoDeAccesoDe(membresia.perfil);
      if (tipo !== undefined && tipo !== tipoReal) {
        await auditar(r, actorAuditoria, { accion: 'sesion.tipo-distinto', recurso: 'sesion', recursoId: usuario.id, detalle: { elegido: tipo, real: tipoReal } }, ahora);
        return { fallo: new ErrorTipoDeAccesoDistinto(tipoReal) };
      }

      await r.usuarios.reiniciarIntentos(actual.id);
      const sesion = await crearSesion(this.d, r, actual, membresia, this.d.ids.nuevo(), ahora);
      await auditar(r, actorAuditoria, { accion: 'sesion.iniciada', recurso: 'sesion', recursoId: actual.id }, ahora);
      return { sesion };
    }, { sistema: true });

    if ('fallo' in resultado) throw resultado.fallo;
    return conTokenDeAcceso(this.d, resultado.sesion);
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
      const presentada = await r.sesiones.buscarPorHash(hash);
      if (!presentada) return { fallo: new ErrorNoAutenticado('sesion-invalida') };
      // Toda escritura sobre las sesiones de un usuario bloquea antes su fila (como el cambio de
      // clave o la desactivación). Sin esto, renovaciones simultáneas del mismo refresco tomaban
      // filas de `sesion` y de `usuario` en órdenes distintos y PostgreSQL abortaba por deadlock.
      const usuario = await r.usuarios.buscarPorIdBloqueando(presentada.usuarioId);
      // Se relee tras el bloqueo para ver lo que confirmó la renovación que llegó primero.
      const sesion = await r.sesiones.buscarPorHash(hash);
      if (!sesion || sesion.revocadaEn !== null || new Date(sesion.expiraEn).getTime() <= ahora.getTime()) {
        return { fallo: new ErrorNoAutenticado('sesion-invalida') };
      }
      const membresia = usuario ? await r.membresias.activaDeUsuario(sesion.usuarioId) : undefined;
      const actor = membresia ? { jassId: membresia.jassId, usuarioId: sesion.usuarioId } : null;

      // Una JASS suspendida no renueva, pero el refresco no se consume: al reactivarla sigue sirviendo.
      if (membresia && usuario?.estado === 'activo' && sesion.usadaEn === null && (await jassSuspendida(r, membresia))) {
        return { fallo: new ErrorJassSuspendida() };
      }

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

      return { sesion: await crearSesion(this.d, r, usuario, membresia, sesion.familiaId, ahora) };
    }, { sistema: true });

    if ('fallo' in resultado) throw resultado.fallo;
    return conTokenDeAcceso(this.d, resultado.sesion);
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
      await r.usuarios.buscarPorIdBloqueando(sesion.usuarioId); // mismo orden de bloqueo que RenovarSesion
      await r.sesiones.revocarFamilia(sesion.familiaId, ahora.toISOString());
      const membresia = await r.membresias.activaDeUsuario(sesion.usuarioId);
      await auditar(r, membresia ? { jassId: membresia.jassId, usuarioId: sesion.usuarioId } : null, { accion: 'sesion.cerrada', recurso: 'sesion', recursoId: sesion.usuarioId }, ahora);
    }, { sistema: true });
  }
}

/**
 * Autoriza una solicitud: valida el token de acceso y lee la membresía **activa** de la base
 * (design.md D3). La JASS, el perfil y el rol nunca salen del token ni del cliente.
 */
export class AutorizarSolicitud {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(tokenAcceso: string | undefined): Promise<ActorAutenticado> {
    if (!tokenAcceso) throw new ErrorNoAutenticado('token-invalido');
    const claims = this.d.tokens.verificarAcceso(tokenAcceso, this.d.reloj.ahora());
    if (!claims) throw new ErrorNoAutenticado('token-invalido');
    const resultado = await this.d.unidadDeTrabajo.ejecutar(async (r): Promise<ActorAutenticado | ErrorJassSuspendida | ErrorAccesoDenegado | ErrorNoAutenticado> => {
      const usuario = await r.usuarios.buscarPorId(claims.usuarioId);
      if (!usuario) return new ErrorNoAutenticado('token-invalido');
      const membresia = usuario.estado === 'activo' ? await r.membresias.activaDeUsuario(usuario.id) : undefined;
      if (!membresia) return new ErrorAccesoDenegado('membresia-inactiva');
      if (await jassSuspendida(r, membresia)) return new ErrorJassSuspendida();
      const comun = { usuarioId: usuario.id, debeCambiarContrasena: usuario.debeCambiarContrasena };
      if (membresia.perfil === 'plataforma') {
        return { ...comun, jassId: null, perfil: 'plataforma', rol: null, asociadoId: null } satisfies ContextoPlataforma;
      }
      if (membresia.jassId === null) return new ErrorAccesoDenegado('membresia-sin-jass');
      return { ...comun, jassId: membresia.jassId, perfil: membresia.perfil, rol: membresia.rol, asociadoId: membresia.asociadoId } satisfies ContextoAcceso;
    }, { sistema: true });
    if (resultado instanceof Error) throw resultado;
    return resultado;
  }
}

/** Registra `acceso.denegado` sin datos del recurso ni de la solicitud (spec `auditoria-eventos`). */
export class RegistrarAccesoDenegado {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ActorAutenticado | null, solicitud: { metodo: string; ruta: string; motivo: string }): Promise<void> {
    const ahora = this.d.reloj.ahora();
    await this.d.unidadDeTrabajo.ejecutar(
      (r) =>
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
      actor === null ? { sistema: true } : contextoDe(actor),
    );
  }
}

/**
 * Cambio de la propia clave (spec `acceso-por-documento`): verifica la actual, valida la nueva,
 * cierra todas las sesiones anteriores y devuelve una sesión nueva (design.md D7).
 */
export class CambiarContrasena {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ActorAutenticado, comando: { contrasenaActual: unknown; contrasenaNueva: unknown }): Promise<SesionIniciada> {
    const ahora = this.d.reloj.ahora();
    const actual = typeof comando.contrasenaActual === 'string' ? comando.contrasenaActual : '';
    const usuario = await this.d.unidadDeTrabajo.ejecutar((r) => r.usuarios.buscarPorId(actor.usuarioId), contextoDe(actor));
    if (!usuario) throw new ErrorNoAutenticado('sesion-invalida');
    if (usuario.bloqueadoHasta !== null && new Date(usuario.bloqueadoHasta).getTime() > ahora.getTime()) {
      throw new ErrorCuentaBloqueada(usuario.bloqueadoHasta);
    }

    const correcta = await verificarClave(this.d, usuario, actual);
    if (!correcta) {
      await this.d.unidadDeTrabajo.ejecutar(async (r) => {
        const hasta = new Date(ahora.getTime() + BLOQUEO_MS).toISOString();
        await r.usuarios.registrarFallo(usuario.id, MAX_INTENTOS_FALLIDOS, hasta);
        await auditar(r, actor, { accion: 'clave.cambio-fallido', recurso: 'usuario', recursoId: usuario.id }, ahora);
      }, contextoDe(actor));
      throw new ErrorNoAutenticado('credenciales-invalidas');
    }

    const nueva = validarContrasenaElegida(comando.contrasenaNueva, usuario.documento);
    const hash = await this.d.contrasenas.derivar(nueva);
    const sesion = await this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const membresia = await r.membresias.activaDeUsuario(usuario.id);
      if (!membresia) throw new ErrorAccesoDenegado('membresia-inactiva');
      await r.usuarios.actualizarCredenciales(usuario.id, { hashContrasena: hash, claveGenerada: false, debeCambiarContrasena: false });
      await r.sesiones.revocarDeUsuario(usuario.id, ahora.toISOString());
      const nueva = await crearSesion(this.d, r, { id: usuario.id, debeCambiarContrasena: false }, membresia, this.d.ids.nuevo(), ahora);
      await auditar(r, actor, { accion: 'clave.cambiada', recurso: 'usuario', recursoId: usuario.id }, ahora);
      return nueva;
    }, contextoDe(actor));
    return conTokenDeAcceso(this.d, sesion);
  }
}

export interface DatosDeSesion {
  readonly perfil: Perfil;
  readonly rol: Rol | null;
  readonly nombre: string;
  /** Solo los 3 últimos dígitos, p. ej. `•••••123`. */
  readonly documento: string | null;
  /** Nombre de la JASS; nulo en la plataforma. */
  readonly jass: { readonly nombre: string } | null;
  readonly debeCambiarContrasena: boolean;
}

/** `GET /v1/yo`: quién es la persona y a qué JASS pertenece, sin identificadores internos. */
export class ConsultarYo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ActorAutenticado): Promise<DatosDeSesion> {
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const usuario = await r.usuarios.buscarPorId(actor.usuarioId);
      if (!usuario) throw new ErrorNoAutenticado('sesion-invalida');
      const jass = actor.jassId === null ? undefined : await r.jass.buscar(actor.jassId);
      const asociado = actor.jassId !== null && actor.asociadoId !== null ? await r.asociados.buscar(actor.jassId, actor.asociadoId) : undefined;
      return {
        perfil: actor.perfil,
        rol: actor.rol,
        nombre: asociado?.nombre ?? usuario.nombre ?? '',
        documento: enmascararDocumento(usuario.documento),
        jass: jass ? { nombre: jass.nombre } : null,
        debeCambiarContrasena: usuario.debeCambiarContrasena,
      };
    }, contextoDe(actor));
  }
}

