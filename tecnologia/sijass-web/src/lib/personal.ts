export const ROL_NOMBRE: Record<string, string> = {
  consejo: 'Consejo',
  tesorero: 'Tesorería',
  operador: 'Operador',
};

const finanzas = ['consejo', 'tesorero'];
const personal = [...finanzas, 'operador'];
export type GrupoPersonal = 'gestion' | 'servicio' | 'cuenta';
export const GRUPOS_PERSONAL: Array<{ id: GrupoPersonal; titulo: string }> = [
  { id: 'gestion', titulo: 'Gestión' },
  { id: 'servicio', titulo: 'Servicio de agua' },
];

export const seccionesPersonal: Array<{ id: string; nombre: string; descripcion: string; roles: string[]; grupo: GrupoPersonal }> = [
  { id: 'inicio', nombre: 'Resumen', descripcion: 'Resumen de la operación de su JASS', roles: personal, grupo: 'gestion' },
  { id: 'asociados', nombre: 'Asociados', descripcion: 'Padrón, accesos y estados de cuenta', roles: finanzas, grupo: 'gestion' },
  { id: 'cuotas', nombre: 'Cuotas y pagos', descripcion: 'Cuotas por periodo e historial de pagos', roles: finanzas, grupo: 'gestion' },
  { id: 'equipo', nombre: 'Equipo', descripcion: 'Tesorería y Operador de su JASS', roles: ['consejo'], grupo: 'gestion' },
  { id: 'reservorios', nombre: 'Reservorios', descripcion: 'Catálogo de reservorios de su organización', roles: personal, grupo: 'servicio' },
  { id: 'mediciones', nombre: 'Mediciones', descripcion: 'Historial de lecturas de cloro residual', roles: personal, grupo: 'servicio' },
  { id: 'campo', nombre: 'Operaciones de campo', descripcion: 'Registro manual de lecturas', roles: ['operador'], grupo: 'servicio' },
  { id: 'asistente', nombre: 'Asistente', descripcion: 'Consultas al asistente técnico', roles: personal, grupo: 'servicio' },
  { id: 'perfil', nombre: 'Mi perfil', descripcion: 'Perfil de sesión y permisos del rol', roles: personal, grupo: 'cuenta' },
];
