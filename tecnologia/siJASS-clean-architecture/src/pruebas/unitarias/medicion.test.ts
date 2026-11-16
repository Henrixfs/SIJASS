import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ErrorValidacion, type MotivoRechazo } from '../../dominio/errores.js';
import {
  crearMedicion,
  normalizarIdentificadores,
  TOLERANCIA_TOMA_MS_POR_DEFECTO,
  type ComandoRegistrarMedicion,
  type DatosServidorMedicion,
} from '../../dominio/medicion.js';

const JASS = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const RESERVORIO = '33333333-3333-4333-8333-333333333333';
const MEDICION = '44444444-4444-4444-8444-444444444444';
const OPERACION = '55555555-5555-4555-8555-555555555555';
const EVIDENCIA = '66666666-6666-4666-8666-666666666666';

const RECEPCION = new Date('2026-10-12T13:10:00.000Z');

const comandoValido: ComandoRegistrarMedicion = {
  operationId: OPERACION,
  reservorioId: RESERVORIO,
  metodo: 'comparador-dpd',
  valor: 0.65,
  unidad: 'mg/L',
  tomadaEn: '2026-10-12T08:00:00-05:00',
};

const datos: DatosServidorMedicion = {
  jassId: JASS,
  usuarioId: USUARIO,
  origen: 'sincronizada',
  id: MEDICION,
  registradaEn: RECEPCION,
  toleranciaMs: TOLERANCIA_TOMA_MS_POR_DEFECTO,
};

/** Construye un comando arbitrario (incluso mal tipado) a partir del válido. */
function comandoCon(cambios: Record<string, unknown>, sin: string[] = []): ComandoRegistrarMedicion {
  const comando: Record<string, unknown> = { ...comandoValido, ...cambios };
  for (const clave of sin) delete comando[clave];
  return comando as unknown as ComandoRegistrarMedicion;
}

function rechazaCon(motivo: MotivoRechazo) {
  return (error: unknown) => {
    assert.ok(error instanceof ErrorValidacion, `se esperaba ErrorValidacion, se obtuvo ${String(error)}`);
    assert.equal(error.codigo, motivo);
    return true;
  };
}

test('crea una medición manual con el contrato completo, estado vigente y revisión 1', () => {
  const medicion = crearMedicion(comandoValido, datos);
  assert.deepStrictEqual(medicion, {
    id: MEDICION,
    jassId: JASS,
    reservorioId: RESERVORIO,
    metodo: 'comparador-dpd',
    valor: 0.65,
    unidad: 'mg/L',
    tomadaEn: '2026-10-12T13:00:00.000Z',
    registradaEn: '2026-10-12T13:10:00.000Z',
    registradoPor: USUARIO,
    origen: 'sincronizada',
    estado: 'vigente',
    revision: 1,
  });
  assert.ok(Object.isFrozen(medicion));
});

test('la medición no contiene campos de estimación automática', () => {
  const medicion = crearMedicion(comandoValido, datos) as unknown as Record<string, unknown>;
  for (const campo of ['confianza', 'confirmada', 'modeloId', 'cloroMgL']) {
    assert.ok(!(campo in medicion), campo);
  }
});

test('JASS, autor, hora de recepción, identificador y origen vienen del servidor', () => {
  const medicion = crearMedicion(comandoValido, { ...datos, origen: 'en-linea' });
  assert.equal(medicion.jassId, JASS);
  assert.equal(medicion.registradoPor, USUARIO);
  assert.equal(medicion.registradaEn, RECEPCION.toISOString());
  assert.equal(medicion.id, MEDICION);
  assert.equal(medicion.origen, 'en-linea');
});

test('PT01 — valor negativo, no finito o no numérico da valor-invalido', () => {
  for (const valor of [-0.1, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0.5', null, true]) {
    assert.throws(() => crearMedicion(comandoCon({ valor }), datos), rechazaCon('valor-invalido'), String(valor));
  }
});

test('PT01 — valor 0 y -0 se aceptan y se registran como 0', () => {
  for (const valor of [0, -0]) {
    const medicion = crearMedicion(comandoCon({ valor }), datos);
    assert.ok(Object.is(medicion.valor, 0), `valor ${String(valor)} debería quedar como +0`);
  }
});

test('PT02 — unidad fuera de catálogo da unidad-invalida', () => {
  for (const unidad of ['ppm', 'mg/l', 'MG/L', '']) {
    assert.throws(() => crearMedicion(comandoCon({ unidad }), datos), rechazaCon('unidad-invalida'), unidad);
  }
});

test('PT02 — método fuera de catálogo da metodo-desconocido', () => {
  for (const metodo of ['estimacion-imagen', 'Colorimetro', '', 3]) {
    assert.throws(() => crearMedicion(comandoCon({ metodo }), datos), rechazaCon('metodo-desconocido'), String(metodo));
  }
});

test('PT02 — se aceptan los métodos del catálogo', () => {
  for (const metodo of ['comparador-dpd', 'colorimetro']) {
    assert.equal(crearMedicion(comandoCon({ metodo }), datos).metodo, metodo);
  }
});

test('PT02 — hora de toma inválida da fecha-invalida', () => {
  for (const tomadaEn of [
    '2026-10-12T08:00:00',
    '2026-02-30T08:00:00Z',
    '2026-10-12',
    '2026-10-12 08:00:00Z',
    '2026-10-12T24:00:00Z',
    '2026-10-12T08:00:00.123456Z',
  ]) {
    assert.throws(() => crearMedicion(comandoCon({ tomadaEn }), datos), rechazaCon('fecha-invalida'), tomadaEn);
  }
});

test('cada campo obligatorio ausente se rechaza con el motivo de su regla', () => {
  const casos: [string, MotivoRechazo][] = [
    ['reservorioId', 'identificador-invalido'],
    ['valor', 'valor-invalido'],
    ['unidad', 'unidad-invalida'],
    ['metodo', 'metodo-desconocido'],
    ['tomadaEn', 'fecha-invalida'],
  ];
  for (const [campo, motivo] of casos) {
    assert.throws(() => crearMedicion(comandoCon({}, [campo]), datos), rechazaCon(motivo), campo);
  }
});

test('un campo fuera del contrato del comando da campo-no-permitido', () => {
  const ajenos: Record<string, unknown> = {
    jassId: JASS,
    registradoPor: USUARIO,
    registradaEn: '2026-10-12T13:10:00Z',
    estado: 'vigente',
    revision: 1,
    confianza: 0.9,
    payloadHash: 'a'.repeat(64),
  };
  for (const [campo, valor] of Object.entries(ajenos)) {
    assert.throws(
      () => crearMedicion(comandoCon({ [campo]: valor }), datos),
      rechazaCon('campo-no-permitido'),
      campo,
    );
  }
});

test('identificador de reservorio malformado da identificador-invalido', () => {
  assert.throws(
    () => crearMedicion(comandoCon({ reservorioId: 'reservorio-1' }), datos),
    rechazaCon('identificador-invalido'),
  );
});

test('evidencia opcional: presente se conserva, ausente se omite, malformada se rechaza', () => {
  const conEvidencia = crearMedicion(comandoCon({ evidenciaId: EVIDENCIA }), datos);
  assert.equal(conEvidencia.evidenciaId, EVIDENCIA);
  assert.equal(conEvidencia.valor, 0.65, 'la evidencia no altera el valor manual');

  const sinEvidencia = crearMedicion(comandoValido, datos);
  assert.ok(!('evidenciaId' in sinEvidencia));
  assert.ok(!('evidenciaId' in crearMedicion(comandoCon({ evidenciaId: undefined }), datos)));

  assert.throws(
    () => crearMedicion(comandoCon({ evidenciaId: 'foto.jpg' }), datos),
    rechazaCon('identificador-invalido'),
  );
});

test('UUID en mayúsculas: la medición se guarda con reservorioId y evidenciaId en minúsculas', () => {
  // UUID con letras hexadecimales: con solo dígitos, toUpperCase() no cambiaría nada.
  const reservorio = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
  const evidencia = 'abcdef01-2345-4678-9abc-def012345678';
  assert.notEqual(reservorio.toUpperCase(), reservorio);
  const medicion = crearMedicion(
    comandoCon({ reservorioId: reservorio.toUpperCase(), evidenciaId: evidencia.toUpperCase() }),
    datos,
  );
  assert.equal(medicion.reservorioId, reservorio);
  assert.equal(medicion.evidenciaId, evidencia);
  assert.deepStrictEqual(medicion, crearMedicion(comandoCon({ reservorioId: reservorio, evidenciaId: evidencia }), datos));
});

test('normalizarIdentificadores pasa a minúsculas solo los UUID válidos y conserva el resto', () => {
  const normalizado = normalizarIdentificadores(
    comandoCon({
      operationId: 'fedcba98-7654-4321-afed-cba987654321'.toUpperCase(),
      reservorioId: 'aaaabbbb-cccc-4ddd-8eee-ffff00001111'.toUpperCase(),
      evidenciaId: 'FOTO-NO-UUID',
      metodo: 'COLORIMETRO',
      extra: 'ABC',
    }),
  ) as unknown as Record<string, unknown>;
  assert.equal(normalizado.operationId, 'fedcba98-7654-4321-afed-cba987654321');
  assert.equal(normalizado.reservorioId, 'aaaabbbb-cccc-4ddd-8eee-ffff00001111');
  assert.equal(normalizado.evidenciaId, 'FOTO-NO-UUID', 'un valor malformado se conserva para que lo rechace su regla');
  assert.equal(normalizado.metodo, 'COLORIMETRO', 'los campos que no son UUID no se tocan');
  assert.equal(normalizado.extra, 'ABC');
});

test('tolerancia: exactamente +5 min se acepta y +5 min + 1 ms se rechaza', () => {
  const limite = new Date(RECEPCION.getTime() + 5 * 60_000).toISOString();
  assert.equal(crearMedicion(comandoCon({ tomadaEn: limite }), datos).tomadaEn, limite);

  const pasado = new Date(RECEPCION.getTime() + 5 * 60_000 + 1).toISOString();
  assert.throws(() => crearMedicion(comandoCon({ tomadaEn: pasado }), datos), rechazaCon('toma-posterior-a-recepcion'));
});

test('tolerancia configurada en 0: +1 ms se rechaza y la misma hora se acepta', () => {
  const sinTolerancia = { ...datos, toleranciaMs: 0 };
  const masUnMs = new Date(RECEPCION.getTime() + 1).toISOString();
  assert.throws(
    () => crearMedicion(comandoCon({ tomadaEn: masUnMs }), sinTolerancia),
    rechazaCon('toma-posterior-a-recepcion'),
  );
  assert.ok(crearMedicion(comandoCon({ tomadaEn: RECEPCION.toISOString() }), sinTolerancia));
});

test('una toma de varios días atrás se acepta sin advertencia', () => {
  const medicion = crearMedicion(comandoCon({ tomadaEn: '2026-10-05T08:00:00-05:00' }), datos);
  assert.equal(medicion.tomadaEn, '2026-10-05T13:00:00.000Z');
});

test('orden fijo de reglas: se informa la primera incumplida', () => {
  assert.throws(
    () => crearMedicion(comandoCon({ confianza: 1, valor: -1 }), datos),
    rechazaCon('campo-no-permitido'),
  );
  assert.throws(
    () => crearMedicion(comandoCon({ reservorioId: 'x', valor: -1 }), datos),
    rechazaCon('identificador-invalido'),
  );
  assert.throws(
    () => crearMedicion(comandoCon({ valor: -1, unidad: 'ppm', metodo: 'x', tomadaEn: 'x' }), datos),
    rechazaCon('valor-invalido'),
  );
  assert.throws(
    () => crearMedicion(comandoCon({ unidad: 'ppm', metodo: 'x', tomadaEn: 'x' }), datos),
    rechazaCon('unidad-invalida'),
  );
  assert.throws(() => crearMedicion(comandoCon({ metodo: 'x', tomadaEn: 'x' }), datos), rechazaCon('metodo-desconocido'));
});
