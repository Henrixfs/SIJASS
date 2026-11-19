/**
 * Órdenes de plataforma: `npm run crear-jass -- "<nombre>" <correo>` y `npm run sembrar-demo`.
 * Requieren `DATABASE_URL`; la contraseña inicial va en `SIJASS_CLAVE_INICIAL`.
 */
import { randomBytes } from 'node:crypto';
import { componer } from './composicion.js';
import { crearJass, sembrarDemo } from './cli-comandos.js';

const [orden, ...argumentos] = process.argv.slice(2);
const databaseUrl = (process.env.DATABASE_URL ?? '').trim();

async function main(): Promise<number> {
  if (orden !== 'crear-jass' && orden !== 'sembrar-demo') {
    console.error('Uso: cli crear-jass <nombre> <correo> | cli sembrar-demo');
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
      const r = await crearJass(casos, { nombre: argumentos[0], correo: argumentos[1] }, process.env);
      console.log(`JASS creada: ${r.jassId}\nPrimer usuario del consejo: ${r.usuarioId}`);
    } else {
      const r = await sembrarDemo(casos, process.env, dependencias.reloj.ahora());
      console.log(`Datos de demostración creados en la JASS ${r.jassId}.\nCuentas: ${JSON.stringify(r.correos, null, 2)}`);
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
