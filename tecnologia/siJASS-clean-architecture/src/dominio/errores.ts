/** Motivos de rechazo de una operación de registro (conjunto cerrado, design.md D1). */
export const MOTIVOS_RECHAZO = Object.freeze([
  'operacion-invalida',
  'campo-no-permitido',
  'identificador-invalido',
  'valor-invalido',
  'unidad-invalida',
  'metodo-desconocido',
  'fecha-invalida',
  'toma-posterior-a-recepcion',
  'reservorio-no-encontrado',
] as const);

export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

/** Base de todos los errores de dominio: cada uno lleva un código estable. */
export abstract class ErrorDominio extends Error {
  protected constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/** Dato del comando que incumple una regla de integridad; se informa como `rejected`. */
export class ErrorValidacion extends ErrorDominio {
  declare readonly codigo: MotivoRechazo;

  constructor(motivo: MotivoRechazo, detalle?: string) {
    super(motivo, detalle ? `${motivo}: ${detalle}` : motivo);
  }
}

/**
 * Ya existe una medición con el mismo par (jassId, id). Forma parte del contrato de
 * `RepositorioMediciones` (DT06); no es un dato inválido del cliente.
 */
export class ErrorMedicionDuplicada extends ErrorDominio {
  constructor(
    readonly jassId: string,
    readonly medicionId: string,
  ) {
    super('medicion-duplicada', `medición duplicada: ${jassId}/${medicionId}`);
  }
}

// ---------------------------------------------------------------------------
// Errores de acceso, padrón y pagos (s1b-acceso-cuotas-pagos). Cada uno lleva un código
// estable; la capa de interfaz los traduce a HTTP (design.md D9) sin interpretar mensajes.
// ---------------------------------------------------------------------------

/** Falta o falla la autenticación (credenciales o token): HTTP 401. */
export class ErrorNoAutenticado extends ErrorDominio {
  constructor(codigo: 'credenciales-invalidas' | 'token-invalido' | 'sesion-invalida' = 'credenciales-invalidas') {
    super(codigo, codigo);
  }
}

/** La cuenta está bloqueada temporalmente por intentos fallidos: HTTP 429. */
export class ErrorCuentaBloqueada extends ErrorDominio {
  constructor(readonly bloqueadoHasta: string) {
    super('cuenta-bloqueada', 'cuenta bloqueada temporalmente');
  }
}

/**
 * El actor autenticado no tiene permiso sobre la operación o el recurso: HTTP 403. El
 * mismo error se usa para un recurso inexistente y para uno de otra JASS (RF01).
 */
export class ErrorAccesoDenegado extends ErrorDominio {
  constructor(readonly motivo: string) {
    super('acceso-denegado', 'acceso denegado');
  }
}

/** Dato de entrada que incumple una regla de negocio: HTTP 422. */
export class ErrorDatoInvalido extends ErrorDominio {
  constructor(codigo: string, detalle?: string) {
    super(codigo, detalle ? `${codigo}: ${detalle}` : codigo);
  }
}

/** La operación choca con el estado actual (duplicado, ya revertido, baja…): HTTP 409. */
export class ErrorConflicto extends ErrorDominio {
  constructor(codigo: string, detalle?: string) {
    super(codigo, detalle ? `${codigo}: ${detalle}` : codigo);
  }
}
