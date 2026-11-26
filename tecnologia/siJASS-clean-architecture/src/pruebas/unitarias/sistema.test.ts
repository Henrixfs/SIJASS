import { test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { esUuid } from '../../dominio/medicion.js';
import { GeneradorIdsAleatorio, RelojSistema } from '../../infraestructura/sistema.js';
import { GeneradorIdsSecuencial, RelojFijo } from '../dobles.js';

test('GeneradorIdsAleatorio produce UUID válidos y distintos', () => {
  const generador = new GeneradorIdsAleatorio();
  const ids = Array.from({ length: 100 }, () => generador.nuevo());
  for (const id of ids) assert.ok(esUuid(id), id);
  assert.equal(new Set(ids).size, ids.length);
});

test('GeneradorIdsSecuencial produce UUID válidos, distintos y predecibles', () => {
  const generador = new GeneradorIdsSecuencial();
  const ids = Array.from({ length: 3 }, () => generador.nuevo());
  assert.deepEqual(ids, [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ]);
  for (const id of ids) assert.ok(esUuid(id), id);
});

test('RelojSistema devuelve la hora actual', () => {
  const antes = Date.now();
  const ahora = new RelojSistema().ahora().getTime();
  assert.ok(ahora >= antes && ahora <= Date.now());
});

test('RelojFijo devuelve el instante configurado, no se altera desde fuera y avanza a pedido', () => {
  const reloj = new RelojFijo('2026-10-12T13:10:00.000Z');
  assert.equal(reloj.ahora().toISOString(), '2026-10-12T13:10:00.000Z');

  reloj.ahora().setUTCFullYear(2000);
  assert.equal(reloj.ahora().toISOString(), '2026-10-12T13:10:00.000Z');

  reloj.avanzar(5 * 60_000 + 1);
  assert.equal(reloj.ahora().toISOString(), '2026-10-12T13:15:00.001Z');
  assert.throws(() => new RelojFijo('no es una fecha'), RangeError);
});
