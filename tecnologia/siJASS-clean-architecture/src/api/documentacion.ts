/**
 * Documentación interactiva de la API (Swagger UI) servida por la propia API en `/docs`.
 *
 * - El contrato es `docs/api/openapi.yaml` (la fuente única que verifica `contrato-openapi.test.ts`).
 * - Swagger UI sale del paquete `swagger-ui-dist`, **autoalojado**: no se carga ningún script de un
 *   tercero en el mismo origen que la interfaz (donde vive el token de refresco).
 * - Solo se publican cuatro archivos fijos; el resto del paquete no se expone.
 * - Si el archivo del contrato no existe, la documentación no se monta y la API arranca igual.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const requerir = createRequire(import.meta.url);

const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API de SIJASS — documentación</title>
<link rel="stylesheet" href="/docs/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="/docs/swagger-ui-bundle.js"></script>
<script src="/docs/iniciar.js"></script>
</body>
</html>
`;

const INICIAR = `window.ui = SwaggerUIBundle({
  url: '/docs/openapi.yaml',
  dom_id: '#swagger-ui',
  deepLinking: true,
  persistAuthorization: false,
  tryItOutEnabled: true,
});
`;

const ESTATICOS: Record<string, string> = {
  '/swagger-ui.css': 'text/css; charset=utf-8',
  '/swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
};

/** Monta `/docs` y devuelve `true` si el contrato existía; si no, no hace nada. */
export function montarDocumentacion(app: NestExpressApplication, archivoOpenapi: string | undefined): boolean {
  if (archivoOpenapi === undefined || !existsSync(archivoOpenapi)) return false;
  const paquete = (requerir('swagger-ui-dist') as { getAbsoluteFSPath(): string }).getAbsoluteFSPath();
  const contrato = readFileSync(archivoOpenapi);

  app.use('/docs', (solicitud: Request, respuesta: Response, siguiente: NextFunction) => {
    if (solicitud.method !== 'GET') return siguiente();
    respuesta.setHeader('Cache-Control', 'no-cache');
    if (solicitud.path === '/' || solicitud.path === '') {
      respuesta.type('text/html; charset=utf-8').send(PAGINA);
    } else if (solicitud.path === '/iniciar.js') {
      respuesta.type('text/javascript; charset=utf-8').send(INICIAR);
    } else if (solicitud.path === '/openapi.yaml') {
      respuesta.type('application/yaml; charset=utf-8').send(contrato);
    } else if (ESTATICOS[solicitud.path] !== undefined) {
      respuesta.type(ESTATICOS[solicitud.path]).sendFile(join(paquete, solicitud.path.slice(1)));
    } else {
      respuesta.status(404).json({ codigo: 'no-encontrado', mensaje: 'Recurso no encontrado' });
    }
  });
  return true;
}
