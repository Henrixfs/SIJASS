import { ErrorDatoInvalido } from './errores.js';

/** Máximo por cuota o pago, igual que la restricción de la base (design.md D4). */
export const MAX_IMPORTE_CENTIMOS = 1_000_000_000;

export interface Asociado {
  readonly id: string;
  readonly jassId: string;
  readonly nombre: string;
  readonly documento: string;
  readonly estado: 'activo' | 'baja';
}

export interface Cuota {
  readonly id: string;
  readonly jassId: string;
  readonly asociadoId: string;
  /** `AAAA-MM`. */
  readonly periodo: string;
  readonly importeCentimos: number;
}

export interface Pago {
  readonly id: string;
  readonly jassId: string;
  readonly cuotaId: string;
  readonly importeCentimos: number;
  /** Instante ISO de la recepción del pago por el servidor. */
  readonly pagadoEn: string;
  readonly comprobante: string;
  readonly claveIdempotencia: string;
  readonly payloadHash: string;
  readonly estado: 'vigente' | 'revertido';
  readonly registradoPor: string;
}

export interface ReversaPago {
  readonly id: string;
  readonly jassId: string;
  readonly pagoId: string;
  readonly motivo: string;
  readonly actorId: string;
  readonly creadaEn: string;
}

export type EstadoCuota = 'pendiente' | 'parcial' | 'pagada';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const DOCUMENTO = /^[A-Za-z0-9-]{4,20}$/;

/** UUID en minúsculas (los identificadores se normalizan antes de validarlos). */
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/** Importe entero positivo en céntimos. */
export function validarImporte(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0 || valor > MAX_IMPORTE_CENTIMOS) {
    throw new ErrorDatoInvalido('importe-invalido', 'debe ser un entero positivo en céntimos');
  }
  return valor;
}

export function validarPeriodo(valor: unknown): string {
  if (typeof valor !== 'string' || !PERIODO.test(valor)) {
    throw new ErrorDatoInvalido('periodo-invalido', 'debe cumplir AAAA-MM');
  }
  return valor;
}

function textoAcotado(valor: unknown, codigo: string, max: number): string {
  if (typeof valor !== 'string') throw new ErrorDatoInvalido(codigo);
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > max) throw new ErrorDatoInvalido(codigo);
  return texto;
}

export const validarNombre = (valor: unknown): string => textoAcotado(valor, 'nombre-invalido', 120);
export const validarComprobante = (valor: unknown): string => textoAcotado(valor, 'comprobante-invalido', 60);
export const validarMotivo = (valor: unknown): string => textoAcotado(valor, 'motivo-invalido', 300);

export function validarDocumento(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!DOCUMENTO.test(texto)) throw new ErrorDatoInvalido('documento-invalido', '4 a 20 letras, dígitos o guiones');
  return texto;
}

/**
 * Periodo `AAAA-MM` vigente en el Perú (UTC-5 todo el año, sin horario de verano),
 * calculado a partir de un instante. Design.md D5.
 */
export function periodoActual(ahora: Date): string {
  const lima = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return `${String(lima.getUTCFullYear()).padStart(4, '0')}-${String(lima.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Suma de los pagos vigentes. */
export function totalVigente(pagos: readonly Pick<Pago, 'importeCentimos' | 'estado'>[]): number {
  return pagos.reduce((acc, p) => (p.estado === 'vigente' ? acc + p.importeCentimos : acc), 0);
}

export function estadoCuota(cuota: Pick<Cuota, 'importeCentimos'>, pagosDeLaCuota: readonly Pago[]): EstadoCuota {
  const pagado = totalVigente(pagosDeLaCuota);
  if (pagado <= 0) return 'pendiente';
  return pagado >= cuota.importeCentimos ? 'pagada' : 'parcial';
}

/** Lo que falta por pagar de una cuota (nunca negativo). */
export function pendienteDeCuota(cuota: Pick<Cuota, 'importeCentimos'>, pagosDeLaCuota: readonly Pago[]): number {
  return Math.max(0, cuota.importeCentimos - totalVigente(pagosDeLaCuota));
}

/**
 * Saldo = cuotas exigibles (periodo ≤ periodo actual) − pagos no revertidos del asociado.
 * Positivo cuando el asociado debe (RF05, spec `cuotas-y-pagos`).
 */
export function saldoAsociado(
  cuotas: readonly Pick<Cuota, 'periodo' | 'importeCentimos'>[],
  pagos: readonly Pick<Pago, 'importeCentimos' | 'estado'>[],
  periodoVigente: string,
): number {
  const exigible = cuotas.filter((c) => c.periodo <= periodoVigente).reduce((acc, c) => acc + c.importeCentimos, 0);
  return exigible - totalVigente(pagos);
}
