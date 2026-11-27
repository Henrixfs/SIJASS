import { Catch, type ArgumentsHost, type CanActivate, type ExceptionFilter, type ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import type { Casos } from '../aplicacion/casos.js';
import {
  ErrorAccesoDenegado,
  ErrorCambioDeClavePendiente,
  ErrorConflicto,
  ErrorCuentaBloqueada,
  ErrorDatoInvalido,
  ErrorJassSuspendida,
  ErrorLimiteDeOrigen,
  ErrorMedicionDuplicada,
  ErrorNoAutenticado,
  ErrorTipoDeAccesoDistinto,
  ErrorTipoNoAdmitido,
  ErrorCargaExcesiva,
  ErrorValidacion,
} from '../dominio/errores.js';
import { esPublico, permiteCambioPendiente, type SolicitudAutenticada } from './comun.js';

function tokenDe(solicitud: SolicitudAutenticada): string | undefined {
  const cabecera = solicitud.headers.authorization;
  const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  if (typeof valor !== 'string') return undefined;
  const partes = valor.split(' ');
  return partes.length === 2 && partes[0].toLowerCase() === 'bearer' ? partes[1] : undefined;
}

/**
 * Autentica cada ruta no pública: valida el token y lee la membresía **activa** de la base
 * (design.md D3). El permiso fino lo exige cada caso de uso.
 */
export class GuardiaAcceso implements CanActivate {
  constructor(private readonly casos: Casos) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (esPublico(contexto)) return true;
    const solicitud = contexto.switchToHttp().getRequest<SolicitudAutenticada>();
    const actor = await this.casos.autorizar.ejecutar(tokenDe(solicitud));
    solicitud.actor = actor;
    // Con el cambio de clave pendiente solo se puede cambiar la clave, consultar `yo` o cerrar sesión.
    if (actor.debeCambiarContrasena === true && !permiteCambioPendiente(contexto)) throw new ErrorCambioDeClavePendiente();
    return true;
  }
}

interface ErrorConEstado {
  status?: unknown;
  statusCode?: unknown;
  getStatus?: () => number;
}

/**
 * Traduce los errores a respuestas `{ codigo, mensaje }` estables (design.md D9) y nunca
 * filtra trazas, SQL ni el cuerpo recibido. Cada `403` queda en la auditoría.
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  constructor(
    private readonly casos: Casos,
    private readonly registrar: (mensaje: string) => void = (m) => console.error(m),
  ) {}

  async catch(error: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const respuesta = http.getResponse<Response>();
    const solicitud = http.getRequest<SolicitudAutenticada>();

    if (error instanceof ErrorNoAutenticado) {
      const credenciales = error.codigo === 'credenciales-invalidas';
      respuesta.status(401).json({ codigo: error.codigo, mensaje: credenciales ? 'Credenciales inválidas' : 'No autenticado' });
      return;
    }
    if (error instanceof ErrorCuentaBloqueada) {
      const restante = Math.max(1, Math.ceil((new Date(error.bloqueadoHasta).getTime() - Date.now()) / 1000));
      respuesta.setHeader('Retry-After', String(restante));
      respuesta.status(429).json({ codigo: 'cuenta-bloqueada', mensaje: 'Demasiados intentos fallidos; vuelva a intentar más tarde' });
      return;
    }
    if (error instanceof ErrorLimiteDeOrigen) {
      respuesta.setHeader('Retry-After', String(error.reintentarEnSegundos));
      respuesta.status(429).json({ codigo: 'demasiados-intentos', mensaje: 'Demasiados intentos; vuelva a intentar más tarde' });
      return;
    }
    if (error instanceof ErrorTipoDeAccesoDistinto) {
      respuesta.status(409).json({ codigo: error.codigo, mensaje: 'El tipo de acceso elegido no corresponde a esta cuenta', tipoReal: error.tipoReal });
      return;
    }
    if (error instanceof ErrorJassSuspendida) {
      respuesta.status(403).json({ codigo: 'jass-suspendida', mensaje: 'La JASS está suspendida' });
      return;
    }
    if (error instanceof ErrorCambioDeClavePendiente) {
      respuesta.status(403).json({ codigo: 'cambio-de-clave-pendiente', mensaje: 'Debe cambiar su clave antes de continuar' });
      return;
    }
    if (error instanceof ErrorAccesoDenegado) {
      // La auditoría no debe impedir la respuesta: si falla, se informa en el registro del servidor.
      try {
        await this.casos.registrarDenegado.ejecutar(solicitud.actor ?? null, {
          metodo: solicitud.method,
          ruta: solicitud.route?.path ?? solicitud.path,
          motivo: error.motivo,
        });
      } catch (falla) {
        this.registrar(`no se pudo auditar un acceso denegado: ${falla instanceof Error ? falla.message : String(falla)}`);
      }
      respuesta.status(403).json({ codigo: 'acceso-denegado', mensaje: 'Acceso denegado' });
      return;
    }
    if (error instanceof ErrorConflicto || error instanceof ErrorMedicionDuplicada) {
      respuesta.status(409).json({ codigo: error.codigo, mensaje: error.message });
      return;
    }
    if (error instanceof ErrorTipoNoAdmitido) {
      respuesta.status(415).json({ codigo: error.codigo, mensaje: 'Tipo de contenido no admitido' });
      return;
    }
    if (error instanceof ErrorCargaExcesiva) {
      respuesta.status(413).json({ codigo: error.codigo, mensaje: 'Solicitud demasiado grande' });
      return;
    }
    if (error instanceof ErrorDatoInvalido || error instanceof ErrorValidacion) {
      respuesta.status(422).json({ codigo: error.codigo, mensaje: error.message });
      return;
    }

    // Errores de Nest/Express (ruta inexistente, JSON mal formado, cuerpo demasiado grande…).
    const e = error as ErrorConEstado;
    const estado = typeof e.getStatus === 'function' ? e.getStatus() : Number(e.status ?? e.statusCode);
    if (Number.isInteger(estado) && estado >= 400 && estado < 500) {
      const mensajes: Record<number, string> = { 400: 'Solicitud inválida', 404: 'Recurso no encontrado', 413: 'Solicitud demasiado grande', 415: 'Tipo de contenido no admitido' };
      respuesta.status(estado).json({ codigo: estado === 404 ? 'no-encontrado' : 'solicitud-invalida', mensaje: mensajes[estado] ?? 'Solicitud inválida' });
      return;
    }

    this.registrar(`error interno: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    respuesta.status(500).json({ codigo: 'error-interno', mensaje: 'Error interno' });
  }
}
