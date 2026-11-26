/** Configuración de la API y órdenes de plataforma (tareas 4.1 y 4.6). */
import { describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { leerConfiguracion } from '../../api/config.js';
import { asignarDocumento, crearJass, crearPlataforma, CUENTAS_DEMO, periodoAnterior, sembrarDemo } from '../../api/cli-comandos.js';
import { UnidadDeTrabajoAccesoMemoria } from '../../infraestructura/memoria-acceso.js';
import { ErrorNoAutenticado } from '../../dominio/errores.js';
import { CLAVE, comoSistema, crearEntorno, esActorDeJass, type Entorno } from '../entorno-acceso.js';

async function actorDeJass(e: Entorno, token: string) {
  const actor = await e.casos.autorizar.ejecutar(token);
  if (!esActorDeJass(actor)) throw new Error('se esperaba un actor de una JASS');
  return actor;
}

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
  test('TRUST_PROXY=1 activa la confianza en el proxy; por defecto no', () => {
    assert.equal(leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: 'x' }).confiarEnProxy, false);
    assert.equal(leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: 'x', TRUST_PROXY: '1' }).confiarEnProxy, true);
    assert.equal(leerConfiguracion({ JWT_SECRET: SECRETO, DATABASE_URL: 'x', TRUST_PROXY: 'true' }).confiarEnProxy, false);
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
    const args = { nombre: 'JASS X', documento: '40000001', consejo: 'Ana Consejo' };
    await assert.rejects(crearJass(e.casos, args, {}), /SIJASS_CLAVE_INICIAL/);
    await assert.rejects(crearJass(e.casos, args, { SIJASS_CLAVE_INICIAL: '' }), /SIJASS_CLAVE_INICIAL/);
  });

  test('crear-jass crea la JASS y el consejo con la clave derivada, con cambio pendiente, y el consejo entra con su DNI', async () => {
    const uow = new UnidadDeTrabajoAccesoMemoria();
    const e = crearEntorno(uow);
    const r = await crearJass(e.casos, { nombre: 'JASS Nueva', documento: '40000002', consejo: 'Ana Consejo' }, { SIJASS_CLAVE_INICIAL: CLAVE });
    const usuario = await comoSistema(uow).ejecutar((x) => x.usuarios.buscarPorId(r.usuarioId));
    assert.equal(usuario?.documento, '40000002');
    assert.equal(usuario?.nombre, 'Ana Consejo');
    assert.equal(usuario?.correo, null);
    assert.equal(usuario?.debeCambiarContrasena, true);
    assert.ok(usuario?.hashContrasena.startsWith('scrypt$'));
    assert.ok(!usuario?.hashContrasena.includes(CLAVE));
    const sesion = await e.casos.autenticar.ejecutar({ documento: '40000002', contrasena: CLAVE, tipo: 'administrador' });
    assert.equal(sesion.rol, 'consejo');
    assert.equal(sesion.debeCambiarContrasena, true);
    assert.ok((await comoSistema(uow).ejecutar((x) => x.auditoria.listarPorJass(r.jassId))).some((ev) => ev.accion === 'jass.creada'));
  });

  test('crear-jass con un DNI inválido o sin datos → rechazo y no deja nada creado', async () => {
    const uow = new UnidadDeTrabajoAccesoMemoria();
    const e = crearEntorno(uow);
    await assert.rejects(crearJass(e.casos, {}, { SIJASS_CLAVE_INICIAL: CLAVE }), /Uso/);
    await assert.rejects(crearJass(e.casos, { nombre: 'JASS Y', documento: '123', consejo: 'Ana' }, { SIJASS_CLAVE_INICIAL: CLAVE }), (err: unknown) => (err as { codigo?: string }).codigo === 'documento-no-es-dni');
    assert.equal((await comoSistema(uow).ejecutar((x) => x.jass.listar())).length, 0);
  });

  test('crear-plataforma crea la cuenta sin JASS, con cambio pendiente, y no imprime ni guarda la clave en claro', async () => {
    const uow = new UnidadDeTrabajoAccesoMemoria();
    const e = crearEntorno(uow);
    await assert.rejects(crearPlataforma(e.casos, { documento: '40000003', nombre: 'Equipo' }, {}), /SIJASS_CLAVE_INICIAL/);
    const r = await crearPlataforma(e.casos, { documento: '40000003', nombre: 'Equipo SIJASS' }, { SIJASS_CLAVE_INICIAL: CLAVE });
    const membresia = await comoSistema(uow).ejecutar((x) => x.membresias.activaDeUsuario(r.usuarioId));
    assert.equal(membresia?.perfil, 'plataforma');
    assert.equal(membresia?.jassId, null);
    const sesion = await e.casos.autenticar.ejecutar({ documento: '40000003', contrasena: CLAVE, tipo: 'administrador' });
    assert.equal(sesion.perfil, 'plataforma');
    assert.equal(sesion.debeCambiarContrasena, true);
  });

  test('asignar-documento da DNI y nombre a una cuenta anterior que solo tenía correo', async () => {
    const uow = new UnidadDeTrabajoAccesoMemoria();
    const e = crearEntorno(uow);
    const hash = await e.dependencias.contrasenas.derivar(CLAVE);
    await comoSistema(uow).ejecutar(async (x) => {
      await x.jass.crear({ id: '50000000-0000-4000-8000-000000000001', nombre: 'JASS Vieja' });
      await x.usuarios.crear({ id: '50000000-0000-4000-8000-000000000002', documento: null, nombre: null, correo: 'viejo@jass.pe', hashContrasena: hash, estado: 'activo', intentosFallidos: 0, bloqueadoHasta: null, claveGenerada: false, debeCambiarContrasena: false });
      await x.membresias.crear({ id: '50000000-0000-4000-8000-000000000003', usuarioId: '50000000-0000-4000-8000-000000000002', jassId: '50000000-0000-4000-8000-000000000001', perfil: 'personal', rol: 'tesorero', asociadoId: null, estado: 'activa' });
    });
    await assert.rejects(e.casos.autenticar.ejecutar({ documento: '40000004', contrasena: CLAVE }), ErrorNoAutenticado);
    await asignarDocumento(e.casos, { correo: 'Viejo@Jass.pe', documento: '40000004', nombre: 'Tesorero Viejo' });
    assert.equal((await e.casos.autenticar.ejecutar({ documento: '40000004', contrasena: CLAVE })).rol, 'tesorero');
    await assert.rejects(asignarDocumento(e.casos, { correo: 'nadie@jass.pe', documento: '40000005', nombre: 'Nadie' }), (err: unknown) => (err as { codigo?: string }).codigo === 'cuenta-inexistente');
    await assert.rejects(asignarDocumento(e.casos, {}), /Uso/);
  });

  test('sembrar-demo se niega sin SIJASS_PERMITIR_DEMO=1 y sin SIJASS_CLAVE_DEMO', async () => {
    const e = crearEntorno(new UnidadDeTrabajoAccesoMemoria());
    const ahora = e.reloj.ahora();
    await assert.rejects(sembrarDemo(e.casos, { SIJASS_CLAVE_DEMO: CLAVE }, ahora), /SIJASS_PERMITIR_DEMO/);
    await assert.rejects(sembrarDemo(e.casos, { SIJASS_PERMITIR_DEMO: '0', SIJASS_CLAVE_DEMO: CLAVE }, ahora), /SIJASS_PERMITIR_DEMO/);
    await assert.rejects(sembrarDemo(e.casos, { SIJASS_PERMITIR_DEMO: '1' }, ahora), /SIJASS_CLAVE_DEMO/);
  });

  test('sembrar-demo crea plataforma, personal, un operador con cambio pendiente y tres asociados con saldos: al día, parcial y moroso', async () => {
    const e = crearEntorno(new UnidadDeTrabajoAccesoMemoria());
    await sembrarDemo(e.casos, { SIJASS_PERMITIR_DEMO: '1', SIJASS_CLAVE_DEMO: CLAVE }, e.reloj.ahora());
    const saldo = async (documento: string) => {
      const s = await e.casos.autenticar.ejecutar({ documento, contrasena: CLAVE, tipo: 'asociado' });
      return (await e.casos.portal.ejecutar(await actorDeJass(e, s.tokenAcceso))).saldoCentimos;
    };
    assert.equal(await saldo(CUENTAS_DEMO.asociados[0].documento), 0);
    assert.equal(await saldo(CUENTAS_DEMO.asociados[1].documento), 4500 - 1500 - 750);
    assert.equal(await saldo(CUENTAS_DEMO.asociados[2].documento), 4500);
    for (const c of [CUENTAS_DEMO.plataforma, CUENTAS_DEMO.consejo, CUENTAS_DEMO.tesorero, CUENTAS_DEMO.operador]) {
      const s = await e.casos.autenticar.ejecutar({ documento: c.documento, contrasena: CLAVE, tipo: 'administrador' });
      assert.equal(s.debeCambiarContrasena, false, c.nombre);
    }
    const nuevo = await e.casos.autenticar.ejecutar({ documento: CUENTAS_DEMO.operadorNuevo.documento, contrasena: CLAVE, tipo: 'administrador' });
    assert.equal(nuevo.debeCambiarContrasena, true);
  });

  test('periodoAnterior cruza el cambio de año', () => {
    assert.equal(periodoAnterior('2026-11', 0), '2026-11');
    assert.equal(periodoAnterior('2026-11', 2), '2026-09');
    assert.equal(periodoAnterior('2026-01', 1), '2025-12');
    assert.equal(periodoAnterior('2026-02', 14), '2024-12');
  });
});
