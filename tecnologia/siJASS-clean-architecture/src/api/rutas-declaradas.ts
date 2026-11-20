import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { CONTROLADORES } from './controladores.js';

const NOMBRE_METODO: Record<number, string> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
};

/** Une segmentos de ruta con una sola barra y sin barra final; `:id` pasa a `{id}` (OpenAPI). */
function normalizar(...partes: string[]): string {
  const ruta = `/${partes.join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return (ruta === '' ? '/' : ruta).replace(/:([A-Za-z]+)/g, '{$1}');
}

/**
 * Pares «método ruta» (por ejemplo `post /v1/pagos/{id}/reversa`) que declaran los controladores
 * de la API, leídos de los metadatos que Nest guarda en cada decorador (s1e, design.md D3).
 */
export function rutasDeLosControladores(controladores: readonly (new (...args: never[]) => unknown)[] = CONTROLADORES): string[] {
  const rutas: string[] = [];
  for (const clase of controladores) {
    const base = String(Reflect.getMetadata('path', clase) ?? '');
    for (const nombre of Object.getOwnPropertyNames(clase.prototype)) {
      if (nombre === 'constructor') continue;
      const manejador = (clase.prototype as Record<string, unknown>)[nombre];
      if (typeof manejador !== 'function') continue;
      const metodo = Reflect.getMetadata('method', manejador) as number | undefined;
      if (metodo === undefined) continue;
      rutas.push(`${NOMBRE_METODO[metodo]} ${normalizar(base, String(Reflect.getMetadata('path', manejador) ?? ''))}`);
    }
  }
  return rutas.sort();
}
