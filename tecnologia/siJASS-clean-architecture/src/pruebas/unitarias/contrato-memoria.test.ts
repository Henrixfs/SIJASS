import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AlmacenMemoria, MedicionesMemoria, ReservoriosMemoria, UnidadDeTrabajoMemoria } from '../../infraestructura/memoria.js';
import { probarContratoRegistroIdempotente } from '../contrato/registro-idempotente.js';
import { probarContratoRepositorioMediciones } from '../contrato/repositorio-mediciones.js';

probarContratoRepositorioMediciones('memoria', async () => ({
  repositorio: new MedicionesMemoria(),
  // La memoria no impone la clave foránea; la precondición la garantiza el caso de uso.
  sembrarReservorio: async () => {},
  cerrar: async () => {},
}));

probarContratoRegistroIdempotente(
  'memoria',
  async () => {
    const almacen = new AlmacenMemoria();
    const delaJass = <T extends { jassId: string }>(valores: Iterable<T>, jassId: string) =>
      [...valores].filter((v) => v.jassId === jassId).length;
    return {
      crearUnidadDeTrabajo: (decorar) => new UnidadDeTrabajoMemoria(almacen, decorar),
      sembrarReservorio: async (jassId, reservorioId) => almacen.agregarReservorio(jassId, reservorioId),
      buscarMedicion: async (jassId, id) => almacen.estado.mediciones.get(`${jassId}:${id}`),
      contarMediciones: async (jassId) => delaJass(almacen.estado.mediciones.values(), jassId),
      contarReservas: async (jassId) => [...almacen.estado.operaciones.keys()].filter((k) => k.startsWith(`${jassId}:`)).length,
      existeReserva: async (jassId, operationId) => almacen.buscarOperacion(jassId, operationId) !== undefined,
      cerrar: async () => {},
    };
  },
  { repeticiones: 10 },
);

test('ReservoriosMemoria reconoce solo reservorios de la JASS indicada', async () => {
  const reservorios = new ReservoriosMemoria();
  reservorios.agregar('jass-a', 'reservorio-1');
  assert.equal(await reservorios.existeEnJass('jass-a', 'reservorio-1'), true);
  assert.equal(await reservorios.existeEnJass('jass-b', 'reservorio-1'), false);
  assert.equal(await reservorios.existeEnJass('jass-a', 'reservorio-2'), false);
});
