import type { Perfil } from '../lib/rutas';

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export interface Sesion {
  readonly perfil: Perfil;
  readonly rol: string | null;
}

interface RespuestaSesion {
  tokenAcceso: string;
  tokenRefresco: string;
  perfil: Perfil;
  rol: string | null;
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
  private renovando: Promise<boolean> | null = null;
  private onSesionExpirada: () => void = () => undefined;
  private alIniciarSesion: (sesion: Sesion) => void = () => undefined;

  /**
   * Registra quién escucha los dos eventos de sesión: un inicio correcto (con perfil y rol) y
   * una sesión que ya no se puede renovar.
   */
  configurar(escuchas: { alIniciarSesion?: (sesion: Sesion) => void; onSesionExpirada?: () => void }): void {
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
    if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json';
    if (this.tokenAcceso) encabezados.Authorization = `Bearer ${this.tokenAcceso}`;
    return this.peticion(ruta, { method: metodo, headers: encabezados, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  }

  private async aError(r: Response): Promise<ErrorApi> {
    let codigo = 'error';
    let mensaje = `Error ${r.status}`;
    try {
      const j = (await r.json()) as { codigo?: string; mensaje?: string };
      codigo = j.codigo ?? codigo;
      mensaje = j.mensaje ?? mensaje;
    } catch {
      /* cuerpo vacío o no JSON */
    }
    return new ErrorApi(r.status, codigo, mensaje);
  }

  private aplicarSesion(s: RespuestaSesion): Sesion {
    this.tokenAcceso = s.tokenAcceso;
    this.guardarRefresco(s.tokenRefresco);
    return { perfil: s.perfil, rol: s.rol };
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<Sesion> {
    const r = await this.enviar('POST', '/v1/auth/login', { correo, contrasena });
    if (!r.ok) throw await this.aError(r);
    const sesion = this.aplicarSesion((await r.json()) as RespuestaSesion);
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
    try {
      const r = await this.enviar('POST', '/v1/auth/refresh', { tokenRefresco: refresco });
      if (!r.ok) {
        this.tokenAcceso = null;
        this.guardarRefresco(null);
        return false;
      }
      this.aplicarSesion((await r.json()) as RespuestaSesion);
      return true;
    } catch {
      return false;
    }
  }

  /** Recupera la sesión tras una recarga: renueva y pregunta quién es. */
  async restaurar(): Promise<Sesion | null> {
    if (!(await this.renovar())) return null;
    try {
      return await this.solicitar<Sesion>('GET', '/v1/yo');
    } catch {
      return null;
    }
  }

  async cerrarSesion(): Promise<void> {
    const refresco = this.leerRefresco();
    this.tokenAcceso = null;
    this.guardarRefresco(null);
    if (refresco) await this.enviar('POST', '/v1/auth/logout', { tokenRefresco: refresco }).catch(() => undefined);
  }

  async solicitar<T>(metodo: string, ruta: string, cuerpo?: unknown, cabeceras?: Record<string, string>): Promise<T> {
    let r = await this.enviar(metodo, ruta, cuerpo, cabeceras);
    if (r.status === 401 && this.tokenAcceso !== null) {
      if (await this.renovar()) r = await this.enviar(metodo, ruta, cuerpo, cabeceras);
      if (r.status === 401) {
        this.tokenAcceso = null;
        this.guardarRefresco(null);
        this.onSesionExpirada();
      }
    }
    if (!r.ok) throw await this.aError(r);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }
}
