/**
 * Casos de uso de incidencias (s1f, tareas 1.3, 1.4, 2.2, 2.3, 2.4 y 3.1): la misma batería sobre la
 * memoria y sobre PostgreSQL.
 */
import { before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { ErrorAccesoDenegado, ErrorConflicto, ErrorDatoInvalido, ErrorTipoNoAdmitido } from '../../dominio/errores.js';
import { MATRIZ_POR_DEFECTO } from '../../dominio/incidencia.js';
import type { UnidadDeTrabajoAcceso } from '../../dominio/puertos-acceso.js';
import type { VistaIncidenciaPersonal } from '../../aplicacion/incidencias.js';
import { crearEntorno, comoSistema, nuevaClave, sembrarEscenario, type Entorno, type Escenario, type UnidadDeTrabajoSistema } from '../entorno-acceso.js';
import { jpegConExif, MARCA_EXIF, pngConTexto } from '../fotos-prueba.js';
import type { FabricaUnidadDeTrabajoAcceso } from './casos-acceso.js';

const reporte = (extra: Record<string, unknown> = {}) => ({
  categoria: 'fuga',
  alcanceReportado: 'varias-viviendas',
  descripcion: 'Sale agua de la tubería junto a la escuela',
  observadaEn: '2026-11-19T07:30:00-05:00',
  ubicacion: 'Camino a la escuela',
  ...extra,
});

const denegado = (e: unknown) => e instanceof ErrorAccesoDenegado;
const ajeno = (e: unknown) => e instanceof ErrorAccesoDenegado && e.motivo === 'recurso-ajeno';
const sinPermiso = (e: unknown) => e instanceof ErrorAccesoDenegado && e.motivo.startsWith('sin-permiso:');
const conflicto = (codigo: string) => (e: unknown) => e instanceof ErrorConflicto && e.codigo === codigo;
const invalido = (codigo: string) => (e: unknown) => e instanceof ErrorDatoInvalido && e.codigo === codigo;

export function suiteIncidencias(fabrica: FabricaUnidadDeTrabajoAcceso): void {
  describe('incidencias', () => {
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

    const reportar = (extra?: Record<string, unknown>, clave = nuevaClave(), quien = esc.asociadoA1.cuenta.actor) => e.casos.registrarIncidencia.ejecutar(quien, reporte(extra), clave);
    const personal = (v: unknown) => v as VistaIncidenciaPersonal;

    describe('registro', () => {
      test('el asociado reporta: queda registrada con la sugerencia, sin prioridad confirmada, y auditada', async () => {
        const { incidencia, duplicado } = await reportar();
        assert.equal(duplicado, false);
        assert.equal(incidencia.estado, 'registrada');
        assert.equal(incidencia.revision, 1);
        assert.equal(incidencia.creadaEn, '2026-11-19T15:00:00.000Z');
        assert.equal(incidencia.observadaEn, '2026-11-19T12:30:00.000Z');
        // El asociado no ve la prioridad ni el responsable.
        assert.equal('sugerencia' in incidencia, false);
        assert.equal('prioridadConfirmada' in incidencia, false);
        const vista = personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id));
        assert.deepEqual(vista.sugerencia, { prioridad: 'alta', regla: 'categoria:fuga/alcance:varias-viviendas', version: 0 });
        assert.equal(vista.prioridadConfirmada, null);
        assert.deepEqual(vista.reportadoPor, { asociadoId: esc.asociadoA1.id, nombre: 'Rosa Quispe' });
        const eventos = await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA));
        assert.ok(eventos.some((ev) => ev.accion === 'incidencia.registrada' && ev.recursoId === incidencia.id && ev.actorId === esc.asociadoA1.cuenta.usuarioId));
      });

      test('alcance individual e interrupción: sugerencia media; alcance general: alta', async () => {
        const s = async (alcanceReportado: string) =>
          personal(await e.casos.consultarIncidencia.ejecutar(esc.operadorA.actor, (await reportar({ categoria: 'interrupcion', alcanceReportado })).incidencia.id)).sugerencia.prioridad;
        assert.equal(await s('individual'), 'media');
        assert.equal(await s('general'), 'alta');
        assert.equal(await s('desconocido'), 'media');
      });

      test('reintento con la misma clave y el mismo contenido: el mismo reporte, sin crear otro', async () => {
        const clave = nuevaClave();
        const primero = await reportar({ descripcion: 'Reintento' }, clave);
        const segundo = await reportar({ descripcion: 'Reintento' }, clave);
        assert.equal(segundo.duplicado, true);
        assert.equal(segundo.incidencia.id, primero.incidencia.id);
        const propias = await e.casos.listarIncidencias.ejecutar(esc.asociadoA1.cuenta.actor, { limite: 100 });
        assert.equal(propias.incidencias.filter((i) => i.descripcion === 'Reintento').length, 1);
      });

      test('la misma clave con otra descripción o con otro alcance → 409 sin cambiar el original', async () => {
        const clave = nuevaClave();
        const { incidencia } = await reportar({ descripcion: 'Original' }, clave);
        await assert.rejects(reportar({ descripcion: 'Cambiada' }, clave), conflicto('clave-idempotencia-reutilizada'));
        await assert.rejects(reportar({ descripcion: 'Original', alcanceReportado: 'general' }, clave), conflicto('clave-idempotencia-reutilizada'));
        const vista = personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id));
        assert.equal(vista.descripcion, 'Original');
        assert.equal(vista.sugerencia.prioridad, 'alta');
      });

      test('la clave es por autor: otro asociado puede usar la misma clave', async () => {
        const clave = nuevaClave();
        const a = await reportar({}, clave, esc.asociadoA1.cuenta.actor);
        const b = await reportar({}, clave, esc.asociadoA2.cuenta.actor);
        assert.notEqual(a.incidencia.id, b.incidencia.id);
        assert.equal(b.duplicado, false);
      });

      test('un reporte inválido no reserva la clave: después la misma clave sirve para uno válido', async () => {
        const clave = nuevaClave();
        await assert.rejects(reportar({ alcanceReportado: undefined }, clave), invalido('alcance-invalido'));
        await assert.rejects(reportar({ categoria: 'lluvia' }, clave), invalido('categoria-invalida'));
        const { duplicado } = await reportar({}, clave);
        assert.equal(duplicado, false);
      });

      test('clave ausente o que no es UUID → 422', async () => {
        for (const clave of [undefined, '', 'abc']) {
          await assert.rejects(e.casos.registrarIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, reporte(), clave), invalido('clave-idempotencia-invalida'));
        }
      });

      test('solo el asociado reporta: el personal queda denegado por permiso', async () => {
        for (const actor of [esc.consejoA.actor, esc.tesoreroA.actor, esc.operadorA.actor]) {
          await assert.rejects(e.casos.registrarIncidencia.ejecutar(actor, reporte(), nuevaClave()), sinPermiso);
        }
      });
    });

    describe('acceso por recurso', () => {
      test('el asociado ve solo los suyos; el de otro asociado y el de otra JASS responden igual que uno inexistente', async () => {
        const { incidencia } = await reportar({ descripcion: 'De Rosa' });
        await assert.rejects(e.casos.consultarIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, incidencia.id), ajeno);
        await assert.rejects(e.casos.historialIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, incidencia.id, {}), ajeno);
        await assert.rejects(e.casos.consultarIncidencia.ejecutar(esc.consejoB.actor, incidencia.id), ajeno);
        await assert.rejects(e.casos.consultarIncidencia.ejecutar(esc.asociadoB1.cuenta.actor, incidencia.id), ajeno);
        await assert.rejects(e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, '00000000-0000-4000-8000-000000000000'), ajeno);
        await assert.rejects(e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, 'no-es-uuid'), ajeno);
        const deLuis = await e.casos.listarIncidencias.ejecutar(esc.asociadoA2.cuenta.actor, { limite: 100 });
        assert.ok(deLuis.incidencias.every((i) => i.descripcion !== 'De Rosa'));
        const deB = await e.casos.listarIncidencias.ejecutar(esc.consejoB.actor, { limite: 100 });
        assert.ok(deB.incidencias.every((i) => i.id !== incidencia.id));
      });

      test('todo el personal de la JASS consulta; Tesorería no gestiona', async () => {
        const { incidencia } = await reportar();
        for (const actor of [esc.consejoA.actor, esc.tesoreroA.actor, esc.operadorA.actor]) {
          assert.equal((await e.casos.consultarIncidencia.ejecutar(actor, incidencia.id)).id, incidencia.id);
        }
        await assert.rejects(e.casos.cambiarEstadoIncidencia.ejecutar(esc.tesoreroA.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined }), sinPermiso);
        await assert.rejects(e.casos.confirmarPrioridad.ejecutar(esc.tesoreroA.actor, incidencia.id, { revision: 1, prioridad: 'alta', motivo: undefined }), sinPermiso);
        await assert.rejects(e.casos.asignarResponsable.ejecutar(esc.tesoreroA.actor, incidencia.id, { revision: 1, responsableId: null }), sinPermiso);
        await assert.rejects(e.casos.registrarAccionIncidencia.ejecutar(esc.tesoreroA.actor, incidencia.id, { revision: 1, descripcion: 'x', visibilidad: 'interna' }), sinPermiso);
        // El asociado tampoco gestiona su propio reporte.
        await assert.rejects(e.casos.cambiarEstadoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined }), sinPermiso);
      });

      test('el personal de otra JASS no gestiona: el recurso es ajeno', async () => {
        const { incidencia } = await reportar();
        await assert.rejects(e.casos.cambiarEstadoIncidencia.ejecutar(esc.operadorB.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined }), ajeno);
      });
    });

    describe('ciclo de atención', () => {
      test('registrada → en atención → cerrada (con acción) → reabierta (con motivo), conservando todo el historial', async () => {
        const { incidencia } = await reportar();
        const atencion = await e.casos.cambiarEstadoIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined });
        assert.equal(atencion.estado, 'en-atencion');
        assert.equal(atencion.revision, 2);
        const cerrada = await e.casos.cambiarEstadoIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 2, estado: 'cerrada', detalle: 'Se cambió la unión' });
        assert.equal(cerrada.estado, 'cerrada');
        e.reloj.avanzar(60_000);
        const reabierta = await e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 3, estado: 'en-atencion', detalle: 'Volvió a gotear' });
        assert.equal(reabierta.estado, 'en-atencion');
        const { eventos } = await e.casos.historialIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, {});
        assert.deepEqual(eventos.map((ev) => [ev.tipo, ev.detalle.a ?? ev.detalle.estado ?? null]), [['creada', 'registrada'], ['estado', 'en-atencion'], ['estado', 'cerrada'], ['estado', 'en-atencion']]);
        assert.equal(eventos[2].detalle.detalle, 'Se cambió la unión');
        assert.equal(eventos[3].detalle.detalle, 'Volvió a gotear');
        assert.equal(eventos[3].actorId, esc.consejoA.usuarioId);
        assert.equal(eventos[3].creadoEn, '2026-11-19T15:01:00.000Z');
        const auditoria = await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA));
        for (const accion of ['incidencia.en-atencion', 'incidencia.cerrada', 'incidencia.reabierta']) {
          assert.ok(auditoria.some((ev) => ev.accion === accion && ev.recursoId === incidencia.id), accion);
        }
      });

      test('cerrar una registrada es una transición inválida y no cambia nada', async () => {
        const { incidencia } = await reportar();
        await assert.rejects(e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 1, estado: 'cerrada', detalle: 'Listo' }), conflicto('transicion-invalida'));
        const vista = await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id);
        assert.equal(vista.estado, 'registrada');
        assert.equal(vista.revision, 1);
      });

      test('cerrar sin acción y reabrir sin motivo → 422', async () => {
        const { incidencia } = await reportar();
        await e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined });
        await assert.rejects(e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 2, estado: 'cerrada', detalle: ' ' }), invalido('accion-requerida'));
        await e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 2, estado: 'cerrada', detalle: 'Hecho' });
        await assert.rejects(e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 3, estado: 'en-atencion', detalle: undefined }), invalido('motivo-requerido'));
      });

      test('una revisión desactualizada → 409 sin escribir cambios ni auditoría', async () => {
        const { incidencia } = await reportar();
        const antes = (await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA))).length;
        await assert.rejects(e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 7, estado: 'en-atencion', detalle: undefined }), conflicto('revision-desactualizada'));
        assert.equal((await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA))).length, antes);
        assert.equal((await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id)).revision, 1);
      });

      test('una incidencia cerrada solo se reabre: prioridad, responsable y acciones → 409', async () => {
        const { incidencia } = await reportar();
        await e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined });
        await e.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 2, estado: 'cerrada', detalle: 'Hecho' });
        await assert.rejects(e.casos.confirmarPrioridad.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 3, prioridad: 'alta', motivo: undefined }), conflicto('incidencia-cerrada'));
        await assert.rejects(e.casos.asignarResponsable.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 3, responsableId: null }), conflicto('incidencia-cerrada'));
        await assert.rejects(e.casos.registrarAccionIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 3, descripcion: 'x', visibilidad: 'publica' }), conflicto('incidencia-cerrada'));
      });

      test('si falla la auditoría, la transición se revierte', async () => {
        const { incidencia } = await reportar();
        const rota = fabrica((repos) => ({
          ...repos,
          auditoria: { ...repos.auditoria, registrar: async () => { throw new Error('fallo forzado'); }, listarPorJass: repos.auditoria.listarPorJass, listarSinJass: repos.auditoria.listarSinJass },
        }));
        const e2 = crearEntorno(rota);
        await assert.rejects(e2.casos.cambiarEstadoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 1, estado: 'en-atencion', detalle: undefined }), /fallo forzado/);
        const vista = await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id);
        assert.equal(vista.estado, 'registrada');
        assert.equal(vista.revision, 1);
        const { eventos } = await e.casos.historialIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, {});
        assert.equal(eventos.length, 1);
      });

      test('si falla la auditoría de la creación, no queda reporte y la clave sigue libre', async () => {
        const clave = nuevaClave();
        const rota = fabrica((repos) => ({
          ...repos,
          auditoria: { ...repos.auditoria, registrar: async () => { throw new Error('fallo forzado'); }, listarPorJass: repos.auditoria.listarPorJass, listarSinJass: repos.auditoria.listarSinJass },
        }));
        await assert.rejects(crearEntorno(rota).casos.registrarIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, reporte({ descripcion: 'Atómico' }), clave), /fallo forzado/);
        const { duplicado } = await reportar({ descripcion: 'Atómico' }, clave);
        assert.equal(duplicado, false);
      });
    });

    describe('prioridad, responsable y acciones', () => {
      test('confirmar la sugerencia no exige motivo; corregirla exige motivo y conserva la sugerencia', async () => {
        const { incidencia } = await reportar();
        const confirmada = personal(await e.casos.confirmarPrioridad.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 1, prioridad: 'alta', motivo: undefined }));
        assert.equal(confirmada.prioridadConfirmada, 'alta');
        await assert.rejects(e.casos.confirmarPrioridad.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 2, prioridad: 'media', motivo: '' }), invalido('motivo-requerido'));
        const corregida = personal(await e.casos.confirmarPrioridad.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 2, prioridad: 'media', motivo: 'Solo dos casas' }));
        assert.equal(corregida.prioridadConfirmada, 'media');
        assert.equal(corregida.sugerencia.prioridad, 'alta');
        const { eventos } = await e.casos.historialIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, {});
        const ultimo = eventos.at(-1);
        assert.deepEqual(ultimo?.detalle, { sugerida: 'alta', confirmada: 'media', motivo: 'Solo dos casas' });
        assert.equal(ultimo?.actorId, esc.operadorA.usuarioId);
        assert.equal(ultimo?.publico, false);
      });

      test('el responsable debe ser personal activo de la JASS; null lo quita', async () => {
        const { incidencia } = await reportar();
        const asignada = personal(await e.casos.asignarResponsable.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 1, responsableId: esc.operadorA.usuarioId }));
        assert.equal(asignada.responsableId, esc.operadorA.usuarioId);
        for (const responsableId of [esc.operadorB.usuarioId, esc.asociadoA1.cuenta.usuarioId, 'no-es-uuid', '00000000-0000-4000-8000-000000000000']) {
          await assert.rejects(e.casos.asignarResponsable.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 2, responsableId }), invalido('responsable-invalido'), String(responsableId));
        }
        assert.equal(personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id)).responsableId, esc.operadorA.usuarioId);
        const sin = personal(await e.casos.asignarResponsable.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 2, responsableId: null }));
        assert.equal(sin.responsableId, null);
      });

      test('un responsable desactivado ya no se puede asignar y la asignación anterior se conserva', async () => {
        const { incidencia } = await reportar();
        const nuevo = await e.casos.crearMiembroEquipo.ejecutar(esc.consejoA.actor, { nombre: 'Temporal', documento: String(30_000_000 + Math.floor(Math.random() * 9_000_000)), rol: 'operador' });
        await e.casos.asignarResponsable.ejecutar(esc.consejoA.actor, incidencia.id, { revision: 1, responsableId: nuevo.usuarioId });
        await e.casos.desactivarMiembroEquipo.ejecutar(esc.consejoA.actor, nuevo.usuarioId);
        assert.equal(personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id)).responsableId, nuevo.usuarioId);
        const otra = await reportar();
        await assert.rejects(e.casos.asignarResponsable.ejecutar(esc.consejoA.actor, otra.incidencia.id, { revision: 1, responsableId: nuevo.usuarioId }), invalido('responsable-invalido'));
      });

      test('acciones públicas e internas: el asociado solo ve las públicas y los cambios de estado', async () => {
        const { incidencia } = await reportar();
        await e.casos.registrarAccionIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 1, descripcion: 'Revisar la caja de válvulas', visibilidad: 'interna' });
        await e.casos.confirmarPrioridad.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 2, prioridad: 'alta', motivo: undefined });
        await e.casos.asignarResponsable.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 3, responsableId: esc.operadorA.usuarioId });
        await e.casos.cambiarEstadoIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 4, estado: 'en-atencion', detalle: undefined });
        await e.casos.registrarAccionIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 5, descripcion: 'Se cambió la unión', visibilidad: 'publica' });
        await assert.rejects(e.casos.registrarAccionIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, { revision: 6, descripcion: 'x', visibilidad: 'secreta' }), invalido('visibilidad-invalida'));
        const delAsociado = await e.casos.historialIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, {});
        assert.deepEqual(delAsociado.eventos.map((ev) => ev.tipo), ['creada', 'estado', 'accion']);
        assert.equal(delAsociado.eventos[2].detalle.descripcion, 'Se cambió la unión');
        assert.ok(delAsociado.eventos.every((ev) => !('actorId' in ev) && !('publico' in ev)));
        assert.equal(JSON.stringify(delAsociado).includes('válvulas'), false);
        const delPersonal = await e.casos.historialIncidencia.ejecutar(esc.tesoreroA.actor, incidencia.id, {});
        assert.deepEqual(delPersonal.eventos.map((ev) => ev.tipo), ['creada', 'accion', 'prioridad', 'responsable', 'estado', 'accion']);
      });
    });

    describe('listado e historial paginados', () => {
      test('el listado va de la más reciente a la más antigua, filtra y pagina con cursor', async () => {
        const local = crearEntorno(base);
        const quien = esc.asociadoA2.cuenta.actor;
        const ids: string[] = [];
        for (let i = 0; i < 5; i++) {
          local.reloj.avanzar(1000 * (i + 1));
          ids.push((await local.casos.registrarIncidencia.ejecutar(quien, reporte({ categoria: i % 2 === 0 ? 'presion' : 'otra', descripcion: `Página ${i}` }), nuevaClave())).incidencia.id);
        }
        const primera = await e.casos.listarIncidencias.ejecutar(quien, { limite: 2, categoria: 'presion' });
        assert.equal(primera.incidencias.length, 2);
        assert.deepEqual(primera.incidencias.map((i) => i.descripcion), ['Página 4', 'Página 2']);
        assert.ok(primera.siguienteCursor);
        const segunda = await e.casos.listarIncidencias.ejecutar(quien, { limite: '2', categoria: 'presion', cursor: primera.siguienteCursor });
        assert.deepEqual(segunda.incidencias.map((i) => i.descripcion), ['Página 0']);
        assert.equal(segunda.siguienteCursor, null);
        const ventana = await e.casos.listarIncidencias.ejecutar(quien, { desde: '2026-11-19T15:00:03Z', hasta: '2026-11-19T15:00:06Z', limite: 100 });
        assert.deepEqual(ventana.incidencias.map((i) => i.descripcion), ['Página 2', 'Página 1']);
      });

      test('parámetros inválidos del listado → 422', async () => {
        const quien = esc.consejoA.actor;
        await assert.rejects(e.casos.listarIncidencias.ejecutar(quien, { limite: 0 }), invalido('limite-invalido'));
        await assert.rejects(e.casos.listarIncidencias.ejecutar(quien, { limite: '101' }), invalido('limite-invalido'));
        await assert.rejects(e.casos.listarIncidencias.ejecutar(quien, { estado: 'pausada' }), invalido('estado-invalido'));
        await assert.rejects(e.casos.listarIncidencias.ejecutar(quien, { categoria: 'lluvia' }), invalido('categoria-invalida'));
        await assert.rejects(e.casos.listarIncidencias.ejecutar(quien, { desde: 'ayer' }), invalido('fecha-invalida'));
        await assert.rejects(e.casos.listarIncidencias.ejecutar(quien, { cursor: 'basura' }), invalido('cursor-invalido'));
      });

      test('el historial se pagina en orden cronológico', async () => {
        const { incidencia } = await reportar();
        for (let r = 1; r <= 3; r++) await e.casos.registrarAccionIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { revision: r, descripcion: `Paso ${r}`, visibilidad: 'publica' });
        const a = await e.casos.historialIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { limite: 2 });
        const b = await e.casos.historialIncidencia.ejecutar(esc.consejoA.actor, incidencia.id, { limite: 2, cursor: a.siguienteCursor });
        assert.deepEqual([...a.eventos, ...b.eventos].map((ev) => ev.detalle.descripcion ?? ev.tipo), ['creada', 'Paso 1', 'Paso 2', 'Paso 3']);
        assert.equal(b.siguienteCursor, null);
      });
    });

    describe('reglas de prioridad por JASS', () => {
      test('sin configuración rige la versión 0; el Consejo la cambia y solo afecta a su JASS y a los reportes nuevos', async () => {
        const antes = await reportar({ categoria: 'presion', alcanceReportado: 'individual' });
        const vigentes = await e.casos.reglasPrioridad.ejecutar(esc.tesoreroA.actor);
        assert.equal(vigentes.version, 0);
        const nuevas = JSON.parse(JSON.stringify(MATRIZ_POR_DEFECTO)) as Record<string, Record<string, string>>;
        nuevas.presion.individual = 'alta';
        const guardadas = await e.casos.actualizarReglasPrioridad.ejecutar(esc.consejoA.actor, { version: 0, reglas: nuevas });
        assert.equal(guardadas.version, 1);
        const despues = await reportar({ categoria: 'presion', alcanceReportado: 'individual' });
        assert.deepEqual(personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, despues.incidencia.id)).sugerencia, { prioridad: 'alta', regla: 'categoria:presion/alcance:individual', version: 1 });
        assert.deepEqual(personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, antes.incidencia.id)).sugerencia.version, 0);
        assert.equal(personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, antes.incidencia.id)).sugerencia.prioridad, 'baja');
        // Otra JASS no cambia.
        assert.equal((await e.casos.reglasPrioridad.ejecutar(esc.consejoB.actor)).version, 0);
        const deB = await e.casos.registrarIncidencia.ejecutar(esc.asociadoB1.cuenta.actor, reporte({ categoria: 'presion', alcanceReportado: 'individual' }), nuevaClave());
        assert.equal(personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoB.actor, deB.incidencia.id)).sugerencia.prioridad, 'baja');
        const auditoria = await uow.ejecutar((r) => r.auditoria.listarPorJass(esc.jassA));
        assert.ok(auditoria.some((ev) => ev.accion === 'incidencia.reglas'));
      });

      test('el reintento de un reporte tras cambiar las reglas devuelve la sugerencia original', async () => {
        const clave = nuevaClave();
        const datos = { categoria: 'averia', alcanceReportado: 'individual', descripcion: 'Tapa rota' };
        const primero = await reportar(datos, clave);
        const vigentes = await e.casos.reglasPrioridad.ejecutar(esc.consejoA.actor);
        const nuevas = JSON.parse(JSON.stringify(vigentes.reglas)) as Record<string, Record<string, string>>;
        nuevas.averia.individual = 'baja';
        await e.casos.actualizarReglasPrioridad.ejecutar(esc.consejoA.actor, { version: vigentes.version, reglas: nuevas });
        const reintento = await reportar(datos, clave);
        assert.equal(reintento.duplicado, true);
        const vista = personal(await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, primero.incidencia.id));
        assert.deepEqual([vista.sugerencia.prioridad, vista.sugerencia.version], ['media', vigentes.version]);
      });

      test('versión desactualizada → 409; matriz incompleta → 422; solo el Consejo modifica', async () => {
        const vigentes = await e.casos.reglasPrioridad.ejecutar(esc.consejoA.actor);
        await assert.rejects(e.casos.actualizarReglasPrioridad.ejecutar(esc.consejoA.actor, { version: vigentes.version + 5, reglas: MATRIZ_POR_DEFECTO }), conflicto('version-desactualizada'));
        const incompleta = JSON.parse(JSON.stringify(MATRIZ_POR_DEFECTO)) as Record<string, unknown>;
        delete incompleta.otra;
        await assert.rejects(e.casos.actualizarReglasPrioridad.ejecutar(esc.consejoA.actor, { version: vigentes.version, reglas: incompleta }), invalido('reglas-invalidas'));
        assert.equal((await e.casos.reglasPrioridad.ejecutar(esc.consejoA.actor)).version, vigentes.version);
        for (const actor of [esc.operadorA.actor, esc.tesoreroA.actor, esc.asociadoA1.cuenta.actor]) {
          await assert.rejects(e.casos.actualizarReglasPrioridad.ejecutar(actor, { version: vigentes.version, reglas: MATRIZ_POR_DEFECTO }), sinPermiso);
        }
        await assert.rejects(e.casos.reglasPrioridad.ejecutar(esc.asociadoA1.cuenta.actor), sinPermiso);
      });
    });

    describe('foto', () => {
      test('el autor adjunta una foto sin metadatos; el personal la lee y el historial lo registra en privado', async () => {
        const { incidencia } = await reportar();
        const { resultado, duplicado } = await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', nuevaClave(), '1');
        assert.equal(duplicado, false);
        assert.equal(resultado.tipo, 'image/jpeg');
        assert.equal(resultado.revision, 2);
        const leida = await e.casos.leerFotoIncidencia.ejecutar(esc.tesoreroA.actor, incidencia.id);
        assert.ok(leida && !leida.bytes.includes(MARCA_EXIF));
        assert.equal(leida?.bytes.length, resultado.tamano);
        assert.equal((await e.casos.consultarIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id)).tieneFoto, true);
        const delAsociado = await e.casos.historialIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, {});
        assert.ok(delAsociado.eventos.every((ev) => ev.tipo !== 'foto'));
      });

      test('reintento idéntico: el mismo resultado sin duplicar; misma clave con otra foto → 409', async () => {
        const { incidencia } = await reportar();
        const clave = nuevaClave();
        const a = await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif('a'), 'image/jpeg', clave, '1');
        const b = await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif('a'), 'image/jpeg', clave, '1');
        assert.equal(b.duplicado, true);
        assert.deepEqual(b.resultado, a.resultado);
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif('b'), 'image/jpeg', clave, '2'), conflicto('clave-idempotencia-reutilizada'));
        assert.equal((await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id)).revision, 2);
      });

      test('Consejo u Operación la sustituyen con la revisión vigente; una revisión vieja → 409', async () => {
        const { incidencia } = await reportar();
        await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', nuevaClave(), '"1"');
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, pngConTexto(), 'image/png', nuevaClave(), '1'), conflicto('revision-desactualizada'));
        const sustituida = await e.casos.subirFotoIncidencia.ejecutar(esc.operadorA.actor, incidencia.id, pngConTexto(), 'image/png', nuevaClave(), 'W/"2"');
        assert.equal(sustituida.resultado.tipo, 'image/png');
        assert.equal((await e.casos.leerFotoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id))?.tipo, 'image/png');
      });

      test('nadie más adjunta ni lee: Tesorería no adjunta; otro asociado y otra JASS ni adjuntan ni leen', async () => {
        const { incidencia } = await reportar();
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.tesoreroA.actor, incidencia.id, jpegConExif(), 'image/jpeg', nuevaClave(), '1'), sinPermiso);
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', nuevaClave(), '1'), ajeno);
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.operadorB.actor, incidencia.id, jpegConExif(), 'image/jpeg', nuevaClave(), '1'), ajeno);
        await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', nuevaClave(), '1');
        await assert.rejects(e.casos.leerFotoIncidencia.ejecutar(esc.asociadoA2.cuenta.actor, incidencia.id), ajeno);
        await assert.rejects(e.casos.leerFotoIncidencia.ejecutar(esc.consejoB.actor, incidencia.id), denegado);
      });

      test('un archivo inválido no deja foto ni reserva la clave', async () => {
        const { incidencia } = await reportar();
        const clave = nuevaClave();
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, Buffer.from('GIF89a....'), 'image/gif', clave, '1'), ErrorTipoNoAdmitido);
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, { no: 'es binario' }, 'application/json', clave, '1'), ErrorTipoNoAdmitido);
        await assert.rejects(e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', clave, 'cero'), invalido('revision-invalida'));
        assert.equal(await e.casos.leerFotoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id), undefined);
        const { duplicado } = await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', clave, '1');
        assert.equal(duplicado, false);
      });

      test('si falla la auditoría, ni la foto ni la reserva quedan guardadas', async () => {
        const { incidencia } = await reportar();
        const clave = nuevaClave();
        const rota = fabrica((repos) => ({
          ...repos,
          auditoria: { ...repos.auditoria, registrar: async () => { throw new Error('fallo forzado'); }, listarPorJass: repos.auditoria.listarPorJass, listarSinJass: repos.auditoria.listarSinJass },
        }));
        await assert.rejects(crearEntorno(rota).casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', clave, '1'), /fallo forzado/);
        assert.equal(await e.casos.leerFotoIncidencia.ejecutar(esc.consejoA.actor, incidencia.id), undefined);
        assert.equal((await e.casos.consultarIncidencia.ejecutar(esc.consejoA.actor, incidencia.id)).tieneFoto, false);
        assert.equal((await e.casos.subirFotoIncidencia.ejecutar(esc.asociadoA1.cuenta.actor, incidencia.id, jpegConExif(), 'image/jpeg', clave, '1')).duplicado, false);
      });
    });
  });
}
