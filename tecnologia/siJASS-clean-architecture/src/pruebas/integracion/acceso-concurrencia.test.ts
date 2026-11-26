/**
 * Concurrencia contra PostgreSQL (tarea 3.4): reintentos simultáneos de un pago, pagos que
 * juntos superan la cuota, rotación simultánea de un refresco y fallos de inicio de sesión
 * simultáneos. Cada escenario se repite 10 veces para descartar fallos intermitentes.
 */
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { ErrorCuentaBloqueada, ErrorDatoInvalido, ErrorNoAutenticado } from '../../dominio/errores.js';
import { AutenticarUsuario } from '../../aplicacion/acceso/sesiones.js';
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
      const s = await e.casos.autenticar.ejecutar({ documento: esc.tesoreroA.documento, contrasena: CLAVE });
      const intentos = await Promise.allSettled(Array.from({ length: 5 }, () => e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco })));
      assert.equal(intentos.filter((i) => i.status === 'fulfilled').length, 1, `ronda ${ronda}`);
      for (const i of intentos) if (i.status === 'rejected') assert.ok(i.reason instanceof ErrorNoAutenticado, `ronda ${ronda}: un intento perdedor falló con otro error: ${String((i.reason as Error | undefined)?.stack ?? i.reason)}`);
    }
  });

  test(`fallos de inicio de sesión simultáneos se suman sin perderse (${RONDAS} rondas)`, async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const esc = await sembrarEscenario(e);
      await Promise.allSettled(Array.from({ length: 4 }, () => e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: 'incorrecta-123' })));
      const { rows } = await pool.query('SELECT intentos_fallidos FROM usuario WHERE id = $1', [esc.operadorA.usuarioId]);
      assert.equal(rows[0].intentos_fallidos, 4, `ronda ${ronda}: se perdió algún intento`);
    }
  });

  test('un inicio correcto iniciado antes del bloqueo no abre sesión después de activarse', async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
    const esc = await sembrarEscenario(e);
    for (let i = 0; i < 4; i++) {
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
    }

    let avisarInicio!: () => void;
    let liberar!: () => void;
    const inicioVerificacion = new Promise<void>((resolve) => { avisarInicio = resolve; });
    const continuar = new Promise<void>((resolve) => { liberar = resolve; });
    const original = e.dependencias.contrasenas;
    const controlada = {
      derivar: original.derivar.bind(original),
      verificar: async (clave: string, hash: string): Promise<boolean> => {
        avisarInicio();
        await continuar;
        return original.verificar(clave, hash);
      },
    };
    const autenticador = new AutenticarUsuario({ ...e.dependencias, contrasenas: controlada });
    const inicioCorrecto = autenticador.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
    try {
      await inicioVerificacion;
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
      const { rows } = await pool.query('SELECT intentos_fallidos, bloqueado_hasta FROM usuario WHERE id = $1', [esc.operadorA.usuarioId]);
      assert.equal(rows[0].intentos_fallidos, 5);
      assert.ok(rows[0].bloqueado_hasta);
    } finally {
      liberar();
    }
    await assert.rejects(inicioCorrecto, ErrorCuentaBloqueada);
    }
  });

  test('el bloqueo vigente prevalece aunque cambie el hash durante la verificación', async () => {
    const esc = await sembrarEscenario(e);
    const cuenta = esc.operadorA;
    for (let i = 0; i < 4; i++) await assert.rejects(e.casos.autenticar.ejecutar({ documento: cuenta.documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
    let avisar!: () => void;
    let liberar!: () => void;
    const inicio = new Promise<void>((resolve) => { avisar = resolve; });
    const continuar = new Promise<void>((resolve) => { liberar = resolve; });
    const original = e.dependencias.contrasenas;
    const caso = new AutenticarUsuario({ ...e.dependencias, contrasenas: {
      derivar: original.derivar.bind(original),
      verificar: async (clave: string, hash: string): Promise<boolean> => {
        avisar();
        await continuar;
        return original.verificar(clave, hash);
      },
    } });
    const intento = caso.ejecutar({ documento: cuenta.documento, contrasena: CLAVE });
    const rechazo = assert.rejects(intento, ErrorCuentaBloqueada);
    await inicio;
    try {
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: cuenta.documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
      const nuevoHash = await original.derivar('otra-clave-segura-123');
      await pool.query('UPDATE usuario SET hash_contrasena = $1 WHERE id = $2', [nuevoHash, cuenta.usuarioId]);
    } finally {
      liberar();
    }
    await rechazo;
    const { rows } = await pool.query('SELECT intentos_fallidos, bloqueado_hasta FROM usuario WHERE id = $1', [cuenta.usuarioId]);
    assert.equal(rows[0].intentos_fallidos, 5);
    assert.ok(rows[0].bloqueado_hasta);
  });

  test('bloquear una cuenta no impide autenticar otra cuenta', async () => {
    const esc = await sembrarEscenario(e);
    const cliente = await pool.connect();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      await cliente.query('BEGIN');
      await cliente.query('SELECT id FROM usuario WHERE id = $1 FOR UPDATE', [esc.operadorA.usuarioId]);
      const limite = new Promise<never>((_, reject) => { temporizador = setTimeout(() => reject(new Error('otra cuenta quedó bloqueada')), 10_000); });
      const sesion = await Promise.race([e.casos.autenticar.ejecutar({ documento: esc.tesoreroB.documento, contrasena: CLAVE }), limite]);
      assert.equal(sesion.rol, 'tesorero');
    } finally {
      if (temporizador) clearTimeout(temporizador);
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });

  for (const cambio of ['hash', 'estado'] as const) {
    test(`se rechaza el inicio si cambia ${cambio} durante la verificación`, async () => {
      const esc = await sembrarEscenario(e);
      let avisar!: () => void;
      let liberar!: () => void;
      const inicio = new Promise<void>((resolve) => { avisar = resolve; });
      const continuar = new Promise<void>((resolve) => { liberar = resolve; });
      const original = e.dependencias.contrasenas;
      const contrasenas = {
        derivar: original.derivar.bind(original),
        verificar: async (clave: string, hash: string): Promise<boolean> => {
          avisar();
          await continuar;
          return original.verificar(clave, hash);
        },
      };
      const caso = new AutenticarUsuario({ ...e.dependencias, contrasenas });
      const intento = caso.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
      const rechazo = assert.rejects(intento, ErrorNoAutenticado);
      await inicio;
      try {
        if (cambio === 'hash') {
          const nuevo = await original.derivar('otra-clave-segura-123');
          await pool.query('UPDATE usuario SET hash_contrasena = $1 WHERE id = $2', [nuevo, esc.operadorA.usuarioId]);
        } else {
          await pool.query("UPDATE usuario SET estado = 'inactivo' WHERE id = $1", [esc.operadorA.usuarioId]);
        }
      } finally {
        liberar();
      }
      await rechazo;
    });
  }

  test('procesos independientes respetan el bloqueo sin afectar otra cuenta', async () => {
    const esc = await sembrarEscenario(e);
    const cuenta = esc.operadorA;
    for (let i = 0; i < 4; i++) await assert.rejects(e.casos.autenticar.ejecutar({ documento: cuenta.documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
    const ruta = new URL('./auxiliar-auth.js', import.meta.url);
    const correcto = fork(ruta, [cuenta.documento, 'correcta'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const cierreCorrecto = once(correcto, 'exit');
    try {
      assert.equal((await once(correcto, 'message'))[0], 'verificando');
      const incorrecto = fork(ruta, [cuenta.documento, 'incorrecta'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      const cierreIncorrecto = once(incorrecto, 'exit');
      assert.equal((await once(incorrecto, 'message'))[0], 'ErrorNoAutenticado');
      await cierreIncorrecto;
      const otra = await e.casos.autenticar.ejecutar({ documento: esc.tesoreroB.documento, contrasena: CLAVE });
      assert.equal(otra.rol, 'tesorero');
      const respuesta = once(correcto, 'message');
      correcto.send('continuar');
      assert.equal((await respuesta)[0], 'ErrorCuentaBloqueada');
      await cierreCorrecto;
      const { rows } = await pool.query('SELECT intentos_fallidos, bloqueado_hasta FROM usuario WHERE id = $1', [cuenta.usuarioId]);
      assert.equal(rows[0].intentos_fallidos, 5);
      assert.ok(rows[0].bloqueado_hasta);
    } finally {
      if (correcto.connected) correcto.send('continuar');
    }
  });

  test('si el inicio correcto decide primero, el fallo posterior cuenta como primero', async () => {
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const esc = await sembrarEscenario(e);
      for (let i = 0; i < 4; i++) await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
      let iniciar!: () => void;
      let liberar!: () => void;
      const iniciado = new Promise<void>((resolve) => { iniciar = resolve; });
      const continuar = new Promise<void>((resolve) => { liberar = resolve; });
      const original = e.dependencias.contrasenas;
      const contrasenas = {
        derivar: original.derivar.bind(original),
        verificar: async (clave: string, hash: string): Promise<boolean> => {
          iniciar();
          await continuar;
          return original.verificar(clave, hash);
        },
      };
      const caso = new AutenticarUsuario({ ...e.dependencias, contrasenas });
      const fallo = caso.ejecutar({ documento: esc.operadorA.documento, contrasena: 'incorrecta-123' });
      const rechazo = assert.rejects(fallo, ErrorNoAutenticado);
      await iniciado;
      try {
      await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
      } finally {
        liberar();
      }
      await rechazo;
      const { rows } = await pool.query('SELECT intentos_fallidos, bloqueado_hasta FROM usuario WHERE id = $1', [esc.operadorA.usuarioId]);
      assert.equal(rows[0].intentos_fallidos, 1);
      assert.equal(rows[0].bloqueado_hasta, null);
    }
  });
});
