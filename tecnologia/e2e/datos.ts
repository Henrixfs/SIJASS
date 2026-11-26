/**
 * Datos fijos de las pruebas de extremo a extremo. Todo es de prueba: los DNI son ficticios
 * (los mismos de `sembrar-demo`) y la clave vive solo en este código y en la base desechable.
 */
export const CLAVE_E2E = 'Clave-E2E-segura-123';

export type TipoDeAcceso = 'asociado' | 'administrador';

export interface Cuenta {
  readonly documento: string;
  readonly nombre: string;
  readonly tipo: TipoDeAcceso;
}

/** Cuentas de `sembrar-demo` (JASS Demostración). Todas usan `CLAVE_E2E`. */
export const PLATAFORMA: Cuenta = { documento: '10000000', nombre: 'Equipo SIJASS', tipo: 'administrador' };
export const CONSEJO: Cuenta = { documento: '10000001', nombre: 'Ana Morales', tipo: 'administrador' };
export const TESORERO: Cuenta = { documento: '10000002', nombre: 'Carlos Rojas', tipo: 'administrador' };
export const OPERADOR: Cuenta = { documento: '10000003', nombre: 'Julia Flores', tipo: 'administrador' };
/** Operador con cambio de clave pendiente: sirve para probar el primer ingreso. */
export const OPERADOR_NUEVO: Cuenta = { documento: '10000004', nombre: 'Pedro Vargas', tipo: 'administrador' };
export const ROSA: Cuenta = { documento: '70000001', nombre: 'Rosa Quispe', tipo: 'asociado' }; // al día
export const LUIS: Cuenta = { documento: '70000002', nombre: 'Luis Huamán', tipo: 'asociado' };
export const ANA: Cuenta = { documento: '70000003', nombre: 'Ana Ccori', tipo: 'asociado' }; // morosa: 3 cuotas de S/ 15.00 sin pagos

/** Consejo de una segunda JASS («Otra JASS»), creada por la línea de comandos como en producción. */
export const CONSEJO_B: Cuenta = { documento: '20000001', nombre: 'Marta Ortiz', tipo: 'administrador' };
export const NOMBRE_JASS_B = 'Otra JASS';
