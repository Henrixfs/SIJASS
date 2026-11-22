import type { DocumentoCorpus } from './corpus.js';

/** Minúsculas, sin acentos y con los signos convertidos en espacios. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

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

const ENTRE_TERMINOS = '(?:[a-z0-9]+ ){0,8}';
const PRODUCTO = '(?:cloro(?! residual\\b)|hipoclorito|lejia|desinfectante|pastillas? (?:de )?clor\\w*)';
const APLICACION = '(?:agreg|ech|aplic|anad|vert|mezcl|dilu|incorpor|disuelv|disolv|vierta|dosifi|pong|prepar|utilic|use)\\w*';
const OPERACION = '(?:dosis|dosific\\w*|clor\\w*|tratamiento|potabiliz\\w*|desinfeccion)';
const UNIDAD = '(?:mg|g|kg|ml|l|miligramos?|gramos?|kilos?|mililitros?|litros?|gotas?|pastillas?|tabletas?|cucharadas?|tapas?|ppm|por ciento)';
const CANTIDAD = `(?:\\d+(?: \\d+)?|un[oa]?|dos|tres|cuatro|cinco|medio|media) ${UNIDAD}(?: (?:por )?(?:l|litros?))?`;
const PATRONES_CONTENIDO: readonly RegExp[] = [
  new RegExp(`\\b(?:formulas?|ecuaciones?|calculos?|tablas?|cantidades?|proporciones?) (?:de|del|para) ${OPERACION}\\b`),
  new RegExp(`\\b${APLICACION} ${ENTRE_TERMINOS}${PRODUCTO}\\b`),
  new RegExp(`\\b${APLICACION} ${ENTRE_TERMINOS}${CANTIDAD}\\b(?! de reactivo (?:al|en el) frasco de muestra\\b)`),
  new RegExp(`\\b${CANTIDAD} (?:de )?${PRODUCTO}\\b`),
  new RegExp(`\\b(?:dosis|dosific\\w*|concentracion (?:objetivo|recomendada)|hasta (?:alcanzar|obtener)) ${ENTRE_TERMINOS}${CANTIDAD}\\b`),
  /\b(?:calcule|estime|determine|recomiende) (?:la )?(?:dosis|dosificacion)\b/,
  /\b(?:desinfecte|potabilice|clore|trate) (?:el |la )?(?:agua|reservorio)\b/,
];

/** Detecta instrucciones, fórmulas y cantidades en contexto, incluidas sus combinaciones en una referencia. */
export function contieneContenidoSanitarioRestringido(texto: string): boolean {
  return texto.split(/(?<=[.!?;])\s+/).some((frase) => {
    const compatible = frase.normalize('NFKC');
    const normalizada = normalizar(compatible);
    const etiquetas = compatible.split(/[:=]/).slice(0, -1);
    return PATRONES_CONTENIDO.some((patron) => patron.test(normalizada))
      || etiquetas.some((etiqueta) => /\b(?:dosis|dosificacion)(?: calculada| indicada| recomendada)?$/.test(normalizar(etiqueta)));
  });
}

export function referenciaSanitariaPermitida(documento: Pick<DocumentoCorpus, 'id' | 'titulo' | 'version'>): boolean {
  return !contieneContenidoSanitarioRestringido(`${documento.id} ${documento.titulo} ${documento.version}`);
}

export const MENSAJE_FUERA_DE_ALCANCE =
  'SIJASS no calcula dosis ni indica tratamientos del agua. Ese cálculo requiere un protocolo validado y casos de referencia revisados; consulte al responsable técnico de su JASS.';
export const MENSAJE_SIN_EVIDENCIA =
  'No se encontró evidencia suficiente en los documentos disponibles. Reformule la pregunta o consulte al responsable técnico de su JASS.';
export const ADVERTENCIA_EJEMPLO = 'Los documentos de este corpus son de EJEMPLO y no están aprobados: no los use como procedimiento.';
