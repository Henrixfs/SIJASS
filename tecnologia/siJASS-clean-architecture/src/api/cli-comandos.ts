/**
 * Órdenes de plataforma (design.md D12 de s1b y D13 de s2a). Se ofrecen solo por línea de
 * comandos, nunca por HTTP, y leen las contraseñas del entorno para que no queden en el
 * historial del shell ni se impriman.
 */
import type { Casos } from '../aplicacion/casos.js';
import { periodoActual } from '../dominio/padron.js';

/** DNIs fijos de la demostración (8 dígitos); la contraseña de todas las cuentas sale del entorno. */
export const CUENTAS_DEMO = Object.freeze({
  plataforma: { documento: '10000000', nombre: 'Equipo SIJASS' },
  consejo: { documento: '10000001', nombre: 'Ana Morales' },
  tesorero: { documento: '10000002', nombre: 'Carlos Rojas' },
  operador: { documento: '10000003', nombre: 'Julia Flores' },
  /** Operador con cambio de clave pendiente: sirve para probar el primer ingreso. */
  operadorNuevo: { documento: '10000004', nombre: 'Pedro Vargas' },
  asociados: [
    { documento: '70000001', nombre: 'Rosa Quispe' },
    { documento: '70000002', nombre: 'Luis Huamán' },
    { documento: '70000003', nombre: 'Ana Ccori' },
  ],
});

function claveDelEntorno(env: NodeJS.ProcessEnv, variable: string, uso: string): string {
  const clave = env[variable];
  if (clave === undefined || clave === '') {
    throw new Error(`Falta ${variable}: la contraseña inicial se lee del entorno, no de un argumento. ${uso}`);
  }
  return clave;
}

/** `crear-jass "<JASS>" <dni-del-consejo> "<nombre-del-consejo>"`; la clave va en `SIJASS_CLAVE_INICIAL`. */
export async function crearJass(
  casos: Casos,
  argumentos: { nombre?: string; documento?: string; consejo?: string },
  env: NodeJS.ProcessEnv,
): Promise<{ jassId: string; usuarioId: string }> {
  const clave = claveDelEntorno(env, 'SIJASS_CLAVE_INICIAL', 'Uso: crear-jass <JASS> <dni> <nombre-del-consejo>');
  if (!argumentos.nombre || !argumentos.documento || !argumentos.consejo) {
    throw new Error('Uso: crear-jass "<nombre de la JASS>" <dni del consejo> "<nombre del consejo>"');
  }
  const r = await casos.crearJass.ejecutar({ nombre: argumentos.nombre, consejo: { nombre: argumentos.consejo, documento: argumentos.documento }, contrasena: clave });
  return { jassId: r.jassId, usuarioId: r.usuarioId };
}

/** `crear-plataforma <dni> "<nombre>"`; la clave va en `SIJASS_CLAVE_INICIAL`. */
export async function crearPlataforma(
  casos: Casos,
  argumentos: { documento?: string; nombre?: string },
  env: NodeJS.ProcessEnv,
): Promise<{ usuarioId: string }> {
  const clave = claveDelEntorno(env, 'SIJASS_CLAVE_INICIAL', 'Uso: crear-plataforma <dni> <nombre>');
  if (!argumentos.documento || !argumentos.nombre) throw new Error('Uso: crear-plataforma <dni> "<nombre>"');
  return casos.crearPlataforma.ejecutar({ nombre: argumentos.nombre, documento: argumentos.documento, contrasena: clave });
}

/** `asignar-documento <correo> <dni> "<nombre>"`: da DNI y nombre a una cuenta anterior a `s2a`. */
export async function asignarDocumento(casos: Casos, argumentos: { correo?: string; documento?: string; nombre?: string }): Promise<{ usuarioId: string }> {
  if (!argumentos.correo || !argumentos.documento || !argumentos.nombre) throw new Error('Uso: asignar-documento <correo> <dni> "<nombre>"');
  return casos.asignarDocumento.ejecutar({ correo: argumentos.correo, documento: argumentos.documento, nombre: argumentos.nombre });
}

/** `AAAA-MM` desplazado `atras` meses respecto de otro periodo. */
export function periodoAnterior(periodo: string, atras: number): string {
  const [a, m] = periodo.split('-').map(Number);
  const indice = a * 12 + (m - 1) - atras;
  return `${String(Math.floor(indice / 12)).padStart(4, '0')}-${String((indice % 12) + 1).padStart(2, '0')}`;
}

export interface ResultadoDemo {
  readonly jassId: string;
  readonly cuentas: typeof CUENTAS_DEMO;
}

/**
 * Datos de demostración: una cuenta de plataforma, una JASS con Consejo, Tesorería, Operador y
 * tres asociados con cuenta (uno al día, uno con pago parcial y uno moroso), y un Operador con
 * cambio de clave pendiente. Todas entran con su DNI y la contraseña de `SIJASS_CLAVE_DEMO`.
 * Solo con `SIJASS_PERMITIR_DEMO=1`; nada de esto se versiona.
 */
export async function sembrarDemo(casos: Casos, env: NodeJS.ProcessEnv, ahora: Date): Promise<ResultadoDemo> {
  if (env.SIJASS_PERMITIR_DEMO !== '1') throw new Error('sembrar-demo se niega a ejecutarse sin SIJASS_PERMITIR_DEMO=1 (no usar en producción).');
  const clave = env.SIJASS_CLAVE_DEMO;
  if (clave === undefined || clave === '') throw new Error('Falta SIJASS_CLAVE_DEMO: la contraseña de las cuentas de demostración se lee del entorno.');

  await casos.crearPlataforma.ejecutar({ ...CUENTAS_DEMO.plataforma, contrasena: clave, debeCambiarContrasena: false });
  // El primer Consejo nace con cambio pendiente; en la demostración se omite para entrar directo.
  const { jassId } = await casos.crearJass.ejecutar({ nombre: 'JASS Demostración', consejo: CUENTAS_DEMO.consejo, contrasena: clave, debeCambiarContrasena: false });
  await casos.crearPersonal.ejecutar({ jassId, ...CUENTAS_DEMO.tesorero, contrasena: clave, rol: 'tesorero' });
  await casos.crearPersonal.ejecutar({ jassId, ...CUENTAS_DEMO.operador, contrasena: clave, rol: 'operador' });
  await casos.crearPersonal.ejecutar({ jassId, ...CUENTAS_DEMO.operadorNuevo, contrasena: clave, rol: 'operador', debeCambiarContrasena: true });

  const sesion = await casos.autenticar.ejecutar({ documento: CUENTAS_DEMO.tesorero.documento, contrasena: clave });
  const tesorero = await casos.autorizar.ejecutar(sesion.tokenAcceso);
  if (tesorero.perfil !== 'personal') throw new Error('la cuenta de tesorería de demostración no es de personal');

  const ids: string[] = [];
  for (const a of CUENTAS_DEMO.asociados) {
    const registrado = await casos.registrarAsociado.ejecutar(tesorero, { nombre: a.nombre, documento: a.documento });
    const { claveTemporal } = await casos.crearAcceso.ejecutar(tesorero, registrado.id);
    // Las cuentas de asociados nacen con una clave generada. Para usar una sola contraseña en la
    // demostración, cada asociado la cambia con su propia sesión: el mismo camino que una familia real.
    const sesionAsociado = await casos.autenticar.ejecutar({ documento: a.documento, contrasena: claveTemporal });
    const actorAsociado = await casos.autorizar.ejecutar(sesionAsociado.tokenAcceso);
    await casos.cambiarContrasena.ejecutar(actorAsociado, { contrasenaActual: claveTemporal, contrasenaNueva: clave });
    ids.push(registrado.id);
  }

  const actual = periodoActual(ahora);
  for (const atras of [2, 1, 0]) await casos.generarCuotas.ejecutar(tesorero, { periodo: periodoAnterior(actual, atras), importeCentimos: 1500 });

  let n = 0;
  const clavePago = () => `d0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const cuotasDe = async (id: string) => (await casos.estadoDeCuenta.ejecutar(tesorero, id)).cuotas;
  // Rosa: al día. Luis: pagó una cuota completa y la mitad de otra. Ana: sin pagos (morosa).
  for (const c of await cuotasDe(ids[0])) await casos.registrarPago.ejecutar(tesorero, { cuotaId: c.id, importeCentimos: c.importeCentimos, comprobante: `DEMO-R-${c.periodo}` }, clavePago());
  const luis = await cuotasDe(ids[1]);
  await casos.registrarPago.ejecutar(tesorero, { cuotaId: luis[0].id, importeCentimos: luis[0].importeCentimos, comprobante: `DEMO-L-${luis[0].periodo}` }, clavePago());
  await casos.registrarPago.ejecutar(tesorero, { cuotaId: luis[1].id, importeCentimos: 750, comprobante: `DEMO-L-${luis[1].periodo}` }, clavePago());

  return { jassId, cuentas: CUENTAS_DEMO };
}
