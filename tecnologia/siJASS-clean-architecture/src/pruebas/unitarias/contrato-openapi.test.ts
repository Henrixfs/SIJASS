/** Contrato OpenAPI ↔ controladores (s1e, tarea 1.1, spec `contrato-openapi`). */
import { describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { cargarOpenApi, comparar, METODOS, rutasDelDocumento } from '../contrato-openapi-util.js';
import { rutasDeLosControladores } from '../../api/rutas-declaradas.js';

describe('contrato OpenAPI', () => {
  const doc = cargarOpenApi();

  test('es OpenAPI 3.1, con operationId únicos, una respuesta de éxito por operación y el esquema Error', () => {
    assert.equal(doc.openapi, '3.1.0');
    const ids = new Set<string>();
    for (const [ruta, operaciones] of Object.entries(doc.paths)) {
      for (const [metodo, op] of Object.entries(operaciones)) {
        if (!METODOS.includes(metodo)) continue;
        assert.ok(op.operationId, `${metodo} ${ruta}: falta operationId`);
        assert.ok(!ids.has(op.operationId), `operationId repetido: ${op.operationId}`);
        ids.add(op.operationId);
        assert.ok(Object.keys(op.responses ?? {}).some((c) => /^2\d\d$/.test(c)), `${metodo} ${ruta}: sin respuesta de éxito`);
      }
    }
    assert.ok(doc.components?.schemas?.Error);
  });

  test('el documento y los controladores declaran exactamente las mismas rutas', () => {
    const { sinDocumentar, inexistentes } = comparar(rutasDeLosControladores(), rutasDelDocumento(doc));
    assert.deepEqual(sinDocumentar, [], `rutas del código sin documentar: ${sinDocumentar.join(', ')}`);
    assert.deepEqual(inexistentes, [], `rutas documentadas que ningún controlador implementa: ${inexistentes.join(', ')}`);
  });

  test('hay 47 operaciones y todas están bajo /v1', () => {
    const rutas = rutasDelDocumento(doc);
    assert.equal(rutas.length, 47);
    assert.ok(rutas.every((r) => r.split(' ')[1].startsWith('/v1/')));
  });

  test('el comparador detecta una ruta del código sin documentar', () => {
    const codigo = [...rutasDeLosControladores(), 'post /v1/nueva-ruta'];
    assert.deepEqual(comparar(codigo, rutasDelDocumento(doc)).sinDocumentar, ['post /v1/nueva-ruta']);
  });

  test('el comparador detecta una ruta documentada que no existe', () => {
    const documento = [...rutasDelDocumento(doc), 'get /v1/fantasma'];
    assert.deepEqual(comparar(rutasDeLosControladores(), documento).inexistentes, ['get /v1/fantasma']);
  });

  test('el comparador detecta una ruta quitada del documento y un método distinto', () => {
    const sinPagos = rutasDelDocumento(doc).filter((r) => r !== 'post /v1/pagos');
    assert.deepEqual(comparar(rutasDeLosControladores(), sinPagos).sinDocumentar, ['post /v1/pagos']);
    const cambiado = rutasDelDocumento(doc).map((r) => (r === 'get /v1/yo' ? 'post /v1/yo' : r));
    const d = comparar(rutasDeLosControladores(), cambiado);
    assert.deepEqual(d.sinDocumentar, ['get /v1/yo']);
    assert.deepEqual(d.inexistentes, ['post /v1/yo']);
  });

  test('las rutas con parámetro usan {id}', () => {
    const rutas = rutasDeLosControladores();
    assert.ok(rutas.includes('post /v1/pagos/{id}/reversa'));
    assert.ok(rutas.includes('get /v1/reservorios/{id}/mediciones'));
    assert.ok(!rutas.some((r) => r.includes(':')));
  });
});
