import { createHash } from 'node:crypto';
import { exigirPermiso, type ContextoAcceso } from '../../dominio/acceso.js';
import { ErrorAccesoDenegado, ErrorConflicto, ErrorDatoInvalido } from '../../dominio/errores.js';
import {
  esUuid,
  pendienteDeCuota,
  validarComprobante,
  validarImporte,
  validarMotivo,
  type Pago,
} from '../../dominio/padron.js';
import { auditar, type DependenciasAcceso } from '../acceso/comun.js';

const recursoAjeno = () => new ErrorAccesoDenegado('recurso-ajeno');

/** SHA-256 del contenido del pago (claves en orden fijo): detecta la misma clave con otro contenido (D6). */
export function hashDePago(contenido: { cuotaId: string; importeCentimos: number; comprobante: string }): string {
  const canonico = JSON.stringify({ comprobante: contenido.comprobante, cuotaId: contenido.cuotaId, importeCentimos: contenido.importeCentimos });
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

export interface ResultadoPago {
  readonly pago: Pago;
  /** `true` si es el reintento de un pago ya registrado (misma clave y mismo contenido). */
  readonly duplicado: boolean;
}

export class RegistrarPago {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(
    actor: ContextoAcceso,
    comando: { cuotaId: unknown; importeCentimos: unknown; comprobante: unknown },
    claveIdempotencia: unknown,
  ): Promise<ResultadoPago> {
    exigirPermiso(actor, 'pagos.registrar');
    const clave = typeof claveIdempotencia === 'string' ? claveIdempotencia.trim().toLowerCase() : '';
    if (!esUuid(clave)) throw new ErrorDatoInvalido('clave-idempotencia-invalida', 'Idempotency-Key debe ser un UUID');
    const cuotaId = typeof comando.cuotaId === 'string' ? comando.cuotaId.trim().toLowerCase() : '';
    if (!esUuid(cuotaId)) throw new ErrorDatoInvalido('cuota-invalida', 'cuotaId debe ser un UUID');
    const importeCentimos = validarImporte(comando.importeCentimos);
    const comprobante = validarComprobante(comando.comprobante);
    const payloadHash = hashDePago({ cuotaId, importeCentimos, comprobante });
    const ahora = this.d.reloj.ahora();

    return this.d.unidadDeTrabajo.ejecutar(async (r): Promise<ResultadoPago> => {
      const decidir = (existente: Pago): ResultadoPago => {
        if (existente.payloadHash !== payloadHash) throw new ErrorConflicto('clave-idempotencia-reutilizada');
        return { pago: existente, duplicado: true };
      };

      // 1. Reintento ya confirmado: se devuelve el original sin tocar la cuota.
      const previo = await r.pagos.buscarPorClave(actor.jassId, clave);
      if (previo) return decidir(previo);

      // 2. Se bloquea la cuota: los pagos de una misma cuota se serializan (design.md D7).
      const cuota = await r.cuotas.buscarBloqueando(actor.jassId, cuotaId);
      if (!cuota) throw recursoAjeno();

      // 3. Con la cuota bloqueada, un reintento concurrente ya puede estar confirmado.
      const tardio = await r.pagos.buscarPorClave(actor.jassId, clave);
      if (tardio) return decidir(tardio);

      const asociado = await r.asociados.buscar(actor.jassId, cuota.asociadoId);
      if (!asociado) throw recursoAjeno();
      if (asociado.estado !== 'activo') throw new ErrorConflicto('asociado-de-baja');

      const pagos = await r.pagos.listarPorCuota(actor.jassId, cuota.id);
      if (importeCentimos > pendienteDeCuota(cuota, pagos)) {
        throw new ErrorDatoInvalido('sobrepago', 'el importe supera el saldo pendiente de la cuota');
      }

      const pago: Pago = {
        id: this.d.ids.nuevo(),
        jassId: actor.jassId,
        cuotaId: cuota.id,
        importeCentimos,
        pagadoEn: ahora.toISOString(),
        comprobante,
        claveIdempotencia: clave,
        payloadHash,
        estado: 'vigente',
        registradoPor: actor.usuarioId,
      };
      const creacion = await r.pagos.crear(pago);
      if (!creacion.creado) return decidir(creacion.existente); // misma clave sobre otra cuota, en carrera
      await auditar(r, actor, { accion: 'pago.registrado', recurso: 'pago', recursoId: pago.id, detalle: { cuotaId: cuota.id, importeCentimos } }, ahora);
      return { pago, duplicado: false };
    });
  }
}

export class ReversarPago {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, pagoId: string, comando: { motivo: unknown }): Promise<{ pagoId: string }> {
    exigirPermiso(actor, 'pagos.registrar');
    if (!esUuid(pagoId)) throw recursoAjeno();
    const motivo = validarMotivo(comando.motivo);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const pago = await r.pagos.buscar(actor.jassId, pagoId);
      if (!pago) throw recursoAjeno();
      // Se bloquea la cuota para ordenar la reversa respecto de otros pagos de la misma cuota.
      await r.cuotas.buscarBloqueando(actor.jassId, pago.cuotaId);
      if (!(await r.pagos.marcarRevertido(actor.jassId, pagoId))) throw new ErrorConflicto('pago-ya-revertido');
      await r.pagos.crearReversa({ id: this.d.ids.nuevo(), jassId: actor.jassId, pagoId, motivo, actorId: actor.usuarioId, creadaEn: ahora.toISOString() });
      await auditar(r, actor, { accion: 'pago.reversado', recurso: 'pago', recursoId: pagoId, detalle: { importeCentimos: pago.importeCentimos } }, ahora);
      return { pagoId };
    });
  }
}

export class ConsultarPago {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(actor: ContextoAcceso, pagoId: string): Promise<Pago & { reversa: { motivo: string; creadaEn: string } | null }> {
    exigirPermiso(actor, 'pagos.leer');
    if (!esUuid(pagoId)) throw recursoAjeno();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const pago = await r.pagos.buscar(actor.jassId, pagoId);
      if (!pago) throw recursoAjeno();
      const reversa = await r.pagos.buscarReversa(actor.jassId, pagoId);
      return { ...pago, reversa: reversa ? { motivo: reversa.motivo, creadaEn: reversa.creadaEn } : null };
    });
  }
}
