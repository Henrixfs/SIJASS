/** Punto de entrada de la API: `npm run api` (requiere `JWT_SECRET` y `DATABASE_URL`). */
import { crearAplicacion } from './aplicacion.js';
import { componer } from './composicion.js';
import { leerConfiguracion } from './config.js';

const config = leerConfiguracion();
const { pool, casos } = componer(config);
const app = await crearAplicacion({ casos, origenesPermitidos: config.origenesPermitidos, directorioWeb: config.directorioWeb });

const cerrar = async (): Promise<void> => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void cerrar());
process.on('SIGTERM', () => void cerrar());

await app.listen(config.puerto, '0.0.0.0');
console.log(`API SIJASS escuchando en el puerto ${config.puerto}`);
