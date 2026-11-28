/**
 * Datos reales para las pantallas v3: se arman en el navegador con los endpoints que ya existen
 * (padrón, estados de cuenta, reservorios, mediciones e incidencias). Nada es de ejemplo.
 */
import { useCallback } from 'react';
import { ErrorApi, type ClienteApi } from '../api/cliente';
import type { EstadoDeCuenta, ResumenAsociado, VistaCuota, VistaPago } from '../api/tipos';
import { useApp } from '../contexto';
import { useCarga } from '../hooks';
import type { Incidencia } from '../lib/incidencias';
import { METODOS_TEXTO } from '../lib/medicion';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ZONA = 'America/Lima';

/** `2026-09` → `Septiembre`. */
export function mesDe(periodo: string): string {
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.exec(periodo);
  return m ? MESES[Number(m[1]) - 1] : periodo;
}

/** Fecha y hora de Lima de un instante. */
function enLima(fecha: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(fecha).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute), mes: Number(p.month), d: Number(p.day), semana: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

/** `hoy, 2:01 p. m.` · `ayer` · `23 nov, 5:01 p. m.` (hora de Lima). */
export function cuando(iso: string, corto = false, ahora: Date = new Date()): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return iso;
  const l = enLima(f);
  const hoy = enLima(ahora);
  const ayer = enLima(new Date(ahora.getTime() - 864e5));
  const dia = l.dia === hoy.dia ? 'hoy' : l.dia === ayer.dia ? 'ayer' : `${l.d} ${MESES[l.mes - 1].slice(0, 3).toLowerCase()}`;
  if (corto) return dia;
  return `${dia}, ${((l.hora + 11) % 12) + 1}:${String(l.minuto).padStart(2, '0')} ${l.hora < 12 ? 'a. m.' : 'p. m.'}`;
}

export function esHoy(iso: string, ahora: Date = new Date()): boolean {
  return enLima(new Date(iso)).dia === enLima(ahora).dia;
}

/** `Jueves 26 de noviembre`. */
export function diaLargo(ahora: Date = new Date()): string {
  const l = enLima(ahora);
  return `${DIAS[l.semana]} ${l.d} de ${MESES[l.mes - 1].toLowerCase()}`;
}

export function saludo(ahora: Date = new Date()): string {
  const h = enLima(ahora).hora;
  return h < 5 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? '';

/** Valor de cloro tal como se anotó: `0.8`, `0.65`. */
export function valorCloro(v: number): string {
  return v.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 3 });
}

// ───────────────────────── Caja: padrón + estados de cuenta ─────────────────────────

export type PagoDe = VistaPago & { asociadoId: string; nombre: string };
export interface Totales {
  emitido: number;
  cobrado: number;
  pendiente: number;
  pct: number;
  porMes: Array<{ periodo: string; emitido: number; cobrado: number }>;
  conSaldo: ResumenAsociado[];
  pagos: PagoDe[];
  importeCuota: number | null;
}
export interface Caja {
  asociados: ResumenAsociado[];
  cuentas: Record<string, EstadoDeCuenta>;
  totales: Totales;
  /** Algún estado de cuenta no se pudo leer: las cifras son parciales. */
  incompleta: boolean;
}

async function enParalelo<T, R>(lista: T[], limite: number, tarea: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(lista.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      salida[i] = await tarea(lista[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, lista.length) }, trabajador));
  return salida;
}

export function calcularTotales(asociados: ResumenAsociado[], cuentas: Record<string, EstadoDeCuenta>): Totales {
  const cuotas: Array<VistaCuota & { asociadoId: string }> = [];
  const pagos: PagoDe[] = [];
  for (const a of asociados) {
    const c = cuentas[a.id];
    if (!c) continue;
    c.cuotas.forEach((x) => cuotas.push({ ...x, asociadoId: a.id }));
    c.pagos.forEach((p) => pagos.push({ ...p, asociadoId: a.id, nombre: a.nombre }));
  }
  const emitido = cuotas.reduce((s, c) => s + c.importeCentimos, 0);
  const pendienteCuotas = cuotas.reduce((s, c) => s + c.pendienteCentimos, 0);
  const pendiente = cuotas.length ? pendienteCuotas : asociados.reduce((s, a) => s + Math.max(0, a.saldoCentimos), 0);
  const periodos = [...new Set(cuotas.map((c) => c.periodo))].sort();
  const porMes = periodos.slice(-4).map((periodo) => {
    const de = cuotas.filter((c) => c.periodo === periodo);
    const e = de.reduce((s, c) => s + c.importeCentimos, 0);
    return { periodo, emitido: e, cobrado: e - de.reduce((s, c) => s + c.pendienteCentimos, 0) };
  });
  const ultimo = periodos.at(-1);
  const importes = cuotas.filter((c) => c.periodo === ultimo).map((c) => c.importeCentimos);
  pagos.sort((a, b) => Date.parse(b.pagadoEn) - Date.parse(a.pagadoEn));
  return {
    emitido, pendiente, cobrado: emitido - pendienteCuotas,
    pct: emitido ? Math.round(((emitido - pendienteCuotas) / emitido) * 100) : 0,
    porMes,
    conSaldo: asociados.filter((a) => a.estado === 'activo' && a.saldoCentimos > 0),
    pagos,
    importeCuota: importes.length && importes.every((x) => x === importes[0]) ? importes[0] : null,
  };
}

export async function cargarCaja(api: ClienteApi): Promise<Caja> {
  const { asociados } = await api.solicitar<{ asociados: ResumenAsociado[] }>('GET', '/v1/asociados');
  let incompleta = false;
  const leidas = await enParalelo(asociados, 6, async (a) => {
    try {
      return await api.solicitar<EstadoDeCuenta>('GET', `/v1/asociados/${a.id}/estado-de-cuenta`);
    } catch {
      incompleta = true;
      return null;
    }
  });
  const cuentas: Record<string, EstadoDeCuenta> = {};
  leidas.forEach((c, i) => { if (c) cuentas[asociados[i].id] = c; });
  return { asociados, cuentas, totales: calcularTotales(asociados, cuentas), incompleta };
}

/** Padrón con el estado de cuenta de cada asociado (solo Consejo y Tesorería). */
export function useCaja(activa = true) {
  const { api } = useApp();
  const cargar = useCallback(() => (activa ? cargarCaja(api) : Promise.resolve(null)), [api, activa]);
  return useCarga(cargar);
}

// ───────────────────────── Servicio: reservorios y lecturas ─────────────────────────

export interface Medicion { id: string; metodo: string; valor: number; unidad: string; tomadaEn: string; registradaEn?: string; estado: string }
export interface ReservorioConLecturas {
  id: string;
  nombre: string;
  /** Todas, de la más antigua a la más reciente. */
  mediciones: Medicion[];
  vigentes: Medicion[];
  ultima: Medicion | null;
  /** No se pudo leer su historial: `prohibido` si el rol no puede (403). */
  fallo: false | 'prohibido' | 'error';
}
/** Nombres cortos de los métodos para tarjetas y listas. */
const NOMBRE_CORTO: Record<string, string> = { 'comparador-dpd': 'Comparador DPD', colorimetro: 'Colorímetro' };
export interface Servicio { reservorios: ReservorioConLecturas[]; metodos: Record<string, string> }

export async function cargarServicio(api: ClienteApi, conCatalogo = true): Promise<Servicio> {
  const [{ reservorios }, catalogo] = await Promise.all([
    api.solicitar<{ reservorios: Array<{ id: string; nombre: string }> }>('GET', '/v1/reservorios'),
    conCatalogo ? api.solicitar<{ metodos: Array<{ codigo: string; descripcion: string }> }>('GET', '/v1/mediciones/catalogo').catch(() => null) : Promise.resolve(null),
  ]);
  const filas = await enParalelo(reservorios, 6, async (r): Promise<ReservorioConLecturas> => {
    try {
      const { mediciones } = await api.solicitar<{ mediciones: Medicion[] }>('GET', `/v1/reservorios/${r.id}/mediciones`);
      const todas = [...mediciones].sort((a, b) => Date.parse(a.tomadaEn) - Date.parse(b.tomadaEn));
      const vigentes = todas.filter((m) => m.estado === 'vigente');
      return { id: r.id, nombre: r.nombre, mediciones: todas, vigentes, ultima: vigentes.at(-1) ?? null, fallo: false };
    } catch (e) {
      return { id: r.id, nombre: r.nombre, mediciones: [], vigentes: [], ultima: null, fallo: e instanceof ErrorApi && e.estado === 403 ? 'prohibido' : 'error' };
    }
  });
  const metodos: Record<string, string> = { ...METODOS_TEXTO };
  catalogo?.metodos.forEach((m) => { metodos[m.codigo] = m.descripcion; });
  Object.assign(metodos, NOMBRE_CORTO);
  // Primero los reservorios con la lectura más reciente; los que aún no tienen, al final.
  filas.sort((a, b) => (Date.parse(b.ultima?.tomadaEn ?? '') || 0) - (Date.parse(a.ultima?.tomadaEn ?? '') || 0) || a.nombre.localeCompare(b.nombre, 'es'));
  return { reservorios: filas, metodos };
}

export function useServicio() {
  const { api } = useApp();
  const cargar = useCallback(() => cargarServicio(api), [api]);
  return useCarga(cargar);
}

// ───────────────────────── Reportes de las familias ─────────────────────────

export function useIncidencias(activa = true) {
  const { api } = useApp();
  const cargar = useCallback(
    () => (activa ? api.solicitar<{ incidencias: Incidencia[] }>('GET', '/v1/incidencias?limite=100').then((r) => r.incidencias) : Promise.resolve([] as Incidencia[])),
    [api, activa],
  );
  return useCarga(cargar);
}
