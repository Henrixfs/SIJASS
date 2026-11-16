/**
 * Batería de contrato de `RepositorioMediciones` (DT06, spec `persistencia-mediciones`).
 * La MISMA batería se ejecuta contra la implementación en memoria (`npm test`) y contra
 * PostgreSQL (`npm run test:integration`). No contiene casos exclusivos de ninguna.
 * Este archivo no termina en `.test.ts`: solo se ejecuta cuando una suite lo invoca.
 */
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ErrorMedicionDuplicada } from '../../dominio/errores.js';
import { crearMedicion, type Medicion } from '../../dominio/medicion.js';
import type { RepositorioMediciones } from '../../dominio/puertos.js';

export interface EntornoRepositorioMediciones {
  readonly repositorio: RepositorioMediciones;
  /** Crea la JASS (si no existe) y un reservorio suyo, para cumplir la precondición de `guardar`. */
  sembrarReservorio(jassId: string, reservorioId: string): Promise<void>;
  cerrar(): Promise<void>;
}

export type FabricaRepositorioMediciones = () => Promise<EntornoRepositorioMediciones>;

const RECEPCION = new Date('2026-10-12T13:10:00.000Z');

interface OpcionesMedicion {
  readonly id?: string;
  readonly valor?: number;
  readonly tomadaEn?: string;
  readonly evidenciaId?: string;
}

/** Medición válida construida por el dominio, para que la batería solo use datos válidos. */
export function medicionDePrueba(jassId: string, reservorioId: string, opciones: OpcionesMedicion = {}): Medicion {
  return crearMedicion(
    {
      operationId: randomUUID(),
      reservorioId,
      metodo: 'colorimetro',
      valor: opciones.valor ?? 0.8,
      unidad: 'mg/L',
      tomadaEn: opciones.tomadaEn ?? '2026-10-12T08:00:00-05:00',
      ...(opciones.evidenciaId === undefined ? {} : { evidenciaId: opciones.evidenciaId }),
    },
    {
      jassId,
      usuarioId: randomUUID(),
      origen: 'en-linea',
      id: opciones.id ?? randomUUID(),
      registradaEn: RECEPCION,
      toleranciaMs: 5 * 60_000,
    },
  );
}

/** Registra la batería de contrato bajo `describe(nombre)`. */
export function probarContratoRepositorioMediciones(nombre: string, fabrica: FabricaRepositorioMediciones): void {
  describe(`contrato RepositorioMediciones — ${nombre}`, () => {
    async function conEntorno(prueba: (entorno: EntornoRepositorioMediciones) => Promise<void>): Promise<void> {
      const entorno = await fabrica();
      try {
        await prueba(entorno);
      } finally {
        await entorno.cerrar();
      }
    }

    test('PT03 — guarda y recupera dentro de la JASS con todos los campos, incluidos JASS y autor', () =>
      conEntorno(async ({ repositorio, sembrarReservorio }) => {
        const jass = randomUUID();
        const reservorio = randomUUID();
        await sembrarReservorio(jass, reservorio);
        const sinEvidencia = medicionDePrueba(jass, reservorio, { valor: 0.35 });
        const conEvidencia = medicionDePrueba(jass, reservorio, { valor: 1.234, evidenciaId: randomUUID() });

        await repositorio.guardar(sinEvidencia);
        await repositorio.guardar(conEvidencia);

        const leida = await repositorio.buscar(jass, sinEvidencia.id);
        assert.deepStrictEqual(leida, sinEvidencia);
        assert.equal(leida?.jassId, jass);
        assert.equal(leida?.registradoPor, sinEvidencia.registradoPor);
        assert.ok(leida && !('evidenciaId' in leida), 'sin evidencia no debe aparecer la clave evidenciaId');
        assert.deepStrictEqual(await repositorio.buscar(jass, conEvidencia.id), conEvidencia);
      }));

    test('un (jassId, id) repetido lanza ErrorMedicionDuplicada y no modifica la medición existente', () =>
      conEntorno(async ({ repositorio, sembrarReservorio }) => {
        const jass = randomUUID();
        const reservorio = randomUUID();
        await sembrarReservorio(jass, reservorio);
        const original = medicionDePrueba(jass, reservorio, { valor: 0.5 });
        const repetida = medicionDePrueba(jass, reservorio, { id: original.id, valor: 2 });

        await repositorio.guardar(original);
        await assert.rejects(repositorio.guardar(repetida), (error: unknown) => {
          assert.ok(error instanceof ErrorMedicionDuplicada, `se esperaba ErrorMedicionDuplicada, se obtuvo ${String(error)}`);
          assert.equal(error.jassId, jass);
          assert.equal(error.medicionId, original.id);
          return true;
        });
        assert.deepStrictEqual(await repositorio.buscar(jass, original.id), original);
      }));

    test('el mismo id en dos JASS no es un duplicado y cada una se recupera solo desde su JASS', () =>
      conEntorno(async ({ repositorio, sembrarReservorio }) => {
        const [jassA, jassB, reservorioA, reservorioB, id] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
        await sembrarReservorio(jassA, reservorioA);
        await sembrarReservorio(jassB, reservorioB);
        const enA = medicionDePrueba(jassA, reservorioA, { id, valor: 0.4 });
        const enB = medicionDePrueba(jassB, reservorioB, { id, valor: 0.9 });

        await repositorio.guardar(enA);
        await repositorio.guardar(enB);

        assert.deepStrictEqual(await repositorio.buscar(jassA, id), enA);
        assert.deepStrictEqual(await repositorio.buscar(jassB, id), enB);
      }));

    test('buscar desde otra JASS equivale a buscar un identificador inexistente', () =>
      conEntorno(async ({ repositorio, sembrarReservorio }) => {
        const [jassA, jassB, reservorioA] = [randomUUID(), randomUUID(), randomUUID()];
        await sembrarReservorio(jassA, reservorioA);
        const medicion = medicionDePrueba(jassA, reservorioA);
        await repositorio.guardar(medicion);

        assert.equal(await repositorio.buscar(jassB, medicion.id), undefined);
        assert.equal(await repositorio.buscar(jassA, randomUUID()), undefined);
      }));

    test('listar desde otra JASS las mediciones de un reservorio ajeno devuelve una lista vacía', () =>
      conEntorno(async ({ repositorio, sembrarReservorio }) => {
        const [jassA, jassB, reservorioA, reservorioB] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
        await sembrarReservorio(jassA, reservorioA);
        await sembrarReservorio(jassB, reservorioB);
        await repositorio.guardar(medicionDePrueba(jassA, reservorioA));

        assert.deepStrictEqual(await repositorio.listar(jassB, { reservorioId: reservorioA }), []);
        assert.equal((await repositorio.listar(jassA, { reservorioId: reservorioA })).length, 1);
      }));

    test('listar devuelve solo ese reservorio de la JASS, por toma descendente y luego por id', () =>
      conEntorno(async ({ repositorio, sembrarReservorio }) => {
        const [jass, otraJass, reservorio, otroReservorio, reservorioAjeno] = [
          randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(),
        ];
        await sembrarReservorio(jass, reservorio);
        await sembrarReservorio(jass, otroReservorio);
        await sembrarReservorio(otraJass, reservorioAjeno);

        const [idMenor, idMayor] = [randomUUID(), randomUUID()].sort();
        const antigua = medicionDePrueba(jass, reservorio, { tomadaEn: '2026-10-10T08:00:00Z' });
        const reciente = medicionDePrueba(jass, reservorio, { tomadaEn: '2026-10-12T09:00:00Z' });
        const empateMayor = medicionDePrueba(jass, reservorio, { id: idMayor, tomadaEn: '2026-10-11T08:00:00Z' });
        const empateMenor = medicionDePrueba(jass, reservorio, { id: idMenor, tomadaEn: '2026-10-11T08:00:00Z' });
        // Se guardan en desorden para que el orden no dependa del de inserción.
        for (const m of [empateMayor, antigua, reciente, empateMenor]) await repositorio.guardar(m);
        await repositorio.guardar(medicionDePrueba(jass, otroReservorio, { tomadaEn: '2026-10-12T10:00:00Z' }));
        await repositorio.guardar(medicionDePrueba(otraJass, reservorioAjeno, { tomadaEn: '2026-10-12T10:00:00Z' }));

        const listado = await repositorio.listar(jass, { reservorioId: reservorio });
        assert.deepStrictEqual(listado, [reciente, empateMenor, empateMayor, antigua]);
      }));
  });
}
