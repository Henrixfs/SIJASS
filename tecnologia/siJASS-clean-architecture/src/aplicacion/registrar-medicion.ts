import { ErrorValidacion, type MotivoRechazo } from '../dominio/errores.js';
import {
  crearMedicion,
  esUuid,
  normalizarIdentificadores,
  TOLERANCIA_TOMA_MS_POR_DEFECTO,
  type ComandoRegistrarMedicion,
  type Origen,
} from '../dominio/medicion.js';
import type { ContextoActor, GeneradorIds, Reloj, ResultadoRegistro, TipoOperacion, UnidadDeTrabajo } from '../dominio/puertos.js';
import { hashOperacion } from './hash-operacion.js';

/** Resultado explícito de cada operación (diseño interno §5.2, spec `registro-idempotente`). */
export type ResultadoOperacion =
  | { readonly resultado: 'accepted' | 'duplicate'; readonly operationId: string; readonly medicion: ResultadoRegistro }
  | { readonly resultado: 'conflict'; readonly operationId: string }
  | { readonly resultado: 'rejected'; readonly operationId: string; readonly motivo: MotivoRechazo };

export interface DependenciasRegistrarMedicion {
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  readonly reloj: Reloj;
  readonly ids: GeneradorIds;
  /** Tolerancia entre la toma y la recepción; por defecto, 5 minutos (design.md D3). */
  readonly toleranciaMs?: number;
}

const TIPO: TipoOperacion = 'registrar-medicion';

/**
 * Registro idempotente de una medición (ADR-005, diseño interno §5.3, design.md D6).
 * La reserva de (JASS, operationId), la escritura de la medición y el registro del
 * resultado se confirman en una sola unidad de trabajo, o se revierten juntos.
 */
export class RegistrarMedicion {
  private readonly toleranciaMs: number;

  constructor(private readonly dependencias: DependenciasRegistrarMedicion) {
    this.toleranciaMs = dependencias.toleranciaMs ?? TOLERANCIA_TOMA_MS_POR_DEFECTO;
  }

  async ejecutar(comando: ComandoRegistrarMedicion, actor: ContextoActor, origen: Origen): Promise<ResultadoOperacion> {
    // Paso 1 (fuera de la transacción): UUID en minúsculas (D1), operationId válido,
    // hash del contenido canónico (D5) y hora de recepción, leída una sola vez (D3).
    const normalizado = normalizarIdentificadores(comando);
    const operationId = normalizado.operationId;
    if (!esUuid(operationId)) return { resultado: 'rejected', operationId, motivo: 'operacion-invalida' };
    const payloadHash = hashOperacion(TIPO, normalizado);
    const registradaEn = this.dependencias.reloj.ahora();

    try {
      return await this.dependencias.unidadDeTrabajo.ejecutar(async ({ mediciones, operaciones, reservorios }) => {
        // Paso 2: reservar; si ya existía, decidir solo por el hash, sin validar el contenido nuevo.
        const reserva = await operaciones.reservar(actor.jassId, operationId, payloadHash, TIPO);
        if (!reserva.nueva) {
          return reserva.payloadHash === payloadHash
            ? { resultado: 'duplicate', operationId, medicion: reserva.resultado }
            : { resultado: 'conflict', operationId };
        }

        // Paso 3: reglas puras y pertenencia del reservorio; un fallo lanza y revierte la reserva.
        const medicion = crearMedicion(normalizado, {
          jassId: actor.jassId,
          usuarioId: actor.usuarioId,
          origen,
          id: this.dependencias.ids.nuevo(),
          registradaEn,
          toleranciaMs: this.toleranciaMs,
        });
        if (!(await reservorios.existeEnJass(actor.jassId, medicion.reservorioId))) {
          throw new ErrorValidacion('reservorio-no-encontrado');
        }

        // Paso 4: escritura y resultado en la misma unidad de trabajo.
        await mediciones.guardar(medicion);
        const resultado: ResultadoRegistro = {
          medicionId: medicion.id,
          revision: medicion.revision,
          registradaEn: medicion.registradaEn,
        };
        await operaciones.registrarResultado(actor.jassId, operationId, resultado);
        return { resultado: 'accepted', operationId, medicion: resultado };
      }, { jassId: actor.jassId });
    } catch (error) {
      // Paso 5: un dato inválido es `rejected`; cualquier otro error (incluido
      // ErrorMedicionDuplicada) es un fallo reintentable y se propaga.
      if (error instanceof ErrorValidacion) return { resultado: 'rejected', operationId, motivo: error.codigo };
      throw error;
    }
  }
}
