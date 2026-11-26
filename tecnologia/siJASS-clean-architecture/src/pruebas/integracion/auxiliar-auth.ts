import { once } from 'node:events';
import { AutenticarUsuario } from '../../aplicacion/acceso/sesiones.js';
import { UnidadDeTrabajoAccesoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { CLAVE, crearEntorno } from '../entorno-acceso.js';
import { crearPool } from './entorno.js';

const pool = crearPool();
const entorno = crearEntorno(new UnidadDeTrabajoAccesoPostgres(pool));
const documento = process.argv[2];
const correcta = process.argv[3] === 'correcta';
const original = entorno.dependencias.contrasenas;
const contrasenas = {
  derivar: original.derivar.bind(original),
  verificar: async (clave: string, hash: string): Promise<boolean> => {
    if (correcta) {
      process.send?.('verificando');
      await once(process, 'message');
    }
    return original.verificar(clave, hash);
  },
};
try {
  const caso = new AutenticarUsuario({ ...entorno.dependencias, contrasenas });
  await caso.ejecutar({ documento, contrasena: correcta ? CLAVE : 'incorrecta-123' });
  process.send?.('exito');
} catch (error) {
  process.send?.(error instanceof Error ? error.name : 'error-desconocido');
} finally {
  await pool.end();
  process.disconnect?.();
}
