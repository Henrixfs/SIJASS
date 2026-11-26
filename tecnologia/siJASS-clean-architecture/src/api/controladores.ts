import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Casos } from '../aplicacion/casos.js';
import type { ActorAutenticado, ContextoAcceso, ContextoPlataforma } from '../dominio/acceso.js';
import { ActorActual, ActorCualquiera, ActorDePlataforma, CASOS, cuerpo, PermitidaConCambioPendiente, Publico, type SolicitudAutenticada } from './comun.js';

/** Sonda pública para despliegues: no devuelve datos de negocio ni de configuración. */
@Controller('v1/salud')
export class SaludController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Publico()
  @Get()
  async salud(@Res({ passthrough: true }) respuesta: Response) {
    const estado = await this.casos.salud.ejecutar();
    respuesta.status(estado.estado === 'ok' ? 200 : 503);
    return estado;
  }
}

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() solicitud: SolicitudAutenticada) {
    const b = cuerpo(body);
    return this.casos.autenticar.ejecutar({ documento: b.documento, contrasena: b.contrasena, tipo: b.tipo, origen: solicitud.ip ?? 'desconocido' });
  }

  @Publico()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.casos.renovar.ejecutar({ tokenRefresco: cuerpo(body).tokenRefresco });
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown): Promise<void> {
    await this.casos.cerrarSesion.ejecutar({ tokenRefresco: cuerpo(body).tokenRefresco });
  }

  /** Cambio de la propia clave; la única operación (con `yo`) que una cuenta con cambio pendiente puede usar. */
  @PermitidaConCambioPendiente()
  @Post('cambiar-contrasena')
  @HttpCode(200)
  cambiarContrasena(@ActorCualquiera() actor: ActorAutenticado, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.casos.cambiarContrasena.ejecutar(actor, { contrasenaActual: b.contrasenaActual, contrasenaNueva: b.contrasenaNueva });
  }
}

@Controller('v1/yo')
export class YoController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  /** Perfil, rol, nombre, DNI enmascarado y nombre de la JASS de quien consulta; nunca identificadores internos. */
  @PermitidaConCambioPendiente()
  @Get()
  yo(@ActorCualquiera() actor: ActorAutenticado) {
    return this.casos.yo.ejecutar(actor);
  }
}

@Controller('v1/asociados')
export class AsociadosController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Get()
  listar(@ActorActual() actor: ContextoAcceso) {
    return this.casos.listarAsociados.ejecutar(actor).then((asociados) => ({ asociados }));
  }

  @Post()
  registrar(@ActorActual() actor: ContextoAcceso, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.casos.registrarAsociado.ejecutar(actor, { nombre: b.nombre, documento: b.documento });
  }

  @Post(':id/baja')
  @HttpCode(204)
  async baja(@ActorActual() actor: ContextoAcceso, @Param('id') id: string): Promise<void> {
    await this.casos.darDeBaja.ejecutar(actor, id);
  }

  /** Crea el acceso con una clave generada que solo se devuelve en esta respuesta. */
  @Post(':id/acceso')
  crearAcceso(@ActorActual() actor: ContextoAcceso, @Param('id') id: string) {
    return this.casos.crearAcceso.ejecutar(actor, id);
  }

  @Post(':id/acceso/restablecer')
  @HttpCode(200)
  restablecerAcceso(@ActorActual() actor: ContextoAcceso, @Param('id') id: string) {
    return this.casos.restablecerClaveAsociado.ejecutar(actor, id);
  }

  @Get(':id/estado-de-cuenta')
  estadoDeCuenta(@ActorActual() actor: ContextoAcceso, @Param('id') id: string) {
    return this.casos.estadoDeCuenta.ejecutar(actor, id);
  }
}

@Controller('v1/cuotas')
export class CuotasController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Post('generar')
  @HttpCode(200)
  generar(@ActorActual() actor: ContextoAcceso, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.casos.generarCuotas.ejecutar(actor, { periodo: b.periodo, importeCentimos: b.importeCentimos });
  }
}

@Controller('v1/pagos')
export class PagosController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  /** `201` si crea el pago; `200` con el pago original si es un reintento de la misma clave. */
  @Post()
  async registrar(
    @ActorActual() actor: ContextoAcceso,
    @Body() body: unknown,
    @Headers('idempotency-key') clave: string | undefined,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const b = cuerpo(body);
    const { pago, duplicado } = await this.casos.registrarPago.ejecutar(
      actor,
      { cuotaId: b.cuotaId, importeCentimos: b.importeCentimos, comprobante: b.comprobante },
      clave,
    );
    respuesta.status(duplicado ? 200 : 201);
    return pago;
  }

  @Get(':id')
  consultar(@ActorActual() actor: ContextoAcceso, @Param('id') id: string) {
    return this.casos.consultarPago.ejecutar(actor, id);
  }

  @Post(':id/reversa')
  @HttpCode(200)
  reversar(@ActorActual() actor: ContextoAcceso, @Param('id') id: string, @Body() body: unknown) {
    return this.casos.reversarPago.ejecutar(actor, id, { motivo: cuerpo(body).motivo });
  }
}

/** Portal del asociado: ninguna ruta recibe identificadores; todo sale de la membresía. */
@Controller('v1/portal')
export class PortalController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Get('saldo')
  async saldo(@ActorActual() actor: ContextoAcceso) {
    const c = await this.casos.portal.ejecutar(actor);
    return { asociado: { nombre: c.asociado.nombre, estado: c.asociado.estado }, saldoCentimos: c.saldoCentimos, periodoActual: c.periodoActual };
  }

  @Get('cuotas')
  async cuotas(@ActorActual() actor: ContextoAcceso) {
    return { cuotas: (await this.casos.portal.ejecutar(actor)).cuotas };
  }

  @Get('pagos')
  async pagos(@ActorActual() actor: ContextoAcceso) {
    return { pagos: (await this.casos.portal.ejecutar(actor)).pagos };
  }
}

@Controller('v1/reservorios')
export class ReservoriosController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Get()
  listar(@ActorActual() actor: ContextoAcceso) {
    return this.casos.listarReservorios.ejecutar(actor).then((reservorios) => ({ reservorios }));
  }

  /** La JASS sale de la membresía: un `jassId` del cuerpo se ignora. */
  @Post()
  crear(@ActorActual() actor: ContextoAcceso, @Body() body: unknown) {
    return this.casos.crearReservorio.ejecutar(actor, { nombre: cuerpo(body).nombre });
  }

  @Get(':id/mediciones')
  historial(@ActorActual() actor: ContextoAcceso, @Param('id') id: string) {
    return this.casos.historial.ejecutar(actor, id).then((mediciones) => ({ mediciones }));
  }
}

@Controller('v1/mediciones')
export class MedicionesController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  /**
   * Dato de referencia, igual para todos: único `GET /v1` que se puede guardar (ADR-016). Solo se cachea la
   * respuesta correcta: el encabezado se fija DESPUÉS de autorizar, de modo que un 401 o un 403 siguen en
   * `no-store`. `Vary: Authorization` evita servirla a otra sesión; Express añade el `ETag` y responde `304`.
   */
  @Get('catalogo')
  async catalogo(@ActorActual() actor: ContextoAcceso, @Res({ passthrough: true }) respuesta: Response) {
    const catalogo = await this.casos.catalogo.ejecutar(actor);
    respuesta.setHeader('Cache-Control', 'private, max-age=300');
    respuesta.setHeader('Vary', 'Authorization');
    return catalogo;
  }

  /** `201` si es nueva; `200` con el mismo resultado si es un reintento de la misma clave. */
  @Post()
  async registrar(
    @ActorActual() actor: ContextoAcceso,
    @Body() body: unknown,
    @Headers('idempotency-key') clave: string | undefined,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const { duplicado, ...resultado } = await this.casos.registrarMedicion.ejecutar(actor, cuerpo(body), clave);
    respuesta.status(duplicado ? 200 : 201);
    return resultado;
  }
}

@Controller('v1/asistente')
export class AsistenteController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Get('documentos')
  documentos(@ActorActual() actor: ContextoAcceso) {
    return this.casos.documentosAsistente.ejecutar(actor);
  }

  /** `200` con el estado `respondida`, `sin-evidencia` o `fuera-de-alcance`; `422` si la pregunta no es válida. */
  @Post('consultas')
  @HttpCode(200)
  consultar(@ActorActual() actor: ContextoAcceso, @Body() body: unknown) {
    return this.casos.asistente.ejecutar(actor, cuerpo(body).pregunta);
  }
}



/** Equipo de la JASS (Tesorería y Operador), gestionado solo por el Consejo. */
@Controller('v1/equipo')
export class EquipoController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Get()
  listar(@ActorActual() actor: ContextoAcceso) {
    return this.casos.listarEquipo.ejecutar(actor).then((equipo) => ({ equipo }));
  }

  @Post()
  crear(@ActorActual() actor: ContextoAcceso, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.casos.crearMiembroEquipo.ejecutar(actor, { nombre: b.nombre, documento: b.documento, rol: b.rol });
  }

  @Post(':usuarioId/desactivar')
  @HttpCode(204)
  async desactivar(@ActorActual() actor: ContextoAcceso, @Param('usuarioId') usuarioId: string): Promise<void> {
    await this.casos.desactivarMiembroEquipo.ejecutar(actor, usuarioId);
  }

  @Post(':usuarioId/restablecer-clave')
  @HttpCode(200)
  restablecer(@ActorActual() actor: ContextoAcceso, @Param('usuarioId') usuarioId: string) {
    return this.casos.restablecerClaveEquipo.ejecutar(actor, usuarioId);
  }
}

/** Plataforma: altas, suspensiones y claves de las JASS. Ninguna ruta toca datos de negocio. */
@Controller('v1/plataforma/jass')
export class PlataformaController {
  constructor(@Inject(CASOS) private readonly casos: Casos) {}

  @Get()
  listar(@ActorDePlataforma() actor: ContextoPlataforma) {
    return this.casos.listarJass.ejecutar(actor).then((jass) => ({ jass }));
  }

  @Post()
  crear(@ActorDePlataforma() actor: ContextoPlataforma, @Body() body: unknown) {
    const b = cuerpo(body);
    const consejo = cuerpo(b.consejo);
    return this.casos.crearJassPlataforma.ejecutar(actor, { nombre: b.nombre, ubicacion: b.ubicacion, consejo: { nombre: consejo.nombre, documento: consejo.documento } });
  }

  @Post(':id/suspender')
  @HttpCode(204)
  async suspender(@ActorDePlataforma() actor: ContextoPlataforma, @Param('id') id: string): Promise<void> {
    await this.casos.suspenderJass.ejecutar(actor, id);
  }

  @Post(':id/reactivar')
  @HttpCode(204)
  async reactivar(@ActorDePlataforma() actor: ContextoPlataforma, @Param('id') id: string): Promise<void> {
    await this.casos.reactivarJass.ejecutar(actor, id);
  }

  @Post(':id/consejo/restablecer-clave')
  @HttpCode(200)
  restablecerConsejo(@ActorDePlataforma() actor: ContextoPlataforma, @Param('id') id: string, @Body() body: unknown) {
    const usuarioId = cuerpo(body).usuarioId;
    return this.casos.restablecerClaveConsejo.ejecutar(actor, id, typeof usuarioId === 'string' ? usuarioId : undefined);
  }
}

export const CONTROLADORES = [
  SaludController,
  AuthController,
  YoController,
  AsociadosController,
  EquipoController,
  PlataformaController,
  CuotasController,
  PagosController,
  PortalController,
  ReservoriosController,
  MedicionesController,
  AsistenteController,
];
