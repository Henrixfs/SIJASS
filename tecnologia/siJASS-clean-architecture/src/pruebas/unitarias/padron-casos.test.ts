/** Padrón, cuotas, pagos y portal sobre la memoria (tarea 2.3). */
import { describe } from '../marco.js';
import { AlmacenAccesoMemoria, UnidadDeTrabajoAccesoMemoria } from '../../infraestructura/memoria-acceso.js';
import { suitePadron } from '../contrato/casos-padron.js';
import { suiteAsistente } from '../contrato/casos-asistente.js';
import { suiteReservorios } from '../contrato/casos-reservorios.js';
import { suiteIncidencias } from '../contrato/casos-incidencias.js';

describe('padrón, cuotas y pagos (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suitePadron((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});

describe('reservorios (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suiteReservorios((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});

describe('asistente documental (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suiteAsistente((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});

describe('incidencias (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suiteIncidencias((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});
