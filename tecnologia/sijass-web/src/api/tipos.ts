export interface ResumenAsociado {
  id: string;
  nombre: string;
  documento: string;
  estado: 'activo' | 'baja';
  saldoCentimos: number;
  /** Si tiene cuenta de acceso al portal. */
  acceso: EstadoAcceso;
}

export type EstadoAcceso = 'sin-acceso' | 'activo' | 'inactivo';

/** Respuesta que entrega una clave temporal: solo se muestra una vez. */
export interface AccesoEntregado {
  usuarioId: string;
  claveTemporal: string;
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

export type PagoConReversa = Omit<VistaPago, 'periodo'> & {
  reversa: { motivo: string; creadaEn: string } | null;
};

export interface EstadoDeCuenta {
  asociado: { id: string; nombre: string; documento: string; estado: 'activo' | 'baja' };
  /** Solo en la consulta del personal. */
  acceso?: EstadoAcceso;
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
