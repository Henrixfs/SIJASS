import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorCorpus, validarManifiesto, type Corpus } from '../dominio/asistente/corpus.js';

/**
 * Carga y valida el corpus de `<directorio>/manifiesto.json`. Lanza `ErrorCorpus` si el archivo
 * falta, no es JSON o no supera la validación: la API no arranca con un corpus inválido.
 */
export function cargarCorpus(directorio: string): Corpus {
  const ruta = join(directorio, 'manifiesto.json');
  let crudo: string;
  try {
    crudo = readFileSync(ruta, 'utf8');
  } catch {
    throw new ErrorCorpus(`no se pudo leer ${ruta}`);
  }
  let manifiesto: unknown;
  try {
    manifiesto = JSON.parse(crudo);
  } catch {
    throw new ErrorCorpus(`${ruta} no es JSON válido`);
  }
  return validarManifiesto(manifiesto);
}

/** Directorio del corpus de ejemplo que se distribuye con el prototipo. */
export const DIRECTORIO_CORPUS_EJEMPLO = new URL('../../corpus-ejemplo/', import.meta.url);
