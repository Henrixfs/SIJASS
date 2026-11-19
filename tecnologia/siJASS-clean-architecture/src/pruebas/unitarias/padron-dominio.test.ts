/** Reglas puras de cuotas, pagos y saldo (tarea 2.2, spec `cuotas-y-pagos`). */
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ErrorDatoInvalido } from '../../dominio/errores.js';
import {
  estadoCuota,
  pendienteDeCuota,
  periodoActual,
  saldoAsociado,
  validarComprobante,
  validarDocumento,
  validarImporte,
  validarMotivo,
  validarNombre,
  validarPeriodo,
  type Pago,
} from '../../dominio/padron.js';

const pago = (importeCentimos: number, estado: Pago['estado'] = 'vigente'): Pago => ({
  id: 'p', jassId: 'j', cuotaId: 'c', importeCentimos, pagadoEn: '2026-11-19T15:00:00.000Z', comprobante: 'R',
  claveIdempotencia: 'k', payloadHash: 'h', estado, registradoPor: 'u',
});

describe('importes en céntimos', () => {
  for (const v of [1, 500, 1500, 1_000_000_000]) test(`${v} es válido`, () => assert.equal(validarImporte(v), v));
  for (const v of [0, -1, 1.5, NaN, Infinity, '1500', null, undefined, 1_000_000_001, Number.MAX_SAFE_INTEGER + 2, {}]) {
    test(`${String(v)} se rechaza como importe-invalido`, () => {
      assert.throws(() => validarImporte(v), (e: unknown) => e instanceof ErrorDatoInvalido && e.codigo === 'importe-invalido');
    });
  }
});

describe('periodo AAAA-MM', () => {
  for (const v of ['2026-01', '2026-12', '1999-06']) test(`${v} es válido`, () => assert.equal(validarPeriodo(v), v));
  for (const v of ['2026-13', '2026-00', '26-11', '2026/11', '2026-1', '2026-11-01', '', null, 202611]) {
    test(`${String(v)} se rechaza`, () => assert.throws(() => validarPeriodo(v), (e: unknown) => e instanceof ErrorDatoInvalido && e.codigo === 'periodo-invalido'));
  }

  test('el periodo vigente usa la hora de Lima (UTC-5), también en la frontera de mes y de año', () => {
    assert.equal(periodoActual(new Date('2026-11-19T15:00:00Z')), '2026-11');
    assert.equal(periodoActual(new Date('2026-12-01T04:59:59Z')), '2026-11', 'aún es 30 de noviembre en Lima');
    assert.equal(periodoActual(new Date('2026-12-01T05:00:00Z')), '2026-12');
    assert.equal(periodoActual(new Date('2027-01-01T04:59:59Z')), '2026-12');
    assert.equal(periodoActual(new Date('2027-01-01T05:00:00Z')), '2027-01');
  });
});

describe('textos del padrón', () => {
  test('se recortan los espacios y se rechazan vacíos o demasiado largos', () => {
    assert.equal(validarNombre('  Rosa Quispe '), 'Rosa Quispe');
    assert.equal(validarComprobante(' REC-1 '), 'REC-1');
    assert.equal(validarMotivo('  error '), 'error');
    for (const f of [validarNombre, validarComprobante, validarMotivo]) {
      assert.throws(() => f(''), ErrorDatoInvalido);
      assert.throws(() => f('   '), ErrorDatoInvalido);
      assert.throws(() => f(null), ErrorDatoInvalido);
      assert.throws(() => f(5), ErrorDatoInvalido);
    }
    assert.throws(() => validarComprobante('x'.repeat(61)), ErrorDatoInvalido);
    assert.equal(validarComprobante('x'.repeat(60)).length, 60);
    assert.throws(() => validarNombre('x'.repeat(121)), ErrorDatoInvalido);
  });

  test('el documento admite 4 a 20 letras, dígitos o guiones', () => {
    assert.equal(validarDocumento(' 12345678 '), '12345678');
    for (const d of ['123', '1'.repeat(21), 'abc def', 'ñ1234', '', null, 12345678]) {
      assert.throws(() => validarDocumento(d), (e: unknown) => e instanceof ErrorDatoInvalido && e.codigo === 'documento-invalido');
    }
  });
});

describe('estado de la cuota y saldo', () => {
  const cuota = { importeCentimos: 1500 };

  test('estado: pendiente, parcial y pagada', () => {
    assert.equal(estadoCuota(cuota, []), 'pendiente');
    assert.equal(estadoCuota(cuota, [pago(500)]), 'parcial');
    assert.equal(estadoCuota(cuota, [pago(500), pago(1000)]), 'pagada');
  });

  test('un pago revertido no cuenta para el estado ni para el pendiente', () => {
    assert.equal(estadoCuota(cuota, [pago(1500, 'revertido')]), 'pendiente');
    assert.equal(pendienteDeCuota(cuota, [pago(500), pago(1000, 'revertido')]), 1000);
  });

  test('el pendiente nunca es negativo', () => {
    assert.equal(pendienteDeCuota(cuota, [pago(1500), pago(100)]), 0);
  });

  test('saldo con cuota exigible y futura: 1500 + (1500 futura) − 500 = 1000', () => {
    const cuotas = [{ periodo: '2026-11', importeCentimos: 1500 }, { periodo: '2026-12', importeCentimos: 1500 }];
    assert.equal(saldoAsociado(cuotas, [pago(500)], '2026-11'), 1000);
  });

  test('el periodo anterior y el actual son exigibles; el siguiente no', () => {
    const cuotas = [{ periodo: '2026-10', importeCentimos: 1000 }, { periodo: '2026-11', importeCentimos: 1500 }, { periodo: '2027-01', importeCentimos: 9999 }];
    assert.equal(saldoAsociado(cuotas, [], '2026-11'), 2500);
  });

  test('revertir el único pago devuelve el saldo al importe exigible', () => {
    const cuotas = [{ periodo: '2026-11', importeCentimos: 1500 }];
    assert.equal(saldoAsociado(cuotas, [pago(500, 'revertido')], '2026-11'), 1500);
  });

  test('un asociado sin cuotas tiene saldo 0; con pagos de más el saldo es negativo (a favor)', () => {
    assert.equal(saldoAsociado([], [], '2026-11'), 0);
    assert.equal(saldoAsociado([{ periodo: '2027-05', importeCentimos: 100 }], [pago(100)], '2026-11'), -100);
  });
});
