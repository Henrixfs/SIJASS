import { normalizar } from './recuperacion.js';

/**
 * Guarda de «fuera de alcance» (s1d, design.md D4): detecta pedidos de calcular, estimar o
 * recomendar dosis, cantidades de cloro o instrucciones de tratamiento. Se aplica al texto
 * normalizado de la **pregunta** antes de consultar el corpus. Es deliberadamente amplia: un
 * falso positivo lleva a «consulte al responsable técnico»; un falso negativo sería entregar
 * contenido de dosificación, que SIJASS no ofrece sin un protocolo validado.
 */
const MATERIA = '(cloro|hipoclorito|lejia|cal|pastilla|pastillas|tableta|tabletas|gramo|gramos|litro|litros|mililitro|mililitros|ml|kilo|kilos|kg|cucharada|cucharadas|tapa|tapas)';

const PATRONES: readonly RegExp[] = [
  /\bdosi/, // dosis, dosificar, dosificacion…
  new RegExp(`\\bcuant[oa]s?\\b.*\\b${MATERIA}\\b`),
  new RegExp(`\\b${MATERIA}\\b.*\\bcuant[oa]s?\\b`),
  /\b(calcul|estim|recom|determin|obten)\w*\b.*\b(cloro|hipoclorito|dosis|cantidad|cantidades|concentracion)\b/,
  /\b(agreg|ech|aplic|anad|verter|mezcl|dilu)\w*\b.*\b(cloro|hipoclorito|lejia)\b/,
  /\b(cloro|hipoclorito|lejia)\b.*\b(agreg|ech|aplic|anad|verter|mezcl|dilu)\w*\b/,
  /\bcantidad(es)? de (cloro|hipoclorito|lejia)\b/,
  /\bformula\b.*\b(clor\w*|dosis)\b/,
  /\b(trat(ar|o|a|e|amiento)|desinfect\w*|potabiliz\w*)\b.*\b(agua|reservorio)\b/,
  /\b(agua|reservorio)\b.*\b(trat(ar|o|a|e|amiento)|desinfect\w*|potabiliz\w*)\b/,
];

export function pideDosisOTratamiento(pregunta: string): boolean {
  const t = normalizar(pregunta);
  return PATRONES.some((p) => p.test(t));
}

export const MENSAJE_FUERA_DE_ALCANCE =
  'SIJASS no calcula dosis ni indica tratamientos del agua. Ese cálculo requiere un protocolo validado y casos de referencia revisados; consulte al responsable técnico de su JASS.';
export const MENSAJE_SIN_EVIDENCIA =
  'No se encontró evidencia suficiente en los documentos disponibles. Reformule la pregunta o consulte al responsable técnico de su JASS.';
export const ADVERTENCIA_EJEMPLO = 'Los documentos de este corpus son de EJEMPLO y no están aprobados: no los use como procedimiento.';
