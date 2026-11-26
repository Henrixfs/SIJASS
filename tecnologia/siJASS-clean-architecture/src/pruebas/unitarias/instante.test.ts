import { test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { ErrorValidacion } from '../../dominio/errores.js';
import { normalizarInstante } from '../../dominio/instante.js';

const esFechaInvalida = (error: unknown) =>
  error instanceof ErrorValidacion && error.codigo === 'fecha-invalida';

const INVALIDOS: unknown[] = [
  '2026-02-30T08:00:00Z', // día inexistente (Date.parse lo convierte en 2 de marzo)
  '2026-02-29T08:00:00Z', // 2026 no es bisiesto
  '2026-10-12T08:00:00', // sin zona
  '2026-10-12', // solo fecha
  '2026-10-12 08:00:00Z', // separador espacio
  '2026-10-12T24:00:00Z', // hora 24
  '2026-10-12T08:00:00.123456Z', // más de milisegundos
  '2026-10-12T08:00Z', // sin segundos (obligatorios)
  '2026-13-01T08:00:00Z', // mes 13
  '2026-04-31T08:00:00Z', // abril tiene 30 días
  '2026-10-12T08:60:00Z', // minuto 60
  '2026-10-12T08:00:60Z', // segundo 60
  '2026-10-12T08:00:00+24:00', // desplazamiento fuera de rango
  '2026-10-12T08:00:00-0500', // desplazamiento sin dos puntos
  '2026-10-12T08:00:00z', // zona en minúscula
  '',
  undefined,
  null,
  1791792000000,
  new Date('2026-10-12T08:00:00Z'),
];

test('PT02 — rechaza instantes mal formados, sin zona o inexistentes con fecha-invalida', () => {
  for (const caso of INVALIDOS) {
    assert.throws(() => normalizarInstante(caso), esFechaInvalida, `debería rechazar ${String(caso)}`);
  }
});

test('acepta instantes válidos y los normaliza a UTC con milisegundos', () => {
  const VALIDOS: [string, string][] = [
    ['2028-02-29T08:00:00Z', '2028-02-29T08:00:00.000Z'], // bisiesto
    ['2026-10-12T08:00:00-05:00', '2026-10-12T13:00:00.000Z'],
    ['2026-10-12T08:00:00.5Z', '2026-10-12T08:00:00.500Z'],
    ['2026-10-12T08:00:00.123Z', '2026-10-12T08:00:00.123Z'],
    ['2026-10-12T01:00:00+05:30', '2026-10-11T19:30:00.000Z'], // cruza el día
    ['2026-12-31T23:00:00-05:00', '2027-01-01T04:00:00.000Z'], // cruza el año
  ];
  for (const [entrada, esperado] of VALIDOS) {
    assert.equal(normalizarInstante(entrada), esperado, entrada);
  }
});

test('el resultado no depende de la zona horaria del proceso', () => {
  const zonaOriginal = process.env.TZ;
  const casos = ['2026-10-12T08:00:00-05:00', '2026-03-29T02:30:00+01:00', '2028-02-29T23:59:59.999Z'];
  try {
    const porZona = ['UTC', 'America/Lima', 'Asia/Kolkata'].map((zona) => {
      process.env.TZ = zona;
      return casos.map((c) => normalizarInstante(c));
    });
    for (const resultado of porZona) assert.deepEqual(resultado, porZona[0]);
  } finally {
    if (zonaOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = zonaOriginal;
  }
});
