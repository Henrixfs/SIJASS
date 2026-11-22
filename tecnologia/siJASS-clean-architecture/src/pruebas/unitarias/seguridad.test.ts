/** Contraseñas `scrypt` y tokens HS256 (tarea 2.1, spec `acceso-por-perfiles`). */
import { createHmac, randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ContrasenasScrypt } from '../../infraestructura/seguridad/contrasenas-scrypt.js';
import { TokensHs256 } from '../../infraestructura/seguridad/tokens-hs256.js';

const SECRETO = 'x'.repeat(40);
// Costo bajo solo para que la batería sea rápida; el valor de producción está en `PARAMETROS_PRODUCCION`.
const barato = new ContrasenasScrypt({ N: 1024, r: 8, p: 1 });

describe('contraseñas scrypt', () => {
  test('la misma contraseña produce hashes distintos (sal propia)', async () => {
    const a = await barato.derivar('Clave-de-prueba-1');
    const b = await barato.derivar('Clave-de-prueba-1');
    assert.notEqual(a, b);
    assert.ok(a.startsWith('scrypt$1024$8$1$'));
    assert.ok(!a.includes('Clave-de-prueba-1'));
  });

  test('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await barato.derivar('Clave-de-prueba-1');
    assert.equal(await barato.verificar('Clave-de-prueba-1', hash), true);
    assert.equal(await barato.verificar('Clave-de-prueba-2', hash), false);
    assert.equal(await barato.verificar('', hash), false);
  });

  test('un hash de producción también se verifica', async () => {
    const produccion = new ContrasenasScrypt();
    const hash = await produccion.derivar('Otra-clave-segura');
    assert.ok(hash.startsWith('scrypt$32768$8$1$'));
    assert.equal(await produccion.verificar('Otra-clave-segura', hash), true);
  });

  for (const hash of ['', 'texto', 'scrypt$1$2$3', 'bcrypt$1024$8$1$c2Fs$aGFzaA', 'scrypt$1024$8$1$c2Fs$aGFzaA']) {
    test(`formato inválido «${hash}» → false sin lanzar`, async () => {
      assert.equal(await barato.verificar('x', hash), false);
    });
  }

  test('parámetros abusivos en el hash (N enorme o no potencia de 2) → false sin derivar', async () => {
    const hash = await barato.derivar('Clave-de-prueba-1');
    const partes = hash.split('$');
    for (const N of ['1099511627776', '1000', '0', '-2']) {
      const alterado = [partes[0], N, ...partes.slice(2)].join('$');
      assert.equal(await barato.verificar('Clave-de-prueba-1', alterado), false);
    }
  });
});

describe('tokens de acceso HS256', () => {
  const tokens = new TokensHs256(SECRETO, 900);
  const ahora = new Date('2026-11-19T15:00:00.000Z');
  const usuarioId = randomUUID();

  test('emite y verifica; el token no contiene JASS, perfil ni rol', () => {
    const token = tokens.emitirAcceso(usuarioId, ahora);
    const claims = tokens.verificarAcceso(token, ahora);
    assert.equal(claims?.usuarioId, usuarioId);
    const carga = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.deepEqual(Object.keys(carga).sort(), ['exp', 'iat', 'jti', 'sub']);
    assert.equal(carga.exp - carga.iat, 900);
  });

  test('vence a los 15 minutos', () => {
    const token = tokens.emitirAcceso(usuarioId, ahora);
    assert.ok(tokens.verificarAcceso(token, new Date(ahora.getTime() + 899_000)));
    assert.equal(tokens.verificarAcceso(token, new Date(ahora.getTime() + 900_000)), undefined);
  });

  test('rechaza un token alterado en la carga o en la firma', () => {
    const [h, c, f] = tokens.emitirAcceso(usuarioId, ahora).split('.');
    const cargaAjena = Buffer.from(JSON.stringify({ sub: randomUUID(), iat: 1, exp: 9_999_999_999 })).toString('base64url');
    assert.equal(tokens.verificarAcceso(`${h}.${cargaAjena}.${f}`, ahora), undefined);
    assert.equal(tokens.verificarAcceso(`${h}.${c}.${f.slice(0, -2)}AA`, ahora), undefined);
  });

  test('rechaza un token firmado con otra clave', () => {
    const otro = new TokensHs256('y'.repeat(40), 900);
    assert.equal(tokens.verificarAcceso(otro.emitirAcceso(usuarioId, ahora), ahora), undefined);
  });

  test('rechaza alg none y otros encabezados, aunque la firma sea válida para ese encabezado', () => {
    const carga = Buffer.from(JSON.stringify({ sub: usuarioId, iat: 1, exp: 9_999_999_999 })).toString('base64url');
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    assert.equal(tokens.verificarAcceso(`${none}.${carga}.`, ahora), undefined);
    const hs512 = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
    const firma = createHmac('sha256', SECRETO).update(`${hs512}.${carga}`).digest('base64url');
    assert.equal(tokens.verificarAcceso(`${hs512}.${carga}.${firma}`, ahora), undefined);
  });

  for (const basura of ['', 'a.b', 'a.b.c.d', 'no-es-un-token', 'x'.repeat(5000)]) {
    test(`formato inválido (${basura.length} caracteres) → undefined`, () => {
      assert.equal(tokens.verificarAcceso(basura, ahora), undefined);
    });
  }

  test('rechaza un `sub` que no es UUID', () => {
    const encabezado = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const carga = Buffer.from(JSON.stringify({ sub: 'admin', iat: 1, exp: 9_999_999_999 })).toString('base64url');
    const firma = createHmac('sha256', SECRETO).update(`${encabezado}.${carga}`).digest('base64url');
    assert.equal(tokens.verificarAcceso(`${encabezado}.${carga}.${firma}`, ahora), undefined);
  });

  test('exige un secreto de al menos 32 bytes', () => {
    assert.throws(() => new TokensHs256('corto'), /32 bytes/);
    assert.throws(() => new TokensHs256(''), /32 bytes/);
  });

  test('el refresco es opaco, aleatorio y su hash es SHA-256 hexadecimal', () => {
    const a = tokens.nuevoRefresco();
    const b = tokens.nuevoRefresco();
    assert.notEqual(a.token, b.token);
    assert.match(a.hash, /^[0-9a-f]{64}$/);
    assert.equal(tokens.hashDeRefresco(a.token), a.hash);
    assert.notEqual(a.hash, a.token);
  });
});
