import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { VIGENCIA_ACCESO_S } from '../../dominio/acceso.js';
import type { ClaimsAcceso, ServicioTokens } from '../../dominio/puertos-acceso.js';
import { esUuid } from '../../dominio/padron.js';

const LONGITUD_MINIMA_SECRETO = 32;
const ENCABEZADO = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

/**
 * JWT HS256 mínimo (design.md D2). El token solo lleva `sub`, `iat`, `exp` y `jti`: ni
 * JASS, ni perfil, ni rol (la autorización lee la membresía en cada solicitud, D3).
 */
export class TokensHs256 implements ServicioTokens {
  private readonly secreto: Buffer;

  /** @throws Error si el secreto tiene menos de 32 bytes. */
  constructor(secreto: string, private readonly vigenciaS: number = VIGENCIA_ACCESO_S) {
    this.secreto = Buffer.from(secreto, 'utf8');
    if (this.secreto.length < LONGITUD_MINIMA_SECRETO) {
      throw new Error(`JWT_SECRET debe tener al menos ${LONGITUD_MINIMA_SECRETO} bytes`);
    }
  }

  private firmar(contenido: string): Buffer {
    return createHmac('sha256', this.secreto).update(contenido).digest();
  }

  emitirAcceso(usuarioId: string, ahora: Date): string {
    const iat = Math.floor(ahora.getTime() / 1000);
    const carga = Buffer.from(JSON.stringify({ sub: usuarioId, iat, exp: iat + this.vigenciaS, jti: randomUUID() })).toString('base64url');
    const contenido = `${ENCABEZADO}.${carga}`;
    return `${contenido}.${this.firmar(contenido).toString('base64url')}`;
  }

  verificarAcceso(token: string, ahora: Date): ClaimsAcceso | undefined {
    if (typeof token !== 'string' || token.length > 2048) return undefined;
    const partes = token.split('.');
    if (partes.length !== 3) return undefined;
    const [encabezado, carga, firma] = partes;
    // Solo se acepta exactamente el encabezado propio: rechaza `alg: none` y otros algoritmos.
    if (encabezado !== ENCABEZADO) return undefined;
    const esperada = this.firmar(`${encabezado}.${carga}`);
    const recibida = Buffer.from(firma, 'base64url');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return undefined;
    let datos: unknown;
    try {
      datos = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    } catch {
      return undefined;
    }
    if (typeof datos !== 'object' || datos === null) return undefined;
    const { sub, exp } = datos as { sub?: unknown; exp?: unknown };
    if (!esUuid(sub) || typeof exp !== 'number' || !Number.isFinite(exp)) return undefined;
    if (exp <= Math.floor(ahora.getTime() / 1000)) return undefined;
    return { usuarioId: sub, expiraEn: exp };
  }

  nuevoRefresco(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashDeRefresco(token) };
  }

  hashDeRefresco(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
