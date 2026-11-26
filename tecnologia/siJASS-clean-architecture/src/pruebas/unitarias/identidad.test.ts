/** Identidad por DNI sobre la memoria: la misma batería que corre sobre PostgreSQL (s2a). */
import { describe } from '../marco.js';
import { AlmacenAccesoMemoria, UnidadDeTrabajoAccesoMemoria } from '../../infraestructura/memoria-acceso.js';
import { suiteAislamiento } from '../contrato/casos-aislamiento.js';
import { suiteIdentidad } from '../contrato/casos-identidad.js';

describe('identidad (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suiteIdentidad((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});

describe('aislamiento multi-JASS (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suiteAislamiento((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});
