/**
 * Órdenes de plataforma, solo por línea de comandos (nunca por HTTP):
 *   npm run crear-plataforma -- <dni> "<nombre>"
 *   npm run crear-jass -- "<JASS>" <dni-del-consejo> "<nombre-del-consejo>"
 *   npm run asignar-documento -- <correo> <dni> "<nombre>"
 *   npm run sembrar-demo
 * Requieren `DATABASE_URL`; la contraseña inicial va en `SIJASS_CLAVE_INICIAL` y nunca se imprime.
 */
import { randomBytes } from 'node:crypto';
import { componer } from './composicion.js';
import { asignarDocumento, crearJass, crearPlataforma, sembrarDemo } from './cli-comandos.js';

const [orden, ...argumentos] = process.argv.slice(2);
const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
const ORDENES = ['crear-jass', 'crear-plataforma', 'asignar-documento', 'sembrar-demo'];

async function main(): Promise<number> {
  if (orden === undefined || !ORDENES.includes(orden)) {
    console.error('Uso: cli crear-plataforma <dni> <nombre> | crear-jass <JASS> <dni> <nombre> | asignar-documento <correo> <dni> <nombre> | sembrar-demo');
    return 2;
  }
  if (databaseUrl === '') {
    console.error('Falta DATABASE_URL.');
    return 1;
  }
  // Las órdenes no emiten tokens de acceso: el secreto de firma es efímero y se descarta.
  const { pool, casos, dependencias } = componer({ databaseUrl, jwtSecret: randomBytes(32).toString('hex') }, 2);
  try {
    if (orden === 'crear-jass') {
      const r = await crearJass(casos, { nombre: argumentos[0], documento: argumentos[1], consejo: argumentos[2] }, process.env);
      console.log(`JASS creada: ${r.jassId}\nPrimer usuario del consejo: ${r.usuarioId}\nDebe cambiar su clave en el primer ingreso.`);
    } else if (orden === 'crear-plataforma') {
      const r = await crearPlataforma(casos, { documento: argumentos[0], nombre: argumentos[1] }, process.env);
      console.log(`Cuenta de plataforma creada: ${r.usuarioId}\nDebe cambiar su clave en el primer ingreso.`);
    } else if (orden === 'asignar-documento') {
      const r = await asignarDocumento(casos, { correo: argumentos[0], documento: argumentos[1], nombre: argumentos[2] });
      console.log(`Documento asignado a la cuenta ${r.usuarioId}.`);
    } else {
      const r = await sembrarDemo(casos, process.env, dependencias.reloj.ahora());
      console.log(`Datos de demostración creados en la JASS ${r.jassId}.\nCuentas (contraseña: la de SIJASS_CLAVE_DEMO):\n${JSON.stringify(r.cuentas, null, 2)}`);
    }
    return 0;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await pool.end();
  }
}

process.exitCode = await main();
