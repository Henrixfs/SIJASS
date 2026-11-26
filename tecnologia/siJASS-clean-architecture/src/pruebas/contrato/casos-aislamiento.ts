/**
 * Aislamiento entre tres JASS (spec `aislamiento-multi-jass`, «Pruebas de aislamiento con varias
 * JASS»). Para cada recurso comprueba que lecturas, listados y escrituras de una JASS no alcanzan
 * a las otras. Se ejecuta con la memoria y con PostgreSQL.
 */
import { before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { ErrorAccesoDenegado } from '../../dominio/errores.js';
import type { UnidadDeTrabajoAcceso } from '../../dominio/puertos-acceso.js';
import { actorDe, CLAVE, comoSistema, crearEntorno, nuevaClave, nuevoDni, type Cuenta, type Entorno, type UnidadDeTrabajoSistema } from '../entorno-acceso.js';
import type { FabricaUnidadDeTrabajoAcceso } from './casos-acceso.js';

interface Jass {
  readonly nombre: string;
  readonly jassId: string;
  readonly consejo: Cuenta;
  readonly asociadoId: string;
  readonly cuotaId: string;
  readonly pagoId: string;
  readonly reservorioId: string;
  readonly miembroId: string;
}

const sufijo = () => Math.random().toString(36).slice(2, 10);
const denegado = (err: unknown) => err instanceof ErrorAccesoDenegado && err.motivo === 'recurso-ajeno';

export function suiteAislamiento(fabrica: FabricaUnidadDeTrabajoAcceso): void {
  describe('aislamiento entre tres JASS', () => {
    let base: UnidadDeTrabajoAcceso;
    let uow: UnidadDeTrabajoSistema;
    let e: Entorno;
    let jass: Jass[];

    async function crearJass(etiqueta: string): Promise<Jass> {
      const documento = nuevoDni();
      const nombre = `Aislada ${etiqueta} ${sufijo()}`;
      const alta = await e.casos.crearJass.ejecutar({ nombre, consejo: { nombre: `Consejo ${etiqueta}`, documento }, contrasena: CLAVE, debeCambiarContrasena: false });
      const consejo = await actorDe(e, documento);
      const asociado = await e.casos.registrarAsociado.ejecutar(consejo.actor, { nombre: `Asociado ${etiqueta}`, documento: nuevoDni() });
      await e.casos.generarCuotas.ejecutar(consejo.actor, { periodo: '2026-11', importeCentimos: 1500 });
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(consejo.actor, asociado.id);
      const pago = await e.casos.registrarPago.ejecutar(consejo.actor, { cuotaId: cuenta.cuotas[0].id, importeCentimos: 500, comprobante: `AIS-${etiqueta}` }, nuevaClave());
      const reservorio = await e.casos.crearReservorio.ejecutar(consejo.actor, { nombre: `Reservorio ${etiqueta}` });
      const miembro = await e.casos.crearMiembroEquipo.ejecutar(consejo.actor, { nombre: `Operador ${etiqueta}`, documento: nuevoDni(), rol: 'operador' });
      return { nombre, jassId: alta.jassId, consejo, asociadoId: asociado.id, cuotaId: cuenta.cuotas[0].id, pagoId: pago.pago.id, reservorioId: reservorio.id, miembroId: miembro.usuarioId };
    }

    before(async () => {
      base = fabrica();
      uow = comoSistema(base);
      e = crearEntorno(base);
      jass = [await crearJass('A'), await crearJass('B'), await crearJass('C')];
    });

    const paresDistintos = (): Array<[Jass, Jass]> => jass.flatMap((x) => jass.filter((y) => y !== x).map((y): [Jass, Jass] => [x, y]));

    test('los listados de cada JASS solo traen sus propios recursos', async () => {
      for (const j of jass) {
        const asociados = await e.casos.listarAsociados.ejecutar(j.consejo.actor);
        assert.deepEqual(asociados.map((a) => a.id), [j.asociadoId]);
        assert.deepEqual((await e.casos.listarReservorios.ejecutar(j.consejo.actor)).map((r) => r.id), [j.reservorioId]);
        const equipo = (await e.casos.listarEquipo.ejecutar(j.consejo.actor)).map((f) => f.usuarioId);
        assert.ok(equipo.includes(j.miembroId) && equipo.includes(j.consejo.usuarioId));
        for (const otra of jass.filter((x) => x !== j)) assert.ok(!equipo.includes(otra.miembroId) && !equipo.includes(otra.consejo.usuarioId));
      }
    });

    test('lecturas por identificador de otra JASS se tratan como un recurso inexistente', async () => {
      for (const [x, y] of paresDistintos()) {
        await assert.rejects(e.casos.estadoDeCuenta.ejecutar(x.consejo.actor, y.asociadoId), denegado);
        await assert.rejects(e.casos.consultarPago.ejecutar(x.consejo.actor, y.pagoId), denegado);
        await assert.rejects(e.casos.historial.ejecutar(x.consejo.actor, y.reservorioId), denegado);
      }
    });

    test('las escrituras sobre recursos de otra JASS se rechazan sin modificar datos de ninguna', async () => {
      const antes = await Promise.all(jass.map((j) => e.casos.estadoDeCuenta.ejecutar(j.consejo.actor, j.asociadoId)));
      for (const [x, y] of paresDistintos()) {
        await assert.rejects(e.casos.registrarPago.ejecutar(x.consejo.actor, { cuotaId: y.cuotaId, importeCentimos: 100, comprobante: 'INTRUSO' }, nuevaClave()), (err: unknown) => err instanceof Error);
        await assert.rejects(e.casos.reversarPago.ejecutar(x.consejo.actor, y.pagoId, { motivo: 'intruso' }), denegado);
        await assert.rejects(e.casos.darDeBaja.ejecutar(x.consejo.actor, y.asociadoId), denegado);
        await assert.rejects(e.casos.crearAcceso.ejecutar(x.consejo.actor, y.asociadoId), denegado);
        await assert.rejects(e.casos.restablecerClaveAsociado.ejecutar(x.consejo.actor, y.asociadoId), denegado);
        await assert.rejects(e.casos.desactivarMiembroEquipo.ejecutar(x.consejo.actor, y.miembroId), denegado);
        await assert.rejects(e.casos.restablecerClaveEquipo.ejecutar(x.consejo.actor, y.miembroId), denegado);
      }
      const despues = await Promise.all(jass.map((j) => e.casos.estadoDeCuenta.ejecutar(j.consejo.actor, j.asociadoId)));
      assert.deepEqual(despues, antes);
    });

    test('un evento de auditoría de una JASS no aparece en la de otra', async () => {
      for (const [x, y] of paresDistintos()) {
        const propios = await uow.ejecutar((r) => r.auditoria.listarPorJass(x.jassId));
        const ajenos = await uow.ejecutar((r) => r.auditoria.listarPorJass(y.jassId));
        assert.ok(propios.length > 0 && ajenos.length > 0);
        assert.ok(propios.every((ev) => ev.jassId === x.jassId));
        assert.ok(!ajenos.some((ev) => propios.includes(ev)));
      }
    });
  });
}
