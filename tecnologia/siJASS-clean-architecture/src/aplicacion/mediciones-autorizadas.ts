/**
 * Registro e historial de mediciones con autorización por rol y JASS (s1c, design.md D3).
 * Reutiliza `RegistrarMedicion` (s1a) sin modificarlo: la JASS y el autor salen de la membresía.
 */
import { exigirPermiso, type ContextoAcceso } from '../dominio/acceso.js';
import { DESCRIPCION_METODOS, METODOS_MEDICION, UNIDAD_MEDICION } from '../dominio/catalogo.js';
import { ErrorAccesoDenegado, ErrorConflicto, ErrorDatoInvalido, ErrorValidacion } from '../dominio/errores.js';
import type { ComandoRegistrarMedicion, Medicion } from '../dominio/medicion.js';
import { esUuid } from '../dominio/padron.js';
import type { UnidadDeTrabajo } from '../dominio/puertos.js';
import type { RegistrarMedicion } from './registrar-medicion.js';

/** Un reservorio que no existe y uno de otra JASS son indistinguibles (RF01). */
const recursoAjeno = () => new ErrorAccesoDenegado('recurso-ajeno');

export const LIMITE_HISTORIAL = 200;

export interface MedicionRegistrada {
  readonly medicionId: string;
  readonly revision: number;
  readonly registradaEn: string;
  /** `true` si es el reintento de una operación ya aceptada. */
  readonly duplicado: boolean;
}

export class RegistrarMedicionAutorizada {
  constructor(private readonly registrar: RegistrarMedicion) {}

  async ejecutar(actor: ContextoAcceso, cuerpo: Record<string, unknown>, claveIdempotencia: unknown): Promise<MedicionRegistrada> {
    exigirPermiso(actor, 'mediciones.registrar');
    const clave = typeof claveIdempotencia === 'string' ? claveIdempotencia.trim().toLowerCase() : '';
    if (!esUuid(clave)) throw new ErrorDatoInvalido('clave-idempotencia-invalida', 'Idempotency-Key debe ser un UUID');

    // Los campos extra llegan al dominio, que los rechaza con `campo-no-permitido`.
    const comando = { ...cuerpo, operationId: clave } as unknown as ComandoRegistrarMedicion;
    const r = await this.registrar.ejecutar(comando, { jassId: actor.jassId, usuarioId: actor.usuarioId }, 'en-linea');

    switch (r.resultado) {
      case 'accepted':
      case 'duplicate':
        return { ...r.medicion, duplicado: r.resultado === 'duplicate' };
      case 'conflict':
        throw new ErrorConflicto('clave-idempotencia-reutilizada');
      case 'rejected':
        if (r.motivo === 'reservorio-no-encontrado') throw recursoAjeno();
        throw new ErrorValidacion(r.motivo);
    }
  }
}

export interface VistaMedicion {
  readonly id: string;
  readonly reservorioId: string;
  readonly metodo: string;
  readonly valor: number;
  readonly unidad: string;
  readonly tomadaEn: string;
  readonly registradaEn: string;
  /** Identificador de la cuenta que registró; no se exponen nombres. */
  readonly registradoPor: string;
  readonly estado: string;
  readonly revision: number;
}

const aVista = (m: Medicion): VistaMedicion => ({
  id: m.id,
  reservorioId: m.reservorioId,
  metodo: m.metodo,
  valor: m.valor,
  unidad: m.unidad,
  tomadaEn: m.tomadaEn,
  registradaEn: m.registradaEn,
  registradoPor: m.registradoPor,
  estado: m.estado,
  revision: m.revision,
});

export class ConsultarHistorial {
  constructor(private readonly unidadDeTrabajo: UnidadDeTrabajo) {}

  async ejecutar(actor: ContextoAcceso, reservorioId: string): Promise<VistaMedicion[]> {
    exigirPermiso(actor, 'mediciones.leer');
    if (!esUuid(reservorioId)) throw recursoAjeno();
    return this.unidadDeTrabajo.ejecutar(async (r) => {
      if (!(await r.reservorios.existeEnJass(actor.jassId, reservorioId))) throw recursoAjeno();
      const todas = await r.mediciones.listar(actor.jassId, { reservorioId });
      return todas.slice(0, LIMITE_HISTORIAL).map(aVista);
    }, { jassId: actor.jassId });
  }
}

export class ConsultarCatalogo {
  ejecutar(actor: ContextoAcceso): { metodos: Array<{ codigo: string; descripcion: string }>; unidad: string } {
    exigirPermiso(actor, 'mediciones.leer');
    return { metodos: METODOS_MEDICION.map((codigo) => ({ codigo, descripcion: DESCRIPCION_METODOS[codigo] })), unidad: UNIDAD_MEDICION };
  }
}
