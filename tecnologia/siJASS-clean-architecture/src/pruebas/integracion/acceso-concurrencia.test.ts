/**
 * Concurrencia contra PostgreSQL (tarea 3.4): reintentos simultáneos de un pago, pagos que
 * juntos superan la cuota, rotación simultánea de un refresco y fallos de inicio de sesión
 * simultáneos. Cada escenario se repite 10 veces para descartar fallos intermitentes.
 */
import { after, before, describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ErrorDatoInvalido, ErrorNoAutenticado } from '../../dominio/errores.js';
import { UnidadDeTrabajoAccesoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { CLAVE, crearEntorno, nuevaClave, sembrarEscenario, type Entorno } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';

const RONDAS = 10;

describe('concurrencia de acceso y pagos (PostgreSQL)', () => {
  const pool = crearPool(16);
  let e: Entorno;

  before(() => {
    e = crearEntorno(new UnidadDeTrabajoAccesoPostgres(pool));
  });
  after(async () => {
    await pool.end();
  });

  async function cuotaNueva(importeCentimos: number) {
    const esc = await sembrarEscenario(e);
    await e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo: '2026-11', importeCentimos });
    const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
    return { esc, cuotaId: cuenta.cuotas[0].id };
  }

  test(`diez solicitudes idénticas con la misma clave producen un único pago (${RONDAS} rondas)`, async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const { esc, cuotaId } = await cuotaNueva(1500);
      const clave = nuevaClave();
      const resultados = await Promise.all(
        Array.from({ length: 10 }, () => e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId, importeCentimos: 500, comprobante: 'CONC-1' }, clave)),
      );
      assert.equal(new Set(resultados.map((r) => r.pago.id)).size, 1, `ronda ${ronda}: más de un pago`);
      assert.equal(resultados.filter((r) => !r.duplicado).length, 1, `ronda ${ronda}: debe haber exactamente una creación`);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM pago WHERE jass_id = $1 AND cuota_id = $2', [esc.jassA, cuotaId]);
      assert.equal(rows[0].n, 1);
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
      assert.equal(cuenta.cuotas[0].pendienteCentimos, 1000);
    }
  });

  test(`dos pagos distintos que juntos superan la cuota: solo uno prospera (${RONDAS} rondas)`, async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const { esc, cuotaId } = await cuotaNueva(1000);
      const intentos = await Promise.allSettled([
        e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId, importeCentimos: 700, comprobante: 'A' }, nuevaClave()),
        e.casos.registrarPago.ejecutar(esc.consejoA.actor, { cuotaId, importeCentimos: 700, comprobante: 'B' }, nuevaClave()),
      ]);
      const ok = intentos.filter((i) => i.status === 'fulfilled');
      const fallos = intentos.filter((i): i is PromiseRejectedResult => i.status === 'rejected');
      assert.equal(ok.length, 1, `ronda ${ronda}: debe prosperar exactamente uno`);
      assert.equal(fallos.length, 1);
      assert.ok(fallos[0].reason instanceof ErrorDatoInvalido && fallos[0].reason.codigo === 'sobrepago');
      const { rows } = await pool.query("SELECT COALESCE(sum(importe_centimos), 0)::int AS total FROM pago WHERE cuota_id = $1 AND estado = 'vigente'", [cuotaId]);
      assert.ok(rows[0].total <= 1000, `ronda ${ronda}: la suma vigente (${rows[0].total}) supera la cuota`);
    }
  });

  test(`pagos simultáneos que caben en la cuota prosperan todos (${RONDAS} rondas)`, async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const { esc, cuotaId } = await cuotaNueva(1000);
      const resultados = await Promise.all(
        Array.from({ length: 10 }, (_, i) => e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId, importeCentimos: 100, comprobante: `P${i}` }, nuevaClave())),
      );
      assert.equal(resultados.length, 10);
      const cuenta = await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id);
      assert.equal(cuenta.cuotas[0].pendienteCentimos, 0);
      assert.equal(cuenta.cuotas[0].estado, 'pagada');
    }
  });

  test(`la misma clave sobre dos cuotas distintas en carrera: un solo pago y un conflicto (${RONDAS} rondas)`, async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const esc = await sembrarEscenario(e);
      await e.casos.generarCuotas.ejecutar(esc.tesoreroA.actor, { periodo: '2026-11', importeCentimos: 1000 });
      const c1 = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA1.id)).cuotas[0].id;
      const c2 = (await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id)).cuotas[0].id;
      const clave = nuevaClave();
      const intentos = await Promise.allSettled([
        e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: c1, importeCentimos: 100, comprobante: 'X' }, clave),
        e.casos.registrarPago.ejecutar(esc.tesoreroA.actor, { cuotaId: c2, importeCentimos: 100, comprobante: 'X' }, clave),
      ]);
      assert.equal(intentos.filter((i) => i.status === 'fulfilled').length, 1, `ronda ${ronda}`);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM pago WHERE jass_id = $1 AND clave_idempotencia = $2', [esc.jassA, clave]);
      assert.equal(rows[0].n, 1);
    }
  });

  test(`rotación simultánea del mismo refresco: solo una renovación prospera (${RONDAS} rondas)`, async () => {
    const esc = await sembrarEscenario(e);
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const s = await e.casos.autenticar.ejecutar({ correo: esc.tesoreroA.correo, contrasena: CLAVE });
      const intentos = await Promise.allSettled(Array.from({ length: 5 }, () => e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco })));
      assert.equal(intentos.filter((i) => i.status === 'fulfilled').length, 1, `ronda ${ronda}`);
      for (const i of intentos) if (i.status === 'rejected') assert.ok(i.reason instanceof ErrorNoAutenticado);
    }
  });

  test(`fallos de inicio de sesión simultáneos se suman sin perderse (${RONDAS} rondas)`, async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const esc = await sembrarEscenario(e);
      await Promise.allSettled(Array.from({ length: 4 }, () => e.casos.autenticar.ejecutar({ correo: esc.operadorA.correo, contrasena: 'incorrecta-123' })));
      const { rows } = await pool.query('SELECT intentos_fallidos FROM usuario WHERE id = $1', [esc.operadorA.usuarioId]);
      assert.equal(rows[0].intentos_fallidos, 4, `ronda ${ronda}: se perdió algún intento`);
    }
  });
});
