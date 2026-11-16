import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AlmacenMemoria, UnidadDeTrabajoMemoria } from '../../infraestructura/memoria.js';
import { medicionDePrueba } from '../contrato/repositorio-mediciones.js';

const JASS = '11111111-1111-4111-8111-111111111111';
const RESERVORIO = '33333333-3333-4333-8333-333333333333';
const OPERACION = '55555555-5555-4555-8555-555555555555';
const HASH = 'a'.repeat(64);
const RESULTADO = { medicionId: '44444444-4444-4444-8444-444444444444', revision: 1, registradaEn: '2026-10-12T13:10:00.000Z' };

test('un trabajo que se resuelve publica todas sus escrituras', async () => {
  const uow = new UnidadDeTrabajoMemoria();
  const medicion = medicionDePrueba(JASS, RESERVORIO);
  const valor = await uow.ejecutar(async ({ mediciones, operaciones }) => {
    await operaciones.reservar(JASS, OPERACION, HASH, 'registrar-medicion');
    await mediciones.guardar(medicion);
    await operaciones.registrarResultado(JASS, OPERACION, RESULTADO);
    return 'hecho';
  });
  assert.equal(valor, 'hecho');
  assert.deepStrictEqual(await uow.ejecutar(({ mediciones }) => mediciones.buscar(JASS, medicion.id)), medicion);
  assert.deepStrictEqual(uow.almacen.buscarOperacion(JASS, OPERACION), {
    tipo: 'registrar-medicion',
    payloadHash: HASH,
    resultado: RESULTADO,
  });
});

test('un trabajo que lanza no deja ninguna escritura y propaga el error', async () => {
  const uow = new UnidadDeTrabajoMemoria();
  const medicion = medicionDePrueba(JASS, RESERVORIO);
  const fallo = new Error('fallo simulado');
  await assert.rejects(
    uow.ejecutar(async ({ mediciones, operaciones }) => {
      await operaciones.reservar(JASS, OPERACION, HASH, 'registrar-medicion');
      await mediciones.guardar(medicion);
      throw fallo;
    }),
    (error) => error === fallo,
  );
  assert.equal(uow.almacen.buscarOperacion(JASS, OPERACION), undefined);
  assert.equal(await uow.ejecutar(({ mediciones }) => mediciones.buscar(JASS, medicion.id)), undefined);
  assert.equal(uow.almacen.estado.mediciones.size, 0);
  assert.equal(uow.almacen.estado.operaciones.size, 0);
});

test('dos trabajos simultáneos sobre el mismo almacén se ejecutan en serie', async () => {
  const almacen = new AlmacenMemoria();
  const eventos: string[] = [];
  const trabajo = (nombre: string) => async () => {
    eventos.push(`inicio ${nombre}`);
    await new Promise((r) => setTimeout(r, 20));
    eventos.push(`fin ${nombre}`);
  };
  await Promise.all([
    new UnidadDeTrabajoMemoria(almacen).ejecutar(trabajo('A')),
    new UnidadDeTrabajoMemoria(almacen).ejecutar(trabajo('B')),
  ]);
  assert.deepEqual(eventos, ['inicio A', 'fin A', 'inicio B', 'fin B']);
});

test('un fallo no bloquea la cola: la transacción siguiente se ejecuta', async () => {
  const uow = new UnidadDeTrabajoMemoria();
  const primera = uow.ejecutar(async () => {
    throw new Error('primera falla');
  });
  const segunda = uow.ejecutar(async () => 'segunda');
  await assert.rejects(primera, /primera falla/);
  assert.equal(await segunda, 'segunda');
});

test('el decorador envuelve los repositorios de cada transacción', async () => {
  const uow = new UnidadDeTrabajoMemoria(new AlmacenMemoria(), (repos) => ({
    ...repos,
    mediciones: {
      ...repos.mediciones,
      buscar: repos.mediciones.buscar.bind(repos.mediciones),
      listar: repos.mediciones.listar.bind(repos.mediciones),
      guardar: async () => {
        throw new Error('guardar decorado');
      },
    },
  }));
  await assert.rejects(
    uow.ejecutar(({ mediciones }) => mediciones.guardar(medicionDePrueba(JASS, RESERVORIO))),
    /guardar decorado/,
  );
});

test('una reserva repetida devuelve el hash y el resultado almacenados', async () => {
  const uow = new UnidadDeTrabajoMemoria();
  await uow.ejecutar(async ({ operaciones }) => {
    assert.deepStrictEqual(await operaciones.reservar(JASS, OPERACION, HASH, 'registrar-medicion'), { nueva: true });
    await operaciones.registrarResultado(JASS, OPERACION, RESULTADO);
  });
  const reserva = await uow.ejecutar(({ operaciones }) => operaciones.reservar(JASS, OPERACION, 'b'.repeat(64), 'registrar-medicion'));
  assert.deepStrictEqual(reserva, { nueva: false, payloadHash: HASH, resultado: RESULTADO });
  assert.equal(uow.almacen.buscarOperacion(JASS, OPERACION)?.payloadHash, HASH, 'la reserva existente no se modifica');
});
