/** Configuración de la API y órdenes de plataforma (tareas 4.1 y 4.6). */
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { leerConfiguracion } from '../../api/config.js';
import { CORREOS_DEMO, crearJass, periodoAnterior, sembrarDemo } from '../../api/cli-comandos.js';
import { UnidadDeTrabajoAccesoMemoria } from '../../infraestructura/memoria-acceso.js';
import { CLAVE, crearEntorno } from '../entorno-acceso.js';

const SECRETO = 's'.repeat(32);

describe('configuración de la API', () => {
  test('sin JWT_SECRET no arranca', () => {
    assert.throws(() => leerConfiguracion({ DATABASE_URL: 'postgres://x' }), /JWT_SECRET/);
  });
  test('un JWT_SECRET de menos de 32 bytes no arranca (también contando bytes, no caracteres)', () => {
    assert.throws(() => leerConfiguracion({ JWT_SECRET: 'corto', DATABASE_URL: 'postgres://x' }), /32 bytes/);
    assert.throws(() => leerConfiguracion({ JWT_SECRET: 's'.repeat(31), DATABASE_URL: 'postgres://x' }), /32 bytes/);
    assert.doesNotThrow(() => leerConfiguracion({ JWT_SECRET: 's'.repeat(32), DATABASE_URL: 'postgres://x' }));
    assert.doesNotThrow(() => leerConfiguracion({ JWT_SECRET: 'ñ'.repeat(16), DATABASE_URL: 'postgres://x' }));
  });
  test('sin DATABASE_URL no arranca', () => {
    assert.throws(() => leerConfiguracion({ JWT_SECRET: SECRETO }), /DATABASE_URL/);
    assert.throws(() => leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: '  ' }), /DATABASE_URL/);
  });
  test('PORT inválido no arranca; por defecto 3000', () => {
    for (const PORT of ['abc', '-1', '70000', '1.5']) assert.throws(() => leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: 'x', PORT }), /PORT/);
    assert.equal(leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: 'x' }).puerto, 3000);
  });
  test('CORS_ORIGIN y WEB_DIR son opcionales y se normalizan', () => {
    const c = leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: 'x', CORS_ORIGIN: ' http://a.pe , ,http://b.pe', WEB_DIR: ' /web ' });
    assert.deepEqual(c.origenesPermitidos, ['http://a.pe', 'http://b.pe']);
    assert.equal(c.directorioWeb, '/web');
    assert.deepEqual(leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: 'x' }).origenesPermitidos, []);
  });
});

describe('órdenes de plataforma', () => {
  test('crear-jass falla sin SIJASS_CLAVE_INICIAL y no acepta la contraseña por argumento', async () => {
    const e = crearEntorno(new UnidadDeTrabajoAccesoMemoria());
    await assert.rejects(crearJass(e.casos, { nombre: 'JASS X', correo: 'a@b.pe' }, {}), /SIJASS_CLAVE_INICIAL/);
    await assert.rejects(crearJass(e.casos, { nombre: 'JASS X', correo: 'a@b.pe' }, { SIJASS_CLAVE_INICIAL: '' }), /SIJASS_CLAVE_INICIAL/);
  });

  test('crear-jass crea la JASS y el consejo con la contraseña derivada, y el consejo inicia sesión', async () => {
    const uow = new UnidadDeTrabajoAccesoMemoria();
    const e = crearEntorno(uow);
    const r = await crearJass(e.casos, { nombre: 'JASS Nueva', correo: 'Consejo@Nueva.pe' }, { SIJASS_CLAVE_INICIAL: CLAVE });
    const usuario = await uow.ejecutar((x) => x.usuarios.buscarPorId(r.usuarioId));
    assert.equal(usuario?.correo, 'consejo@nueva.pe');
    assert.ok(usuario?.hashContrasena.startsWith('scrypt$'));
    assert.ok(!usuario?.hashContrasena.includes(CLAVE));
    const sesion = await e.casos.autenticar.ejecutar({ correo: 'consejo@nueva.pe', contrasena: CLAVE });
    assert.equal(sesion.rol, 'consejo');
    assert.ok((await uow.ejecutar((x) => x.auditoria.listarPorJass(r.jassId))).some((ev) => ev.accion === 'jass.creada'));
  });

  test('crear-jass sin nombre o correo → uso', async () => {
    const e = crearEntorno(new UnidadDeTrabajoAccesoMemoria());
    await assert.rejects(crearJass(e.casos, {}, { SIJASS_CLAVE_INICIAL: CLAVE }), /Uso/);
  });

  test('sembrar-demo se niega sin SIJASS_PERMITIR_DEMO=1 y sin SIJASS_CLAVE_DEMO', async () => {
    const e = crearEntorno(new UnidadDeTrabajoAccesoMemoria());
    const ahora = e.reloj.ahora();
    await assert.rejects(sembrarDemo(e.casos, { SIJASS_CLAVE_DEMO: CLAVE }, ahora), /SIJASS_PERMITIR_DEMO/);
    await assert.rejects(sembrarDemo(e.casos, { SIJASS_PERMITIR_DEMO: '0', SIJASS_CLAVE_DEMO: CLAVE }, ahora), /SIJASS_PERMITIR_DEMO/);
    await assert.rejects(sembrarDemo(e.casos, { SIJASS_PERMITIR_DEMO: '1' }, ahora), /SIJASS_CLAVE_DEMO/);
  });

  test('sembrar-demo crea personal, tres asociados con cuenta y saldos: al día, parcial y moroso', async () => {
    const e = crearEntorno(new UnidadDeTrabajoAccesoMemoria());
    await sembrarDemo(e.casos, { SIJASS_PERMITIR_DEMO: '1', SIJASS_CLAVE_DEMO: CLAVE }, e.reloj.ahora());
    const saldo = async (correo: string) => {
      const s = await e.casos.autenticar.ejecutar({ correo, contrasena: CLAVE });
      return (await e.casos.portal.ejecutar(await e.casos.autorizar.ejecutar(s.tokenAcceso))).saldoCentimos;
    };
    assert.equal(await saldo(CORREOS_DEMO.asociados[0]), 0);
    assert.equal(await saldo(CORREOS_DEMO.asociados[1]), 4500 - 1500 - 750);
    assert.equal(await saldo(CORREOS_DEMO.asociados[2]), 4500);
  });

  test('periodoAnterior cruza el cambio de año', () => {
    assert.equal(periodoAnterior('2026-11', 0), '2026-11');
    assert.equal(periodoAnterior('2026-11', 2), '2026-09');
    assert.equal(periodoAnterior('2026-01', 1), '2025-12');
    assert.equal(periodoAnterior('2026-02', 14), '2024-12');
  });
});
