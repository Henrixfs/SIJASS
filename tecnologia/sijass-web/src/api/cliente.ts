import type { Perfil } from '../lib/rutas';

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    /** Cuerpo de la respuesta de error, por si trae datos extra (p. ej. `tipoReal`). */
    readonly datos: Readonly<Record<string, unknown>> = {},
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

/** Lo que el servidor devuelve al iniciar o renovar la sesión (sin datos de la persona). */
export interface SesionBasica {
  readonly perfil: Perfil;
  readonly rol: string | null;
  /** La cuenta debe cambiar su clave antes de usar el sistema. */
  readonly debeCambiarContrasena: boolean;
}

/** Quién es la persona (`GET /v1/yo`): nunca trae identificadores internos ni el DNI completo. */
export interface Sesion extends SesionBasica {
  readonly nombre: string;
  /** Solo los 3 últimos dígitos, p. ej. `•••••123`. */
  readonly documento: string | null;
  /** Nombre de su JASS; nulo en la plataforma. */
  readonly jass: { readonly nombre: string } | null;
}

export type TipoDeAcceso = 'asociado' | 'administrador';

/** Las credenciales son correctas, pero el tipo de acceso elegido no es el de la cuenta (`409`). */
export class ErrorTipoDeAcceso extends Error {
  constructor(readonly tipoReal: TipoDeAcceso) {
    super('El tipo de acceso elegido no corresponde a la cuenta');
    this.name = 'ErrorTipoDeAcceso';
  }
}

interface RespuestaSesion extends SesionBasica {
  tokenAcceso: string;
  tokenRefresco: string;
}

const CLAVE_REFRESCO = 'sijass.refresco';

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Cliente de la API. El token de acceso vive solo en memoria; el de refresco, en
 * `sessionStorage` (por pestaña) para sobrevivir a una recarga. Ante un `401` renueva la
 * sesión una vez (una sola renovación a la vez) y repite la solicitud.
 */
export class ClienteApi {
  private tokenAcceso: string | null = null;
  private versionSesion = 0;
  private renovando: Promise<boolean> | null = null;
  private onSesionExpirada: () => void = () => undefined;
  private alIniciarSesion: (sesion: SesionBasica | Sesion) => void = () => undefined;

  /**
   * Registra quién escucha los dos eventos de sesión: un inicio correcto (con perfil y rol) y
   * una sesión que ya no se puede renovar.
   */
  configurar(escuchas: { alIniciarSesion?: (sesion: SesionBasica | Sesion) => void; onSesionExpirada?: () => void }): void {
    if (escuchas.alIniciarSesion) this.alIniciarSesion = escuchas.alIniciarSesion;
    if (escuchas.onSesionExpirada) this.onSesionExpirada = escuchas.onSesionExpirada;
  }

  constructor(
    private readonly peticion: typeof fetch = (...a) => fetch(...a),
    private readonly almacen: Almacen = sessionStorage,
  ) {}

  private leerRefresco(): string | null {
    try {
      return this.almacen.getItem(CLAVE_REFRESCO);
    } catch {
      return null;
    }
  }

  private guardarRefresco(valor: string | null): void {
    try {
      if (valor === null) this.almacen.removeItem(CLAVE_REFRESCO);
      else this.almacen.setItem(CLAVE_REFRESCO, valor);
    } catch {
      /* sin almacenamiento: la sesión dura lo que dure la página */
    }
  }

  private async enviar(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<Response> {
    const encabezados: Record<string, string> = { Accept: 'application/json', ...cabeceras };
    // Un archivo (la foto de un reporte) viaja tal cual, con su propio tipo; lo demás, como JSON.
    const binario = typeof Blob !== 'undefined' && cuerpo instanceof Blob;
    if (binario) encabezados['Content-Type'] = cuerpo.type || 'application/octet-stream';
    else if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
    if (this.tokenAcceso) encabezados.Authorization = `Bearer ${this.tokenAcceso}`;
    return this.peticion(ruta, { method: metodo, headers: encabezados, body: cuerpo === undefined ? undefined : binario ? cuerpo : JSON.stringify(cuerpo) });
  }

  private async aError(r: Response): Promise<ErrorApi> {
    let codigo = 'error';
    let mensaje = `Error ${r.status}`;
    let datos: Record<string, unknown> = {};
    try {
      const j = (await r.json()) as { codigo?: string; mensaje?: string };
      codigo = j.codigo ?? codigo;
      mensaje = j.mensaje ?? mensaje;
      datos = j as Record<string, unknown>;
    } catch {
      /* cuerpo vacío o no JSON */
    }
    return new ErrorApi(r.status, codigo, mensaje, datos);
  }

  private aplicarSesion(s: RespuestaSesion): SesionBasica {
    this.tokenAcceso = s.tokenAcceso;
    this.guardarRefresco(s.tokenRefresco);
    return { perfil: s.perfil, rol: s.rol, debeCambiarContrasena: s.debeCambiarContrasena === true };
  }

  /** Quién es la persona: perfil, rol, nombre, DNI enmascarado y nombre de su JASS. */
  consultarSesion(): Promise<Sesion> {
    return this.solicitar<Sesion>('GET', '/v1/yo');
  }

  /**
   * Inicia sesión con DNI y clave. El `tipo` es solo una guía: el servidor decide el perfil por la
   * membresía y, si no coincide (con credenciales correctas), responde `409` sin emitir sesión; aquí
   * se lanza `ErrorTipoDeAcceso` con el tipo real de la cuenta.
   */
  async iniciarSesion(documento: string, contrasena: string, tipo?: TipoDeAcceso): Promise<Sesion> {
    const r = await this.enviar('POST', '/v1/auth/login', { documento, contrasena, ...(tipo ? { tipo } : {}) });
    if (!r.ok) {
      const error = await this.aError(r);
      if (error.estado === 409 && error.codigo === 'tipo-de-acceso-distinto' && (error.datos.tipoReal === 'asociado' || error.datos.tipoReal === 'administrador')) {
        throw new ErrorTipoDeAcceso(error.datos.tipoReal);
      }
      throw error;
    }
    return this.establecerSesion((await r.json()) as RespuestaSesion);
  }

  /** Cambia la propia clave (la actual y la nueva); el servidor cierra las demás sesiones y entrega una nueva. */
  async cambiarContrasena(contrasenaActual: string, contrasenaNueva: string): Promise<Sesion> {
    const datos = await this.solicitar<RespuestaSesion>('POST', '/v1/auth/cambiar-contrasena', { contrasenaActual, contrasenaNueva });
    return this.establecerSesion(datos);
  }

  private async establecerSesion(datos: RespuestaSesion): Promise<Sesion> {
    this.versionSesion++;
    this.renovando = null;
    const basica = this.aplicarSesion(datos);
    const sesion: Sesion = { ...(await this.consultarSesion()), ...basica };
    this.alIniciarSesion(sesion);
    return sesion;
  }

  /** Renueva con el refresco guardado; `false` si no hay o ya no sirve. Una sola renovación a la vez. */
  renovar(): Promise<boolean> {
    if (this.renovando === null) {
      const actual: Promise<boolean> = this.ejecutarRenovacion().finally(() => {
        if (this.renovando === actual) this.renovando = null;
      });
      this.renovando = actual;
    }
    return this.renovando;
  }

  private async ejecutarRenovacion(): Promise<boolean> {
    const refresco = this.leerRefresco();
    if (!refresco) return false;
    const version = this.versionSesion;
    try {
      const r = await this.enviar('POST', '/v1/auth/refresh', { tokenRefresco: refresco });
      if (!r.ok) {
        if (version === this.versionSesion) this.guardarRefresco(null);
        return false;
      }
      const datos = (await r.json()) as RespuestaSesion;
      if (version !== this.versionSesion) {
        await this.invalidarRefresco(datos.tokenRefresco);
        return false;
      }
      this.alIniciarSesion(this.aplicarSesion(datos));
      return true;
    } catch {
      return false;
    }
  }

  /** Recupera la sesión tras una recarga: renueva y pregunta quién es. */
  async restaurar(): Promise<Sesion | null> {
    if (!(await this.renovar())) return null;
    try {
      return await this.consultarSesion();
    } catch {
      return null;
    }
  }

  async cerrarSesion(): Promise<void> {
    const refresco = this.leerRefresco();
    this.versionSesion++;
    this.renovando = null;
    this.tokenAcceso = null;
    this.guardarRefresco(null);
    if (refresco) await this.invalidarRefresco(refresco);
  }

  private async invalidarRefresco(tokenRefresco: string) {
    await this.enviar('POST', '/v1/auth/logout', { tokenRefresco }).catch(() => undefined);
  }

  private async esFalloDeCredenciales(r: Response): Promise<boolean> {
    try {
      return ((await r.clone().json()) as { codigo?: string }).codigo === 'credenciales-invalidas';
    } catch {
      return false;
    }
  }

  async solicitar<T>(metodo: string, ruta: string, cuerpo?: unknown, cabeceras?: Record<string, string>): Promise<T> {
    const r = await this.responder(metodo, ruta, cuerpo, cabeceras);
    if (!r.ok) throw await this.aError(r);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  /** Descarga un archivo protegido (la foto de un reporte); `null` si no existe (`404`). */
  async solicitarArchivo(ruta: string): Promise<Blob | null> {
    const r = await this.responder('GET', ruta, undefined, { Accept: '*/*' });
    if (r.status === 404) return null;
    if (!r.ok) throw await this.aError(r);
    return r.blob();
  }

  /** Envía la solicitud y, ante un `401` de sesión vencida, renueva una vez y la repite. */
  private async responder(metodo: string, ruta: string, cuerpo?: unknown, cabeceras?: Record<string, string>): Promise<Response> {
    const version = this.versionSesion;
    const token = this.tokenAcceso;
    let r = await this.enviar(metodo, ruta, cuerpo, cabeceras);
    // Un 401 de credenciales (p. ej. la clave actual equivocada al cambiarla) no es una sesión vencida:
    // no se renueva ni se cierra la sesión.
    if (r.status === 401 && token !== null && version === this.versionSesion && !(await this.esFalloDeCredenciales(r))) {
      const renovado = this.tokenAcceso !== token || await this.renovar();
      if (renovado && version === this.versionSesion) r = await this.enviar(metodo, ruta, cuerpo, cabeceras);
      if (r.status === 401 && version === this.versionSesion) {
        this.versionSesion++;
        this.tokenAcceso = null;
        this.guardarRefresco(null);
        this.onSesionExpirada();
      }
    }
    return r;
  }
}
