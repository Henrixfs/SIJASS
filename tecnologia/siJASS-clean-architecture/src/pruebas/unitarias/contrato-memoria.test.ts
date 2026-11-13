import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MedicionesMemoria, ReservoriosMemoria } from '../../infraestructura/memoria.js';
import { probarContratoRepositorioMediciones } from '../contrato/repositorio-mediciones.js';

probarContratoRepositorioMediciones('memoria', async () => ({
  repositorio: new MedicionesMemoria(),
  // La memoria no impone la clave foránea; la precondición la garantiza el caso de uso.
  sembrarReservorio: async () => {},
  cerrar: async () => {},
}));

test('ReservoriosMemoria reconoce solo reservorios de la JASS indicada', async () => {
  const reservorios = new ReservoriosMemoria();
  reservorios.agregar('jass-a', 'reservorio-1');
  assert.equal(await reservorios.existeEnJass('jass-a', 'reservorio-1'), true);
  assert.equal(await reservorios.existeEnJass('jass-b', 'reservorio-1'), false);
  assert.equal(await reservorios.existeEnJass('jass-a', 'reservorio-2'), false);
});
