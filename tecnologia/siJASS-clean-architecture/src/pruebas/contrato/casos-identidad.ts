/**
 * Casos de uso de identidad de `s2a-acceso-dni-multi-jass` (specs `acceso-por-documento`,
 * `gestion-de-accesos` y `plataforma-jass`). Se ejecutan sobre la memoria (`npm test`) y sobre
 * PostgreSQL (`npm run test:integration`) con la misma batería.
 */
import { before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import type { ContextoPlataforma } from '../../dominio/acceso.js';
import {
  ErrorAccesoDenegado,
  ErrorConflicto,
  ErrorCuentaBloqueada,
  ErrorDatoInvalido,
  ErrorJassSuspendida,
  ErrorLimiteDeOrigen,
  ErrorNoAutenticado,
  ErrorTipoDeAccesoDistinto,
} from '../../dominio/errores.js';
import type { UnidadDeTrabajoAcceso } from '../../dominio/puertos-acceso.js';
import { LimitadorDeIntentosMemoria } from '../../infraestructura/limitador-memoria.js';
import { actorDe, CLAVE, crearEntorno, nuevoDni, sembrarEscenario, type Entorno, type Escenario, comoSistema, type UnidadDeTrabajoSistema } from '../entorno-acceso.js';
import type { FabricaUnidadDeTrabajoAcceso } from './casos-acceso.js';

const sufijo = () => Math.random().toString(36).slice(2, 10);
const codigo = (c: string) => (err: unknown) => (err as { codigo?: string }).codigo === c;

async function plataforma(e: Entorno): Promise<ContextoPlataforma> {
  const documento = nuevoDni();
  await e.casos.crearPlataforma.ejecutar({ nombre: 'Plataforma', documento, contrasena: CLAVE, debeCambiarContrasena: false });
  const s = await e.casos.autenticar.ejecutar({ documento, contrasena: CLAVE, tipo: 'administrador' });
  const actor = await e.casos.autorizar.ejecutar(s.tokenAcceso);
  if (actor.perfil !== 'plataforma') throw new Error('se esperaba el perfil de plataforma');
  return actor;
}

export function suiteIdentidad(fabrica: FabricaUnidadDeTrabajoAcceso): void {
  describe('identidad — repositorios por documento y JASS', () => {
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

    test('el documento identifica la cuenta y es único en todo el sistema, también entre JASS', async () => {
      const u = await uow.ejecutar((r) => r.usuarios.buscarPorDocumento(esc.tesoreroA.documento));
      assert.equal(u?.id, esc.tesoreroA.usuarioId);
      assert.equal(await uow.ejecutar((r) => r.usuarios.buscarPorDocumento('00000000')), undefined);
      await assert.rejects(
        e.casos.crearPersonal.ejecutar({ jassId: esc.jassB, nombre: 'Otro', documento: esc.tesoreroA.documento, contrasena: CLAVE, rol: 'operador' }),
        codigo('documento-con-acceso'),
      );
    });

    test('varias cuentas sin correo conviven: el correo es opcional', async () => {
      const nuevos = [nuevoDni(), nuevoDni()];
      for (const documento of nuevos) await e.casos.crearPersonal.ejecutar({ jassId: esc.jassA, nombre: 'Sin correo', documento, contrasena: CLAVE, rol: 'operador' });
      for (const documento of nuevos) assert.equal((await uow.ejecutar((r) => r.usuarios.buscarPorDocumento(documento)))?.correo, null);
    });

    test('una JASS no se repite con el mismo nombre y la misma ubicación, sin distinguir mayúsculas', async () => {
      const nombre = `Rio Claro ${sufijo()}`;
      await uow.ejecutar((r) => r.jass.crear({ id: crypto.randomUUID(), nombre, distrito: 'Huamanga', centroPoblado: 'Pacaycasa' }));
      await assert.rejects(uow.ejecutar((r) => r.jass.crear({ id: crypto.randomUUID(), nombre: nombre.toUpperCase(), distrito: 'HUAMANGA', centroPoblado: 'pacaycasa' })), codigo('jass-duplicada'));
      // Otro centro poblado: es otra JASS.
      await uow.ejecutar((r) => r.jass.crear({ id: crypto.randomUUID(), nombre, distrito: 'Huamanga', centroPoblado: 'Quinua' }));
    });

    test('el estado y la ubicación de la JASS se guardan y la suspensión no borra nada', async () => {
      const id = crypto.randomUUID();
      await uow.ejecutar((r) => r.jass.crear({ id, nombre: `Estado ${sufijo()}`, departamento: 'Ayacucho', provincia: 'Huamanga' }));
      const j = await uow.ejecutar((r) => r.jass.buscar(id));
      assert.equal(j?.estado, 'activa');
      assert.equal(j?.departamento, 'Ayacucho');
      assert.equal(j?.distrito, null);
      assert.equal(await uow.ejecutar((r) => r.jass.cambiarEstado(id, 'suspendida')), true);
      assert.equal((await uow.ejecutar((r) => r.jass.buscar(id)))?.estado, 'suspendida');
      assert.equal(await uow.ejecutar((r) => r.jass.cambiarEstado(crypto.randomUUID(), 'suspendida')), false);
    });

    test('el listado de JASS cuenta solo cuentas activas y no trae datos de negocio', async () => {
      const lista = await uow.ejecutar((r) => r.jass.listar());
      const a = lista.find((j) => j.id === esc.jassA);
      assert.ok(a);
      assert.ok(a.cuentasActivas >= 4, 'consejo, tesorero, operador y dos asociados');
      assert.deepEqual(Object.keys(a).sort(), ['centroPoblado', 'cuentasActivas', 'departamento', 'distrito', 'estado', 'id', 'nombre', 'provincia']);
    });

    test('la membresía de plataforma no tiene JASS y una cuenta solo admite una membresía activa', async () => {
      const p = await plataforma(e);
      const m = await uow.ejecutar((r) => r.membresias.activaDeUsuario(p.usuarioId));
      assert.equal(m?.perfil, 'plataforma');
      assert.equal(m?.jassId, null);
      await assert.rejects(
        uow.ejecutar((r) => r.membresias.crear({ id: crypto.randomUUID(), usuarioId: p.usuarioId, jassId: esc.jassA, perfil: 'personal', rol: 'operador', asociadoId: null, estado: 'activa' })),
        codigo('membresia-activa-existente'),
      );
    });

    test('listarPersonal ordena por rol y nombre; listarDeAsociados trae solo los de la JASS', async () => {
      const personal = await uow.ejecutar((r) => r.membresias.listarPersonal(esc.jassA));
      assert.equal(personal[0].rol, 'consejo');
      assert.ok(personal.every((x) => x.documento.length === 8));
      assert.deepEqual(personal.map((x) => x.rol), [...personal.map((x) => x.rol)].sort((x, y) => ['consejo', 'tesorero', 'operador'].indexOf(x) - ['consejo', 'tesorero', 'operador'].indexOf(y)));
      const asociados = await uow.ejecutar((r) => r.membresias.listarDeAsociados(esc.jassA));
      assert.ok(asociados.every((m) => m.jassId === esc.jassA && m.perfil === 'asociado'));
      assert.ok(!asociados.some((m) => m.asociadoId === esc.asociadoB1.id));
    });

    test('revocarDeUsuario cierra todas las sesiones de la cuenta y deja intactas las de otras', async () => {
      const s1 = await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
      const s2 = await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
      const ajena = await e.casos.autenticar.ejecutar({ documento: esc.operadorB.documento, contrasena: CLAVE });
      await uow.ejecutar((r) => r.sesiones.revocarDeUsuario(esc.operadorA.usuarioId, e.reloj.ahora().toISOString()));
      for (const s of [s1, s2]) await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
      assert.equal((await e.casos.renovar.ejecutar({ tokenRefresco: ajena.tokenRefresco })).rol, 'operador');
    });
  });

  describe('identidad — claves y verificación', () => {
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

    test('una clave generada se acepta con variantes de escritura y una elegida solo exacta', async () => {
      const dni = nuevoDni();
      const x = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Claves Uno', documento: dni });
      const { claveTemporal } = await e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, x.id);
      const [p1, p2, p3] = claveTemporal.split('-');
      for (const escrita of [claveTemporal.toUpperCase(), `${p1} ${p2} ${p3}`, `  ${p1}--${p2}  ${p3} `, `${p1[0].toUpperCase()}${p1.slice(1)}-${p2}-${p3}`]) {
        assert.equal((await e.casos.autenticar.ejecutar({ documento: dni, contrasena: escrita })).perfil, 'asociado', escrita);
      }
      const s = await e.casos.autenticar.ejecutar({ documento: dni, contrasena: claveTemporal });
      const actor = await e.casos.autorizar.ejecutar(s.tokenAcceso);
      const propia = 'Mi-clave-propia-77';
      await e.casos.cambiarContrasena.ejecutar(actor, { contrasenaActual: claveTemporal, contrasenaNueva: propia });
      assert.equal((await e.casos.autenticar.ejecutar({ documento: dni, contrasena: propia })).perfil, 'asociado');
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: dni, contrasena: propia.toUpperCase() }), ErrorNoAutenticado);
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: dni, contrasena: claveTemporal }), ErrorNoAutenticado);
    });

    test('dos accesos consecutivos reciben claves independientes y con derivación y sal propias', async () => {
      const dnis = [nuevoDni(), nuevoDni()];
      const claves: string[] = [];
      for (const dni of dnis) {
        const x = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Independiente', documento: dni });
        claves.push((await e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, x.id)).claveTemporal);
      }
      assert.notEqual(claves[0], claves[1]);
      const hashes = await Promise.all(dnis.map(async (d) => (await uow.ejecutar((r) => r.usuarios.buscarPorDocumento(d)))?.hashContrasena));
      assert.notEqual(hashes[0], hashes[1]);
    });
  });

  describe('identidad — tipo de acceso, límite por origen y JASS suspendida', () => {
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

    test('administrador entra como administrador y como sin tipo; el asociado entra como asociado', async () => {
      assert.equal((await e.casos.autenticar.ejecutar({ documento: esc.consejoA.documento, contrasena: CLAVE, tipo: 'administrador' })).rol, 'consejo');
      assert.equal((await e.casos.autenticar.ejecutar({ documento: esc.consejoA.documento, contrasena: CLAVE })).rol, 'consejo');
      assert.equal((await e.casos.autenticar.ejecutar({ documento: esc.asociadoA1.cuenta.documento, contrasena: CLAVE, tipo: 'asociado' })).perfil, 'asociado');
    });

    test('un tipo equivocado con credenciales correctas → 409 con el tipo real, sin sesión y sin contar como fallo', async () => {
      const antes = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.asociadoA1.cuenta.usuarioId));
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.asociadoA1.cuenta.documento, contrasena: CLAVE, tipo: 'administrador' }), (err: unknown) => {
        assert.ok(err instanceof ErrorTipoDeAccesoDistinto);
        assert.equal(err.tipoReal, 'asociado');
        return true;
      });
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.tesoreroA.documento, contrasena: CLAVE, tipo: 'asociado' }), (err: unknown) => err instanceof ErrorTipoDeAccesoDistinto && err.tipoReal === 'administrador');
      const despues = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.asociadoA1.cuenta.usuarioId));
      assert.equal(despues?.intentosFallidos, antes?.intentosFallidos);
      const eventos = await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA));
      assert.ok(eventos.some((x) => x.accion === 'sesion.tipo-distinto' && x.actorId === esc.asociadoA1.cuenta.usuarioId));
    });

    test('un tipo con la clave equivocada es 401 genérico: no revela el tipo real', async () => {
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.asociadoA2.cuenta.documento, contrasena: 'incorrecta-123', tipo: 'administrador' }), (err: unknown) => err instanceof ErrorNoAutenticado && !('tipoReal' in err));
    });

    test('un tipo desconocido → 422', async () => {
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.consejoA.documento, contrasena: CLAVE, tipo: 'superusuario' }), codigo('tipo-de-acceso-invalido'));
    });

    test('un documento mal formado no consulta ninguna cuenta ni deja auditoría', async () => {
      const antes = (await uow.ejecutar((r) => r.auditoria.listarSinJass())).length;
      for (const documento of ['1234567', '123456789', 'ABCDEFGH', '1234 5678', '', 12345678]) {
        await assert.rejects(e.casos.autenticar.ejecutar({ documento, contrasena: CLAVE }), codigo('credenciales-invalidas'));
      }
      assert.equal((await uow.ejecutar((r) => r.auditoria.listarSinJass())).length, antes);
    });

    test('el límite por origen responde antes de consultar la cuenta y no afecta a otros orígenes', async () => {
      const limitado = crearEntorno(base, { limitador: new LimitadorDeIntentosMemoria(3, 15 * 60 * 1000) });
      // Los inicios correctos no cuentan: una red compartida no debe bloquear a quienes entran bien.
      for (let i = 0; i < 5; i++) await limitado.casos.autenticar.ejecutar({ documento: esc.consejoA.documento, contrasena: CLAVE, origen: '203.0.113.9' });
      for (let i = 0; i < 3; i++) await assert.rejects(limitado.casos.autenticar.ejecutar({ documento: nuevoDni(), contrasena: 'incorrecta-123', origen: '203.0.113.9' }), ErrorNoAutenticado);
      const antes = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.operadorA.usuarioId));
      await assert.rejects(limitado.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE, origen: '203.0.113.9' }), ErrorLimiteDeOrigen);
      const despues = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.operadorA.usuarioId));
      assert.equal(despues?.intentosFallidos, antes?.intentosFallidos, 'el intento limitado no consulta ni cuenta contra la cuenta');
      assert.equal((await limitado.casos.autenticar.ejecutar({ documento: esc.consejoA.documento, contrasena: CLAVE, origen: '198.51.100.7' })).rol, 'consejo');
      // La ventana se desliza: tras 15 minutos el origen vuelve a poder intentar.
      limitado.reloj.avanzar(16 * 60 * 1000);
      assert.equal((await limitado.casos.autenticar.ejecutar({ documento: esc.consejoA.documento, contrasena: CLAVE, origen: '203.0.113.9' })).rol, 'consejo');
    });

    test('una JASS suspendida impide iniciar y renovar sesión sin consumir el refresco; al reactivar todo vuelve', async () => {
      const p = await plataforma(e);
      const nombre = `Suspendible ${sufijo()}`;
      const alta = await e.casos.crearJassPlataforma.ejecutar(p, { nombre, consejo: { nombre: 'Consejo S', documento: nuevoDni() } });
      const dniConsejo = (await uow.ejecutar((r) => r.usuarios.buscarPorId(alta.usuarioId)))?.documento as string;
      const s = await e.casos.autenticar.ejecutar({ documento: dniConsejo, contrasena: alta.claveTemporal });
      await e.casos.suspenderJass.ejecutar(p, alta.jassId);
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: dniConsejo, contrasena: alta.claveTemporal }), ErrorJassSuspendida);
      await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorJassSuspendida);
      await assert.rejects(e.casos.autorizar.ejecutar(s.tokenAcceso), ErrorJassSuspendida);
      const usuario = await uow.ejecutar((r) => r.usuarios.buscarPorId(alta.usuarioId));
      assert.equal(usuario?.intentosFallidos, 0, 'la suspensión no cuenta como fallo');
      await e.casos.reactivarJass.ejecutar(p, alta.jassId);
      assert.equal((await e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco })).rol, 'consejo', 'el refresco no se consumió');
      const eventos = await uow.ejecutar((r) => r.auditoria.listarPorJass(alta.jassId));
      assert.ok(eventos.some((x) => x.accion === 'jass.suspendida'));
      assert.ok(eventos.some((x) => x.accion === 'jass.reactivada'));
    });
  });

  describe('identidad — cambio de clave y datos de la sesión', () => {
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

    test('el cambio correcto entrega una sesión nueva, cierra las anteriores y quita la marca de cambio pendiente', async () => {
      const dni = nuevoDni();
      const { claveTemporal } = await e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: 'Nuevo Tesorero', documento: dni, rol: 'tesorero' });
      const inicial = await e.casos.autenticar.ejecutar({ documento: dni, contrasena: claveTemporal, tipo: 'administrador' });
      assert.equal(inicial.debeCambiarContrasena, true);
      const actor = await e.casos.autorizar.ejecutar(inicial.tokenAcceso);
      assert.equal(actor.debeCambiarContrasena, true);
      const nueva = await e.casos.cambiarContrasena.ejecutar(actor, { contrasenaActual: claveTemporal, contrasenaNueva: 'Tesoreria-nueva-99' });
      assert.equal(nueva.debeCambiarContrasena, false);
      assert.equal(nueva.rol, 'tesorero');
      await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: inicial.tokenRefresco }), ErrorNoAutenticado);
      assert.equal((await e.casos.renovar.ejecutar({ tokenRefresco: nueva.tokenRefresco })).rol, 'tesorero');
      assert.equal((await e.casos.autenticar.ejecutar({ documento: dni, contrasena: 'Tesoreria-nueva-99' })).debeCambiarContrasena, false);
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: dni, contrasena: claveTemporal }), ErrorNoAutenticado);
    });

    test('una clave actual errónea es 401, cuenta como intento fallido y no cambia nada', async () => {
      const antes = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.operadorA.usuarioId));
      await assert.rejects(e.casos.cambiarContrasena.ejecutar(esc.operadorA.actor, { contrasenaActual: 'no-es-la-clave', contrasenaNueva: 'Otra-clave-larga-1' }), ErrorNoAutenticado);
      const despues = await uow.ejecutar((r) => r.usuarios.buscarPorId(esc.operadorA.usuarioId));
      assert.equal(despues?.intentosFallidos, (antes?.intentosFallidos ?? 0) + 1);
      assert.equal(despues?.hashContrasena, antes?.hashContrasena);
      await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
    });

    test('la clave nueva debe tener 10 a 128 caracteres y ser distinta del DNI', async () => {
      for (const nueva of ['corta', 'x'.repeat(129), esc.operadorA.documento + 'zz'.slice(0, 0), '']) {
        if (nueva === esc.operadorA.documento) continue; // el DNI tiene 8 dígitos: ya es demasiado corto
        await assert.rejects(e.casos.cambiarContrasena.ejecutar(esc.operadorA.actor, { contrasenaActual: CLAVE, contrasenaNueva: nueva }), codigo('contrasena-invalida'));
      }
      await assert.rejects(e.casos.cambiarContrasena.ejecutar(esc.operadorA.actor, { contrasenaActual: CLAVE, contrasenaNueva: esc.operadorA.documento }), codigo('contrasena-invalida'));
      await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
    });

    test('yo trae nombre, DNI enmascarado y JASS; el asociado toma su nombre del padrón; la plataforma no tiene JASS', async () => {
      const consejo = await e.casos.yo.ejecutar(esc.consejoA.actor);
      assert.equal(consejo.nombre, 'Consejo A');
      assert.equal(consejo.documento, `•••••${esc.consejoA.documento.slice(-3)}`);
      assert.equal(consejo.jass?.nombre.startsWith('JASS A'), true);
      assert.equal(consejo.debeCambiarContrasena, false);
      const asociado = await e.casos.yo.ejecutar(esc.asociadoA1.cuenta.actor);
      assert.equal(asociado.nombre, 'Rosa Quispe');
      assert.equal(asociado.rol, null);
      const p = await e.casos.yo.ejecutar(await plataforma(e));
      assert.equal(p.perfil, 'plataforma');
      assert.equal(p.jass, null);
      assert.ok(!JSON.stringify(consejo).includes(esc.consejoA.documento), 'el DNI completo no sale');
    });

    test('la auditoría de claves no contiene claves, tokens ni el DNI completo', async () => {
      const dni = nuevoDni();
      const { claveTemporal, usuarioId } = await e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: 'Auditado', documento: dni, rol: 'operador' });
      const restablecida = await e.casos.restablecerClaveEquipo.ejecutar(esc.consejoA.actor, usuarioId);
      const s = await e.casos.autenticar.ejecutar({ documento: dni, contrasena: restablecida.claveTemporal });
      await e.casos.cambiarContrasena.ejecutar(await e.casos.autorizar.ejecutar(s.tokenAcceso), { contrasenaActual: restablecida.claveTemporal, contrasenaNueva: 'Auditada-clave-55' });
      const texto = JSON.stringify([...(await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA))), ...(await uow.ejecutar((r) => r.auditoria.listarSinJass()))]);
      for (const secreto of [claveTemporal, restablecida.claveTemporal, 'Auditada-clave-55', s.tokenAcceso, s.tokenRefresco, dni]) assert.ok(!texto.includes(secreto), 'un secreto llegó a la auditoría');
      const acciones = (await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA))).map((x) => x.accion);
      for (const accion of ['acceso.creado', 'clave.restablecida', 'clave.cambiada']) assert.ok(acciones.includes(accion), accion);
    });
  });

  describe('gestión de accesos — equipo y restablecimiento', () => {
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

    test('solo el Consejo gestiona el equipo; los demás roles reciben denegado', async () => {
      for (const cuenta of [esc.tesoreroA, esc.operadorA, esc.asociadoA1.cuenta]) {
        await assert.rejects(e.casos.listarEquipo.ejecutar(cuenta.actor), ErrorAccesoDenegado);
        await assert.rejects(e.casos.crearMiembroEquipo.ejecutar(cuenta.actor, { nombre: 'X', documento: nuevoDni(), rol: 'operador' }), ErrorAccesoDenegado);
      }
      const lista = await e.casos.listarEquipo.ejecutar(esc.consejoA.actor);
      assert.ok(lista.length >= 3);
      assert.ok(lista.every((f) => /^•+\d{3}$/.test(f.documento)), 'DNI enmascarado');
    });

    test('alta de Tesorería: clave temporal una sola vez, cambio pendiente, DNI enmascarado en el listado', async () => {
      const dni = nuevoDni();
      const r = await e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: '  Marta   Salas ', documento: dni, rol: 'tesorero' });
      assert.match(r.claveTemporal, /^[a-z]+-[a-z]+-[a-z]+$/);
      const u = await uow.ejecutar((x) => x.usuarios.buscarPorId(r.usuarioId));
      assert.equal(u?.nombre, 'Marta Salas');
      assert.equal(u?.debeCambiarContrasena, true);
      assert.equal(u?.claveGenerada, true);
      const fila = (await e.casos.listarEquipo.ejecutar(esc.consejoA.actor)).find((f) => f.usuarioId === r.usuarioId);
      assert.deepEqual({ nombre: fila?.nombre, rol: fila?.rol, estado: fila?.estado, documento: fila?.documento }, { nombre: 'Marta Salas', rol: 'tesorero', estado: 'activo', documento: `•••••${dni.slice(-3)}` });
    });

    test('roles no permitidos y documentos inválidos → 422; documento ya con acceso → 409; nada queda creado', async () => {
      const antes = (await e.casos.listarEquipo.ejecutar(esc.consejoA.actor)).length;
      for (const rol of ['consejo', 'plataforma', 'asociado', 'otro', undefined]) {
        await assert.rejects(e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: 'X', documento: nuevoDni(), rol }), codigo('rol-invalido'));
      }
      await assert.rejects(e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: 'X', documento: '123', rol: 'operador' }), codigo('documento-no-es-dni'));
      await assert.rejects(e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: '', documento: nuevoDni(), rol: 'operador' }), codigo('nombre-invalido'));
      await assert.rejects(e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: 'Repetido', documento: esc.tesoreroB.documento, rol: 'operador' }), (err: unknown) => err instanceof ErrorConflicto && err.codigo === 'documento-con-acceso' && !/JASS B/.test(err.message));
      assert.equal((await e.casos.listarEquipo.ejecutar(esc.consejoA.actor)).length, antes);
    });

    test('desactivar: la cuenta no entra, sus sesiones se invalidan; no a sí mismo, ni a un Consejo, ni a cuentas de otra JASS', async () => {
      const dni = nuevoDni();
      const { usuarioId, claveTemporal } = await e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: 'Saliente', documento: dni, rol: 'operador' });
      const s = await e.casos.autenticar.ejecutar({ documento: dni, contrasena: claveTemporal });
      await e.casos.desactivarMiembroEquipo.ejecutar(esc.consejoA.actor, usuarioId);
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: dni, contrasena: claveTemporal }), ErrorNoAutenticado);
      await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
      assert.equal((await e.casos.listarEquipo.ejecutar(esc.consejoA.actor)).find((f) => f.usuarioId === usuarioId)?.estado, 'inactivo');
      await assert.rejects(e.casos.desactivarMiembroEquipo.ejecutar(esc.consejoA.actor, esc.consejoA.usuarioId), codigo('no-puede-modificarse-a-si-mismo'));
      await assert.rejects(e.casos.desactivarMiembroEquipo.ejecutar(esc.consejoB.actor, esc.consejoA.usuarioId), ErrorAccesoDenegado);
      await assert.rejects(e.casos.desactivarMiembroEquipo.ejecutar(esc.consejoA.actor, esc.tesoreroB.usuarioId), ErrorAccesoDenegado);
      await assert.rejects(e.casos.desactivarMiembroEquipo.ejecutar(esc.consejoA.actor, 'no-es-uuid'), ErrorAccesoDenegado);
      const eventos = await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA));
      assert.ok(eventos.some((x) => x.accion === 'acceso.desactivado' && x.recursoId === usuarioId));
    });

    test('restablecer la clave del equipo: clave nueva, cambio pendiente y sesiones anteriores cerradas; no la de otra JASS', async () => {
      const s = await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE });
      const r = await e.casos.restablecerClaveEquipo.ejecutar(esc.consejoA.actor, esc.operadorA.usuarioId);
      await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: CLAVE }), ErrorNoAutenticado);
      assert.equal((await e.casos.autenticar.ejecutar({ documento: esc.operadorA.documento, contrasena: r.claveTemporal })).debeCambiarContrasena, true);
      await assert.rejects(e.casos.restablecerClaveEquipo.ejecutar(esc.consejoA.actor, esc.tesoreroB.usuarioId), ErrorAccesoDenegado);
      await assert.rejects(e.casos.restablecerClaveEquipo.ejecutar(esc.consejoA.actor, esc.consejoA.usuarioId), codigo('no-puede-modificarse-a-si-mismo'));
      await assert.rejects(e.casos.restablecerClaveEquipo.ejecutar(esc.tesoreroA.actor, esc.operadorA.usuarioId), ErrorAccesoDenegado);
    });

    test('restablecer la clave de un asociado levanta el bloqueo y cierra sus sesiones; Operador sin permiso; ajeno como inexistente', async () => {
      const cuenta = esc.asociadoA2.cuenta;
      const s = await e.casos.autenticar.ejecutar({ documento: cuenta.documento, contrasena: CLAVE });
      for (let i = 0; i < 5; i++) await assert.rejects(e.casos.autenticar.ejecutar({ documento: cuenta.documento, contrasena: 'incorrecta-123' }));
      await assert.rejects(e.casos.autenticar.ejecutar({ documento: cuenta.documento, contrasena: CLAVE }), ErrorCuentaBloqueada);
      await assert.rejects(e.casos.restablecerClaveAsociado.ejecutar(esc.operadorA.actor, esc.asociadoA2.id), ErrorAccesoDenegado);
      await assert.rejects(e.casos.restablecerClaveAsociado.ejecutar(esc.tesoreroB.actor, esc.asociadoA2.id), ErrorAccesoDenegado);
      const r = await e.casos.restablecerClaveAsociado.ejecutar(esc.tesoreroA.actor, esc.asociadoA2.id);
      await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
      const entrada = await e.casos.autenticar.ejecutar({ documento: cuenta.documento, contrasena: r.claveTemporal });
      assert.equal(entrada.debeCambiarContrasena, false, 'las familias no están obligadas a cambiarla');
      const sinAcceso = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Sin acceso', documento: nuevoDni() });
      await assert.rejects(e.casos.restablecerClaveAsociado.ejecutar(esc.tesoreroA.actor, sinAcceso.id), codigo('asociado-sin-acceso'));
    });

    test('el padrón y el estado de cuenta indican el acceso de cada asociado', async () => {
      const x = await e.casos.registrarAsociado.ejecutar(esc.tesoreroA.actor, { nombre: 'Estado Acceso', documento: nuevoDni() });
      const antes = (await e.casos.listarAsociados.ejecutar(esc.tesoreroA.actor)).find((a) => a.id === x.id);
      assert.equal(antes?.acceso, 'sin-acceso');
      assert.equal((await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, x.id)).acceso, 'sin-acceso');
      await e.casos.crearAcceso.ejecutar(esc.tesoreroA.actor, x.id);
      assert.equal((await e.casos.listarAsociados.ejecutar(esc.tesoreroA.actor)).find((a) => a.id === x.id)?.acceso, 'activo');
      assert.equal((await e.casos.estadoDeCuenta.ejecutar(esc.tesoreroA.actor, x.id)).acceso, 'activo');
      const portal = await e.casos.portal.ejecutar(esc.asociadoA1.cuenta.actor);
      assert.equal('acceso' in portal, false, 'el portal no trae el estado del acceso');
    });
  });

  describe('plataforma — altas, suspensión y claves del Consejo', () => {
    let base: UnidadDeTrabajoAcceso;
    let uow: UnidadDeTrabajoSistema;
    let e: Entorno;
    let esc: Escenario;
    let p: ContextoPlataforma;

    before(async () => {
      base = fabrica();
      uow = comoSistema(base);
      e = crearEntorno(base);
      esc = await sembrarEscenario(e);
      p = await plataforma(e);
    });

    test('alta de JASS con su primer Consejo: clave temporal una vez, cambio pendiente y ubicación guardada', async () => {
      const dni = nuevoDni();
      const nombre = `Nueva ${sufijo()}`;
      const r = await e.casos.crearJassPlataforma.ejecutar(p, { nombre, ubicacion: { departamento: 'Ayacucho', provincia: 'Huamanga', distrito: 'Quinua' }, consejo: { nombre: 'Rosa Consejo', documento: dni } });
      assert.match(r.claveTemporal, /^[a-z]+-[a-z]+-[a-z]+$/);
      const j = (await e.casos.listarJass.ejecutar(p)).find((x) => x.id === r.jassId);
      assert.deepEqual({ nombre: j?.nombre, estado: j?.estado, cuentas: j?.cuentasActivas, distrito: j?.ubicacion.distrito }, { nombre, estado: 'activa', cuentas: 1, distrito: 'Quinua' });
      const s = await e.casos.autenticar.ejecutar({ documento: dni, contrasena: r.claveTemporal, tipo: 'administrador' });
      assert.equal(s.rol, 'consejo');
      assert.equal(s.debeCambiarContrasena, true);
      const eventos = await uow.ejecutar((x) => x.auditoria.listarPorJass(r.jassId));
      const creada = eventos.find((x) => x.accion === 'jass.creada');
      assert.equal(creada?.actorId, p.usuarioId);
      assert.ok(!JSON.stringify(eventos).includes(r.claveTemporal));
    });

    test('un alta que falla a medias no deja nada: DNI repetido, nombre y ubicación repetidos, datos inválidos', async () => {
      const antes = (await e.casos.listarJass.ejecutar(p)).length;
      await assert.rejects(e.casos.crearJassPlataforma.ejecutar(p, { nombre: `Atomica ${sufijo()}`, consejo: { nombre: 'Dup', documento: esc.consejoA.documento } }), codigo('documento-con-acceso'));
      const nombre = `Repetida ${sufijo()}`;
      await e.casos.crearJassPlataforma.ejecutar(p, { nombre, ubicacion: { distrito: 'Tambo' }, consejo: { nombre: 'Uno', documento: nuevoDni() } });
      const despuesUna = (await e.casos.listarJass.ejecutar(p)).length;
      assert.equal(despuesUna, antes + 1);
      await assert.rejects(e.casos.crearJassPlataforma.ejecutar(p, { nombre: nombre.toUpperCase(), ubicacion: { distrito: 'tambo' }, consejo: { nombre: 'Dos', documento: nuevoDni() } }), codigo('jass-duplicada'));
      for (const consejo of [{ nombre: 'X', documento: '1' }, { nombre: '', documento: nuevoDni() }]) {
        await assert.rejects(e.casos.crearJassPlataforma.ejecutar(p, { nombre: `Invalida ${sufijo()}`, consejo }));
      }
      await assert.rejects(e.casos.crearJassPlataforma.ejecutar(p, { nombre: '', consejo: { nombre: 'X', documento: nuevoDni() } }), codigo('nombre-invalido'));
      await assert.rejects(e.casos.crearJassPlataforma.ejecutar(p, { nombre: `Ubi ${sufijo()}`, ubicacion: { distrito: 'x'.repeat(81) }, consejo: { nombre: 'X', documento: nuevoDni() } }), codigo('ubicacion-invalida'));
      assert.equal((await e.casos.listarJass.ejecutar(p)).length, despuesUna);
    });

    test('restablecer la clave del Consejo: clave temporal, cambio pendiente y sesiones cerradas; JASS sin Consejo activo → 409', async () => {
      const dni = nuevoDni();
      const alta = await e.casos.crearJassPlataforma.ejecutar(p, { nombre: `Consejo ${sufijo()}`, consejo: { nombre: 'Consejo Y', documento: dni } });
      const s = await e.casos.autenticar.ejecutar({ documento: dni, contrasena: alta.claveTemporal });
      const r = await e.casos.restablecerClaveConsejo.ejecutar(p, alta.jassId);
      assert.equal(r.usuarioId, alta.usuarioId);
      assert.equal(r.documento, `•••••${dni.slice(-3)}`);
      await assert.rejects(e.casos.renovar.ejecutar({ tokenRefresco: s.tokenRefresco }), ErrorNoAutenticado);
      assert.equal((await e.casos.autenticar.ejecutar({ documento: dni, contrasena: r.claveTemporal })).debeCambiarContrasena, true);
      await assert.rejects(e.casos.restablecerClaveConsejo.ejecutar(p, alta.jassId, '70000000-0000-4000-8000-000000000001'), codigo('sin-consejo-activo'));
      await assert.rejects(e.casos.restablecerClaveConsejo.ejecutar(p, '70000000-0000-4000-8000-000000000002'), codigo('jass-inexistente'));
    });

    test('suspender y reactivar una JASS inexistente o con un identificador inválido → 422', async () => {
      for (const id of ['no-uuid', '70000000-0000-4000-8000-000000000003']) {
        await assert.rejects(e.casos.suspenderJass.ejecutar(p, id), ErrorDatoInvalido);
        await assert.rejects(e.casos.reactivarJass.ejecutar(p, id), ErrorDatoInvalido);
      }
    });

    test('las cuentas de una JASS no son de plataforma: sus actores no se aceptan como actor de plataforma', async () => {
      // El permiso `jass.gestionar` solo existe para el perfil de plataforma (el tipo ContextoPlataforma lo impone al compilar).
      const { tienePermiso } = await import('../../dominio/acceso.js');
      for (const cuenta of [esc.consejoA, esc.tesoreroA, esc.operadorA, esc.asociadoA1.cuenta]) assert.equal(tienePermiso(cuenta.actor, 'jass.gestionar'), false);
      assert.equal(tienePermiso(p, 'jass.gestionar'), true);
      for (const permiso of ['padron.leer', 'padron.escribir', 'pagos.leer', 'pagos.registrar', 'reservorios.leer', 'reservorios.crear', 'mediciones.registrar', 'mediciones.leer', 'asistente.consultar', 'portal.consultar', 'equipo.gestionar', 'acceso-asociado.crear', 'acceso-asociado.restablecer'] as const) {
        assert.equal(tienePermiso(p, permiso), false, `la plataforma no debe tener ${permiso}`);
      }
    });

    test('un actor de la propia JASS puede iniciar sesión con su DNI aunque la plataforma lo haya creado', async () => {
      const cuenta = await actorDe(e, esc.tesoreroA.documento);
      assert.equal(cuenta.actor.rol, 'tesorero');
    });
  });
}
