/** Incidencias (s1f): tipos de la API y textos en lenguaje común para las pantallas. */
export type Categoria = 'fuga' | 'interrupcion' | 'averia' | 'presion' | 'calidad-observada' | 'otra';
export type Alcance = 'individual' | 'varias-viviendas' | 'general' | 'desconocido';
export type EstadoIncidencia = 'registrada' | 'en-atencion' | 'cerrada';
export type Prioridad = 'baja' | 'media' | 'alta';

export interface Incidencia {
  id: string;
  categoria: Categoria;
  alcanceReportado: Alcance;
  descripcion: string;
  observadaEn: string;
  ubicacion: string;
  estado: EstadoIncidencia;
  creadaEn: string;
  revision: number;
  tieneFoto: boolean;
  /** Solo para el personal. */
  sugerencia?: { prioridad: Prioridad; regla: string; version: number };
  prioridadConfirmada?: Prioridad | null;
  responsableId?: string | null;
  reportadoPor?: { asociadoId: string; nombre: string | null };
}

export interface EventoIncidencia {
  tipo: 'creada' | 'estado' | 'prioridad' | 'responsable' | 'accion' | 'foto';
  detalle: Record<string, string | number | null>;
  creadoEn: string;
  publico?: boolean;
  actorId?: string;
}

export const CATEGORIAS: Record<Categoria, { texto: string; ayuda: string; color: string }> = {
  fuga: { texto: 'Fuga de agua', ayuda: 'Se está saliendo el agua', color: '#2F8FE0' },
  interrupcion: { texto: 'No hay agua', ayuda: 'Se cortó el servicio', color: '#D9603F' },
  'calidad-observada': { texto: 'Agua turbia', ayuda: 'Color, olor o sabor raro', color: '#B7852B' },
  presion: { texto: 'Poca presión', ayuda: 'Sale muy despacio', color: '#7D6BCB' },
  averia: { texto: 'Algo está roto', ayuda: 'Tubería, caño o tapa', color: '#3F8E6A' },
  otra: { texto: 'Otro o reclamo', ayuda: 'Cuéntalo con tus palabras', color: '#51707A' },
};

export const ALCANCES: Record<Alcance, string> = {
  individual: 'Solo mi casa',
  'varias-viviendas': 'Varias casas',
  general: 'Toda la zona',
  desconocido: 'No sé',
};

export const ESTADO_PERSONAL: Record<EstadoIncidencia, string> = { registrada: 'Registrada', 'en-atencion': 'En atención', cerrada: 'Cerrada' };
export const ESTADO_FAMILIA: Record<EstadoIncidencia, string> = { registrada: 'Enviado', 'en-atencion': 'En atención', cerrada: 'Atendido' };

/** Frases que la familia puede tocar en vez de escribir. */
export const FRASES: Record<Categoria, string[]> = {
  fuga: ['Sale agua de una tubería', 'Un caño no cierra'],
  interrupcion: ['No llega agua desde la mañana', 'Se corta a ratos'],
  'calidad-observada': ['El agua sale con color', 'El agua huele raro'],
  presion: ['El agua sale muy despacio', 'No sube al caño'],
  averia: ['Una tapa está rota', 'Un caño está roto'],
  otra: ['Tengo un reclamo sobre mi cuota', 'Quiero hacer una consulta'],
};

/** `2026-11-26T13:05Z` → `26 nov, 8:05 a. m.` en hora de Lima. */
export function fechaHora(iso: string): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return iso;
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' }).format(f);
}

/** Texto de un evento del historial. */
export function textoEvento(e: EventoIncidencia, familia: boolean): string {
  const d = e.detalle;
  switch (e.tipo) {
    case 'creada': return familia ? 'Enviaste el reporte' : 'Reporte recibido';
    case 'estado':
      if (d.a === 'cerrada') return `${familia ? 'Atendido' : 'Cerrado'}: ${d.detalle ?? ''}`.trim();
      if (d.de === 'cerrada') return `Reabierto: ${d.detalle ?? ''}`.trim();
      return 'La JASS empezó a atender';
    case 'accion': return String(d.descripcion ?? 'Acción');
    case 'prioridad': return `Prioridad ${d.confirmada}${d.motivo ? ` (${d.motivo})` : ''}`;
    case 'responsable': return d.responsable ? 'Responsable asignado' : 'Sin responsable';
    case 'foto': return 'Foto adjunta';
  }
}
