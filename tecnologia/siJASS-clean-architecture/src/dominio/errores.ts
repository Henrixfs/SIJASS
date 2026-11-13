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
