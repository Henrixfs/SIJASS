/**
 * Batería de contrato del registro idempotente (spec `registro-idempotente`, ADR-005,
 * DT05). La MISMA batería se ejecuta contra la unidad de trabajo en memoria (`npm test`)
 * y contra PostgreSQL (`npm run test:integration`). No contiene casos exclusivos.
 * Este archivo no termina en `.test.ts`: solo se ejecuta cuando una suite lo invoca.
 */
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { RegistrarMedicion, type ResultadoOperacion } from '../../aplicacion/registrar-medicion.js';
import { ErrorMedicionDuplicada, type MotivoRechazo } from '../../dominio/errores.js';
import type { ComandoRegistrarMedicion, Medicion } from '../../dominio/medicion.js';
import type {
  ContextoActor,
  DecoradorRepositorios,
  RepositoriosTransaccion,
  RepositorioMediciones,
  UnidadDeTrabajo,
} from '../../dominio/puertos.js';
import { GeneradorIdsAleatorio } from '../../infraestructura/sistema.js';
import { RelojFijo } from '../dobles.js';

export interface EntornoRegistroIdempotente {
  /** Unidad de trabajo sobre la base compartida del entorno, con decorador opcional. */
  crearUnidadDeTrabajo(decorar?: DecoradorRepositorios): UnidadDeTrabajo;
  /** Crea la JASS (si no existe) y un reservorio suyo, ya confirmados. */
  sembrarReservorio(jassId: string, reservorioId: string): Promise<void>;
  /** Lecturas del estado confirmado, fuera de toda transacción. */
  buscarMedicion(jassId: string, id: string): Promise<Medicion | undefined>;
  contarMediciones(jassId: string): Promise<number>;
  contarReservas(jassId: string): Promise<number>;
  existeReserva(jassId: string, operationId: string): Promise<boolean>;
  cerrar(): Promise<void>;
}

export type FabricaRegistroIdempotente = () => Promise<EntornoRegistroIdempotente>;

export interface OpcionesBateriaRegistro {
  /** Rondas de las pruebas de reversión y concurrencia (design.md D10: 10). */
  readonly repeticiones: number;
}

const RECEPCION = '2026-10-12T13:10:00.000Z';
const TOMA = '2026-10-12T08:00:00-05:00';

/** Escenario de una prueba: JASS, actor y reservorio propios, recién sembrados. */
interface Escenario {
  readonly entorno: EntornoRegistroIdempotente;
  readonly jass: string;
  readonly actor: ContextoActor;
  readonly reservorio: string;
  readonly reloj: RelojFijo;
  casoDeUso(decorar?: DecoradorRepositorios): RegistrarMedicion;
  comando(cambios?: Record<string, unknown>, sin?: string[]): ComandoRegistrarMedicion;
}

async function crearEscenario(entorno: EntornoRegistroIdempotente): Promise<Escenario> {
  const jass = randomUUID();
  const reservorio = randomUUID();
  await entorno.sembrarReservorio(jass, reservorio);
  const reloj = new RelojFijo(RECEPCION);
  return {
    entorno,
    jass,
    actor: { jassId: jass, usuarioId: randomUUID() },
    reservorio,
    reloj,
    casoDeUso: (decorar) =>
      new RegistrarMedicion({ unidadDeTrabajo: entorno.crearUnidadDeTrabajo(decorar), reloj, ids: new GeneradorIdsAleatorio() }),
    comando: (cambios = {}, sin = []) => {
      const c: Record<string, unknown> = {
        operationId: randomUUID(),
        reservorioId: reservorio,
        metodo: 'comparador-dpd',
        valor: 0.65,
        unidad: 'mg/L',
        tomadaEn: TOMA,
        ...cambios,
      };
      for (const clave of sin) delete c[clave];
      return c as unknown as ComandoRegistrarMedicion;
    },
  };
}

// ---- Decoradores de prueba (costura de design.md D6) -------------------------------

/** Reemplaza `mediciones.guardar` conservando el resto de los métodos. */
export function conGuardar(guardar: (repos: RepositoriosTransaccion, medicion: Medicion) => Promise<void>): DecoradorRepositorios {
  return (repos) => {
    const m: RepositorioMediciones = repos.mediciones;
    return {
      ...repos,
      mediciones: {
        guardar: (medicion) => guardar(repos, medicion),
        buscar: (jassId, id) => m.buscar(jassId, id),
        listar: (jassId, filtro) => m.listar(jassId, filtro),
      },
    };
  };
}

export const fallaAlGuardar = (error: Error): DecoradorRepositorios =>
  conGuardar(async () => {
    throw error;
  });

/** Retrasa la escritura para mantener tomada la reserva y forzar la espera de las demás. */
export const retrasarGuardar = (ms: number): DecoradorRepositorios =>
  conGuardar(async (repos, medicion) => {
    await new Promise((r) => setTimeout(r, ms));
    await repos.mediciones.guardar(medicion);
  });

/** Falla al registrar el resultado, después de haber escrito la medición. */
export const fallaAlRegistrarResultado = (error: Error): DecoradorRepositorios => (repos) => {
  const o = repos.operaciones;
  return {
    ...repos,
    operaciones: {
      reservar: (jassId, operationId, hash, tipo) => o.reservar(jassId, operationId, hash, tipo),
      registrarResultado: async () => {
        throw error;
      },
    },
  };
};

const fallaAlReservar = (error: Error): DecoradorRepositorios => (repos) => ({
  ...repos,
  operaciones: {
    reservar: async () => {
      throw error;
    },
    registrarResultado: (jassId, operationId, resultado) => repos.operaciones.registrarResultado(jassId, operationId, resultado),
  },
});

const fallaAlConsultarReservorio = (error: Error): DecoradorRepositorios => (repos) => ({
  ...repos,
  reservorios: {
    existeEnJass: async () => {
      throw error;
    },
  },
});

// ---- Aserciones ---------------------------------------------------------------------

function aceptada(r: ResultadoOperacion): Extract<ResultadoOperacion, { resultado: 'accepted' | 'duplicate' }> {
  assert.equal(r.resultado, 'accepted', `se esperaba accepted, se obtuvo ${JSON.stringify(r)}`);
  return r as Extract<ResultadoOperacion, { resultado: 'accepted' }>;
}

/** UUID aleatorio que contiene letras, para que mayúsculas y minúsculas difieran. */
function uuidConLetras(): string {
  for (;;) {
    const id = randomUUID();
    if (id.toUpperCase() !== id) return id;
  }
}

/** Registra la batería de contrato bajo `describe(nombre)`. */
export function probarContratoRegistroIdempotente(
  nombre: string,
  fabrica: FabricaRegistroIdempotente,
  opciones: OpcionesBateriaRegistro,
): void {
  async function conEscenario(prueba: (e: Escenario) => Promise<void>): Promise<void> {
    const entorno = await fabrica();
    try {
      await prueba(await crearEscenario(entorno));
    } finally {
      await entorno.cerrar();
    }
  }

  describe(`contrato registro idempotente — ${nombre}`, () => {
    test('accepted: registra la medición con JASS y autor del contexto y devuelve el resultado', () =>
      conEscenario(async ({ entorno, jass, actor, reservorio, casoDeUso, comando }) => {
        const c = comando();
        const r = aceptada(await casoDeUso().ejecutar(c, actor, 'sincronizada'));
        assert.equal(r.operationId, c.operationId);
        assert.equal(r.medicion.revision, 1);
        assert.equal(r.medicion.registradaEn, RECEPCION);

        const guardada = await entorno.buscarMedicion(jass, r.medicion.medicionId);
        assert.deepStrictEqual(guardada, {
          id: r.medicion.medicionId,
          jassId: jass,
          reservorioId: reservorio,
          metodo: 'comparador-dpd',
          valor: 0.65,
          unidad: 'mg/L',
          tomadaEn: '2026-10-12T13:00:00.000Z',
          registradaEn: RECEPCION,
          registradoPor: actor.usuarioId,
          origen: 'sincronizada',
          estado: 'vigente',
          revision: 1,
        });
        assert.equal(await entorno.contarReservas(jass), 1);
      }));

    test('PT04 — reenvío con el mismo contenido: duplicate con el resultado original', () =>
      conEscenario(async ({ actor, casoDeUso, comando }) => {
        const c = comando();
        const original = aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
        const reenvio = await casoDeUso().ejecutar(c, actor, 'en-linea');
        assert.deepStrictEqual(reenvio, { resultado: 'duplicate', operationId: c.operationId, medicion: original.medicion });
      }));

    test('RNF04 — un envío y tres reintentos: un accepted, tres duplicate, una medición y una reserva', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const c = comando();
        const resultados: ResultadoOperacion[] = [];
        for (let i = 0; i < 4; i++) resultados.push(await casoDeUso().ejecutar(c, actor, 'sincronizada'));
        assert.deepEqual(resultados.map((r) => r.resultado), ['accepted', 'duplicate', 'duplicate', 'duplicate']);
        assert.equal(await entorno.contarMediciones(jass), 1);
        assert.equal(await entorno.contarReservas(jass), 1);
      }));

    test('reenvío en otro momento: duplicate informa la hora de recepción original', () =>
      conEscenario(async ({ actor, reloj, casoDeUso, comando }) => {
        const c = comando();
        aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
        reloj.avanzar(60 * 60_000);
        const r = await casoDeUso().ejecutar(c, actor, 'en-linea');
        assert.equal(r.resultado, 'duplicate');
        assert.equal(r.resultado === 'duplicate' && r.medicion.registradaEn, RECEPCION);
      }));

    test('mismo contenido con las claves en otro orden: duplicate', () =>
      conEscenario(async ({ actor, casoDeUso, comando }) => {
        const c = comando();
        aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
        const reordenado = Object.fromEntries(Object.entries(c).reverse()) as unknown as ComandoRegistrarMedicion;
        assert.equal((await casoDeUso().ejecutar(reordenado, actor, 'en-linea')).resultado, 'duplicate');
      }));

    test('UUID en mayúsculas: se guarda en minúsculas y otra capitalización da duplicate, no conflict', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const reservorio = uuidConLetras();
        await entorno.sembrarReservorio(jass, reservorio);
        const operacion = uuidConLetras();
        const evidencia = uuidConLetras();
        const enMayusculas = comando({
          operationId: operacion.toUpperCase(),
          reservorioId: reservorio.toUpperCase(),
          evidenciaId: evidencia.toUpperCase(),
        });

        const r = aceptada(await casoDeUso().ejecutar(enMayusculas, actor, 'en-linea'));
        assert.equal(r.operationId, operacion);
        const guardada = await entorno.buscarMedicion(jass, r.medicion.medicionId);
        assert.equal(guardada?.reservorioId, reservorio);
        assert.equal(guardada?.evidenciaId, evidencia);
        assert.ok(await entorno.existeReserva(jass, operacion));

        const enMinusculas = comando({ operationId: operacion, reservorioId: reservorio, evidenciaId: evidencia });
        const mezcla = comando({ operationId: operacion.toUpperCase(), reservorioId: reservorio, evidenciaId: evidencia.toUpperCase() });
        for (const reenvio of [enMinusculas, mezcla]) {
          assert.deepStrictEqual(await casoDeUso().ejecutar(reenvio, actor, 'en-linea'), {
            resultado: 'duplicate',
            operationId: operacion,
            medicion: r.medicion,
          });
        }
        assert.equal(await entorno.contarMediciones(jass), 1);
        assert.equal(await entorno.contarReservas(jass), 1);
      }));

    test('PT12 — mismo operationId con otro valor: conflict sin modificar la medición ni el resultado', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const c = comando();
        const original = aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
        const antes = await entorno.buscarMedicion(jass, original.medicion.medicionId);

        const r = await casoDeUso().ejecutar({ ...c, valor: 1.5 }, actor, 'en-linea');
        assert.deepStrictEqual(r, { resultado: 'conflict', operationId: c.operationId });
        assert.deepStrictEqual(await entorno.buscarMedicion(jass, original.medicion.medicionId), antes);
        assert.equal(await entorno.contarMediciones(jass), 1);
        assert.equal(await entorno.contarReservas(jass), 1);

        // Tras el conflicto, el contenido original sigue dando duplicate con el resultado original.
        assert.deepStrictEqual(await casoDeUso().ejecutar(c, actor, 'en-linea'), {
          resultado: 'duplicate',
          operationId: c.operationId,
          medicion: original.medicion,
        });
      }));

    test('PT12 — contenido distinto e inválido sobre un operationId aceptado: conflict, no rejected', () =>
      conEscenario(async ({ actor, casoDeUso, comando }) => {
        const c = comando();
        aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
        assert.equal((await casoDeUso().ejecutar({ ...c, valor: -1 }, actor, 'en-linea')).resultado, 'conflict');
      }));

    test('cambiar un único campo del comando da conflict', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const otroReservorio = randomUUID();
        await entorno.sembrarReservorio(jass, otroReservorio);
        const cambios: Record<string, unknown>[] = [
          { valor: 0.66 },
          { metodo: 'colorimetro' },
          { unidad: 'ppm' },
          { tomadaEn: '2026-10-12T08:01:00-05:00' },
          { reservorioId: otroReservorio },
          { evidenciaId: randomUUID() },
        ];
        const c = comando();
        aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
        for (const cambio of cambios) {
          const r = await casoDeUso().ejecutar({ ...c, ...cambio } as ComandoRegistrarMedicion, actor, 'en-linea');
          assert.equal(r.resultado, 'conflict', JSON.stringify(cambio));
        }
        assert.equal(await entorno.contarMediciones(jass), 1);
      }));

    test('rejected con cada motivo, sin dejar reserva ni medición', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const otraJass = randomUUID();
        const reservorioAjeno = randomUUID();
        await entorno.sembrarReservorio(otraJass, reservorioAjeno);
        const pasadoTolerancia = new Date(Date.parse(RECEPCION) + 5 * 60_000 + 1).toISOString();
        const casos: [Record<string, unknown>, MotivoRechazo][] = [
          [{ operationId: 'no-es-uuid' }, 'operacion-invalida'],
          [{ jassId: otraJass }, 'campo-no-permitido'],
          [{ payloadHash: 'a'.repeat(64) }, 'campo-no-permitido'],
          [{ reservorioId: 'reservorio-1' }, 'identificador-invalido'],
          [{ evidenciaId: 'foto.jpg' }, 'identificador-invalido'],
          [{ valor: -1 }, 'valor-invalido'],
          [{ unidad: 'ppm' }, 'unidad-invalida'],
          [{ metodo: 'estimacion-imagen' }, 'metodo-desconocido'],
          [{ tomadaEn: '2026-10-12T08:00:00' }, 'fecha-invalida'],
          [{ tomadaEn: pasadoTolerancia }, 'toma-posterior-a-recepcion'],
          [{ reservorioId: randomUUID() }, 'reservorio-no-encontrado'],
          [{ reservorioId: reservorioAjeno }, 'reservorio-no-encontrado'],
        ];
        for (const [cambios, motivo] of casos) {
          const c = comando(cambios);
          const r = await casoDeUso().ejecutar(c, actor, 'en-linea');
          assert.deepStrictEqual(r, { resultado: 'rejected', operationId: c.operationId, motivo }, JSON.stringify(cambios));
          if (typeof c.operationId === 'string' && c.operationId !== 'no-es-uuid') {
            assert.equal(await entorno.existeReserva(jass, c.operationId), false, `reserva tras ${motivo}`);
          }
        }
        assert.equal(await entorno.contarReservas(jass), 0);
        assert.equal(await entorno.contarMediciones(jass), 0);
        assert.equal(await entorno.contarMediciones(otraJass), 0);
      }));

    test('un rechazo no deja rastro: el mismo operationId con contenido válido da accepted', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const invalido = comando({ valor: -1 });
        assert.equal((await casoDeUso().ejecutar(invalido, actor, 'en-linea')).resultado, 'rejected');
        // Reenviar el mismo contenido inválido vuelve a dar rejected, no duplicate.
        assert.equal((await casoDeUso().ejecutar(invalido, actor, 'en-linea')).resultado, 'rejected');
        const valido = { ...invalido, valor: 0.4 };
        aceptada(await casoDeUso().ejecutar(valido, actor, 'en-linea'));
        assert.equal(await entorno.contarMediciones(jass), 1);
      }));

    test('mismo operationId en dos JASS: operaciones independientes', () =>
      conEscenario(async ({ entorno, jass: jassA, actor: actorA, casoDeUso, comando }) => {
        const jassB = randomUUID();
        const reservorioB = randomUUID();
        await entorno.sembrarReservorio(jassB, reservorioB);
        const actorB: ContextoActor = { jassId: jassB, usuarioId: randomUUID() };
        const operationId = randomUUID();
        const enA = comando({ operationId });
        const enB = comando({ operationId, reservorioId: reservorioB, valor: 0.9 });

        const rA = aceptada(await casoDeUso().ejecutar(enA, actorA, 'en-linea'));
        const rB = aceptada(await casoDeUso().ejecutar(enB, actorB, 'en-linea'));
        assert.notEqual(rA.medicion.medicionId, rB.medicion.medicionId);
        assert.equal((await entorno.buscarMedicion(jassA, rA.medicion.medicionId))?.valor, 0.65);
        assert.equal((await entorno.buscarMedicion(jassB, rB.medicion.medicionId))?.valor, 0.9);
        assert.equal(await entorno.buscarMedicion(jassB, rA.medicion.medicionId), undefined);
        assert.equal(await entorno.buscarMedicion(jassA, rB.medicion.medicionId), undefined);

        // Un conflicto en B no afecta a A, y cada JASS conserva su propio resultado.
        assert.equal((await casoDeUso().ejecutar({ ...enB, valor: 2 }, actorB, 'en-linea')).resultado, 'conflict');
        assert.deepStrictEqual(await casoDeUso().ejecutar(enA, actorA, 'en-linea'), { resultado: 'duplicate', operationId, medicion: rA.medicion });
        assert.deepStrictEqual(await casoDeUso().ejecutar(enB, actorB, 'en-linea'), { resultado: 'duplicate', operationId, medicion: rB.medicion });
        // El contenido de A enviado por B no es duplicate de A: en B es otro contenido.
        assert.equal((await casoDeUso().ejecutar(enA, actorB, 'en-linea')).resultado, 'conflict');

        for (const j of [jassA, jassB]) {
          assert.equal(await entorno.contarMediciones(j), 1);
          assert.equal(await entorno.contarReservas(j), 1);
          assert.ok(await entorno.existeReserva(j, operationId));
        }
      }));

    test('mismo operationId en dos JASS: un rechazo en una no impide aceptar en la otra', () =>
      conEscenario(async ({ entorno, jass: jassA, actor: actorA, casoDeUso, comando }) => {
        const jassB = randomUUID();
        const reservorioB = randomUUID();
        await entorno.sembrarReservorio(jassB, reservorioB);
        const actorB: ContextoActor = { jassId: jassB, usuarioId: randomUUID() };
        const operationId = randomUUID();

        assert.equal((await casoDeUso().ejecutar(comando({ operationId, valor: -1 }), actorA, 'en-linea')).resultado, 'rejected');
        aceptada(await casoDeUso().ejecutar(comando({ operationId, reservorioId: reservorioB }), actorB, 'en-linea'));
        assert.equal(await entorno.existeReserva(jassA, operationId), false);
        assert.equal(await entorno.existeReserva(jassB, operationId), true);
      }));

    test('la deduplicación es por operationId, no por contenido', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const c = comando();
        aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
        aceptada(await casoDeUso().ejecutar({ ...c, operationId: randomUUID() }, actor, 'en-linea'));
        assert.equal(await entorno.contarMediciones(jass), 2);
      }));

    test('un fallo de infraestructura se propaga como error, sin resultado y sin rastro', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        for (const decorar of [
          fallaAlConsultarReservorio(new Error('fallo simulado de lectura')),
          fallaAlReservar(new Error('fallo simulado de reserva')),
        ]) {
          const c = comando();
          await assert.rejects(casoDeUso(decorar).ejecutar(c, actor, 'en-linea'), /fallo simulado/);
          assert.equal(await entorno.existeReserva(jass, c.operationId), false);
        }
        assert.equal(await entorno.contarMediciones(jass), 0);
        assert.equal(await entorno.contarReservas(jass), 0);
      }));

    test('ErrorMedicionDuplicada se propaga como fallo reintentable, no como rejected', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        const c = comando();
        const decorar = conGuardar(async (_repos, m) => {
          throw new ErrorMedicionDuplicada(m.jassId, m.id);
        });
        await assert.rejects(casoDeUso(decorar).ejecutar(c, actor, 'en-linea'), ErrorMedicionDuplicada);
        assert.equal(await entorno.existeReserva(jass, c.operationId), false);
        aceptada(await casoDeUso().ejecutar(c, actor, 'en-linea'));
      }));
  });

  describe(`contrato registro idempotente: reversión y concurrencia (${opciones.repeticiones} rondas) — ${nombre}`, () => {
    const puntosDeFalla: [string, (error: Error) => DecoradorRepositorios][] = [
      ['entre la reserva y la escritura (guardar)', fallaAlGuardar],
      ['después de escribir la medición (registrarResultado)', fallaAlRegistrarResultado],
    ];

    for (const [punto, inyectar] of puntosDeFalla) {
      test(`PT11 — falla ${punto}: cero reserva y cero medición; el reintento da accepted`, () =>
        conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
          for (let ronda = 0; ronda < opciones.repeticiones; ronda++) {
            const c = comando();
            const fallo = new Error(`fallo simulado ${punto} ronda ${ronda}`);
            await assert.rejects(casoDeUso(inyectar(fallo)).ejecutar(c, actor, 'sincronizada'), (e) => e === fallo);

            // Tras la falla: ni reserva ni medición de esta operación (solo las de rondas anteriores).
            assert.equal(await entorno.existeReserva(jass, c.operationId), false, `reserva tras la falla, ronda ${ronda}`);
            assert.equal(await entorno.contarReservas(jass), ronda, `reservas tras la falla, ronda ${ronda}`);
            assert.equal(await entorno.contarMediciones(jass), ronda, `mediciones tras la falla, ronda ${ronda}`);

            // El reintento sin falla se aplica: ni accepted falso antes, ni pérdida silenciosa ahora.
            const r = aceptada(await casoDeUso().ejecutar(c, actor, 'sincronizada'));
            assert.ok(await entorno.buscarMedicion(jass, r.medicion.medicionId));
            assert.equal(await entorno.contarMediciones(jass), ronda + 1);
            assert.equal(await entorno.contarReservas(jass), ronda + 1);
          }
        }));
    }

    test('10 envíos simultáneos idénticos: 1 accepted, 9 duplicate, mismo medicionId y una sola medición', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        for (let ronda = 0; ronda < opciones.repeticiones; ronda++) {
          const c = comando();
          // Cada envío usa su propia unidad de trabajo; el retardo mantiene tomada la reserva.
          const resultados = await Promise.all(
            Array.from({ length: 10 }, () => casoDeUso(retrasarGuardar(50)).ejecutar(c, actor, 'sincronizada')),
          );
          const tipos = resultados.map((r) => r.resultado).sort();
          assert.deepEqual(tipos, ['accepted', ...Array<string>(9).fill('duplicate')], `ronda ${ronda}`);
          const ids = new Set(resultados.map((r) => (r.resultado === 'accepted' || r.resultado === 'duplicate' ? r.medicion.medicionId : '')));
          assert.equal(ids.size, 1, `un solo medicionId en la ronda ${ronda}`);
          assert.equal(await entorno.contarMediciones(jass), ronda + 1, `mediciones en la ronda ${ronda}`);
          assert.equal(await entorno.contarReservas(jass), ronda + 1, `reservas en la ronda ${ronda}`);
        }
      }));

    test('2 envíos simultáneos con el mismo operationId y valores distintos: 1 accepted y 1 conflict', () =>
      conEscenario(async ({ entorno, jass, actor, casoDeUso, comando }) => {
        for (let ronda = 0; ronda < opciones.repeticiones; ronda++) {
          const c = comando();
          const resultados = await Promise.all([
            casoDeUso(retrasarGuardar(50)).ejecutar(c, actor, 'sincronizada'),
            casoDeUso(retrasarGuardar(50)).ejecutar({ ...c, valor: 1.25 }, actor, 'sincronizada'),
          ]);
          assert.deepEqual(resultados.map((r) => r.resultado).sort(), ['accepted', 'conflict'], `ronda ${ronda}`);
          assert.equal(await entorno.contarMediciones(jass), ronda + 1, `mediciones en la ronda ${ronda}`);
        }
      }));
  });
}
