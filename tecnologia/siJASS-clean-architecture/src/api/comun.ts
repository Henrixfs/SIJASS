import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ContextoAcceso } from '../dominio/acceso.js';

/** Token de inyección de los casos de uso ya construidos. */
export const CASOS = Symbol('CASOS');

const PUBLICO = 'sijass:publico';

/** Marca una ruta como pública (no exige token de acceso). */
export const Publico = () => SetMetadata(PUBLICO, true);

export function esPublico(contexto: ExecutionContext): boolean {
  return Reflect.getMetadata(PUBLICO, contexto.getHandler()) === true || Reflect.getMetadata(PUBLICO, contexto.getClass()) === true;
}

export interface SolicitudAutenticada {
  actor?: ContextoAcceso;
  method: string;
  path: string;
  route?: { path?: string };
  headers: Record<string, string | string[] | undefined>;
}

/** El actor lo fija el guardia a partir de la membresía de la base (design.md D3). */
export const ActorActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): ContextoAcceso => {
  const solicitud = contexto.switchToHttp().getRequest<SolicitudAutenticada>();
  if (!solicitud.actor) throw new Error('ruta protegida sin actor');
  return solicitud.actor;
});

/** El cuerpo llega sin tipar: se reduce a un objeto y cada caso de uso valida sus campos. */
export function cuerpo(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}
