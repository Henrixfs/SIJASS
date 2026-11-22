import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { ServicioContrasenas } from '../../dominio/puertos-acceso.js';

/** Parámetros de producción (design.md D2): ~32 MB y decenas de milisegundos por derivación. */
export const PARAMETROS_PRODUCCION = Object.freeze({ N: 32768, r: 8, p: 1 });

/** Tope de los parámetros aceptados al verificar, para que un hash alterado no agote la memoria. */
const N_MAXIMO = 1 << 17;
const R_MAXIMO = 16;
const P_MAXIMO = 4;
const LONGITUD_HASH = 64;
const LONGITUD_SAL = 16;

function derivarClave(contrasena: string, sal: Buffer, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(contrasena.normalize('NFKC'), sal, LONGITUD_HASH, opciones, (error, clave) => {
      if (error) rechazar(error);
      else resolver(clave);
    });
  });
}

function opcionesDe(N: number, r: number, p: number): ScryptOptions {
  return { N, r, p, maxmem: 128 * N * r * p + 128 * N * r + 1024 * 1024 };
}

/**
 * `scrypt` de `node:crypto` como función de derivación robusta de ADR-008. Almacena
 * `scrypt$N$r$p$sal$hash` (base64) con una sal aleatoria por contraseña.
 */
export class ContrasenasScrypt implements ServicioContrasenas {
  constructor(private readonly parametros: { N: number; r: number; p: number } = PARAMETROS_PRODUCCION) {}

  async derivar(contrasena: string): Promise<string> {
    const { N, r, p } = this.parametros;
    const sal = randomBytes(LONGITUD_SAL);
    const clave = await derivarClave(contrasena, sal, opcionesDe(N, r, p));
    return `scrypt$${N}$${r}$${p}$${sal.toString('base64')}$${clave.toString('base64')}`;
  }

  async verificar(contrasena: string, hash: string): Promise<boolean> {
    const partes = hash.split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
    const N = Number(partes[1]);
    const r = Number(partes[2]);
    const p = Number(partes[3]);
    const parametrosValidos =
      Number.isInteger(N) && N >= 2 && N <= N_MAXIMO && (N & (N - 1)) === 0 &&
      Number.isInteger(r) && r >= 1 && r <= R_MAXIMO &&
      Number.isInteger(p) && p >= 1 && p <= P_MAXIMO;
    if (!parametrosValidos) return false;
    const sal = Buffer.from(partes[4], 'base64');
    const esperado = Buffer.from(partes[5], 'base64');
    if (sal.length < 8 || esperado.length !== LONGITUD_HASH) return false;
    const obtenido = await derivarClave(contrasena, sal, opcionesDe(N, r, p));
    return timingSafeEqual(obtenido, esperado);
  }
}
