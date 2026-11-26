/** Claves de tres palabras, DNI, permisos nuevos y límite por origen (s2a, tareas 1.2 y 1.3). */
import { describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { exigirPermisoPlataforma, tienePermiso, type ContextoAcceso, type ContextoPlataforma, type Permiso } from '../../dominio/acceso.js';
import { canonicalizarClave, generarClaveDePalabras, PALABRAS_CLAVE, PALABRAS_POR_CLAVE } from '../../dominio/claves/claves.js';
import { enmascararDocumento, esDni, validarDni } from '../../dominio/documento.js';
import { ErrorAccesoDenegado } from '../../dominio/errores.js';
import { GeneradorClavesAleatorio, palabrasDeClaveDeEntorno } from '../../infraestructura/seguridad/generador-claves.js';
import { LimitadorDeIntentosMemoria } from '../../infraestructura/limitador-memoria.js';

describe('lista de palabras de las claves', () => {
  test('tiene al menos 2048 palabras únicas de 4 a 7 letras a-z, sin tildes ni eñes', () => {
    assert.ok(PALABRAS_CLAVE.length >= 2048, `solo ${PALABRAS_CLAVE.length}`);
    assert.equal(new Set(PALABRAS_CLAVE).size, PALABRAS_CLAVE.length, 'hay palabras repetidas');
    for (const p of PALABRAS_CLAVE) assert.match(p, /^[a-z]{4,7}$/, p);
  });

  test('no contiene términos ofensivos conocidos', () => {
    const vetadas = ['puta', 'mierda', 'culo', 'pene', 'sexo', 'tonto', 'idiota', 'odio', 'droga', 'zorra'];
    for (const v of vetadas) assert.ok(!PALABRAS_CLAVE.includes(v), v);
  });
});

describe('claves generadas', () => {
  test('tienen la forma palabra-palabra-palabra, cumplen la longitud mínima y no se repiten en 1000 generaciones', () => {
    const generador = new GeneradorClavesAleatorio();
    const vistas = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const clave = generador.generar();
      assert.match(clave, /^[a-z]{4,7}-[a-z]{4,7}-[a-z]{4,7}$/);
      assert.ok(clave.length >= 14 && clave.length <= 23, clave);
      assert.equal(clave.split('-').length, PALABRAS_POR_CLAVE);
      vistas.add(clave);
    }
    assert.ok(vistas.size >= 999, `${vistas.size} únicas de 1000`);
  });

  test('con SIJASS_PALABRAS_CLAVE=4 la clave tiene cuatro palabras; fuera de 3 a 6 no se acepta', () => {
    assert.equal(palabrasDeClaveDeEntorno({}), 3);
    assert.equal(palabrasDeClaveDeEntorno({ SIJASS_PALABRAS_CLAVE: '4' }), 4);
    assert.equal(new GeneradorClavesAleatorio(4).generar().split('-').length, 4);
    for (const n of [2, 7, 3.5]) assert.throws(() => new GeneradorClavesAleatorio(n), /entre 3 y 6/);
  });

  test('el sorteo usa índices dentro de la lista y es determinista con un sorteo fijo', () => {
    const pedidos: number[] = [];
    const clave = generarClaveDePalabras((maximo) => {
      pedidos.push(maximo);
      return 0;
    });
    assert.deepEqual(pedidos, [PALABRAS_CLAVE.length, PALABRAS_CLAVE.length, PALABRAS_CLAVE.length]);
    assert.equal(clave, [PALABRAS_CLAVE[0], PALABRAS_CLAVE[0], PALABRAS_CLAVE[0]].join('-'));
  });

  test('la canonicalización ignora mayúsculas, tildes, espacios y guiones repetidos', () => {
    assert.equal(canonicalizarClave(' Río  LUNA-maíz '), 'rio-luna-maiz');
    assert.equal(canonicalizarClave('rio--luna - maiz'), 'rio-luna-maiz');
    assert.equal(canonicalizarClave('RIO\tLUNA\nMAIZ'), 'rio-luna-maiz');
    assert.equal(canonicalizarClave(''), '');
    assert.equal(canonicalizarClave('rio-luna-maiz'), 'rio-luna-maiz');
  });
});

describe('DNI', () => {
  test('solo 8 dígitos son un DNI; el enmascarado deja los 3 últimos', () => {
    for (const bueno of ['12345678', '00000001']) assert.ok(esDni(bueno));
    for (const malo of ['1234567', '123456789', 'ABCDEFGH', '1234 5678', '', 12345678, null, undefined]) assert.ok(!esDni(malo), String(malo));
    assert.equal(validarDni(' 12345678 '), '12345678');
    assert.throws(() => validarDni('123'), (e: unknown) => (e as { codigo?: string }).codigo === 'documento-no-es-dni');
    assert.equal(enmascararDocumento('12345678'), '•••••678');
    assert.equal(enmascararDocumento(null), null);
  });
});

describe('permisos de plataforma y del equipo', () => {
  const base = { usuarioId: 'u', jassId: 'j' };
  const consejo: ContextoAcceso = { ...base, perfil: 'personal', rol: 'consejo', asociadoId: null };
  const tesorero: ContextoAcceso = { ...base, perfil: 'personal', rol: 'tesorero', asociadoId: null };
  const operador: ContextoAcceso = { ...base, perfil: 'personal', rol: 'operador', asociadoId: null };
  const asociado: ContextoAcceso = { ...base, perfil: 'asociado', rol: null, asociadoId: 'a' };
  const plataforma: ContextoPlataforma = { usuarioId: 'p', jassId: null, perfil: 'plataforma', rol: null, asociadoId: null };

  test('equipo.gestionar solo para el Consejo; restablecer acceso para Tesorería y Consejo', () => {
    assert.deepEqual([consejo, tesorero, operador, asociado].map((a) => tienePermiso(a, 'equipo.gestionar')), [true, false, false, false]);
    assert.deepEqual([consejo, tesorero, operador, asociado].map((a) => tienePermiso(a, 'acceso-asociado.restablecer')), [true, true, false, false]);
  });

  test('jass.gestionar solo para la plataforma y ningún permiso de negocio la incluye', () => {
    assert.ok(tienePermiso(plataforma, 'jass.gestionar'));
    for (const a of [consejo, tesorero, operador, asociado]) assert.ok(!tienePermiso(a, 'jass.gestionar'));
    const negocio: Permiso[] = ['padron.leer', 'padron.escribir', 'pagos.leer', 'pagos.registrar', 'acceso-asociado.crear', 'acceso-asociado.restablecer', 'portal.consultar', 'reservorios.leer', 'reservorios.crear', 'mediciones.registrar', 'mediciones.leer', 'asistente.consultar', 'equipo.gestionar'];
    for (const p of negocio) assert.ok(!tienePermiso(plataforma, p), p);
    assert.doesNotThrow(() => exigirPermisoPlataforma(plataforma, 'jass.gestionar'));
    assert.throws(() => exigirPermisoPlataforma(plataforma, 'padron.leer'), ErrorAccesoDenegado);
  });

  test('un caso de JASS no compila con un actor de plataforma', () => {
    // @ts-expect-error `ContextoPlataforma` no es un `ContextoAcceso`: el compilador lo impide.
    const intento: ContextoAcceso = plataforma;
    assert.equal(intento.perfil, 'plataforma');
  });
});

describe('límite de intentos por origen', () => {
  test('cuenta fallos por origen, se desliza con el tiempo y acota la memoria', () => {
    const limitador = new LimitadorDeIntentosMemoria(3, 1000, 2);
    const t0 = new Date('2026-11-25T10:00:00Z');
    for (let i = 0; i < 3; i++) {
      assert.equal(limitador.excedido('a', new Date(t0.getTime() + i)), false);
      limitador.registrarFallo('a', new Date(t0.getTime() + i));
    }
    assert.equal(limitador.excedido('a', new Date(t0.getTime() + 10)), true, 'tras tres fallos el origen queda limitado');
    assert.equal(limitador.excedido('b', t0), false, 'otro origen no se ve afectado');
    assert.equal(limitador.excedido('a', new Date(t0.getTime() + 1500)), false, 'tras la ventana se vuelve a permitir');
    // Con tope de 2 orígenes, el más antiguo se olvida al llegar un tercero.
    limitador.registrarFallo('b', new Date(t0.getTime() + 1600));
    limitador.registrarFallo('c', new Date(t0.getTime() + 1700));
    limitador.registrarFallo('d', new Date(t0.getTime() + 1800));
    assert.equal(limitador.excedido('b', new Date(t0.getTime() + 1850)), false, 'el origen más antiguo se olvidó');
  });
});
