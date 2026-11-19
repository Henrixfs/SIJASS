export interface ResumenAsociado {
  id: string;
  nombre: string;
  documento: string;
  estado: 'activo' | 'baja';
  saldoCentimos: number;
}

export interface VistaCuota {
  id: string;
  periodo: string;
  importeCentimos: number;
  pagadoCentimos: number;
  pendienteCentimos: number;
  estado: 'pendiente' | 'parcial' | 'pagada';
}

export interface VistaPago {
  id: string;
  cuotaId: string;
  periodo: string;
  importeCentimos: number;
  pagadoEn: string;
  comprobante: string;
  estado: 'vigente' | 'revertido';
}

export interface EstadoDeCuenta {
  asociado: { id: string; nombre: string; documento: string; estado: 'activo' | 'baja' };
  saldoCentimos: number;
  periodoActual: string;
  cuotas: VistaCuota[];
  pagos: VistaPago[];
}

export interface SaldoPortal {
  asociado: { nombre: string; estado: 'activo' | 'baja' };
  saldoCentimos: number;
  periodoActual: string;
}
