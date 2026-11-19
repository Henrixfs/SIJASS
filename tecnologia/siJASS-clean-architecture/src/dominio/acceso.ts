import { ErrorAccesoDenegado } from './errores.js';
import type { ContextoActor } from './puertos.js';

export const PERFILES = ['personal', 'asociado'] as const;
export type Perfil = (typeof PERFILES)[number];

export const ROLES = ['consejo', 'tesorero', 'operador'] as const;
export type Rol = (typeof ROLES)[number];

export interface Usuario {
  readonly id: string;
  /** En minúsculas y sin espacios en los extremos. */
  readonly correo: string;
  /** `scrypt$N$r$p$sal$hash`; nunca la contraseña en claro. */
  readonly hashContrasena: string;
  readonly estado: 'activo' | 'inactivo';
  readonly intentosFallidos: number;
  /** Instante ISO hasta el que no se admite el inicio de sesión, si lo hay. */
  readonly bloqueadoHasta: string | null;
}

export interface Membresia {
  readonly id: string;
  readonly usuarioId: string;
  readonly jassId: string;
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
  readonly perfil: Perfil;
  readonly rol: Rol | null;
  readonly asociadoId: string | null;
}

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
  | 'mediciones.leer';

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
};

export function tienePermiso(actor: ContextoAcceso, permiso: Permiso): boolean {
  const regla = REGLAS[permiso];
  if (actor.perfil !== regla.perfil) return false;
  if (regla.roles === undefined) return true;
  return actor.rol !== null && regla.roles.includes(actor.rol);
}

/** @throws ErrorAccesoDenegado si el actor no tiene el permiso. */
export function exigirPermiso(actor: ContextoAcceso, permiso: Permiso): void {
  if (!tienePermiso(actor, permiso)) throw new ErrorAccesoDenegado(`sin-permiso:${permiso}`);
}

export const MAX_INTENTOS_FALLIDOS = 5;
export const BLOQUEO_MS = 15 * 60 * 1000;
export const VIGENCIA_ACCESO_S = 15 * 60;
export const VIGENCIA_REFRESCO_MS = 7 * 24 * 60 * 60 * 1000;
