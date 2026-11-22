/**
 * Casos de uso de padrón, cuotas, pagos y portal (tarea 2.3, specs `cuotas-y-pagos`,
 * `portal-asociado` y `auditoria-eventos`). Misma batería sobre la memoria y sobre PostgreSQL.
 */
import { before, describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ErrorAccesoDenegado, ErrorConflicto, ErrorDatoInvalido } from '../../dominio/errores.js';
import type { UnidadDeTrabajoAcceso } from '../../dominio/puertos-acceso.js';
import { crearEntorno, nuevaClave, sembrarEscenario, type Entorno, type Escenario } from '../entorno-acceso.js';
import type { FabricaUnidadDeTrabajoAcceso } from './casos-acceso.js';

const codigo = (c: string, tipo: abstract new (...a: never[]) => Error = ErrorDatoInvalido) => (err: unknown) => {
  assert.ok(err instanceof tipo, `se esperaba ${tipo.name}, llegó ${String(err)}`);
  assert.equal((err as unknown as { codigo: string }).codigo, c);
  return true;
};

export function suitePadron(fabrica: FabricaUnidadDeTrabajoAcceso): void {
describe('padrón, cuotas y pagos', () => {
  let uow: UnidadDeTrabajoAcceso;
  let e: Entorno;
  let esc: Escenario;
  let cuotaA1: string;

  before(async () => {
    uow = fabrica();
    e = crearEntorno(uow);
    esc = await sembrarEscenario(e);
    const r = await e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo: '2026-11', importeCentimos: 1500 });
    assert.deepEqual(r, { creadas: 2, existentes: 0 });
    const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
    cuotaA1 = cuenta.cuotas.find((c) => c.periodo === '2026-11')!.id;
  });

  const eventos = (jassId: string) => uow.ejecutar((r) => r.auditoria.listarPorJass(jassId));

  describe('padrón', () => {
    test('alta: queda activo en la JASS del tesorero y se audita', async () => {
      const a = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: ' Pedro Mamani ', documento: 'DNI-77001' });
      assert.equal(a.jassId, esc.jassA);
      assert.equal(a.estado, 'activo');
      assert.equal(a.nombre, 'Pedro Mamani');
      assert.ok((await eventos(esc.jassA)).some((x) => x.accion === 'asociado.registrado' && x.recursoId === a.id));
    });

    test('documento repetido en la misma JASS → conflicto; en otra JASS se admite', async () => {
      await assert.rejects(e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Otro', documento: 'DNI-77001' }), codigo('documento-duplicado', ErrorConflicto));
      const b = await e.casos.registrarAsociado.ejecutar(esc.tesoreroB.actor, { nombre: 'Otro', documento: 'DNI-77001' });
      assert.equal(b.jassId, esc.jassB);
    });

    test('datos inválidos → 422 y el padrón no cambia', async () => {
      const antes = (await e.casos.listarAsociados.ejecutar(esc.tesoreroA.actor)).length;
      await assert.rejects(e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: '', documento: 'DNI-1234' }), codigo('nombre-invalido'));
      await assert.rejects(e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'X', documento: '1' }), codigo('documento-invalido'));
      assert.equal((await e.casos.listarAsociados.ejecutar(esc.tesoreroA.actor)).length, antes);
    });

    test('el listado solo incluye la JASS del actor', async () => {
      const a = await e.casos.listarAsociados.ejecutar(esc.tesoreroA.actor);
      const b = await e.casos.listarAsociados.ejecutar(esc.tesoreroB.actor);
      assert.ok(a.every((x) => x.id !== esc.asociadoB1.id));
      assert.ok(b.every((x) => x.id !== esc.asociadoA1.id));
    });

    test('baja lógica: conserva cuotas y pagos, y no admite cuotas ni pagos nuevos', async () => {
      const x = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Baja Prueba', documento: 'BAJA-001' });
      await e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo: '2026-10', importeCentimos: 800 });
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, x.id);
      const cuotaX = cuenta.cuotas[0].id;
      await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaX, importeCentimos: 300, comprobante: 'R-BAJA' }, nuevaClave());
      await e.casos.darDeBaja.ejecutar(esc.tesoreroA.actor, x.id);
      await e.casos.darDeBaja.ejecutar(esc.tesoreroA.actor, x.id); // idempotente
      const despues = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, x.id);
      assert.equal(despues.asociado.estado, 'baja');
      assert.equal(despues.cuotas.length, 1);
      assert.equal(despues.pagos.length, 1);
      await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaX, importeCentimos: 100, comprobante: 'R-2' }, nuevaClave()), codigo('asociado-de-baja', ErrorConflicto));
      const g = await e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo: '2026-09', importeCentimos: 500 });
      const nuevas = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, x.id);
      assert.equal(nuevas.cuotas.length, 1, 'no se genera cuota nueva al asociado dado de baja');
      assert.ok(g.creadas >= 1);
    });
  });

  describe('cuotas', () => {
    test('regeneración: 0 creadas y las existentes informadas; importes sin cambio', async () => {
      const activos = (await e.casos.listarAsociados.ejecutar(esc.tesoreroA.actor)).filter((a) => a.estado === 'activo').length;
      // 2026-11 ya fue generado para los asociados activos de entonces.
      const r = await e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo: '2026-11', importeCentimos: 9999 });
      assert.equal(r.creadas + r.existentes, activos);
      assert.ok(r.existentes >= 2);
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
      assert.equal(cuenta.cuotas.find((c) => c.periodo === '2026-11')?.importeCentimos, 1500);
    });

    test('importe o periodo inválido → 422 y no se crea nada', async () => {
      for (const importeCentimos of [0, -5, 10.5, '1500', null]) {
        await assert.rejects(e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo: '2026-08', importeCentimos }), codigo('importe-invalido'));
      }
      for (const periodo of ['2026-13', '2026-8', 'agosto', null]) {
        await assert.rejects(e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo, importeCentimos: 100 }), codigo('periodo-invalido'));
      }
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
      assert.ok(!cuenta.cuotas.some((c) => c.periodo === '2026-08'));
    });

    test('generar cuotas en una JASS no toca las de la otra', async () => {
      const cuentaB = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroB.actor, esc.asociadoB1.id);
      assert.equal(cuentaB.cuotas.length, 0);
    });
  });

  describe('pagos', () => {
    test('pago correcto: vigente, pendiente de la cuota 1000 y evento de auditoría', async () => {
      const r = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 500, comprobante: ' REC-0001 ' }, nuevaClave());
      assert.equal(r.duplicado, false);
      assert.equal(r.pago.estado, 'vigente');
      assert.equal(r.pago.comprobante, 'REC-0001');
      assert.equal(r.pago.registradoPor, esc.tesoreroA.usuarioId);
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
      assert.equal(cuenta.cuotas.find((c) => c.periodo === '2026-11')!.pendienteCentimos, 1000);
      assert.equal(cuenta.cuotas.find((c) => c.periodo === '2026-11')!.estado, 'parcial');
      assert.ok((await eventos(esc.jassA)).some((x) => x.accion === 'pago.registrado' && x.recursoId === r.pago.id && x.actorId === esc.tesoreroA.usuarioId));
    });

    test('el consejo también puede registrar pagos', async () => {
      const r = await e.casos.registrarPago.ejecutar(esc.consejoA.actor, { cuotaId: (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id)).cuotas.find((c) => c.periodo === '2026-11')!.id, importeCentimos: 100, comprobante: 'C-1' }, nuevaClave());
      assert.equal(r.pago.registradoPor, esc.consejoA.usuarioId);
    });

    test('reintento con la misma clave y el mismo contenido → devuelve el original', async () => {
      const clave = nuevaClave();
      const comando = { cuotaId: cuotaA1, importeCentimos: 100, comprobante: 'REC-RETRY' };
      const a = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, comando, clave);
      const b = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, comando, clave.toUpperCase());
      assert.equal(a.duplicado, false);
      assert.equal(b.duplicado, true);
      assert.equal(b.pago.id, a.pago.id);
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
      assert.equal(cuenta.pagos.filter((p) => p.comprobante === 'REC-RETRY').length, 1);
    });

    test('misma clave con otro importe o comprobante → conflicto y el original no cambia', async () => {
      const clave = nuevaClave();
      const a = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 100, comprobante: 'REC-C1' }, clave);
      await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 200, comprobante: 'REC-C1' }, clave), codigo('clave-idempotencia-reutilizada', ErrorConflicto));
      await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 100, comprobante: 'OTRO' }, clave), codigo('clave-idempotencia-reutilizada', ErrorConflicto));
      const p = await e.casos.consultarPago.ejecutar(esc.tesoreroA.actor, a.pago.id);
      assert.equal(p.importeCentimos, 100);
      assert.equal(p.comprobante, 'REC-C1');
    });

    test('la misma clave en otra JASS es otro pago', async () => {
      const clave = nuevaClave();
      await e.casos.generarCuotas.ejecutar(esc.tesoreroB.actor, { periodo: '2026-11', importeCentimos: 700 });
      const cuotaB = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroB.actor, esc.asociadoB1.id)).cuotas.find((c) => c.periodo === '2026-11')!.id;
      const a = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 50, comprobante: 'K-A' }, clave);
      const b = await e.casos.registrarPago.ejecutar(esc.tesoreroB.actor, { cuotaId: cuotaB, importeCentimos: 50, comprobante: 'K-B' }, clave);
      assert.notEqual(a.pago.id, b.pago.id);
      assert.equal(b.duplicado, false);
    });

    test('sobrepago → 422 y no se crea el pago', async () => {
      const antes = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id)).pagos.length;
      await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 1_000_000, comprobante: 'X' }, nuevaClave()), codigo('sobrepago'));
      assert.equal((await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id)).pagos.length, antes);
    });

    test('falta la clave, el comprobante o el importe es inválido → 422', async () => {
      const ok = { cuotaId: cuotaA1, importeCentimos: 10, comprobante: 'X' };
      for (const clave of [undefined, '', 'no-es-uuid', null]) await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, ok, clave), codigo('clave-idempotencia-invalida'));
      for (const comprobante of [undefined, '', '   ', 5]) await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { ...ok, comprobante }, nuevaClave()), codigo('comprobante-invalido'));
      for (const importeCentimos of [0, -1, 1.5, '10', undefined]) await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { ...ok, importeCentimos }, nuevaClave()), codigo('importe-invalido'));
      await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { ...ok, cuotaId: 'no-uuid' }, nuevaClave()), codigo('cuota-invalida'));
    });

    test('cuota de otra JASS o inexistente → acceso denegado idéntico', async () => {
      const cuotaB = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroB.actor, esc.asociadoB1.id)).cuotas.find((c) => c.periodo === '2026-11')!.id;
      for (const cuotaId of [cuotaB, '20000000-0000-4000-8000-000000000001']) {
        await assert.rejects(e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId, importeCentimos: 10, comprobante: 'X' }, nuevaClave()), (err: unknown) => err instanceof ErrorAccesoDenegado && err.motivo === 'recurso-ajeno');
      }
    });

    test('permisos: operador y asociado no pueden registrar ni reversar pagos', async () => {
      const cmd = { cuotaId: cuotaA1, importeCentimos: 10, comprobante: 'X' };
      for (const actor of [esc.operadorA.actor, esc.asociadoA1.cuenta.actor]) {
        await assert.rejects(e.casos.registrarPago.ejecutar(actor, cmd, nuevaClave()), ErrorAccesoDenegado);
        await assert.rejects(e.casos.reversarPago.ejecutar(actor, '20000000-0000-4000-8000-000000000001', { motivo: 'x' }), ErrorAccesoDenegado);
      }
    });
  });

  describe('reversa', () => {
    test('reversa correcta: el pago pasa a revertido, queda la reversa y el saldo vuelve a subir', async () => {
      const cuotaId = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id)).cuotas.find((c) => c.periodo === '2026-11')!.id;
      const antes = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id)).saldoCentimos;
      const { pago } = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId, importeCentimos: 500, comprobante: 'REV-1' }, nuevaClave());
      assert.equal((await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id)).saldoCentimos, antes - 500);
      await e.casos.reversarPago.ejecutar(esc.tesoreroA.actor, pago.id, { motivo: 'Error de digitación' });
      const consulta = await e.casos.consultarPago.ejecutar(esc.tesoreroA.actor, pago.id);
      assert.equal(consulta.estado, 'revertido');
      assert.equal(consulta.reversa?.motivo, 'Error de digitación');
      assert.equal((await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id)).saldoCentimos, antes);
      const ev = (await eventos(esc.jassA)).find((x) => x.accion === 'pago.reversado' && x.recursoId === pago.id);
      assert.equal(ev?.actorId, esc.tesoreroA.usuarioId);
    });

    test('doble reversa → conflicto; sin motivo → 422 y el pago sigue vigente', async () => {
      const cuotaId = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id)).cuotas.find((c) => c.periodo === '2026-11')!.id;
      const { pago } = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId, importeCentimos: 100, comprobante: 'REV-2' }, nuevaClave());
      await assert.rejects(e.casos.reversarPago.ejecutar(esc.tesoreroA.actor, pago.id, { motivo: '  ' }), codigo('motivo-invalido'));
      assert.equal((await e.casos.consultarPago.ejecutar(esc.tesoreroA.actor, pago.id)).estado, 'vigente');
      await e.casos.reversarPago.ejecutar(esc.tesoreroA.actor, pago.id, { motivo: 'primera' });
      await assert.rejects(e.casos.reversarPago.ejecutar(esc.tesoreroA.actor, pago.id, { motivo: 'segunda' }), codigo('pago-ya-revertido', ErrorConflicto));
    });

    test('un pago de otra JASS no se puede consultar ni reversar', async () => {
      const { pago } = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 10, comprobante: 'AJENO' }, nuevaClave());
      await assert.rejects(e.casos.consultarPago.ejecutar(esc.tesoreroB.actor, pago.id), ErrorAccesoDenegado);
      await assert.rejects(e.casos.reversarPago.ejecutar(esc.tesoreroB.actor, pago.id, { motivo: 'x' }), ErrorAccesoDenegado);
      assert.equal((await e.casos.consultarPago.ejecutar(esc.tesoreroA.actor, pago.id)).estado, 'vigente');
    });
  });

  describe('atomicidad con la auditoría', () => {
    test('si falla el evento de auditoría, el pago no queda guardado', async () => {
      const rota = fabrica((repos) => ({
        ...repos,
        auditoria: { ...repos.auditoria, registrar: async () => { throw new Error('fallo forzado'); }, listarPorJass: repos.auditoria.listarPorJass, listarSinJass: repos.auditoria.listarSinJass },
      }));
      const e2 = crearEntorno(rota);
      const antes = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id)).pagos.length;
      await assert.rejects(e2.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 10, comprobante: 'ATOM' }, nuevaClave()), /fallo forzado/);
      assert.equal((await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id)).pagos.length, antes);
    });

    test('si falla el evento de auditoría, la reversa no queda guardada', async () => {
      const { pago } = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: cuotaA1, importeCentimos: 10, comprobante: 'ATOM-R' }, nuevaClave());
      const rota = fabrica((repos) => ({
        ...repos,
        auditoria: { ...repos.auditoria, registrar: async () => { throw new Error('fallo forzado'); }, listarPorJass: repos.auditoria.listarPorJass, listarSinJass: repos.auditoria.listarSinJass },
      }));
      const e2 = crearEntorno(rota);
      await assert.rejects(e2.casos.reversarPago.ejecutar(esc.tesoreroA.actor, pago.id, { motivo: 'x' }), /fallo forzado/);
      assert.equal((await e.casos.consultarPago.ejecutar(esc.tesoreroA.actor, pago.id)).estado, 'vigente');
    });
  });

  describe('portal del asociado', () => {
    test('el asociado ve su saldo actualizado tras un pago y tras su reversa', async () => {
      const cuenta = esc.asociadoA2.cuenta.actor;
      const base = (await e.casos.portal.ejecutar(cuenta)).saldoCentimos;
      const cuotaId = (await e.casos.portal.ejecutar(cuenta)).cuotas.find((c) => c.periodo === '2026-11')!.id;
      const { pago } = await e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId, importeCentimos: 500, comprobante: 'PORTAL-1' }, nuevaClave());
      const tras = await e.casos.portal.ejecutar(cuenta);
      assert.equal(tras.saldoCentimos, base - 500);
      assert.equal(tras.pagos.find((p) => p.comprobante === 'PORTAL-1')?.estado, 'vigente');
      await e.casos.reversarPago.ejecutar(esc.tesoreroA.actor, pago.id, { motivo: 'prueba' });
      const revertido = await e.casos.portal.ejecutar(cuenta);
      assert.equal(revertido.saldoCentimos, base);
      assert.equal(revertido.pagos.find((p) => p.comprobante === 'PORTAL-1')?.estado, 'revertido');
    });

    test('el portal solo devuelve lo propio, sin datos de otros asociados', async () => {
      const mio = await e.casos.portal.ejecutar(esc.asociadoA1.cuenta.actor);
      assert.equal(mio.asociado.id, esc.asociadoA1.id);
      assert.ok(!JSON.stringify(mio).includes(esc.asociadoA2.id));
      assert.ok(!JSON.stringify(mio).includes(esc.asociadoB1.id));
    });

    test('personal y operador no pueden usar el portal', async () => {
      for (const actor of [esc.tesoreroA.actor, esc.consejoA.actor, esc.operadorA.actor]) {
        await assert.rejects(e.casos.portal.ejecutar(actor), ErrorAccesoDenegado);
      }
    });

    test('un asociado no puede leer el estado de cuenta de nadie por la ruta del personal', async () => {
      for (const id of [esc.asociadoA1.id, esc.asociadoA2.id, esc.asociadoB1.id]) {
        await assert.rejects(e.casos.estadoDeCuenta.ejecutar(esc.asociadoA1.cuenta.actor, id), ErrorAccesoDenegado);
      }
    });

    test('un tesorero de otra JASS no ve el estado de cuenta, igual que ante un identificador inexistente', async () => {
      // Cada promesa se crea y se espera en el mismo paso: una rechazada sin atender falla la prueba.
      for (const id of [esc.asociadoA1.id, '30000000-0000-4000-8000-000000000009', 'no-uuid']) {
        await assert.rejects(e.casos.estadoDeCuenta.ejecutar(esc.tesoreroB.actor, id), (err: unknown) => err instanceof ErrorAccesoDenegado && err.motivo === 'recurso-ajeno' && err.message === 'acceso denegado');
      }
    });

    test('asociado dado de baja: sigue viendo su historial', async () => {
      const x = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Con Cuenta', documento: 'CTA-0001' });
      await e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, x.id, { correo: `cuenta.${x.id.slice(0, 6)}@prueba.pe`, contrasena: 'Clave-de-prueba-123' });
      const s = await e.casos.autenticar.ejecutar({ correo: `cuenta.${x.id.slice(0, 6)}@prueba.pe`, contrasena: 'Clave-de-prueba-123' });
      const actor = await e.casos.autorizar.ejecutar(s.tokenAcceso);
      await e.casos.darDeBaja.ejecutar(esc.tesoreroA.actor, x.id);
      assert.equal((await e.casos.portal.ejecutar(actor)).asociado.estado, 'baja');
    });
  });

  describe('matriz perfil/rol × caso de uso', () => {
    const desconocido = '40000000-0000-4000-8000-000000000001';
    type Intento = (actor: Escenario['consejoA']['actor']) => Promise<unknown>;
    const casos: Array<{ nombre: string; permitidos: Array<'consejo' | 'tesorero' | 'operador' | 'asociado'>; intento: Intento }> = [
      { nombre: 'registrarAsociado', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.registrarAsociado.ejecutar(a, { nombre: '', documento: '' }) },
      { nombre: 'darDeBaja', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.darDeBaja.ejecutar(a, desconocido) },
      { nombre: 'listarAsociados', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.listarAsociados.ejecutar(a) },
      { nombre: 'estadoDeCuenta', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.estadoDeCuenta.ejecutar(a, desconocido) },
      { nombre: 'crearAcceso', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.crearAcceso.ejecutar(a, desconocido, { correo: 'x@y.pe', contrasena: 'Clave-de-prueba-123' }) },
      { nombre: 'generarCuotas', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.generarCuotas.ejecutar(a, { periodo: 'mal', importeCentimos: 1 }) },
      { nombre: 'registrarPago', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.registrarPago.ejecutar(a, { cuotaId: undefined, importeCentimos: undefined, comprobante: undefined }, undefined) },
      { nombre: 'reversarPago', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.reversarPago.ejecutar(a, desconocido, { motivo: 'x' }) },
      { nombre: 'consultarPago', permitidos: ['consejo', 'tesorero'], intento: (a) => e.casos.consultarPago.ejecutar(a, desconocido) },
      { nombre: 'portal', permitidos: ['asociado'], intento: (a) => e.casos.portal.ejecutar(a) },
    ];
    const perfiles = (): Record<'consejo' | 'tesorero' | 'operador' | 'asociado', Escenario['consejoA']['actor']> => ({
      consejo: esc.consejoA.actor,
      tesorero: esc.tesoreroA.actor,
      operador: esc.operadorA.actor,
      asociado: esc.asociadoA1.cuenta.actor,
    });

    for (const caso of casos) {
      for (const perfil of ['consejo', 'tesorero', 'operador', 'asociado'] as const) {
        const permitido = caso.permitidos.includes(perfil);
        test(`${caso.nombre}: ${perfil} ${permitido ? 'pasa la autorización' : 'queda denegado por permiso'}`, async () => {
          const resultado = await caso.intento(perfiles()[perfil]).then(
            () => 'ok',
            (err: unknown) => (err instanceof ErrorAccesoDenegado && err.motivo.startsWith('sin-permiso:') ? 'sin-permiso' : 'otro'),
          );
          if (permitido) assert.notEqual(resultado, 'sin-permiso');
          else assert.equal(resultado, 'sin-permiso');
        });
      }
    }
  });

  describe('cuentas de acceso de asociados', () => {
    test('correo repetido → conflicto; contraseña débil o correo inválido → 422; asociado ajeno → denegado', async () => {
      const x = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Sin Cuenta', documento: 'SIN-0001' });
      await assert.rejects(e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, x.id, { correo: esc.asociadoA1.cuenta.correo, contrasena: 'Clave-de-prueba-123' }), codigo('correo-duplicado', ErrorConflicto));
      await assert.rejects(e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, x.id, { correo: 'nuevo@prueba.pe', contrasena: 'corta' }), codigo('contrasena-invalida'));
      await assert.rejects(e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, x.id, { correo: 'no-es-correo', contrasena: 'Clave-de-prueba-123' }), codigo('correo-invalido'));
      await assert.rejects(e.casos.crearAcceso.ejecutar(esc.tesoreroB.actor, x.id, { correo: 'nuevo@prueba.pe', contrasena: 'Clave-de-prueba-123' }), ErrorAccesoDenegado);
      await assert.rejects(e.casos.crearAcceso.ejecutar(esc.operadorA.actor, x.id, { correo: 'nuevo@prueba.pe', contrasena: 'Clave-de-prueba-123' }), ErrorAccesoDenegado);
    });

    test('un asociado ya con cuenta no admite una segunda cuenta activa', async () => {
      await assert.rejects(
        e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id, { correo: 'segunda@prueba.pe', contrasena: 'Clave-de-prueba-123' }),
        codigo('asociado-con-cuenta', ErrorConflicto),
      );
    });
  });
});
}
