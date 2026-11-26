/**
 * Casos de uso de acceso (tarea 2.3, spec `acceso-por-perfiles` y `auditoria-eventos` en lo
 * que no depende de HTTP). Se ejecutan sobre la memoria (`npm test`) y sobre PostgreSQL
 * (`npm run test:integration`) con la misma batería.
 */
import { before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { ErrorAccesoDenegado, ErrorCuentaBloqueada, ErrorNoAutenticado } from '../../dominio/errores.js';
import type { DecoradorRepositoriosAcceso, UnidadDeTrabajoAcceso } from '../../dominio/puertos-acceso.js';
import { CLAVE, crearEntorno, sembrarEscenario, type Entorno, type Escenario, comoSistema, type UnidadDeTrabajoSistema } from '../entorno-acceso.js';

/** Crea una unidad de trabajo sobre la **misma** base cada vez; el decorador es la costura de fallos. */
export type FabricaUnidadDeTrabajoAcceso = (decorar?: DecoradorRepositoriosAcceso) => UnidadDeTrabajoAcceso;

export function suiteAcceso(fabrica: FabricaUnidadDeTrabajoAcceso): void {
describe('acceso — inicio de sesión', () => {
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

  const eventos = (jassId: string) => uow.ejecutar((r) => r.auditoria.listarPorJass(jassId));

  test('inicio correcto: tokens, perfil y rol; la contraseña no se almacena en claro', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: esc.tesoreroA.documento, contrasena: CLAVE });
    assert.equal(s.perfil, 'personal');
    assert.equal(s.rol, 'tesorero');
    assert.equal(s.venceEnSegundos, 900);
    const usuario = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.tesoreroA.usuarioId));
    assert.ok(usuario?.hashContrasena.startsWith('scrypt$'));
    assert.ok(!usuario?.hashContrasena.includes(CLAVE));
  });

  test('el DNI admite espacios en los extremos', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: `  ${esc.tesoreroA.documento} `, contrasena: CLAVE });
    assert.equal(s.perfil, 'personal');
  });

  test('credenciales inválidas: mismo error para correo desconocido y contraseña errónea', async () => {
    // Cada promesa se crea y se espera en el mismo paso: una rechazada sin atender falla la prueba.
    for (const comando of [{ documento: esc.operadorA.documento, contrasena: 'otra-clave-123' }, { documento: '99999999', contrasena: CLAVE }]) {
      await assert.rejects(e.casos.autenticar.ejecutar(comando), (err: unknown) => {
        assert.ok(err instanceof ErrorNoAutenticado);
        assert.equal(err.codigo, 'credenciales-invalidas');
        assert.equal(err.message, 'credenciales-invalidas');
        return true;
      });
    }
  });

  test('entradas de tipo inválido → credenciales inválidas, sin lanzar otro error', async () => {
    for (const comando of [{ documento: 42, contrasena: CLAVE }, { documento: esc.operadorA.documento, contrasena: null }, { documento: '', contrasena: '' }, { documento: undefined, contrasena: undefined }]) {
      await assert.rejects(e.casos.autenticar.ejecutar(comando), ErrorNoAutenticado);
    }
  });

  test('bloqueo tras 5 fallos; el sexto intento falla aunque la contraseña sea correcta, hasta los 15 minutos', async () => {
    const documento = esc.asociadoA2.cuenta.documento;
    for (let i = 0; i < 5; i++) {
      await assert.rejects(e.casos.autenticar.ejecutar({ documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
    }
    await assert.rejects(e.casos.autenticar.ejecutar({ documento, contrasena: CLAVE }), (err: unknown) => {
      assert.ok(err instanceof ErrorCuentaBloqueada);
      return true;
    });
    e.reloj.avanzar(14 * 60_000);
    await assert.rejects(e.casos.autenticar.ejecutar({ documento, contrasena: CLAVE }), ErrorCuentaBloqueada);
    e.reloj.avanzar(61_000);
    const s = await e.casos.autenticar.ejecutar({ documento, contrasena: CLAVE });
    assert.equal(s.perfil, 'asociado');
    // El inicio correcto reinicia el contador.
    const usuario = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.asociadoA2.cuenta.usuarioId));
    assert.equal(usuario?.intentosFallidos, 0);
    assert.equal(usuario?.bloqueadoHasta, null);
  });

  test('con 4 fallos, un inicio correcto reinicia el contador a 0', async () => {
    const documento = esc.consejoA.documento;
    for (let i = 0; i < 4; i++) await assert.rejects(e.casos.autenticar.ejecutar({ documento, contrasena: 'incorrecta-123' }), ErrorNoAutenticado);
    assert.equal((await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.consejoA.usuarioId)))?.intentosFallidos, 4);
    await e.casos.autenticar.ejecutar({ documento, contrasena: CLAVE });
    assert.equal((await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.consejoA.usuarioId)))?.intentosFallidos, 0);
  });

  test('la auditoría registra fallos y bloqueos sin contraseñas ni tokens', async () => {
    const delaJass = await eventos(esc.jassA);
    const sinJass = await uow.ejecutar((r) => r.auditoria.listarSinJass());
    const todos = JSON.stringify([...delaJass, ...sinJass]);
    assert.ok(delaJass.some((x) => x.accion === 'sesion.fallida'));
    assert.ok(delaJass.some((x) => x.accion === 'sesion.bloqueada'));
    assert.ok(sinJass.some((x) => x.accion === 'sesion.fallida'), 'cuenta desconocida sin JASS');
    assert.ok(!todos.includes('incorrecta-123'));
    assert.ok(!todos.includes(CLAVE));
    assert.ok(!todos.includes('99999999'), 'el correo de una cuenta inexistente tampoco se almacena');
  });
});

describe('acceso — renovación y cierre de sesión', () => {
  let e: Entorno;
  let base: UnidadDeTrabajoAcceso;
  let uow: UnidadDeTrabajoSistema;
  let esc: Escenario;
  before(async () => {
    base = fabrica();
    uow = comoSistema(base);
    e = crearEntorno(base);
    esc = await sembrarEscenario(e);
  });

  test('renovación rotativa: el refresco anterior deja de servir y su reutilización revoca la familia', async () => {
    const s1 = await e.casos.autenticar.ejecutar({ documento: esc.tesoreroA.documento, contrasena: CLAVE });
    const s2 = await e.casos.renovar.ejecutar({ tokenRefresco: s1.tokenRefresco });
    assert.notEqual(s2.tokenRefresco, s1.tokenRefresco);
    assert.ok((await e.casos.autorizar.ejecutar(s2.tokenAcceso)).jassId === esc.jassA);
    await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s1.tokenRefresco }), ErrorNoAutenticado);
    // Se asumió robo: el refresco nuevo de la misma familia también queda inservible.
    await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s2.tokenRefresco }), ErrorNoAutenticado);
    assert.ok((await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA))).some((x) => x.accion === 'sesion.reutilizada'));
  });

  test('el refresco vence a los 7 días', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
    e.reloj.avanzar(7 * 24 * 3600_000 + 1000);
    await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
  });

  test('cerrar sesión invalida el refresco; cerrar con un token desconocido no falla', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: esc.consejoA.documento, contrasena: CLAVE });
    await e.casos.cerrarSesion.ejecutar({ tokenRefresco: s.tokenRefresco });
    await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
    await e.casos.cerrarSesion.ejecutar({ tokenRefresco: 'desconocido' });
    await e.casos.cerrarSesion.ejecutar({ tokenRefresco: 42 });
  });

  test('refresco inválido o de otro tipo → sesión inválida', async () => {
    for (const t of [undefined, null, 0, '', 'x'.repeat(300), 'no-existe']) {
      await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: t }), ErrorNoAutenticado);
    }
  });

  test('la renovación falla si la membresía fue desactivada', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: esc.asociadoA1.cuenta.documento, contrasena: CLAVE });
    await uow.ejecutar((r) => r.membresias.desactivarDeUsuario(esc.asociadoA1.cuenta.usuarioId));
    await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
  });
});

describe('acceso — autorización de cada solicitud', () => {
  let e: Entorno;
  let base: UnidadDeTrabajoAcceso;
  let uow: UnidadDeTrabajoSistema;
  let esc: Escenario;
  before(async () => {
    base = fabrica();
    uow = comoSistema(base);
    e = crearEntorno(base);
    esc = await sembrarEscenario(e);
  });

  test('sin token o con un token inválido → no autenticado', async () => {
    for (const t of [undefined, '', 'abc', 'a.b.c']) await assert.rejects(e.casos.autorizar.ejecutar(t), ErrorNoAutenticado);
  });

  test('un token vencido → no autenticado', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: esc.tesoreroA.documento, contrasena: CLAVE });
    e.reloj.avanzar(15 * 60_000);
    await assert.rejects(e.casos.autorizar.ejecutar(s.tokenAcceso), ErrorNoAutenticado);
  });

  test('con la membresía desactivada, el token aún vigente deja de autorizar (403)', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
    assert.ok(await e.casos.autorizar.ejecutar(s.tokenAcceso));
    await uow.ejecutar((r) => r.membresias.desactivarDeUsuario(esc.operadorA.usuarioId));
    await assert.rejects(e.casos.autorizar.ejecutar(s.tokenAcceso), ErrorAccesoDenegado);
  });

  test('la JASS, el perfil y el rol salen de la membresía de la base', async () => {
    const s = await e.casos.autenticar.ejecutar({ documento: esc.asociadoB1.cuenta.documento, contrasena: CLAVE });
    const actor = await e.casos.autorizar.ejecutar(s.tokenAcceso);
    assert.equal(actor.jassId, esc.jassB);
    assert.equal(actor.perfil, 'asociado');
    assert.equal(actor.rol, null);
    assert.equal(actor.asociadoId, esc.asociadoB1.id);
  });

  test('un documento que ya tiene acceso no admite otra cuenta, ni siquiera en otra JASS', async () => {
    await assert.rejects(
      e.casos.crearPersonal.ejecutar({ jassId: esc.jassB, nombre: 'Repetido', documento: esc.tesoreroA.documento, contrasena: CLAVE, rol: 'operador' }),
      (err: unknown) => (err as { codigo?: string }).codigo === 'documento-con-acceso',
    );
  });

  test('el acceso denegado se audita con el actor y la ruta, sin datos del recurso', async () => {
    await e.casos.registrarDenegado.ejecutar(esc.asociadoA1.cuenta.actor, { metodo: 'GET', ruta: '/v1/asociados/:id/estado-de-cuenta', motivo: 'sin-permiso:padron.leer' });
    const ev = (await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA))).filter((x) => x.accion === 'acceso.denegado');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].actorId, esc.asociadoA1.cuenta.usuarioId);
    assert.equal(ev[0].jassId, esc.jassA);
    assert.deepEqual(Object.keys(ev[0].detalle).sort(), ['metodo', 'motivo', 'ruta']);
  });
});
}
