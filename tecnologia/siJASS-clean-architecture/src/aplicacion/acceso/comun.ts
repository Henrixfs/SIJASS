import type { ContextoAcceso } from '../../dominio/acceso.js';
import { ErrorDatoInvalido } from '../../dominio/errores.js';
import type { GeneradorIds, Reloj } from '../../dominio/puertos.js';
import type {
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
}

/** Origen de los eventos de auditoría de este contexto. */
export const ORIGEN_API = 'api';

export interface DatosAuditoria {
  readonly accion: string;
  readonly recurso: string;
  readonly recursoId?: string | null;
  readonly detalle?: Readonly<Record<string, unknown>>;
}

/** Escribe un evento en la misma transacción que el cambio auditado (spec `auditoria-eventos`). */
export async function auditar(
  repos: RepositoriosAcceso,
  actor: Pick<ContextoAcceso, 'jassId' | 'usuarioId'> | null,
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
