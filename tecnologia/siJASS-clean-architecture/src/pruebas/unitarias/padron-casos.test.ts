/** Padrón, cuotas, pagos y portal sobre la memoria (tarea 2.3). */
import { describe } from 'node:test';
import { AlmacenAccesoMemoria, UnidadDeTrabajoAccesoMemoria } from '../../infraestructura/memoria-acceso.js';
import { suitePadron } from '../contrato/casos-padron.js';

describe('padrón, cuotas y pagos (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suitePadron((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});
