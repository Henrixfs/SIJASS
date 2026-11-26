/**
 * Entorno compartido de las pruebas de acceso, padrón y pagos: dependencias deterministas,
 * casos de uso ya construidos y una siembra de JASS, personal y asociados. Sirve igual para
 * la memoria (pruebas unitarias) y para PostgreSQL (integración y API).
 */
import type { DependenciasAcceso } from '../aplicacion/acceso/comun.js';
import { construirCasos, type Casos } from '../aplicacion/casos.js';
import type { ContextoAcceso, ContextoPlataforma } from '../dominio/acceso.js';
import type { GeneradorIds, Reloj, UnidadDeTrabajo } from '../dominio/puertos.js';
import { UnidadDeTrabajoMemoria } from '../infraestructura/memoria.js';
import { cargarCorpus, DIRECTORIO_CORPUS_EJEMPLO } from '../infraestructura/corpus-archivo.js';
import type { Corpus } from '../dominio/asistente/corpus.js';
import { fileURLToPath } from 'node:url';
import type { LimitadorDeIntentos, RepositoriosAcceso, UnidadDeTrabajoAcceso } from '../dominio/puertos-acceso.js';
import { ContrasenasScrypt } from '../infraestructura/seguridad/contrasenas-scrypt.js';
import { TokensHs256 } from '../infraestructura/seguridad/tokens-hs256.js';
import { GeneradorClavesAleatorio } from '../infraestructura/seguridad/generador-claves.js';
import { LimitadorDeIntentosMemoria } from '../infraestructura/limitador-memoria.js';
import { GeneradorIdsAleatorio } from '../infraestructura/sistema.js';
import { GeneradorIdsSecuencial, RelojFijo } from './dobles.js';

export { construirCasos, type Casos };

/** Para las consultas directas de las pruebas: identidad y auditoría, en modo de sistema (sin JASS fijada). */
export interface UnidadDeTrabajoSistema {
  ejecutar<T>(trabajo: (repos: RepositoriosAcceso) => Promise<T>): Promise<T>;
}

export function comoSistema(unidad: UnidadDeTrabajoAcceso): UnidadDeTrabajoSistema {
  return { ejecutar: (trabajo) => unidad.ejecutar(trabajo, { sistema: true }) };
}

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
  opciones: { secuencial?: boolean; reloj?: RelojFijo; mediciones?: UnidadDeTrabajo; corpus?: Corpus; limitador?: LimitadorDeIntentos } = {},
): Entorno {
  const reloj = opciones.reloj ?? new RelojFijo(AHORA_PRUEBAS);
  const ids: GeneradorIds = opciones.secuencial ? new GeneradorIdsSecuencial() : new GeneradorIdsAleatorio();
  const dependencias: DependenciasAcceso = {
    unidadDeTrabajo,
    reloj: reloj as Reloj,
    ids,
    contrasenas: new ContrasenasScrypt({ N: 1024, r: 8, p: 1 }),
    tokens: new TokensHs256(SECRETO_PRUEBAS),
    claves: new GeneradorClavesAleatorio(),
    // Las pruebas no envían origen salvo las del límite, que construyen su propio entorno.
    limitador: opciones.limitador ?? new LimitadorDeIntentosMemoria(),
  };
  return { dependencias, casos: construirCasos(dependencias, opciones.mediciones ?? new UnidadDeTrabajoMemoria(), opciones.corpus ?? cargarCorpus(fileURLToPath(DIRECTORIO_CORPUS_EJEMPLO))), reloj };
}

export interface Cuenta {
  /** DNI con el que inicia sesión. */
  readonly documento: string;
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

export function esActorDeJass(actor: ContextoAcceso | ContextoPlataforma): actor is ContextoAcceso {
  return actor.perfil !== 'plataforma';
}

/** Inicia sesión por DNI y devuelve la cuenta con su actor de JASS. */
export async function actorDe(e: Entorno, documento: string, clave: string = CLAVE): Promise<Cuenta> {
  const sesion = await e.casos.autenticar.ejecutar({ documento, contrasena: clave });
  const actor = await e.casos.autorizar.ejecutar(sesion.tokenAcceso);
  if (!esActorDeJass(actor)) throw new Error('se esperaba un actor de una JASS');
  return { documento, usuarioId: actor.usuarioId, actor };
}

let dniSecuencia = Math.floor(Math.random() * 40_000_000);
/** DNI de 8 dígitos distinto en cada llamada: el documento es único en todo el sistema. */
export function nuevoDni(): string {
  dniSecuencia += 1 + Math.floor(Math.random() * 7);
  return String(20_000_000 + dniSecuencia);
}

/** Sufijo aleatorio para que varias siembras convivan en una misma base de PostgreSQL. */
const sufijo = () => Math.random().toString(36).slice(2, 10);

/**
 * Dos JASS. En A: consejo, tesorero, operador y dos asociados con cuenta; en B: consejo, tesorero,
 * operador y un asociado con cuenta. Sin cuotas ni pagos. Todas entran con su DNI y `CLAVE`.
 */
export async function sembrarEscenario(e: Entorno): Promise<Escenario> {
  const s = sufijo();
  const dni = {
    consejoA: nuevoDni(), tesoreroA: nuevoDni(), operadorA: nuevoDni(),
    consejoB: nuevoDni(), tesoreroB: nuevoDni(), operadorB: nuevoDni(),
  };

  const a = await e.casos.crearJass.ejecutar({ nombre: `JASS A ${s}`, consejo: { nombre: 'Consejo A', documento: dni.consejoA }, contrasena: CLAVE, debeCambiarContrasena: false });
  const b = await e.casos.crearJass.ejecutar({ nombre: `JASS B ${s}`, consejo: { nombre: 'Consejo B', documento: dni.consejoB }, contrasena: CLAVE, debeCambiarContrasena: false });
  await e.casos.crearPersonal.ejecutar({ jassId: a.jassId, nombre: 'Tesorero A', documento: dni.tesoreroA, contrasena: CLAVE, rol: 'tesorero' });
  await e.casos.crearPersonal.ejecutar({ jassId: a.jassId, nombre: 'Operador A', documento: dni.operadorA, contrasena: CLAVE, rol: 'operador' });
  await e.casos.crearPersonal.ejecutar({ jassId: b.jassId, nombre: 'Tesorero B', documento: dni.tesoreroB, contrasena: CLAVE, rol: 'tesorero' });
  await e.casos.crearPersonal.ejecutar({ jassId: b.jassId, nombre: 'Operador B', documento: dni.operadorB, contrasena: CLAVE, rol: 'operador' });

  const consejoA = await actorDe(e, dni.consejoA);
  const tesoreroA = await actorDe(e, dni.tesoreroA);
  const operadorA = await actorDe(e, dni.operadorA);
  const tesoreroB = await actorDe(e, dni.tesoreroB);
  const consejoB = await actorDe(e, dni.consejoB);
  const operadorB = await actorDe(e, dni.operadorB);

  /** Registra al asociado, le crea el acceso (clave generada) y la cambia por `CLAVE`: el camino de una familia. */
  async function asociado(tesorero: Cuenta, nombre: string) {
    const documento = nuevoDni();
    const a1 = await e.casos.registrarAsociado.ejecutar(tesorero.actor, { nombre, documento });
    const { claveTemporal } = await e.casos.crearAcceso.ejecutar(tesorero.actor, a1.id);
    const temporal = await actorDe(e, documento, claveTemporal);
    await e.casos.cambiarContrasena.ejecutar(temporal.actor, { contrasenaActual: claveTemporal, contrasenaNueva: CLAVE });
    return { id: a1.id, cuenta: await actorDe(e, documento) };
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
    asociadoA1: await asociado(tesoreroA, 'Rosa Quispe'),
    asociadoA2: await asociado(tesoreroA, 'Luis Huamán'),
    asociadoB1: await asociado(tesoreroB, 'Ana Ccori'),
  };
}

let claveSecuencia = 0;
/** UUID distinto en cada llamada, para las claves de idempotencia de las pruebas. */
export function nuevaClave(): string {
  claveSecuencia += 1;
  return `10000000-0000-4000-8000-${String(claveSecuencia).padStart(12, '0')}`;
}
