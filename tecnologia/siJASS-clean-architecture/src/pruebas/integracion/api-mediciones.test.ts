/**
 * Reservorios y mediciones por HTTP (s1c, tareas 2.x y 3.x): alta, registro por el operador,
 * historial, catálogo y la matriz de aislamiento entre cuentas y JASS.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { nuevaClave } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';
import { crearMundo, type Mundo } from './entorno-api.js';

const CUERPO_403 = '{"codigo":"acceso-denegado","mensaje":"Acceso denegado"}';
/** Hora de toma válida respecto del reloj fijo de las pruebas (2026-11-19T15:00Z). */
const TOMA = '2026-11-19T09:00:00-05:00';

const lectura = (reservorioId: string, cambios: Record<string, unknown> = {}) => ({
  reservorioId, metodo: 'comparador-dpd', valor: 0.65, unidad: 'mg/L', tomadaEn: TOMA, ...cambios,
});

describe('API — reservorios', () => {
  const pool = crearPool();
  let m: Mundo;
  before(async () => {
    m = await crearMundo(pool);
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });
  const post = (ruta: string, token: string, cuerpo: unknown, cabeceras?: Record<string, string>) => m.api.peticion('POST', ruta, { token, cuerpo, cabeceras });

  test('el consejo crea un reservorio en su JASS aunque el cuerpo diga otra (201)', async () => {
    const r = await post('/v1/reservorios', m.token.consejoA, { nombre: ' Reservorio Central ', jassId: m.esc.jassB });
    assert.equal(r.estado, 201);
    assert.equal(r.cuerpo.nombre, 'Reservorio Central');
    assert.equal(r.cuerpo.jassId, m.esc.jassA);
    const { rows } = await pool.query('SELECT jass_id FROM reservorio WHERE id = $1', [r.cuerpo.id]);
    assert.equal(rows[0].jass_id, m.esc.jassA);
    const ev = await pool.query("SELECT 1 FROM evento_auditoria WHERE accion = 'reservorio.creado' AND recurso_id = $1", [r.cuerpo.id]);
    assert.equal(ev.rowCount, 1);
  });

  test('nombre repetido en la misma JASS (también con otras mayúsculas) → 409; en otra JASS se admite', async () => {
    assert.equal((await post('/v1/reservorios', m.token.consejoA, { nombre: 'RESERVORIO CENTRAL' })).estado, 409);
    assert.equal((await post('/v1/reservorios', m.token.consejoB, { nombre: 'Reservorio Central' })).estado, 201);
  });

  test('nombre vacío, de espacios, largo o de otro tipo → 422', async () => {
    for (const nombre of ['', '   ', 'x'.repeat(81), 5, null, undefined]) {
      assert.equal((await post('/v1/reservorios', m.token.consejoA, { nombre })).estado, 422, String(nombre));
    }
  });

  test('operador, tesorero y asociado no pueden crear reservorios (403) y no se crea nada', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM reservorio WHERE jass_id = $1', [m.esc.jassA])).rows[0].n;
    for (const t of [m.token.operadorA, m.token.tesoreroA, m.token.asociadoA1]) {
      const r = await post('/v1/reservorios', t, { nombre: 'Intruso' });
      assert.equal(r.estado, 403);
      assert.equal(r.texto, CUERPO_403);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM reservorio WHERE jass_id = $1', [m.esc.jassA])).rows[0].n, antes);
  });

  test('el personal lista solo los de su JASS, ordenados por nombre; el asociado recibe 403', async () => {
    await post('/v1/reservorios', m.token.consejoA, { nombre: 'adelante' });
    await post('/v1/reservorios', m.token.consejoA, { nombre: 'Zona Alta' });
    for (const t of [m.token.consejoA, m.token.tesoreroA, m.token.operadorA]) {
      const r = await m.api.peticion('GET', '/v1/reservorios', { token: t });
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo.reservorios.map((x: { nombre: string }) => x.nombre), ['adelante', 'Reservorio Central', 'Zona Alta']);
      assert.ok(r.cuerpo.reservorios.every((x: { jassId: string }) => x.jassId === m.esc.jassA));
    }
    const b = await m.api.peticion('GET', '/v1/reservorios', { token: m.token.operadorB });
    assert.deepEqual(b.cuerpo.reservorios.map((x: { nombre: string }) => x.nombre), ['Reservorio Central']);
    assert.ok(!b.texto.includes(m.esc.jassA));
    const a = await m.api.peticion('GET', '/v1/reservorios', { token: m.token.asociadoA1 });
    assert.equal(a.estado, 403);
    assert.equal(a.texto, CUERPO_403);
  });
});

describe('API — mediciones: registro, historial y catálogo', () => {
  const pool = crearPool();
  let m: Mundo;
  let resA = '';
  let resB = '';
  before(async () => {
    m = await crearMundo(pool);
    resA = (await m.api.peticion('POST', '/v1/reservorios', { token: m.token.consejoA, cuerpo: { nombre: 'Reservorio A' } })).cuerpo.id;
    resB = (await m.api.peticion('POST', '/v1/reservorios', { token: m.token.consejoB, cuerpo: { nombre: 'Reservorio B' } })).cuerpo.id;
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });
  // `null` omite el encabezado Idempotency-Key.
  const registrar = (token: string, cuerpo: unknown, clave: string | null = nuevaClave()) =>
    m.api.peticion('POST', '/v1/mediciones', { token, cuerpo, cabeceras: clave === null ? {} : { 'Idempotency-Key': clave } });
  const total = async (reservorioId: string) => (await pool.query('SELECT count(*)::int AS n FROM medicion WHERE reservorio_id = $1', [reservorioId])).rows[0].n as number;

  test('el operador registra: 201 con identificador, revisión 1 y hora de recepción; queda con su JASS y su autor', async () => {
    const r = await registrar(m.token.operadorA, lectura(resA));
    assert.equal(r.estado, 201);
    assert.equal(r.cuerpo.revision, 1);
    assert.equal(r.cuerpo.registradaEn, '2026-11-19T15:00:00.000Z');
    const { rows } = await pool.query('SELECT jass_id, registrado_por, origen, unidad, valor FROM medicion WHERE id = $1', [r.cuerpo.medicionId]);
    assert.equal(rows[0].jass_id, m.esc.jassA);
    assert.equal(rows[0].registrado_por, m.esc.operadorA.usuarioId);
    assert.equal(rows[0].origen, 'en-linea');
    assert.equal(Number(rows[0].valor), 0.65);
  });

  test('reintento con la misma clave → 200 con el mismo identificador y una sola medición', async () => {
    const clave = nuevaClave();
    const a = await registrar(m.token.operadorA, lectura(resA, { valor: 0.5 }), clave);
    const antes = await total(resA);
    const b = await registrar(m.token.operadorA, lectura(resA, { valor: 0.5 }), clave);
    assert.equal(a.estado, 201);
    assert.equal(b.estado, 200);
    assert.equal(b.cuerpo.medicionId, a.cuerpo.medicionId);
    assert.equal(await total(resA), antes);
  });

  test('misma clave con otro valor → 409 y la medición original no cambia', async () => {
    const clave = nuevaClave();
    const a = await registrar(m.token.operadorA, lectura(resA, { valor: 0.4 }), clave);
    const c = await registrar(m.token.operadorA, lectura(resA, { valor: 0.9 }), clave);
    assert.equal(c.estado, 409);
    const { rows } = await pool.query('SELECT valor FROM medicion WHERE id = $1', [a.cuerpo.medicionId]);
    assert.equal(Number(rows[0].valor), 0.4);
  });

  test('el dominio rechaza con 422 y su motivo, sin crear nada', async () => {
    const antes = await total(resA);
    const casos: Array<[string, Record<string, unknown>]> = [
      ['valor-invalido', { valor: -1 }],
      ['valor-invalido', { valor: 'abc' }],
      ['unidad-invalida', { unidad: 'ppm' }],
      ['metodo-desconocido', { metodo: 'ia-fotografica' }],
      ['toma-posterior-a-recepcion', { tomadaEn: '2026-11-20T09:00:00-05:00' }],
      ['fecha-invalida', { tomadaEn: '2026-02-30T09:00:00-05:00' }],
      ['fecha-invalida', { tomadaEn: '2026-11-19 09:00' }],
    ];
    for (const [motivo, cambios] of casos) {
      const r = await registrar(m.token.operadorA, lectura(resA, cambios));
      assert.equal(r.estado, 422, motivo);
      assert.equal(r.cuerpo.codigo, motivo, JSON.stringify(cambios));
    }
    assert.equal(await total(resA), antes);
  });

  test('campos que el cliente no puede fijar → 422 campo-no-permitido', async () => {
    const antes = await total(resA);
    for (const extra of [{ jassId: m.esc.jassB }, { registradoPor: randomUUID() }, { registradaEn: TOMA }, { estado: 'anulada' }, { revision: 9 }, { id: randomUUID() }]) {
      const r = await registrar(m.token.operadorA, lectura(resA, extra));
      assert.equal(r.estado, 422, JSON.stringify(extra));
      assert.equal(r.cuerpo.codigo, 'campo-no-permitido');
    }
    assert.equal(await total(resA), antes);
  });

  test('sin Idempotency-Key o con una clave que no es UUID → 422', async () => {
    const antes = await total(resA);
    for (const clave of [null, 'abc', '123']) assert.equal((await registrar(m.token.operadorA, lectura(resA), clave)).estado, 422);
    assert.equal(await total(resA), antes);
  });

  test('tesorero, consejo y asociado no pueden registrar (403)', async () => {
    const antes = await total(resA);
    for (const t of [m.token.tesoreroA, m.token.consejoA, m.token.asociadoA1]) {
      const r = await registrar(t, lectura(resA));
      assert.equal(r.estado, 403);
      assert.equal(r.texto, CUERPO_403);
    }
    assert.equal(await total(resA), antes);
  });

  test('un reservorio de otra JASS o inexistente → 403 idéntico, sin crear nada', async () => {
    const antes = (await total(resA)) + (await total(resB));
    const ajeno = await registrar(m.token.operadorA, lectura(resB));
    const inexistente = await registrar(m.token.operadorA, lectura(randomUUID()));
    assert.equal(ajeno.estado, 403);
    assert.equal(ajeno.texto, inexistente.texto);
    assert.equal(ajeno.texto, CUERPO_403);
    assert.equal((await total(resA)) + (await total(resB)), antes);
  });

  test('historial: el consejo ve la medición del operador, de la más reciente a la más antigua', async () => {
    const reservorio = (await m.api.peticion('POST', '/v1/reservorios', { token: m.token.consejoA, cuerpo: { nombre: 'Con historial' } })).cuerpo.id;
    await registrar(m.token.operadorA, lectura(reservorio, { valor: 0.3, tomadaEn: '2026-11-19T06:00:00-05:00' }));
    await registrar(m.token.operadorA, lectura(reservorio, { valor: 0.7, tomadaEn: '2026-11-19T08:00:00-05:00', metodo: 'colorimetro' }));
    await registrar(m.token.operadorA, lectura(reservorio, { valor: 0.5, tomadaEn: '2026-11-19T07:00:00-05:00' }));
    for (const t of [m.token.consejoA, m.token.tesoreroA, m.token.operadorA]) {
      const r = await m.api.peticion('GET', `/v1/reservorios/${reservorio}/mediciones`, { token: t });
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo.mediciones.map((x: { valor: number }) => x.valor), [0.7, 0.5, 0.3]);
      const primera = r.cuerpo.mediciones[0];
      assert.equal(primera.unidad, 'mg/L');
      assert.equal(primera.metodo, 'colorimetro');
      assert.equal(primera.tomadaEn, '2026-11-19T13:00:00.000Z');
      assert.equal(primera.registradoPor, m.esc.operadorA.usuarioId);
      assert.equal(primera.estado, 'vigente');
    }
  });

  test('el historial se limita a las 200 más recientes', async () => {
    const reservorio = (await m.api.peticion('POST', '/v1/reservorios', { token: m.token.consejoA, cuerpo: { nombre: 'Muchas lecturas' } })).cuerpo.id;
    await pool.query(
      `INSERT INTO medicion (jass_id, id, reservorio_id, metodo, valor, unidad, tomada_en, registrada_en, registrado_por, origen)
       SELECT $1, gen_random_uuid(), $2, 'comparador-dpd', 0.5, 'mg/L', '2026-01-01T00:00:00Z'::timestamptz + (n || ' minutes')::interval, '2026-11-19T15:00:00Z', $3, 'en-linea'
         FROM generate_series(1, 205) AS n`,
      [m.esc.jassA, reservorio, m.esc.operadorA.usuarioId],
    );
    const r = await m.api.peticion('GET', `/v1/reservorios/${reservorio}/mediciones`, { token: m.token.consejoA });
    assert.equal(r.cuerpo.mediciones.length, 200);
    const fechas: string[] = r.cuerpo.mediciones.map((x: { tomadaEn: string }) => x.tomadaEn);
    assert.deepEqual([...fechas].sort().reverse(), fechas, 'ordenadas de la más reciente a la más antigua');
    assert.equal(fechas[0], '2026-01-01T03:25:00.000Z');
  });

  test('catálogo: códigos y descripciones; el asociado recibe 403', async () => {
    const r = await m.api.peticion('GET', '/v1/mediciones/catalogo', { token: m.token.operadorA });
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo.metodos.map((x: { codigo: string }) => x.codigo), ['comparador-dpd', 'colorimetro']);
    assert.equal(r.cuerpo.unidad, 'mg/L');
    assert.equal((await m.api.peticion('GET', '/v1/mediciones/catalogo', { token: m.token.asociadoA1 })).estado, 403);
  });

  test('catálogo: es el único GET de /v1 que se cachea (privado, 5 min, con ETag y 304); los errores y el resto siguen en no-store', async () => {
    const r = await m.api.peticion('GET', '/v1/mediciones/catalogo', { token: m.token.operadorA });
    assert.equal(r.cabeceras.get('cache-control'), 'private, max-age=300');
    assert.match(r.cabeceras.get('vary') ?? '', /Authorization/i);
    const etag = r.cabeceras.get('etag');
    assert.ok(etag, 'lleva ETag');
    // `fetch` añade `Cache-Control: no-cache` a una solicitud con `If-None-Match` y Express la trata como no fresca;
    // un navegador revalida sin ese encabezado, así que se usa `http` para reproducirlo.
    const estado304 = await new Promise<number>((resolver, rechazar) => {
      http.get(`${m.api.url}/v1/mediciones/catalogo`, { headers: { authorization: `Bearer ${m.token.operadorA}`, 'if-none-match': etag } }, (res) => {
        res.resume();
        resolver(res.statusCode ?? 0);
      }).on('error', rechazar);
    });
    assert.equal(estado304, 304);
    // Sin sesión o sin permiso la respuesta de error NO se puede guardar.
    for (const token of [undefined, m.token.asociadoA1]) {
      const e = await m.api.peticion('GET', '/v1/mediciones/catalogo', token ? { token } : {});
      assert.ok(e.estado === 401 || e.estado === 403);
      assert.equal(e.cabeceras.get('cache-control'), 'no-store');
    }
    // Los datos de personas siguen sin guardarse.
    assert.equal((await m.api.peticion('GET', '/v1/reservorios', { token: m.token.operadorA })).cabeceras.get('cache-control'), 'no-store');
  });
});

type Cuenta = 'anonimo' | 'consejoA' | 'tesoreroA' | 'operadorA' | 'consejoB' | 'operadorB' | 'asociadoA1';
const CUENTAS: Cuenta[] = ['anonimo', 'consejoA', 'tesoreroA', 'operadorA', 'consejoB', 'operadorB', 'asociadoA1'];
const JASS: Record<Cuenta, 'A' | 'B' | null> = { anonimo: null, consejoA: 'A', tesoreroA: 'A', operadorA: 'A', consejoB: 'B', operadorB: 'B', asociadoA1: 'A' };
const PERSONAL = new Set<Cuenta>(['consejoA', 'tesoreroA', 'operadorA', 'consejoB', 'operadorB']);

describe('API — matriz de aislamiento de reservorios y mediciones', () => {
  const pool = crearPool();
  let m: Mundo;
  const ids = { rA: '', rB: '' };
  const INEXISTENTE = '60000000-0000-4000-8000-000000000001';

  before(async () => {
    m = await crearMundo(pool);
    ids.rA = (await m.api.peticion('POST', '/v1/reservorios', { token: m.token.consejoA, cuerpo: { nombre: 'Matriz A' } })).cuerpo.id;
    ids.rB = (await m.api.peticion('POST', '/v1/reservorios', { token: m.token.consejoB, cuerpo: { nombre: 'Matriz B' } })).cuerpo.id;
    await m.api.peticion('POST', '/v1/mediciones', { token: m.token.operadorA, cuerpo: lectura(ids.rA, { valor: 0.61 }), cabeceras: { 'Idempotency-Key': nuevaClave() } });
    await m.api.peticion('POST', '/v1/mediciones', { token: m.token.operadorB, cuerpo: lectura(ids.rB, { valor: 0.62 }), cabeceras: { 'Idempotency-Key': nuevaClave() } });
  });
  after(async () => {
    await m.api.cerrar();
    await pool.end();
  });

  const token = (c: Cuenta) => (c === 'anonimo' ? undefined : m.token[c]);
  const eventos = async () => (await pool.query("SELECT count(*)::int AS n FROM evento_auditoria WHERE accion = 'acceso.denegado' AND jass_id = ANY($1)", [[m.esc.jassA, m.esc.jassB]])).rows[0].n as number;
  const foto = async () => JSON.stringify((await pool.query(
    `SELECT (SELECT count(*) FROM reservorio WHERE jass_id = ANY($1)) AS reservorios, (SELECT count(*) FROM medicion WHERE jass_id = ANY($1)) AS mediciones`,
    [[m.esc.jassA, m.esc.jassB]])).rows[0]);

  test('lecturas: solo el personal de la misma JASS obtiene datos; el resto recibe 401/403 idéntico y auditado', async () => {
    const antes = await eventos();
    let denegados = 0;
    const recursos: Array<['rA' | 'rB' | 'inexistente', string]> = [['rA', ids.rA], ['rB', ids.rB], ['inexistente', INEXISTENTE]];
    for (const cuenta of CUENTAS) {
      const peticiones: Array<{ ruta: string; esperado: number }> = [
        { ruta: '/v1/reservorios', esperado: cuenta === 'anonimo' ? 401 : PERSONAL.has(cuenta) ? 200 : 403 },
        { ruta: '/v1/mediciones/catalogo', esperado: cuenta === 'anonimo' ? 401 : PERSONAL.has(cuenta) ? 200 : 403 },
        { ruta: '/v1/reservorios/no-uuid/mediciones', esperado: cuenta === 'anonimo' ? 401 : 403 },
        ...recursos.map(([nombre, id]) => ({
          ruta: `/v1/reservorios/${id}/mediciones`,
          esperado: cuenta === 'anonimo' ? 401 : PERSONAL.has(cuenta) && nombre !== 'inexistente' && (nombre === 'rA' ? 'A' : 'B') === JASS[cuenta] ? 200 : 403,
        })),
      ];
      for (const { ruta, esperado } of peticiones) {
        const r = await m.api.peticion('GET', ruta, { token: token(cuenta) });
        assert.equal(r.estado, esperado, `${cuenta} → GET ${ruta.replace(ids.rA, '{rA}').replace(ids.rB, '{rB}')}: llegó ${r.estado}`);
        if (r.estado === 403) {
          denegados++;
          assert.equal(r.texto, CUERPO_403);
        }
        if (r.estado === 200 && JASS[cuenta] === 'A') for (const ajeno of [ids.rB, 'Matriz B', m.esc.jassB, '0.62']) assert.ok(!r.texto.includes(ajeno), `${cuenta}: filtra ${ajeno}`);
        if (r.estado === 200 && JASS[cuenta] === 'B') for (const ajeno of [ids.rA, 'Matriz A', m.esc.jassA, '0.61']) assert.ok(!r.texto.includes(ajeno), `${cuenta}: filtra ${ajeno}`);
      }
    }
    assert.ok(denegados > 20);
    assert.equal((await eventos()) - antes, denegados, 'cada 403 deja un evento acceso.denegado');
  });

  test('escrituras: crear reservorios solo el consejo y registrar solo el operador de la misma JASS; lo demás es 401/403 y no cambia nada', async () => {
    const datos = await foto();
    const antes = await eventos();
    let denegados = 0;
    for (const cuenta of CUENTAS) {
      // Crear reservorio: solo el consejo (se omiten las combinaciones permitidas).
      if (cuenta !== 'consejoA' && cuenta !== 'consejoB') {
        const r = await m.api.peticion('POST', '/v1/reservorios', { token: token(cuenta), cuerpo: { nombre: `Intruso ${cuenta}` } });
        assert.equal(r.estado, cuenta === 'anonimo' ? 401 : 403, `${cuenta} → crear reservorio`);
        if (r.estado === 403) denegados++;
      }
      // Registrar medición en cada reservorio: solo el operador de esa JASS (se omiten las permitidas).
      for (const [nombre, id] of [['A', ids.rA], ['B', ids.rB], ['inexistente', INEXISTENTE]] as const) {
        if (cuenta.startsWith('operador') && JASS[cuenta] === nombre) continue;
        const r = await m.api.peticion('POST', '/v1/mediciones', { token: token(cuenta), cuerpo: lectura(id, { valor: 9.9 }), cabeceras: { 'Idempotency-Key': nuevaClave() } });
        assert.equal(r.estado, cuenta === 'anonimo' ? 401 : 403, `${cuenta} → registrar en ${nombre}: llegó ${r.estado}`);
        if (r.estado === 403) {
          denegados++;
          assert.equal(r.texto, CUERPO_403);
        }
      }
    }
    assert.equal(await foto(), datos, 'una escritura denegada no cambia ninguna tabla');
    assert.equal((await eventos()) - antes, denegados);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM medicion WHERE valor = 9.9")).rows[0].n, 0);
  });

  test('un operador de otra JASS no puede registrar ni consultar aunque conozca el identificador del reservorio', async () => {
    const r1 = await m.api.peticion('POST', '/v1/mediciones', { token: m.token.operadorB, cuerpo: lectura(ids.rA), cabeceras: { 'Idempotency-Key': nuevaClave() } });
    const r2 = await m.api.peticion('GET', `/v1/reservorios/${ids.rA}/mediciones`, { token: m.token.operadorB });
    const r3 = await m.api.peticion('GET', `/v1/reservorios/${ids.rA}/mediciones`, { token: m.token.consejoB });
    for (const r of [r1, r2, r3]) {
      assert.equal(r.estado, 403);
      assert.equal(r.texto, CUERPO_403);
    }
  });

  test('el evento acceso.denegado de una medición no contiene valores ni identificadores del reservorio', async () => {
    const { rows } = await pool.query("SELECT detalle FROM evento_auditoria WHERE accion = 'acceso.denegado' AND actor_id = $1", [m.esc.operadorB.usuarioId]);
    assert.ok(rows.length > 0);
    for (const f of rows) {
      const texto = JSON.stringify(f.detalle);
      assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(texto), texto);
      assert.ok(!texto.includes('0.61') && !texto.includes('9.9'));
    }
  });
});
