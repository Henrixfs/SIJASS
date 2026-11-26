/**
 * Casos de uso de reservorios (s1c, tarea 2.1): misma batería sobre la memoria y sobre PostgreSQL.
 */
import { before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { ErrorAccesoDenegado, ErrorConflicto, ErrorDatoInvalido } from '../../dominio/errores.js';
import type { UnidadDeTrabajoAcceso } from '../../dominio/puertos-acceso.js';
import { crearEntorno, sembrarEscenario, type Entorno, type Escenario, comoSistema, type UnidadDeTrabajoSistema } from '../entorno-acceso.js';
import type { FabricaUnidadDeTrabajoAcceso } from './casos-acceso.js';

export function suiteReservorios(fabrica: FabricaUnidadDeTrabajoAcceso): void {
  describe('reservorios', () => {
    let base: UnidadDeTrabajoAcceso;
    let uow: UnidadDeTrabajoSistema;
    let e: Entorno;
    let esc: Escenario;
    before(async () => {
      base = fabrica();
      uow = comoSistema(base);
      e = crearEntorno(base);
      esc = await sembrarEscenario(e);
    });

    test('el consejo crea un reservorio en su JASS y queda el evento de auditoría', async () => {
      const r = await e.casos.crearReservorio.ejecutar(esc.consejoA.actor, { nombre: ' Reservorio Central ' });
      assert.equal(r.nombre, 'Reservorio Central');
      assert.equal(r.jassId, esc.jassA);
      const eventos = await uow.ejecutar((x) => x.auditoria.listarPorJass(esc.jassA));
      assert.ok(eventos.some((ev) => ev.accion === 'reservorio.creado' && ev.recursoId === r.id && ev.actorId === esc.consejoA.usuarioId));
    });

    test('nombre repetido en la JASS (con otras mayúsculas) → conflicto; en otra JASS se admite', async () => {
      for (const nombre of ['Reservorio Central', 'RESERVORIO CENTRAL']) {
        await assert.rejects(e.casos.crearReservorio.ejecutar(esc.consejoA.actor, { nombre }), (err: unknown) => err instanceof ErrorConflicto && err.codigo === 'reservorio-duplicado');
      }
      const b = await e.casos.crearReservorio.ejecutar(esc.consejoB.actor, { nombre: 'Reservorio Central' });
      assert.equal(b.jassId, esc.jassB);
    });

    test('nombre inválido → 422', async () => {
      for (const nombre of ['', '   ', 'x'.repeat(81), null, 3]) {
        await assert.rejects(e.casos.crearReservorio.ejecutar(esc.consejoA.actor, { nombre }), (err: unknown) => err instanceof ErrorDatoInvalido && err.codigo === 'nombre-invalido');
      }
    });

    test('solo el consejo crea; los demás roles y el asociado quedan denegados por permiso', async () => {
      for (const actor of [esc.tesoreroA.actor, esc.operadorA.actor, esc.asociadoA1.cuenta.actor]) {
        await assert.rejects(e.casos.crearReservorio.ejecutar(actor, { nombre: 'Intruso' }), (err: unknown) => err instanceof ErrorAccesoDenegado && err.motivo.startsWith('sin-permiso:'));
      }
    });

    test('el listado es de la JASS del actor, ordenado sin distinguir mayúsculas; el asociado no lista', async () => {
      await e.casos.crearReservorio.ejecutar(esc.consejoA.actor, { nombre: 'adelante' });
      await e.casos.crearReservorio.ejecutar(esc.consejoA.actor, { nombre: 'Zona Alta' });
      for (const actor of [esc.consejoA.actor, esc.tesoreroA.actor, esc.operadorA.actor]) {
        assert.deepEqual((await e.casos.listarReservorios.ejecutar(actor)).map((r) => r.nombre), ['adelante', 'Reservorio Central', 'Zona Alta']);
      }
      assert.deepEqual((await e.casos.listarReservorios.ejecutar(esc.operadorB.actor)).map((r) => r.jassId), [esc.jassB]);
      await assert.rejects(e.casos.listarReservorios.ejecutar(esc.asociadoA1.cuenta.actor), ErrorAccesoDenegado);
    });

    test('si falla el evento de auditoría, el reservorio no queda guardado', async () => {
      const rota = fabrica((repos) => ({ ...repos, auditoria: { ...repos.auditoria, registrar: async () => { throw new Error('fallo forzado'); }, listarPorJass: repos.auditoria.listarPorJass, listarSinJass: repos.auditoria.listarSinJass } }));
      const e2 = crearEntorno(rota);
      await assert.rejects(e2.casos.crearReservorio.ejecutar(esc.consejoA.actor, { nombre: 'Atómico' }), /fallo forzado/);
      assert.ok(!(await e.casos.listarReservorios.ejecutar(esc.consejoA.actor)).some((r) => r.nombre === 'Atómico'));
    });
  });
}
