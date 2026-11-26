import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ActorAutenticado, ContextoAcceso, ContextoPlataforma } from '../dominio/acceso.js';
import { ErrorAccesoDenegado } from '../dominio/errores.js';

/** Token de inyección de los casos de uso ya construidos. */
export const CASOS = Symbol('CASOS');

const PUBLICO = 'sijass:publico';
const CON_CAMBIO_PENDIENTE = 'sijass:con-cambio-pendiente';

/** Marca una ruta como pública (no exige token de acceso). */
export const Publico = () => SetMetadata(PUBLICO, true);

/**
 * Marca una ruta que una cuenta con el cambio de clave pendiente sí puede usar (cambiar la clave,
 * consultar `yo`); en cualquier otra, la guardia responde `403 cambio-de-clave-pendiente`.
 */
export const PermitidaConCambioPendiente = () => SetMetadata(CON_CAMBIO_PENDIENTE, true);

export function esPublico(contexto: ExecutionContext): boolean {
  return Reflect.getMetadata(PUBLICO, contexto.getHandler()) === true || Reflect.getMetadata(PUBLICO, contexto.getClass()) === true;
}

export function permiteCambioPendiente(contexto: ExecutionContext): boolean {
  return Reflect.getMetadata(CON_CAMBIO_PENDIENTE, contexto.getHandler()) === true;
}

export interface SolicitudAutenticada {
  actor?: ActorAutenticado;
  method: string;
  path: string;
  /** Origen de la conexión; Express lo resuelve con `trust proxy` cuando está activo. */
  ip?: string;
  route?: { path?: string };
  headers: Record<string, string | string[] | undefined>;
}

function actorDe(contexto: ExecutionContext): ActorAutenticado {
  const solicitud = contexto.switchToHttp().getRequest<SolicitudAutenticada>();
  if (!solicitud.actor) throw new Error('ruta protegida sin actor');
  return solicitud.actor;
}

/**
 * El actor de una JASS lo fija el guardia a partir de la membresía de la base (design.md D3). Una
 * cuenta de plataforma no es un actor de JASS: ninguna ruta de negocio la acepta.
 */
export const ActorActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): ContextoAcceso => {
  const actor = actorDe(contexto);
  if (actor.perfil === 'plataforma') throw new ErrorAccesoDenegado('perfil-plataforma');
  return actor;
});

/** El actor de plataforma; cualquier otro perfil recibe `403`. */
export const ActorDePlataforma = createParamDecorator((_dato: unknown, contexto: ExecutionContext): ContextoPlataforma => {
  const actor = actorDe(contexto);
  if (actor.perfil !== 'plataforma') throw new ErrorAccesoDenegado('solo-plataforma');
  return actor;
});

/** Cualquier cuenta autenticada, de una JASS o de la plataforma (cambio de clave, `yo`). */
export const ActorCualquiera = createParamDecorator((_dato: unknown, contexto: ExecutionContext): ActorAutenticado => actorDe(contexto));

/** El cuerpo llega sin tipar: se reduce a un objeto y cada caso de uso valida sus campos. */
export function cuerpo(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}
