import { Module, type DynamicModule, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Casos } from '../aplicacion/casos.js';
import { CASOS } from './comun.js';
import { CONTROLADORES } from './controladores.js';
import { FiltroErrores, GuardiaAcceso } from './guardia-y-filtro.js';

@Module({})
class ModuloApi {
  static con(casos: Casos): DynamicModule {
    return { module: ModuloApi, controllers: CONTROLADORES, providers: [{ provide: CASOS, useValue: casos }] };
  }
}

export interface OpcionesAplicacion {
  readonly casos: Casos;
  readonly origenesPermitidos?: readonly string[];
  /** Carpeta de la interfaz construida; si existe, la API la sirve con respaldo a `index.html`. */
  readonly directorioWeb?: string;
  readonly registrar?: (mensaje: string) => void;
}

/** Cabeceras seguras en toda respuesta y `Cache-Control: no-store` en la API. */
function cabecerasSeguras(solicitud: Request, respuesta: Response, siguiente: NextFunction): void {
  respuesta.setHeader('X-Content-Type-Options', 'nosniff');
  respuesta.setHeader('X-Frame-Options', 'DENY');
  respuesta.setHeader('Referrer-Policy', 'no-referrer');
  if (solicitud.path.startsWith('/v1/')) respuesta.setHeader('Cache-Control', 'no-store');
  siguiente();
}

/**
 * Construye la aplicación NestJS sin ponerla a escuchar (las pruebas HTTP usan `listen(0)`).
 * Los casos de uso llegan ya construidos: el dominio y la aplicación no conocen a Nest.
 */
export async function crearAplicacion(opciones: OpcionesAplicacion): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(ModuloApi.con(opciones.casos), { logger: ['error', 'warn'], bodyParser: true });
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '100kb' });
  app.use(cabecerasSeguras);
  app.useGlobalGuards(new GuardiaAcceso(opciones.casos));
  app.useGlobalFilters(new FiltroErrores(opciones.casos, opciones.registrar));
  if (opciones.origenesPermitidos && opciones.origenesPermitidos.length > 0) {
    app.enableCors({ origin: [...opciones.origenesPermitidos], methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] });
  }
  if (opciones.directorioWeb && existsSync(join(opciones.directorioWeb, 'index.html'))) {
    app.useStaticAssets(opciones.directorioWeb, { index: false, maxAge: '1h' });
    // Respaldo de la SPA: cualquier GET que no sea API ni recurso estático devuelve index.html.
    app.use((solicitud: Request, respuesta: Response, siguiente: NextFunction) => {
      if (solicitud.method !== 'GET' || solicitud.path.startsWith('/v1/')) return siguiente();
      respuesta.sendFile(join(opciones.directorioWeb as string, 'index.html'));
    });
  }
  await app.init();
  return app;
}
