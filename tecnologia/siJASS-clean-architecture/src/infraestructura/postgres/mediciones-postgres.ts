import type { CodigoMetodo, UnidadMedicion } from '../../dominio/catalogo.js';
import { ErrorMedicionDuplicada } from '../../dominio/errores.js';
import type { EstadoMedicion, Medicion, Origen } from '../../dominio/medicion.js';
import type { FiltroMediciones, RepositorioMediciones } from '../../dominio/puertos.js';
import type { Consultable } from './consultable.js';

/** Fila de `medicion` tal como la devuelve `pg`. */
interface FilaMedicion {
  id: string;
  jass_id: string;
  reservorio_id: string;
  metodo: string;
  valor: string; // `numeric` llega como texto (design.md D8)
  unidad: string;
  tomada_en: Date; // `timestamptz` llega como Date
  registrada_en: Date;
  registrado_por: string;
  origen: string;
  evidencia_id: string | null;
  estado: string;
  revision: number;
}

const COLUMNAS =
  'id, jass_id, reservorio_id, metodo, valor, unidad, tomada_en, registrada_en, registrado_por, origen, evidencia_id, estado, revision';

/** Conversión local de los tipos de `pg`; no se registran analizadores globales. */
function aMedicion(fila: FilaMedicion): Medicion {
  return Object.freeze({
    id: fila.id,
    jassId: fila.jass_id,
    reservorioId: fila.reservorio_id,
    metodo: fila.metodo as CodigoMetodo,
    valor: Number(fila.valor),
    unidad: fila.unidad as UnidadMedicion,
    tomadaEn: fila.tomada_en.toISOString(),
    registradaEn: fila.registrada_en.toISOString(),
    registradoPor: fila.registrado_por,
    origen: fila.origen as Origen,
    // Ausente (no `undefined`) cuando el comando no aportó evidencia, igual que en memoria.
    ...(fila.evidencia_id === null ? {} : { evidenciaId: fila.evidencia_id }),
    estado: fila.estado as EstadoMedicion,
    revision: fila.revision,
  });
}

/** Implementación PostgreSQL de `RepositorioMediciones`. */
export class MedicionesPostgres implements RepositorioMediciones {
  constructor(private readonly db: Consultable) {}

  async guardar(medicion: Medicion): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO medicion (${COLUMNAS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          medicion.id,
          medicion.jassId,
          medicion.reservorioId,
          medicion.metodo,
          // Texto: `numeric` conserva el decimal exacto que escribe JavaScript.
          String(medicion.valor),
          medicion.unidad,
          medicion.tomadaEn,
          medicion.registradaEn,
          medicion.registradoPor,
          medicion.origen,
          medicion.evidenciaId ?? null,
          medicion.estado,
          medicion.revision,
        ],
      );
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      // DT06: el mismo error de dominio que la memoria, no un error genérico del controlador.
      if (e.code === '23505' && e.constraint === 'medicion_pkey') {
        throw new ErrorMedicionDuplicada(medicion.jassId, medicion.id);
      }
      throw error;
    }
  }

  async buscar(jassId: string, id: string): Promise<Medicion | undefined> {
    const { rows } = await this.db.query<FilaMedicion>(`SELECT ${COLUMNAS} FROM medicion WHERE jass_id = $1 AND id = $2`, [
      jassId,
      id,
    ]);
    return rows.length === 0 ? undefined : aMedicion(rows[0]);
  }

  async listar(jassId: string, filtro: FiltroMediciones): Promise<Medicion[]> {
    const { rows } = await this.db.query<FilaMedicion>(
      `SELECT ${COLUMNAS} FROM medicion WHERE jass_id = $1 AND reservorio_id = $2 ORDER BY tomada_en DESC, id ASC`,
      [jassId, filtro.reservorioId],
    );
    return rows.map(aMedicion);
  }
}
