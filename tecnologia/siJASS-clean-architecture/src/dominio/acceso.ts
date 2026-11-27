import { ErrorAccesoDenegado } from './errores.js';
import type { ContextoActor } from './puertos.js';

export const PERFILES = ['personal', 'asociado', 'plataforma'] as const;
export type Perfil = (typeof PERFILES)[number];

export const ROLES = ['consejo', 'tesorero', 'operador'] as const;
export type Rol = (typeof ROLES)[number];

export interface Usuario {
  readonly id: string;
  /** DNI de 8 dígitos: identifica la cuenta en todo el sistema. `null` solo en cuentas anteriores a `s2a`. */
  readonly documento: string | null;
  /** Nombre de la persona (cuentas de personal y de plataforma; el de un asociado sale del padrón). */
  readonly nombre: string | null;
  /** Opcional y sin uso para entrar; en minúsculas y sin espacios en los extremos. */
  readonly correo: string | null;
  /** `scrypt$N$r$p$sal$hash`; nunca la contraseña en claro. */
  readonly hashContrasena: string;
  readonly estado: 'activo' | 'inactivo';
  readonly intentosFallidos: number;
  /** Instante ISO hasta el que no se admite el inicio de sesión, si lo hay. */
  readonly bloqueadoHasta: string | null;
  /** La clave actual la generó el sistema (tres palabras): se acepta sin distinguir mayúsculas ni separadores. */
  readonly claveGenerada: boolean;
  /** Hasta que la cambie, solo puede cambiar su clave, consultar `yo` o cerrar sesión. */
  readonly debeCambiarContrasena: boolean;
}

export interface Membresia {
  readonly id: string;
  readonly usuarioId: string;
  /** `null` solo en el perfil `plataforma`, que no pertenece a ninguna JASS. */
  readonly jassId: string | null;
  readonly perfil: Perfil;
  /** Solo para el perfil `personal`. */
  readonly rol: Rol | null;
  /** Solo para el perfil `asociado`. */
  readonly asociadoId: string | null;
  readonly estado: 'activa' | 'inactiva';
}

export interface Sesion {
  readonly id: string;
  readonly usuarioId: string;
  /** Todas las rotaciones de un mismo inicio de sesión comparten familia. */
  readonly familiaId: string;
  /** SHA-256 hexadecimal del token de refresco; el token nunca se almacena. */
  readonly refreshHash: string;
  readonly expiraEn: string;
  readonly usadaEn: string | null;
  readonly revocadaEn: string | null;
}

/**
 * Quién actúa, resuelto en el servidor desde la membresía activa en cada solicitud
 * (design.md D3). Nunca se construye con datos que envía el cliente.
 */
export interface ContextoAcceso extends ContextoActor {
  readonly perfil: 'personal' | 'asociado';
  readonly rol: Rol | null;
  readonly asociadoId: string | null;
  /** Hasta que la cuenta cambie su clave solo puede cambiarla, consultar `yo` o cerrar sesión. */
  readonly debeCambiarContrasena?: boolean;
}

/**
 * Actor del perfil de plataforma: no pertenece a ninguna JASS. Es un tipo distinto de
 * `ContextoAcceso` para que ningún caso de uso de una JASS compile con él (s2a, design.md D2).
 */
export interface ContextoPlataforma {
  readonly usuarioId: string;
  readonly jassId: null;
  readonly perfil: 'plataforma';
  readonly rol: null;
  readonly asociadoId: null;
  readonly debeCambiarContrasena?: boolean;
}

/** Quien hace la solicitud, ya autenticado: de una JASS o de la plataforma. */
export type ActorAutenticado = ContextoAcceso | ContextoPlataforma;

/** Permisos del MVP (spec `acceso-por-perfiles`, «Autorización por perfil, rol y recurso»). */
export type Permiso =
  | 'padron.leer'
  | 'padron.escribir'
  | 'pagos.leer'
  | 'pagos.registrar'
  | 'acceso-asociado.crear'
  | 'portal.consultar'
  | 'reservorios.leer'
  | 'reservorios.crear'
  | 'mediciones.registrar'
  | 'mediciones.leer'
  | 'asistente.consultar'
  | 'acceso-asociado.restablecer'
  | 'equipo.gestionar'
  | 'jass.gestionar'
  | 'incidencias.reportar'
  | 'incidencias.leer-propias'
  | 'incidencias.leer'
  | 'incidencias.gestionar'
  | 'incidencias.reglas.leer'
  | 'incidencias.reglas.modificar';

const PERSONAL_CON_PADRON: readonly Rol[] = ['tesorero', 'consejo'];
const TODO_EL_PERSONAL: readonly Rol[] = ['consejo', 'tesorero', 'operador'];

// El `operador` no tiene permiso alguno sobre padrón, cuotas ni pagos (matriz de actores).
const REGLAS: Readonly<Record<Permiso, { readonly perfil: Perfil; readonly roles?: readonly Rol[] }>> = {
  'padron.leer': { perfil: 'personal', roles: PERSONAL_CON_PADRON },
  'padron.escribir': { perfil: 'personal', roles: PERSONAL_CON_PADRON },
  'pagos.leer': { perfil: 'personal', roles: PERSONAL_CON_PADRON },
  'pagos.registrar': { perfil: 'personal', roles: PERSONAL_CON_PADRON },
  'acceso-asociado.crear': { perfil: 'personal', roles: PERSONAL_CON_PADRON },
  'portal.consultar': { perfil: 'asociado' },
  // s1c: el consejo da de alta los reservorios; solo el operador registra mediciones; el
  // historial lo leen operador, tesorero y consejo. El asociado no accede a ninguno.
  'reservorios.leer': { perfil: 'personal', roles: TODO_EL_PERSONAL },
  'reservorios.crear': { perfil: 'personal', roles: ['consejo'] },
  'mediciones.registrar': { perfil: 'personal', roles: ['operador'] },
  'mediciones.leer': { perfil: 'personal', roles: TODO_EL_PERSONAL },
  // s1d: consultan el asistente documental operador, tesorero y consejo; el asociado no.
  'asistente.consultar': { perfil: 'personal', roles: TODO_EL_PERSONAL },
  // s2a: Tesorería y Consejo restablecen la clave de un asociado; solo el Consejo gestiona su equipo;
  // la plataforma gestiona las JASS y ningún permiso de negocio la incluye.
  'acceso-asociado.restablecer': { perfil: 'personal', roles: PERSONAL_CON_PADRON },
  'equipo.gestionar': { perfil: 'personal', roles: ['consejo'] },
  'jass.gestionar': { perfil: 'plataforma' },
  // s1f: el asociado reporta y ve solo lo suyo; todo el personal consulta; Consejo y Operación
  // atienden (Tesorería solo lee); solo el Consejo cambia la matriz de prioridad.
  'incidencias.reportar': { perfil: 'asociado' },
  'incidencias.leer-propias': { perfil: 'asociado' },
  'incidencias.leer': { perfil: 'personal', roles: TODO_EL_PERSONAL },
  'incidencias.gestionar': { perfil: 'personal', roles: ['consejo', 'operador'] },
  'incidencias.reglas.leer': { perfil: 'personal', roles: TODO_EL_PERSONAL },
  'incidencias.reglas.modificar': { perfil: 'personal', roles: ['consejo'] },
};

export function tienePermiso(actor: ActorAutenticado, permiso: Permiso): boolean {
  const regla = REGLAS[permiso];
  if (actor.perfil !== regla.perfil) return false;
  if (regla.roles === undefined) return true;
  return actor.rol !== null && regla.roles.includes(actor.rol);
}

/** @throws ErrorAccesoDenegado si el actor no tiene el permiso. */
export function exigirPermiso(actor: ContextoAcceso, permiso: Permiso): void {
  if (!tienePermiso(actor, permiso)) throw new ErrorAccesoDenegado(`sin-permiso:${permiso}`);
}

/** Igual que `exigirPermiso`, para operaciones de la plataforma. */
export function exigirPermisoPlataforma(actor: ContextoPlataforma, permiso: Permiso): void {
  if (!tienePermiso(actor, permiso)) throw new ErrorAccesoDenegado(`sin-permiso:${permiso}`);
}

export const MAX_INTENTOS_FALLIDOS = 5;
export const BLOQUEO_MS = 15 * 60 * 1000;
export const VIGENCIA_ACCESO_S = 15 * 60;
/**
 * Intentos **fallidos** de inicio de sesión por origen en la ventana (s2a, D9). Solo cuentan los
 * fallos: así una red compartida (datos móviles, un cibercafé) no bloquea a quienes sí entran bien.
 */
export const MAX_INTENTOS_POR_ORIGEN = 50;
export const VENTANA_ORIGEN_MS = 15 * 60 * 1000;
export const VIGENCIA_REFRESCO_MS = 7 * 24 * 60 * 60 * 1000;
