import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Casos } from '../aplicacion/casos.js';
import type { ContextoAcceso } from '../dominio/acceso.js';
import { ActorActual, CASOS, cuerpo, Publico } from './comun.js';

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
  login(@Body() body: unknown) {
    const b = cuerpo(body);
    return this.casos.autenticar.ejecutar({ correo: b.correo, contrasena: b.contrasena });
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
}

@Controller('v1/yo')
export class YoController {
  /** Perfil y rol de quien consulta; nunca la JASS ni los tokens. */
  @Get()
  yo(@ActorActual() actor: ContextoAcceso) {
    return { perfil: actor.perfil, rol: actor.rol };
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

  @Post(':id/acceso')
  crearAcceso(@ActorActual() actor: ContextoAcceso, @Param('id') id: string, @Body() body: unknown) {
    const b = cuerpo(body);
    return this.casos.crearAcceso.ejecutar(actor, id, { correo: b.correo, contrasena: b.contrasena });
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

  @Get('catalogo')
  catalogo(@ActorActual() actor: ContextoAcceso) {
    return this.casos.catalogo.ejecutar(actor);
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

export const CONTROLADORES = [SaludController, AuthController, YoController, AsociadosController, CuotasController, PagosController, PortalController, ReservoriosController, MedicionesController, AsistenteController];
