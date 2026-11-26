const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-11` → `noviembre de 2026`. Si el texto no es un periodo, se devuelve tal cual. */
export function nombrePeriodo(periodo: string): { mes: string; anio: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodo);
  return m ? { mes: MESES[Number(m[2]) - 1], anio: m[1] } : null;
}

export function periodoLargo(periodo: string): string {
  const p = nombrePeriodo(periodo);
  return p ? `${p.mes} de ${p.anio}` : periodo;
}

/** `2026-11` → `Noviembre 2026`. */
export function periodoTitulo(periodo: string): string {
  const p = nombrePeriodo(periodo);
  return p ? `${p.mes[0].toUpperCase()}${p.mes.slice(1)} ${p.anio}` : periodo;
}

export function soloMes(periodo: string): string {
  return nombrePeriodo(periodo)?.mes ?? periodo;
}

/** `2026-10-30T...` → `30 oct` (en hora de Lima). */
export function fechaCorta(iso: string): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return iso;
  const partes = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'numeric', timeZone: 'America/Lima' }).formatToParts(f);
  const dia = partes.find((p) => p.type === 'day')?.value ?? '';
  const mes = Number(partes.find((p) => p.type === 'month')?.value ?? '1');
  return `${dia} ${MESES_CORTOS[mes - 1]}`;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[1][0] : '')).toUpperCase() || '·';
}

/** Tiempo transcurrido hasta `ahora`: `hace 35 min`, `hace 2 h`, `hace 3 d`. */
export function haceTiempo(iso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Hora de Lima en formato `09:30`. */
export function horaLima(fecha: Date): string {
  return fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
}
