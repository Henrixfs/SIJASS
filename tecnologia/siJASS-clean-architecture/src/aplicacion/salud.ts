import type { UnidadDeTrabajoAcceso } from '../dominio/puertos-acceso.js';

export interface EstadoSalud {
  readonly estado: 'ok' | 'degradado';
  readonly base: 'ok' | 'error';
}

const LIMITE_MS = 2000;
/** Identificador que no existe: la consulta solo comprueba que la base responde. */
const ID_SONDA = '00000000-0000-0000-0000-000000000000';

/**
 * Sonda de salud para despliegues (s1e, design.md D1): una consulta trivial con límite de
 * tiempo. No devuelve ni registra direcciones, credenciales ni mensajes de la base.
 */
export class ConsultarSalud {
  constructor(
    private readonly unidadDeTrabajo: UnidadDeTrabajoAcceso,
    private readonly registrar: (mensaje: string) => void = () => undefined,
  ) {}

  async ejecutar(): Promise<EstadoSalud> {
    let temporizador: NodeJS.Timeout | undefined;
    try {
      const limite = new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error('tiempo agotado')), LIMITE_MS);
      });
      await Promise.race([this.unidadDeTrabajo.ejecutar((r) => r.jass.existe(ID_SONDA)), limite]);
      return { estado: 'ok', base: 'ok' };
    } catch (error) {
      this.registrar(`sonda de salud: la base no responde (${error instanceof Error ? error.name : 'error'})`);
      return { estado: 'degradado', base: 'error' };
    } finally {
      clearTimeout(temporizador);
    }
  }
}
