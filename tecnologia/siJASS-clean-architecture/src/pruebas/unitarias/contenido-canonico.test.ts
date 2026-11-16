import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hashOperacion } from '../../aplicacion/hash-operacion.js';
import { contenidoCanonico } from '../../dominio/contenido-canonico.js';
import { normalizarIdentificadores, type ComandoRegistrarMedicion } from '../../dominio/medicion.js';

const OPERACION = '55555555-5555-4555-8555-555555555555';
const RESERVORIO = '33333333-3333-4333-8333-333333333333';
const EVIDENCIA = '66666666-6666-4666-8666-666666666666';

const comando: ComandoRegistrarMedicion = {
  operationId: OPERACION,
  valor: 0.65,
  unidad: 'mg/L',
  reservorioId: RESERVORIO,
  metodo: 'comparador-dpd',
  tomadaEn: '2026-10-12T08:00:00-05:00',
};

/** Vector fijo: cadena escrita a mano y su SHA-256 calculado aparte. */
const CANONICO_ESPERADO =
  '{"contenido":{"metodo":"comparador-dpd","reservorioId":"33333333-3333-4333-8333-333333333333",' +
  '"tomadaEn":"2026-10-12T08:00:00-05:00","unidad":"mg/L","valor":0.65},"tipo":"registrar-medicion"}';
const HASH_ESPERADO = '5ce2190b3e649bae02f64987dc4ca5075cfeab742b99939ad952c363ed126144';

const comandoCon = (cambios: Record<string, unknown>) =>
  ({ ...comando, ...cambios }) as unknown as ComandoRegistrarMedicion;

test('vector fijo: contenido canónico y hash SHA-256 esperados', () => {
  assert.equal(contenidoCanonico('registrar-medicion', comando), CANONICO_ESPERADO);
  assert.equal(hashOperacion('registrar-medicion', comando), HASH_ESPERADO);
  assert.match(HASH_ESPERADO, /^[0-9a-f]{64}$/);
});

test('el orden de las claves no cambia el hash', () => {
  const reordenado = {
    tomadaEn: comando.tomadaEn,
    metodo: comando.metodo,
    reservorioId: comando.reservorioId,
    unidad: comando.unidad,
    operationId: comando.operationId,
    valor: comando.valor,
  };
  assert.equal(hashOperacion('registrar-medicion', reordenado), HASH_ESPERADO);
});

test('el operationId no forma parte del hash', () => {
  assert.equal(hashOperacion('registrar-medicion', comandoCon({ operationId: '77777777-7777-4777-8777-777777777777' })), HASH_ESPERADO);
  assert.equal(hashOperacion('registrar-medicion', comandoCon({ operationId: undefined })), HASH_ESPERADO);
});

test('cambiar cualquier campo del comando cambia el hash', () => {
  const cambios: Record<string, unknown>[] = [
    { valor: 0.66 },
    { metodo: 'colorimetro' },
    { unidad: 'ppm' },
    { tomadaEn: '2026-10-12T13:00:00Z' }, // mismo instante, otra escritura: se hashea tal como llega
    { reservorioId: '88888888-8888-4888-8888-888888888888' },
    { evidenciaId: EVIDENCIA },
  ];
  const hashes = cambios.map((c) => hashOperacion('registrar-medicion', comandoCon(c)));
  for (const [i, hash] of hashes.entries()) assert.notEqual(hash, HASH_ESPERADO, JSON.stringify(cambios[i]));
  assert.equal(new Set(hashes).size, hashes.length, 'cada cambio produce un hash distinto');
});

test('un campo undefined se omite como si no estuviera', () => {
  assert.equal(hashOperacion('registrar-medicion', comandoCon({ evidenciaId: undefined })), HASH_ESPERADO);
});

test('la canonización es total: NaN, infinitos y -0 tienen una forma definida', () => {
  assert.match(contenidoCanonico('registrar-medicion', comandoCon({ valor: Number.NaN })), /"valor":"NaN"/);
  assert.match(contenidoCanonico('registrar-medicion', comandoCon({ valor: Number.POSITIVE_INFINITY })), /"valor":"Infinity"/);
  assert.match(contenidoCanonico('registrar-medicion', comandoCon({ valor: Number.NEGATIVE_INFINITY })), /"valor":"-Infinity"/);
  assert.equal(hashOperacion('registrar-medicion', comandoCon({ valor: -0 })), hashOperacion('registrar-medicion', comandoCon({ valor: 0 })));
  assert.doesNotThrow(() => contenidoCanonico('registrar-medicion', comandoCon({ extra: { b: [1, undefined], a: null } })));
  assert.match(contenidoCanonico('registrar-medicion', comandoCon({ extra: { b: [1, undefined], a: null } })), /"extra":\{"a":null,"b":\[1,null\]\}/);
});

test('un campo tipo dentro del comando no altera el tipo de la operación', () => {
  const canonico = contenidoCanonico('registrar-medicion', comandoCon({ tipo: 'corregir-medicion' }));
  assert.match(canonico, /,"tipo":"registrar-medicion"\}$/);
  assert.match(canonico, /"contenido":\{[^}]*"tipo":"corregir-medicion"/);
  assert.notEqual(hashOperacion('registrar-medicion', comandoCon({ tipo: 'corregir-medicion' })), HASH_ESPERADO);
});

test('UUID en mayúsculas y minúsculas dan el mismo hash una vez normalizados', () => {
  // UUID con letras hexadecimales: con solo dígitos, toUpperCase() no cambiaría nada.
  const reservorio = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
  const evidencia = 'abcdef01-2345-4678-9abc-def012345678';
  const operacion = 'fedcba98-7654-4321-afed-cba987654321';
  const mayusculas = comandoCon({
    operationId: operacion.toUpperCase(),
    reservorioId: reservorio.toUpperCase(),
    evidenciaId: evidencia.toUpperCase(),
  });
  const minusculas = comandoCon({ operationId: operacion, reservorioId: reservorio, evidenciaId: evidencia });
  assert.notEqual(mayusculas.reservorioId, minusculas.reservorioId, 'el caso debe diferir antes de normalizar');
  assert.notEqual(hashOperacion('registrar-medicion', mayusculas), hashOperacion('registrar-medicion', minusculas));
  assert.equal(
    hashOperacion('registrar-medicion', normalizarIdentificadores(mayusculas)),
    hashOperacion('registrar-medicion', normalizarIdentificadores(minusculas)),
  );
});
