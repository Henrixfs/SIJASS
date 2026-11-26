import { test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { METODOS_MEDICION, UNIDAD_MEDICION, esMetodoDelCatalogo } from '../../dominio/catalogo.js';

test('el catálogo provisional contiene exactamente comparador-dpd y colorimetro', () => {
  assert.deepEqual([...METODOS_MEDICION], ['comparador-dpd', 'colorimetro']);
  assert.equal(UNIDAD_MEDICION, 'mg/L');
});

test('el catálogo no se puede modificar', () => {
  assert.ok(Object.isFrozen(METODOS_MEDICION));
  assert.throws(() => (METODOS_MEDICION as unknown as string[]).push('estimacion-imagen'), TypeError);
  assert.deepEqual([...METODOS_MEDICION], ['comparador-dpd', 'colorimetro']);
});

test('esMetodoDelCatalogo solo reconoce los códigos del catálogo', () => {
  assert.ok(esMetodoDelCatalogo('comparador-dpd'));
  assert.ok(esMetodoDelCatalogo('colorimetro'));
  for (const otro of ['estimacion-imagen', 'Colorimetro', '', undefined, 1]) {
    assert.ok(!esMetodoDelCatalogo(otro), String(otro));
  }
});
