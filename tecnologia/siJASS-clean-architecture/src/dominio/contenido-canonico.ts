import type { TipoOperacion } from './puertos.js';

/**
 * Serializa un valor de forma canónica: JSON sin espacios, claves de objeto ordenadas de
 * forma recursiva, `undefined` omitido en objetos (y `null` en arreglos, como JSON),
 * números no finitos codificados como texto (`"NaN"`, `"Infinity"`, `"-Infinity"`) y
 * `-0` escrito como `0`. Es total sobre valores JSON más esos números, de modo que
 * también canoniza comandos inválidos (design.md D5).
 */
function canonizar(valor: unknown): string | undefined {
  if (valor === undefined || typeof valor === 'function' || typeof valor === 'symbol') return undefined;
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') return JSON.stringify(valor);
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return JSON.stringify(String(valor));
    return JSON.stringify(valor === 0 ? 0 : valor);
  }
  if (typeof valor === 'bigint') return JSON.stringify(valor.toString());
  if (Array.isArray(valor)) return `[${valor.map((v) => canonizar(v) ?? 'null').join(',')}]`;

  const objeto = valor as Record<string, unknown>;
  const pares: string[] = [];
  for (const clave of Object.keys(objeto).sort()) {
    const serializado = canonizar(objeto[clave]);
    if (serializado !== undefined) pares.push(`${JSON.stringify(clave)}:${serializado}`);
  }
  return `{${pares.join(',')}}`;
}

/**
 * Contenido canónico de una operación: `{ contenido, tipo }`, donde `contenido` es el
 * comando sin `operationId`. El tipo va anidado para que un campo `tipo` enviado por el
 * cliente no pueda sobrescribirlo. Los UUID deben normalizarse antes (design.md D1).
 */
export function contenidoCanonico(tipo: TipoOperacion, comando: object): string {
  const { operationId: _operationId, ...contenido } = comando as Record<string, unknown>;
  void _operationId;
  return canonizar({ contenido, tipo }) as string;
}
