/**
 * Órdenes de plataforma (design.md D12). Se ofrecen solo por línea de comandos, nunca por
 * HTTP, y leen las contraseñas del entorno para que no queden en el historial del shell.
 */
import type { Casos } from '../aplicacion/casos.js';
import { periodoActual } from '../dominio/padron.js';

export const CORREOS_DEMO = Object.freeze({
  consejo: 'consejo@demo.sijass.pe',
  tesorero: 'tesorero@demo.sijass.pe',
  operador: 'operador@demo.sijass.pe',
  asociados: ['rosa.quispe@demo.sijass.pe', 'luis.huaman@demo.sijass.pe', 'ana.ccori@demo.sijass.pe'],
});

export async function crearJass(
  casos: Casos,
  argumentos: { nombre?: string; correo?: string },
  env: NodeJS.ProcessEnv,
): Promise<{ jassId: string; usuarioId: string }> {
  const clave = env.SIJASS_CLAVE_INICIAL;
  if (clave === undefined || clave === '') {
    throw new Error('Falta SIJASS_CLAVE_INICIAL: la contraseña inicial se lee del entorno, no de un argumento.');
  }
  if (!argumentos.nombre || !argumentos.correo) throw new Error('Uso: crear-jass <nombre> <correo-del-consejo>');
  return casos.crearJass.ejecutar({ nombre: argumentos.nombre, correo: argumentos.correo, contrasena: clave });
}

/** `AAAA-MM` desplazado `atras` meses respecto de otro periodo. */
export function periodoAnterior(periodo: string, atras: number): string {
  const [a, m] = periodo.split('-').map(Number);
  const indice = a * 12 + (m - 1) - atras;
  return `${String(Math.floor(indice / 12)).padStart(4, '0')}-${String((indice % 12) + 1).padStart(2, '0')}`;
}

export interface ResultadoDemo {
  readonly jassId: string;
  readonly correos: typeof CORREOS_DEMO;
}

/**
 * Datos de demostración: una JASS con consejo, tesorero, operador y tres asociados con
 * cuenta (uno al día, uno con pago parcial y uno moroso). Solo con `SIJASS_PERMITIR_DEMO=1`
 * y la contraseña en `SIJASS_CLAVE_DEMO`; nada de esto se versiona.
 */
export async function sembrarDemo(casos: Casos, env: NodeJS.ProcessEnv, ahora: Date): Promise<ResultadoDemo> {
  if (env.SIJASS_PERMITIR_DEMO !== '1') throw new Error('sembrar-demo se niega a ejecutarse sin SIJASS_PERMITIR_DEMO=1 (no usar en producción).');
  const clave = env.SIJASS_CLAVE_DEMO;
  if (clave === undefined || clave === '') throw new Error('Falta SIJASS_CLAVE_DEMO: la contraseña de las cuentas de demostración se lee del entorno.');

  const { jassId } = await casos.crearJass.ejecutar({ nombre: 'JASS Demostración', correo: CORREOS_DEMO.consejo, contrasena: clave });
  await casos.crearPersonal.ejecutar({ jassId, correo: CORREOS_DEMO.tesorero, contrasena: clave, rol: 'tesorero' });
  await casos.crearPersonal.ejecutar({ jassId, correo: CORREOS_DEMO.operador, contrasena: clave, rol: 'operador' });

  const sesion = await casos.autenticar.ejecutar({ correo: CORREOS_DEMO.tesorero, contrasena: clave });
  const tesorero = await casos.autorizar.ejecutar(sesion.tokenAcceso);

  const nombres = ['Rosa Quispe', 'Luis Huamán', 'Ana Ccori'];
  const ids: string[] = [];
  for (let i = 0; i < nombres.length; i++) {
    const a = await casos.registrarAsociado.ejecutar(tesorero, { nombre: nombres[i], documento: `7000000${i + 1}` });
    await casos.crearAcceso.ejecutar(tesorero, a.id, { correo: CORREOS_DEMO.asociados[i], contrasena: clave });
    ids.push(a.id);
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

  return { jassId, correos: CORREOS_DEMO };
}
