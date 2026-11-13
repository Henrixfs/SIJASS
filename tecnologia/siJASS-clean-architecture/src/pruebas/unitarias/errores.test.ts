import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  ErrorDominio,
  ErrorMedicionDuplicada,
  ErrorValidacion,
  MOTIVOS_RECHAZO,
} from '../../dominio/errores.js';

test('ErrorValidacion conserva su motivo como código y pertenece a la jerarquía de dominio', () => {
  for (const motivo of MOTIVOS_RECHAZO) {
    const error = new ErrorValidacion(motivo);
    assert.equal(error.codigo, motivo);
    assert.ok(error instanceof ErrorValidacion);
    assert.ok(error instanceof ErrorDominio);
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof ErrorMedicionDuplicada));
    assert.equal(error.name, 'ErrorValidacion');
  }
});

test('ErrorMedicionDuplicada tiene código propio y no es un error de validación', () => {
  const error = new ErrorMedicionDuplicada('jass-a', 'medicion-1');
  assert.equal(error.codigo, 'medicion-duplicada');
  assert.equal(error.jassId, 'jass-a');
  assert.equal(error.medicionId, 'medicion-1');
  assert.ok(error instanceof ErrorDominio);
  assert.ok(!(error instanceof ErrorValidacion));
  assert.equal(error.name, 'ErrorMedicionDuplicada');
});

test('el conjunto de motivos es cerrado e inmutable', () => {
  assert.deepEqual([...MOTIVOS_RECHAZO], [
    'operacion-invalida',
    'campo-no-permitido',
    'identificador-invalido',
    'valor-invalido',
    'unidad-invalida',
    'metodo-desconocido',
    'fecha-invalida',
    'toma-posterior-a-recepcion',
    'reservorio-no-encontrado',
  ]);
  assert.ok(Object.isFrozen(MOTIVOS_RECHAZO));
  // @ts-expect-error -- un motivo fuera del conjunto cerrado no debe compilar
  assert.equal(new ErrorValidacion('motivo-inventado').codigo, 'motivo-inventado');
});
