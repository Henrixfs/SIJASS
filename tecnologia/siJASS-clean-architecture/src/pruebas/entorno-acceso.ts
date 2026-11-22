/**
 * Entorno compartido de las pruebas de acceso, padrón y pagos: dependencias deterministas,
 * casos de uso ya construidos y una siembra de JASS, personal y asociados. Sirve igual para
 * la memoria (pruebas unitarias) y para PostgreSQL (integración y API).
 */
import type { DependenciasAcceso } from '../aplicacion/acceso/comun.js';
import { construirCasos, type Casos } from '../aplicacion/casos.js';
import type { ContextoAcceso } from '../dominio/acceso.js';
import type { GeneradorIds, Reloj, UnidadDeTrabajo } from '../dominio/puertos.js';
import { UnidadDeTrabajoMemoria } from '../infraestructura/memoria.js';
import { cargarCorpus, DIRECTORIO_CORPUS_EJEMPLO } from '../infraestructura/corpus-archivo.js';
import type { Corpus } from '../dominio/asistente/corpus.js';
import { fileURLToPath } from 'node:url';
import type { UnidadDeTrabajoAcceso } from '../dominio/puertos-acceso.js';
import { ContrasenasScrypt } from '../infraestructura/seguridad/contrasenas-scrypt.js';
import { TokensHs256 } from '../infraestructura/seguridad/tokens-hs256.js';
import { GeneradorIdsAleatorio } from '../infraestructura/sistema.js';
import { GeneradorIdsSecuencial, RelojFijo } from './dobles.js';

export { construirCasos, type Casos };

export const SECRETO_PRUEBAS = 'secreto-solo-para-pruebas-0123456789abcdef';
export const CLAVE = 'Clave-de-prueba-123';
/** 2026-11-19 10:00 en Lima: el periodo vigente es 2026-11. */
export const AHORA_PRUEBAS = '2026-11-19T15:00:00.000Z';

export interface Entorno {
  readonly dependencias: DependenciasAcceso;
  readonly casos: Casos;
  readonly reloj: RelojFijo;
}

/** Dependencias con reloj fijo y contraseñas baratas. `ids` aleatorios por defecto (PostgreSQL). */
export function crearEntorno(
  unidadDeTrabajo: UnidadDeTrabajoAcceso,
  opciones: { secuencial?: boolean; reloj?: RelojFijo; mediciones?: UnidadDeTrabajo; corpus?: Corpus } = {},
): Entorno {
  const reloj = opciones.reloj ?? new RelojFijo(AHORA_PRUEBAS);
  const ids: GeneradorIds = opciones.secuencial ? new GeneradorIdsSecuencial() : new GeneradorIdsAleatorio();
  const dependencias: DependenciasAcceso = {
    unidadDeTrabajo,
    reloj: reloj as Reloj,
    ids,
    contrasenas: new ContrasenasScrypt({ N: 1024, r: 8, p: 1 }),
    tokens: new TokensHs256(SECRETO_PRUEBAS),
  };
  return { dependencias, casos: construirCasos(dependencias, opciones.mediciones ?? new UnidadDeTrabajoMemoria(), opciones.corpus ?? cargarCorpus(fileURLToPath(DIRECTORIO_CORPUS_EJEMPLO))), reloj };
}

export interface Cuenta {
  readonly correo: string;
  readonly usuarioId: string;
  readonly actor: ContextoAcceso;
}

export interface Escenario {
  readonly jassA: string;
  readonly jassB: string;
  readonly consejoA: Cuenta;
  readonly tesoreroA: Cuenta;
  readonly operadorA: Cuenta;
  readonly tesoreroB: Cuenta;
  readonly consejoB: Cuenta;
  readonly operadorB: Cuenta;
  readonly asociadoA1: { id: string; cuenta: Cuenta };
  readonly asociadoA2: { id: string; cuenta: Cuenta };
  readonly asociadoB1: { id: string; cuenta: Cuenta };
}

async function actorDe(e: Entorno, correo: string): Promise<Cuenta> {
  const sesion = await e.casos.autenticar.ejecutar({ correo, contrasena: CLAVE });
  const actor = await e.casos.autorizar.ejecutar(sesion.tokenAcceso);
  return { correo, usuarioId: actor.usuarioId, actor };
}

/** Sufijo aleatorio para que varias siembras convivan en una misma base de PostgreSQL. */
const sufijo = () => Math.random().toString(36).slice(2, 10);

/**
 * Dos JASS. En A: consejo, tesorero, operador y dos asociados con cuenta; en B: consejo, tesorero,
 * operador y un asociado con cuenta. Sin cuotas ni pagos.
 */
export async function sembrarEscenario(e: Entorno): Promise<Escenario> {
  const s = sufijo();
  const correo = (nombre: string) => `${nombre}.${s}@prueba.pe`;

  const a = await e.casos.crearJass.ejecutar({ nombre: `JASS A ${s}`, correo: correo('consejo-a'), contrasena: CLAVE });
  const b = await e.casos.crearJass.ejecutar({ nombre: `JASS B ${s}`, correo: correo('consejo-b'), contrasena: CLAVE });
  await e.casos.crearPersonal.ejecutar({ jassId: a.jassId, correo: correo('tesorero-a'), contrasena: CLAVE, rol: 'tesorero' });
  await e.casos.crearPersonal.ejecutar({ jassId: a.jassId, correo: correo('operador-a'), contrasena: CLAVE, rol: 'operador' });
  await e.casos.crearPersonal.ejecutar({ jassId: b.jassId, correo: correo('tesorero-b'), contrasena: CLAVE, rol: 'tesorero' });
  await e.casos.crearPersonal.ejecutar({ jassId: b.jassId, correo: correo('operador-b'), contrasena: CLAVE, rol: 'operador' });

  const consejoA = await actorDe(e, correo('consejo-a'));
  const tesoreroA = await actorDe(e, correo('tesorero-a'));
  const operadorA = await actorDe(e, correo('operador-a'));
  const tesoreroB = await actorDe(e, correo('tesorero-b'));
  const consejoB = await actorDe(e, correo('consejo-b'));
  const operadorB = await actorDe(e, correo('operador-b'));

  async function asociado(tesorero: Cuenta, nombre: string, documento: string) {
    const a1 = await e.casos.registrarAsociado.ejecutar(tesorero.actor, { nombre, documento });
    const cuentaCorreo = correo(`asociado-${documento.toLowerCase()}`);
    await e.casos.crearAcceso.ejecutar(tesorero.actor, a1.id, { correo: cuentaCorreo, contrasena: CLAVE });
    return { id: a1.id, cuenta: await actorDe(e, cuentaCorreo) };
  }

  return {
    jassA: a.jassId,
    jassB: b.jassId,
    consejoA,
    tesoreroA,
    operadorA,
    tesoreroB,
    consejoB,
    operadorB,
    asociadoA1: await asociado(tesoreroA, 'Rosa Quispe', `A1${s}`),
    asociadoA2: await asociado(tesoreroA, 'Luis Huamán', `A2${s}`),
    asociadoB1: await asociado(tesoreroB, 'Ana Ccori', `B1${s}`),
  };
}

let claveSecuencia = 0;
/** UUID distinto en cada llamada, para las claves de idempotencia de las pruebas. */
export function nuevaClave(): string {
  claveSecuencia += 1;
  return `10000000-0000-4000-8000-${String(claveSecuencia).padStart(12, '0')}`;
}
