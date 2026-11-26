/**
 * Aislamiento entre cuentas y entre JASS por HTTP (tarea 4.3, specs `acceso-por-perfiles`,
 * `portal-asociado` y `auditoria-eventos`): cada cuenta intenta cada ruta con cada recurso.
 */
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { nuevaClave } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';
import { crearMundo, type Mundo } from './entorno-api.js';

type Cuenta = 'anonimo' | 'consejoA' | 'tesoreroA' | 'operadorA' | 'tesoreroB' | 'asociadoA1' | 'asociadoA2' | 'asociadoB1';
const CUENTAS: Cuenta[] = ['anonimo', 'consejoA', 'tesoreroA', 'operadorA', 'tesoreroB', 'asociadoA1', 'asociadoA2', 'asociadoB1'];
const JASS_DE: Record<Cuenta, 'A' | 'B' | null> = {
  anonimo: null, consejoA: 'A', tesoreroA: 'A', operadorA: 'A', tesoreroB: 'B', asociadoA1: 'A', asociadoA2: 'A', asociadoB1: 'B',
};
/** Quienes tienen permiso de padrón y pagos (el operador y los asociados, no). */
const PERSONAL_CON_PADRON = new Set<Cuenta>(['consejoA', 'tesoreroA', 'tesoreroB']);

const CUERPO_403 = '{"codigo":"acceso-denegado","mensaje":"Acceso denegado"}';

describe('API — matriz de aislamiento (cada cuenta × cada ruta × cada recurso)', () => {
  const pool = crearPool();
  let m: Mundo;
  const ids = { A1: '', A2: '', B1: '', pagoA1: '', pagoB1: '' };
  const INEXISTENTE = '50000000-0000-4000-8000-000000000001';

  before(async () => {
    m = await crearMundo(pool);
    const t = (cuenta: 'tesoreroA' | 'tesoreroB') => m.token[cuenta];
    ids.A1 = m.esc.asociadoA1.id;
    ids.A2 = m.esc.asociadoA2.id;
    ids.B1 = m.esc.asociadoB1.id;
    await m.api.peticion('POST', '/v1/cuotas/generar', { token: t('tesoreroA'), cuerpo: { periodo: '2026-11', importeCentimos: 1500 } });
    await m.api.peticion('POST', '/v1/cuotas/generar', { token: t('tesoreroB'), cuerpo: { periodo: '2026-11', importeCentimos: 1500 } });
    const cuotaA1 = (await m.api.peticion('GET', `/v1/asociados/${ids.A1}/estado-de-cuenta`, { token: t('tesoreroA') })).cuerpo.cuotas[0].id;
    const cuotaB1 = (await m.api.peticion('GET', `/v1/asociados/${ids.B1}/estado-de-cuenta`, { token: t('tesoreroB') })).cuerpo.cuotas[0].id;
    ids.pagoA1 = (await m.api.peticion('POST', '/v1/pagos', { token: t('tesoreroA'), cuerpo: { cuotaId: cuotaA1, importeCentimos: 500, comprobante: 'AISLA-A1' }, cabeceras: { 'Idempotency-Key': nuevaClave() } })).cuerpo.id;
    ids.pagoB1 = (await m.api.peticion('POST', '/v1/pagos', { token: t('tesoreroB'), cuerpo: { cuotaId: cuotaB1, importeCentimos: 500, comprobante: 'AISLA-B1' }, cabeceras: { 'Idempotency-Key': nuevaClave() } })).cuerpo.id;
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  const tokenDe = (c: Cuenta) => (c === 'anonimo' ? undefined : m.token[c]);
  const jassDe = (recurso: 'A1' | 'A2' | 'B1' | 'pagoA1' | 'pagoB1' | 'inexistente'): 'A' | 'B' | null =>
    recurso === 'inexistente' ? null : recurso.endsWith('1') && (recurso === 'B1' || recurso === 'pagoB1') ? 'B' : 'A';

  async function contarEventosDenegados(): Promise<number> {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM evento_auditoria WHERE accion = 'acceso.denegado' AND jass_id = ANY($1)", [[m.esc.jassA, m.esc.jassB]]);
    return rows[0].n;
  }
  async function fotoDeDatos(): Promise<string> {
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM asociado WHERE jass_id = ANY($1)) AS asociados,
              (SELECT count(*) FROM cuota WHERE jass_id = ANY($1)) AS cuotas,
              (SELECT count(*) FROM pago WHERE jass_id = ANY($1)) AS pagos,
              (SELECT count(*) FROM pago WHERE jass_id = ANY($1) AND estado = 'revertido') AS revertidos,
              (SELECT count(*) FROM reversa_pago WHERE jass_id = ANY($1)) AS reversas,
              (SELECT count(*) FROM asociado WHERE jass_id = ANY($1) AND estado = 'baja') AS bajas,
              (SELECT count(*) FROM membresia WHERE jass_id = ANY($1)) AS membresias`,
      [[m.esc.jassA, m.esc.jassB]],
    );
    return JSON.stringify(rows[0]);
  }

  const RUTAS_LECTURA: Array<{ nombre: string; ruta: string; recurso?: 'A1' | 'A2' | 'B1' | 'pagoA1' | 'pagoB1' | 'inexistente'; tipo: 'personal-recurso' | 'personal-lista' | 'portal' | 'abierta' }> = [
    { nombre: 'listado de asociados', ruta: '/v1/asociados', tipo: 'personal-lista' },
    ...(['A1', 'A2', 'B1', 'inexistente'] as const).map((r) => ({ nombre: `estado de cuenta de ${r}`, ruta: `/v1/asociados/${r === 'inexistente' ? INEXISTENTE : '{' + r + '}'}/estado-de-cuenta`, recurso: r, tipo: 'personal-recurso' as const })),
    { nombre: 'estado de cuenta con identificador mal formado', ruta: '/v1/asociados/no-uuid/estado-de-cuenta', recurso: 'inexistente', tipo: 'personal-recurso' },
    ...(['pagoA1', 'pagoB1', 'inexistente'] as const).map((r) => ({ nombre: `detalle de ${r}`, ruta: `/v1/pagos/${r === 'inexistente' ? INEXISTENTE : '{' + r + '}'}`, recurso: r, tipo: 'personal-recurso' as const })),
    { nombre: 'portal/saldo', ruta: '/v1/portal/saldo', tipo: 'portal' },
    { nombre: 'portal/cuotas', ruta: '/v1/portal/cuotas', tipo: 'portal' },
    { nombre: 'portal/pagos', ruta: '/v1/portal/pagos', tipo: 'portal' },
    { nombre: 'yo', ruta: '/v1/yo', tipo: 'abierta' },
  ];
  const resolver = (ruta: string) => ruta.replace(/\{(\w+)\}/g, (_, k: keyof typeof ids) => ids[k]);

  test('rutas de lectura: solo se obtienen datos si el perfil, el rol y la JASS coinciden; todo lo demás es 401/403 idéntico', async () => {
    const antes403 = await contarEventosDenegados();
    let observados403 = 0;
    for (const cuenta of CUENTAS) {
      for (const ruta of RUTAS_LECTURA) {
        const r = await m.api.peticion('GET', resolver(ruta.ruta), { token: tokenDe(cuenta) });
        let esperado: number;
        if (cuenta === 'anonimo') esperado = 401;
        else if (ruta.tipo === 'abierta') esperado = 200;
        else if (ruta.tipo === 'portal') esperado = cuenta.startsWith('asociado') ? 200 : 403;
        else if (ruta.tipo === 'personal-lista') esperado = PERSONAL_CON_PADRON.has(cuenta) ? 200 : 403;
        else esperado = PERSONAL_CON_PADRON.has(cuenta) && jassDe(ruta.recurso!) === JASS_DE[cuenta] ? 200 : 403;
        assert.equal(r.estado, esperado, `${cuenta} → GET ${ruta.nombre}: se esperaba ${esperado} y llegó ${r.estado}`);
        if (r.estado === 403) {
          observados403++;
          assert.equal(r.texto, CUERPO_403, `${cuenta} → ${ruta.nombre}: el 403 no debe revelar nada del recurso`);
        }
        // Ningún dato de la otra JASS en una respuesta exitosa.
        if (r.estado === 200 && JASS_DE[cuenta] === 'A') {
          for (const ajeno of [m.esc.jassB, ids.B1, ids.pagoB1, 'Ana Ccori', 'AISLA-B1']) assert.ok(!r.texto.includes(ajeno), `${cuenta} → ${ruta.nombre}: filtra «${ajeno}»`);
        }
        if (r.estado === 200 && JASS_DE[cuenta] === 'B') {
          for (const ajeno of [m.esc.jassA, ids.A1, ids.A2, ids.pagoA1, 'Rosa Quispe', 'Luis Huamán', 'AISLA-A1']) assert.ok(!r.texto.includes(ajeno), `${cuenta} → ${ruta.nombre}: filtra «${ajeno}»`);
        }
      }
    }
    assert.ok(observados403 > 30, 'la matriz debe producir muchas denegaciones');
    assert.equal((await contarEventosDenegados()) - antes403, observados403, 'cada 403 debe dejar exactamente un evento acceso.denegado');
  });

  test('rutas de escritura: toda combinación sin permiso o de otra JASS responde 401/403 y no cambia ningún dato', async () => {
    const antesDatos = await fotoDeDatos();
    const usuariosAntes = (await pool.query('SELECT count(*)::int AS n FROM usuario')).rows[0].n as number;
    const antes403 = await contarEventosDenegados();
    let observados403 = 0;
    const escrituras: Array<{ nombre: string; metodo: string; ruta: string; cuerpo: unknown; recurso: 'A1' | 'B1' | 'pagoA1' | 'pagoB1' | null; clave?: boolean }> = [
      { nombre: 'registrar asociado', metodo: 'POST', ruta: '/v1/asociados', cuerpo: { nombre: 'Intruso', documento: 'INTRUSO-1' }, recurso: null },
      { nombre: 'baja de A1', metodo: 'POST', ruta: '/v1/asociados/{A1}/baja', cuerpo: {}, recurso: 'A1' },
      { nombre: 'baja de B1', metodo: 'POST', ruta: '/v1/asociados/{B1}/baja', cuerpo: {}, recurso: 'B1' },
      { nombre: 'crear acceso de A1', metodo: 'POST', ruta: '/v1/asociados/{A1}/acceso', cuerpo: {}, recurso: 'A1' },
      { nombre: 'crear acceso de B1', metodo: 'POST', ruta: '/v1/asociados/{B1}/acceso', cuerpo: {}, recurso: 'B1' },
      { nombre: 'generar cuotas', metodo: 'POST', ruta: '/v1/cuotas/generar', cuerpo: { periodo: '2027-01', importeCentimos: 100 }, recurso: null },
      { nombre: 'reversar pago de A1', metodo: 'POST', ruta: '/v1/pagos/{pagoA1}/reversa', cuerpo: { motivo: 'intruso' }, recurso: 'pagoA1' },
      { nombre: 'reversar pago de B1', metodo: 'POST', ruta: '/v1/pagos/{pagoB1}/reversa', cuerpo: { motivo: 'intruso' }, recurso: 'pagoB1' },
    ];
    for (const cuenta of CUENTAS) {
      for (const e of escrituras) {
        const permitido = PERSONAL_CON_PADRON.has(cuenta) && (e.recurso === null || jassDe(e.recurso) === JASS_DE[cuenta]);
        if (permitido) continue; // las combinaciones permitidas se prueban en api-flujos
        const r = await m.api.peticion(e.metodo, resolver(e.ruta), { token: tokenDe(cuenta), cuerpo: e.cuerpo });
        assert.equal(r.estado, cuenta === 'anonimo' ? 401 : 403, `${cuenta} → ${e.nombre}: llegó ${r.estado}`);
        if (r.estado === 403) {
          observados403++;
          assert.equal(r.texto, CUERPO_403);
        }
      }
    }
    // Pagos: cada cuenta no autorizada intenta pagar la cuota de A1 y la de B1.
    const cuotaA1 = (await m.api.peticion('GET', `/v1/asociados/${ids.A1}/estado-de-cuenta`, { token: m.token.tesoreroA })).cuerpo.cuotas[0].id;
    const cuotaB1 = (await m.api.peticion('GET', `/v1/asociados/${ids.B1}/estado-de-cuenta`, { token: m.token.tesoreroB })).cuerpo.cuotas[0].id;
    for (const cuenta of CUENTAS) {
      for (const [cuotaId, jass] of [[cuotaA1, 'A'], [cuotaB1, 'B']] as const) {
        if (PERSONAL_CON_PADRON.has(cuenta) && JASS_DE[cuenta] === jass) continue;
        const r = await m.api.peticion('POST', '/v1/pagos', { token: tokenDe(cuenta), cuerpo: { cuotaId, importeCentimos: 10, comprobante: 'INTRUSO' }, cabeceras: { 'Idempotency-Key': nuevaClave() } });
        assert.equal(r.estado, cuenta === 'anonimo' ? 401 : 403, `${cuenta} → pagar cuota de ${jass}: llegó ${r.estado}`);
        if (r.estado === 403) observados403++;
      }
    }
    assert.equal(await fotoDeDatos(), antesDatos, 'una escritura denegada no debe cambiar ningún dato');
    assert.equal((await contarEventosDenegados()) - antes403, observados403);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM usuario');
    assert.equal(rows[0].n, usuariosAntes, 'ninguna escritura denegada crea una cuenta');
  });

  test('el portal ignora cualquier identificador enviado: devuelve solo lo propio', async () => {
    const r = await m.api.peticion('GET', `/v1/portal/saldo?asociadoId=${ids.A2}&jassId=${m.esc.jassB}&id=${ids.B1}`, {
      token: m.token.asociadoA1,
      cabeceras: { 'x-asociado-id': ids.A2, 'x-jass-id': m.esc.jassB },
    });
    assert.equal(r.estado, 200);
    assert.equal(r.cuerpo.asociado.nombre, 'Rosa Quispe');
    assert.ok(!r.texto.includes('Luis'));
    const pagos = await m.api.peticion('GET', `/v1/portal/pagos?asociadoId=${ids.A2}`, { token: m.token.asociadoA1 });
    assert.ok(pagos.cuerpo.pagos.every((p: { comprobante: string }) => p.comprobante !== 'AISLA-B1'));
  });

  test('un asociado no puede pedir el detalle de un pago de otro asociado ni de otra JASS (403, auditado)', async () => {
    const antes = await contarEventosDenegados();
    for (const pagoId of [ids.pagoA1, ids.pagoB1]) {
      const r = await m.api.peticion('GET', `/v1/pagos/${pagoId}`, { token: m.token.asociadoA2 });
      assert.equal(r.estado, 403);
      assert.equal(r.texto, CUERPO_403);
    }
    assert.equal((await contarEventosDenegados()) - antes, 2);
  });

  test('el evento acceso.denegado lleva actor y ruta, y ningún dato del recurso', async () => {
    await m.api.peticion('GET', `/v1/asociados/${ids.B1}/estado-de-cuenta`, { token: m.token.tesoreroA });
    const { rows } = await pool.query(
      "SELECT actor_id, jass_id, detalle FROM evento_auditoria WHERE accion = 'acceso.denegado' AND actor_id = $1",
      [m.esc.tesoreroA.usuarioId],
    );
    assert.ok(rows.length > 0);
    assert.ok(rows.some((f) => f.detalle.ruta === '/v1/asociados/:id/estado-de-cuenta'), 'la ruta se guarda como patrón');
    for (const fila of rows) {
      assert.equal(fila.jass_id, m.esc.jassA);
      assert.deepEqual(Object.keys(fila.detalle).sort(), ['metodo', 'motivo', 'ruta']);
      const texto = JSON.stringify(fila.detalle);
      assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(texto), `el evento no debe contener identificadores del recurso: ${texto}`);
    }
  });

  test('con la membresía desactivada, el token vigente deja de servir (403 por HTTP)', async () => {
    const sesion = await m.api.iniciarSesion(m.esc.operadorA.documento);
    assert.equal((await m.api.peticion('GET', '/v1/yo', { token: sesion.tokenAcceso })).estado, 200);
    await pool.query("UPDATE membresia SET estado = 'inactiva' WHERE usuario_id = $1", [m.esc.operadorA.usuarioId]);
    const r = await m.api.peticion('GET', '/v1/yo', { token: sesion.tokenAcceso });
    assert.equal(r.estado, 403);
    assert.equal(r.texto, CUERPO_403);
  });
});
