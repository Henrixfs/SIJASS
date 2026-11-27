import type { NombreIcono } from '../v3/iconos';

export const ROL_NOMBRE: Record<string, string> = {
  consejo: 'Consejo',
  tesorero: 'Tesorería',
  operador: 'Operación',
};

const finanzas = ['consejo', 'tesorero'];
const personal = [...finanzas, 'operador'];

export interface SeccionPersonal {
  id: string;
  /** Texto fijo o uno por rol (el inicio se llama distinto para cada uno). */
  nombre: string | Record<string, string>;
  descripcion: string;
  icono: NombreIcono;
  roles: string[];
  /** Fuera del menú: se llega desde la persona, abajo en el menú. */
  enMenu: boolean;
}

/** Secciones del panel en el orden del menú (maqueta v3): cada rol ve solo las suyas. */
export const seccionesPersonal: SeccionPersonal[] = [
  { id: 'inicio', nombre: { consejo: 'Resumen', tesorero: 'Mi caja', operador: 'Mi jornada' }, descripcion: 'Así va el agua de tu comunidad hoy', icono: 'grid', roles: personal, enMenu: true },
  { id: 'asociados', nombre: 'Asociados', descripcion: 'Padrón, accesos y estados de cuenta', icono: 'users', roles: finanzas, enMenu: true },
  { id: 'cuotas', nombre: 'Cuotas y pagos', descripcion: 'Cuotas por periodo e historial de pagos', icono: 'wallet', roles: finanzas, enMenu: true },
  { id: 'agua', nombre: 'El agua', descripcion: 'Reservorios y lecturas de cloro residual', icono: 'flask', roles: personal, enMenu: true },
  { id: 'reportes', nombre: 'Reportes', descripcion: 'Problemas del servicio reportados por las familias', icono: 'megafono', roles: personal, enMenu: true },
  { id: 'asistente', nombre: 'Asistente', descripcion: 'Consultas al asistente documental', icono: 'libro', roles: personal, enMenu: true },
  { id: 'equipo', nombre: 'Equipo', descripcion: 'Tesorería y Operación de su JASS', icono: 'equipo', roles: ['consejo'], enMenu: true },
  { id: 'perfil', nombre: 'Mi perfil', descripcion: 'Perfil de sesión y permisos del rol', icono: 'persona', roles: personal, enMenu: false },
];

/** Rutas anteriores que ahora viven en «El agua». */
export const ALIAS_SECCION: Record<string, string> = { reservorios: 'agua', mediciones: 'agua', campo: 'agua' };

export function nombreSeccion(s: SeccionPersonal, rol: string): string {
  return typeof s.nombre === 'string' ? s.nombre : (s.nombre[rol] ?? 'Resumen');
}
