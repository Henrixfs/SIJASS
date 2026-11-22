import pg from 'pg';
import type { DependenciasAcceso } from '../aplicacion/acceso/comun.js';
import { construirCasos, type Casos } from '../aplicacion/casos.js';
import { cargarCorpus, DIRECTORIO_CORPUS_EJEMPLO } from '../infraestructura/corpus-archivo.js';
import { fileURLToPath } from 'node:url';
import { UnidadDeTrabajoPostgres } from '../infraestructura/postgres/unidad-de-trabajo-postgres.js';
import { UnidadDeTrabajoAccesoPostgres } from '../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { ContrasenasScrypt } from '../infraestructura/seguridad/contrasenas-scrypt.js';
import { TokensHs256 } from '../infraestructura/seguridad/tokens-hs256.js';
import { GeneradorIdsAleatorio, RelojSistema } from '../infraestructura/sistema.js';
import type { ConfiguracionApi } from './config.js';

export interface Composicion {
  readonly pool: pg.Pool;
  readonly casos: Casos;
  readonly dependencias: DependenciasAcceso;
}

/** Composición de producción: PostgreSQL, `scrypt` con parámetros de producción y reloj real. */
export function componer(config: Pick<ConfiguracionApi, 'databaseUrl' | 'jwtSecret'> & { corpusDir?: string }, tamanoPool = 10): Composicion {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: tamanoPool });
  const dependencias: DependenciasAcceso = {
    unidadDeTrabajo: new UnidadDeTrabajoAccesoPostgres(pool),
    reloj: new RelojSistema(),
    ids: new GeneradorIdsAleatorio(),
    contrasenas: new ContrasenasScrypt(),
    tokens: new TokensHs256(config.jwtSecret),
  };
  return { pool, dependencias, casos: construirCasos(dependencias, new UnidadDeTrabajoPostgres(pool), cargarCorpus(config.corpusDir ?? fileURLToPath(DIRECTORIO_CORPUS_EJEMPLO))) };
}
