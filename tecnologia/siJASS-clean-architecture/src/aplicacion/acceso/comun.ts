import type { ActorAutenticado, Usuario } from '../../dominio/acceso.js';
import { canonicalizarClave } from '../../dominio/claves/claves.js';
import { ErrorAccesoDenegado, ErrorDatoInvalido } from '../../dominio/errores.js';
import type { GeneradorIds, Reloj } from '../../dominio/puertos.js';
import type {
  ContextoTransaccion,
  GeneradorClaves,
  LimitadorDeIntentos,
  RepositoriosAcceso,
  ServicioContrasenas,
  ServicioTokens,
  UnidadDeTrabajoAcceso,
} from '../../dominio/puertos-acceso.js';

export interface DependenciasAcceso {
  readonly unidadDeTrabajo: UnidadDeTrabajoAcceso;
  readonly reloj: Reloj;
  readonly ids: GeneradorIds;
  readonly contrasenas: ServicioContrasenas;
  readonly tokens: ServicioTokens;
  /** Claves temporales de tres palabras (s2a, design.md D4). */
  readonly claves: GeneradorClaves;
  /** Límite de intentos de inicio de sesión por origen (s2a, design.md D9). */
  readonly limitador: LimitadorDeIntentos;
}

/** Origen de los eventos de auditoría de este contexto. */
export const ORIGEN_API = 'api';

export interface DatosAuditoria {
  readonly accion: string;
  readonly recurso: string;
  readonly recursoId?: string | null;
  readonly detalle?: Readonly<Record<string, unknown>>;
}

/** Quién queda registrado como autor de un evento: su JASS (o ninguna, en la plataforma) y su cuenta. */
export interface AutorAuditoria {
  readonly jassId: string | null;
  readonly usuarioId: string;
}

/** Escribe un evento en la misma transacción que el cambio auditado (spec `auditoria-eventos`). */
export async function auditar(
  repos: RepositoriosAcceso,
  actor: AutorAuditoria | null,
  datos: DatosAuditoria,
  ahora: Date,
): Promise<void> {
  await repos.auditoria.registrar({
    jassId: actor?.jassId ?? null,
    actorId: actor?.usuarioId ?? null,
    accion: datos.accion,
    recurso: datos.recurso,
    recursoId: datos.recursoId ?? null,
    detalle: datos.detalle ?? {},
    origen: ORIGEN_API,
    creadaEn: ahora.toISOString(),
  });
}

/** Ejecuta una transacción de negocio con la JASS del actor (la seguridad por filas solo deja ver esa JASS). */
export function enJass(d: Pick<DependenciasAcceso, 'unidadDeTrabajo'>, actor: { readonly jassId: string }) {
  return <T>(trabajo: (repos: RepositoriosAcceso) => Promise<T>): Promise<T> => d.unidadDeTrabajo.ejecutar(trabajo, { jassId: actor.jassId });
}

/** Contexto de transacción de una solicitud autenticada: su JASS o, sin JASS, la plataforma. */
export function contextoDe(actor: ActorAutenticado): ContextoTransaccion {
  return actor.jassId === null ? { plataforma: true } : { jassId: actor.jassId };
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarCorreo(valor: unknown): string {
  const correo = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (correo.length < 3 || correo.length > 254 || !CORREO.test(correo)) throw new ErrorDatoInvalido('correo-invalido');
  return correo;
}

/** Política mínima de contraseñas: 10 a 128 caracteres. */
export function validarContrasena(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length < 10 || valor.length > 128) throw new ErrorDatoInvalido('contrasena-invalida', 'de 10 a 128 caracteres');
  return valor;
}

/** Contraseña que elige una persona: de 10 a 128 caracteres y distinta de su DNI (spec `acceso-por-documento`). */
export function validarContrasenaElegida(valor: unknown, documento: string | null): string {
  const contrasena = validarContrasena(valor);
  if (documento !== null && contrasena === documento) throw new ErrorDatoInvalido('contrasena-invalida', 'no puede ser su DNI');
  return contrasena;
}

/** Nombre de una persona: de 1 a 120 caracteres sin espacios en los extremos. */
export function validarNombrePersona(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
  if (nombre.length === 0 || nombre.length > 120) throw new ErrorDatoInvalido('nombre-invalido');
  return nombre;
}

/**
 * Compara la clave escrita con la de la cuenta. Una clave generada se acepta sin distinguir
 * mayúsculas, tildes ni separadores; una elegida solo se acepta exacta (design.md D4).
 */
export async function verificarClave(d: Pick<DependenciasAcceso, 'contrasenas'>, usuario: Pick<Usuario, 'claveGenerada' | 'hashContrasena'>, escrita: string): Promise<boolean> {
  return d.contrasenas.verificar(usuario.claveGenerada ? canonicalizarClave(escrita) : escrita, usuario.hashContrasena);
}

/** Clave temporal ya generada y derivada: se prepara fuera de la transacción porque `scrypt` es costoso. */
export interface ClavePreparada {
  readonly clave: string;
  readonly hash: string;
}

export async function prepararClaveTemporal(d: Pick<DependenciasAcceso, 'claves' | 'contrasenas'>): Promise<ClavePreparada> {
  const clave = d.claves.generar();
  return { clave, hash: await d.contrasenas.derivar(clave) };
}

/**
 * Aplica una clave temporal a la cuenta: guarda su derivación, marca la clave como generada,
 * reinicia intentos y bloqueo, y cierra todas sus sesiones. `forzarCambio` obliga a cambiarla
 * en el primer ingreso (personal, Consejo y plataforma; no los asociados). Devuelve la clave en
 * claro solo para quien la entrega: nunca se registra (design.md D6).
 */
export async function aplicarClaveTemporal(
  repos: RepositoriosAcceso,
  usuarioId: string,
  preparada: ClavePreparada,
  forzarCambio: boolean,
  ahora: Date,
): Promise<string> {
  await repos.usuarios.actualizarCredenciales(usuarioId, { hashContrasena: preparada.hash, claveGenerada: true, debeCambiarContrasena: forzarCambio });
  await repos.sesiones.revocarDeUsuario(usuarioId, ahora.toISOString());
  return preparada.clave;
}

/** Un recurso que no existe y uno de otra JASS son indistinguibles (RF01). */
export const recursoAjeno = () => new ErrorAccesoDenegado('recurso-ajeno');
