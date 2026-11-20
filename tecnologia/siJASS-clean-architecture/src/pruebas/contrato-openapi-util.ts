/** Utilidades del contrato OpenAPI compartidas por las pruebas (s1e). No es una prueba. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const RUTA_OPENAPI = fileURLToPath(new URL('../../../../docs/api/openapi.yaml', import.meta.url));
export const METODOS = ['get', 'post', 'put', 'delete', 'patch'];

export interface DocumentoOpenApi {
  openapi: string;
  paths: Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, unknown>; responses?: Record<string, unknown> };
}

export function cargarOpenApi(): DocumentoOpenApi {
  return parse(readFileSync(RUTA_OPENAPI, 'utf8')) as DocumentoOpenApi;
}

export function rutasDelDocumento(doc: DocumentoOpenApi): string[] {
  const rutas: string[] = [];
  for (const [ruta, operaciones] of Object.entries(doc.paths)) for (const metodo of Object.keys(operaciones)) if (METODOS.includes(metodo)) rutas.push(`${metodo} ${ruta}`);
  return rutas.sort();
}

/** Diferencias entre lo que declara el código y lo que documenta el contrato. */
export function comparar(codigo: readonly string[], documento: readonly string[]): { sinDocumentar: string[]; inexistentes: string[] } {
  return {
    sinDocumentar: codigo.filter((r) => !documento.includes(r)),
    inexistentes: documento.filter((r) => !codigo.includes(r)),
  };
}

