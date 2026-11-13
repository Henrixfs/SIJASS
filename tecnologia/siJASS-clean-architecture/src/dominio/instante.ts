import { ErrorValidacion } from './errores.js';

/**
 * ISO 8601 estricto: fecha y hora completas (segundos obligatorios), 0 a 3 decimales y
 * desplazamiento de zona obligatorio (`Z` o `±hh:mm`). Ver design.md D1: `Date.parse`
 * acepta fechas inexistentes y cadenas sin zona, por eso no se usa para validar.
 */
const FORMATO_INSTANTE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const MS_POR_MINUTO = 60_000;

/**
 * Valida un instante declarado y lo devuelve normalizado a UTC con milisegundos
 * (`toISOString()`). Lanza `ErrorValidacion('fecha-invalida')` si no cumple el formato
 * o si el día de calendario no existe. El resultado no depende de la zona del servidor.
 */
export function normalizarInstante(texto: unknown): string {
  if (typeof texto !== 'string') throw new ErrorValidacion('fecha-invalida', 'no es texto');
  const partes = FORMATO_INSTANTE.exec(texto);
  if (!partes) throw new ErrorValidacion('fecha-invalida', texto);

  const [, a, me, d, h, mi, s, fraccion, signo, zh, zm] = partes;
  const anio = Number(a);
  const mes = Number(me);
  const dia = Number(d);
  const hora = Number(h);
  const minuto = Number(mi);
  const segundo = Number(s);
  const milisegundo = fraccion === undefined ? 0 : Number(fraccion.padEnd(3, '0'));

  if (hora > 23 || minuto > 59 || segundo > 59) throw new ErrorValidacion('fecha-invalida', texto);

  let desplazamientoMin = 0;
  if (signo !== undefined) {
    const horasZona = Number(zh);
    const minutosZona = Number(zm);
    if (horasZona > 23 || minutosZona > 59) throw new ErrorValidacion('fecha-invalida', texto);
    desplazamientoMin = (signo === '-' ? -1 : 1) * (horasZona * 60 + minutosZona);
  }

  // Hora de pared declarada, interpretada como UTC solo para comprobar el calendario.
  const pared = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo, milisegundo));
  if (
    pared.getUTCFullYear() !== anio ||
    pared.getUTCMonth() !== mes - 1 ||
    pared.getUTCDate() !== dia
  ) {
    throw new ErrorValidacion('fecha-invalida', texto);
  }

  return new Date(pared.getTime() - desplazamientoMin * MS_POR_MINUTO).toISOString();
}
