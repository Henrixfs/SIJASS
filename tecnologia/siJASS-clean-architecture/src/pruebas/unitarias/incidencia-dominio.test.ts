/** Dominio de incidencias (s1f, tareas 1.3, 1.4 y 3.1): reglas puras, sin base de datos. */
import { describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { ErrorCargaExcesiva, ErrorConflicto, ErrorDatoInvalido, ErrorTipoNoAdmitido } from '../../dominio/errores.js';
import {
  ALCANCES_REPORTADOS,
  CATEGORIAS_INCIDENCIA,
  LIMITE_FOTO_BYTES,
  limpiarFoto,
  MATRIZ_POR_DEFECTO,
  REGLAS_POR_DEFECTO,
  sugerirPrioridad,
  tipoDeFoto,
  validarMatriz,
  validarPrioridad,
  validarReporte,
  validarRevision,
  validarTransicion,
  type MatrizPrioridad,
} from '../../dominio/incidencia.js';
import { jpegConExif, MARCA_EXIF, MARCA_TEXTO_PNG, pngConTexto } from '../fotos-prueba.js';

const RECEPCION = new Date('2026-11-19T15:00:00.000Z');
const valido = { categoria: 'fuga', alcanceReportado: 'individual', descripcion: ' Sale agua ', observadaEn: '2026-11-19T09:30:00-05:00', ubicacion: ' Mi casa ' };
const codigo = (c: string) => (e: unknown) => (e as { codigo?: string }).codigo === c;

describe('incidencias — matriz de prioridad', () => {
  test('la matriz por defecto cubre las 24 combinaciones exactas del diseño', () => {
    const esperado: Record<string, string[]> = {
      fuga: ['media', 'alta', 'alta', 'media'],
      interrupcion: ['media', 'alta', 'alta', 'media'],
      averia: ['media', 'media', 'alta', 'media'],
      presion: ['baja', 'media', 'alta', 'media'],
      'calidad-observada': ['media', 'alta', 'alta', 'media'],
      otra: ['baja', 'media', 'alta', 'baja'],
    };
    let combinaciones = 0;
    for (const c of CATEGORIAS_INCIDENCIA) {
      ALCANCES_REPORTADOS.forEach((a, i) => {
        const s = sugerirPrioridad(c, a, REGLAS_POR_DEFECTO);
        assert.equal(s.prioridad, esperado[c][i], `${c}/${a}`);
        assert.equal(s.regla, `categoria:${c}/alcance:${a}`);
        assert.equal(s.version, 0);
        combinaciones++;
      });
    }
    assert.equal(combinaciones, 24);
  });

  test('cada alcance de una interrupción da la sugerencia del diseño', () => {
    const s = (a: (typeof ALCANCES_REPORTADOS)[number]) => sugerirPrioridad('interrupcion', a, REGLAS_POR_DEFECTO).prioridad;
    assert.deepEqual([s('individual'), s('varias-viviendas'), s('general'), s('desconocido')], ['media', 'alta', 'alta', 'media']);
  });

  test('una matriz configurada se usa con su versión', () => {
    const propia = JSON.parse(JSON.stringify(MATRIZ_POR_DEFECTO)) as Record<string, Record<string, string>>;
    propia.fuga.individual = 'alta';
    const reglas = { version: 3, reglas: validarMatriz(propia) };
    assert.deepEqual(sugerirPrioridad('fuga', 'individual', reglas), { prioridad: 'alta', regla: 'categoria:fuga/alcance:individual', version: 3 });
  });

  test('una matriz incompleta, con claves de más o con valores fuera del catálogo se rechaza', () => {
    const copia = () => JSON.parse(JSON.stringify(MATRIZ_POR_DEFECTO)) as Record<string, Record<string, unknown>>;
    const sinCategoria = copia();
    delete sinCategoria.otra;
    const sinAlcance = copia();
    delete sinAlcance.fuga.general;
    const conExtra = copia();
    conExtra.lluvia = { ...conExtra.fuga };
    const conAlcanceExtra = copia();
    conAlcanceExtra.fuga.calle = 'alta';
    const valorMalo = copia();
    valorMalo.presion.general = 'urgente';
    for (const m of [sinCategoria, sinAlcance, conExtra, conAlcanceExtra, valorMalo, null, [], 'alta']) {
      assert.throws(() => validarMatriz(m), codigo('reglas-invalidas'));
    }
  });

  test('una matriz válida se copia y queda congelada', () => {
    const m: MatrizPrioridad = validarMatriz(JSON.parse(JSON.stringify(MATRIZ_POR_DEFECTO)));
    assert.ok(Object.isFrozen(m) && Object.isFrozen(m.fuga));
    assert.deepEqual(m, MATRIZ_POR_DEFECTO);
  });
});

describe('incidencias — reporte', () => {
  test('un reporte válido se recorta y la fecha queda en UTC', () => {
    const r = validarReporte(valido, RECEPCION);
    assert.deepEqual(r, { categoria: 'fuga', alcanceReportado: 'individual', descripcion: 'Sale agua', observadaEn: '2026-11-19T14:30:00.000Z', ubicacion: 'Mi casa' });
  });

  test('campos obligatorios, catálogos y longitudes', () => {
    const casos: Array<[Record<string, unknown>, string]> = [
      [{ ...valido, categoria: 'lluvia' }, 'categoria-invalida'],
      [{ ...valido, categoria: undefined }, 'categoria-invalida'],
      [{ ...valido, alcanceReportado: 'barrio' }, 'alcance-invalido'],
      [{ ...valido, alcanceReportado: undefined }, 'alcance-invalido'],
      [{ ...valido, descripcion: '   ' }, 'descripcion-invalida'],
      [{ ...valido, descripcion: 'x'.repeat(2001) }, 'descripcion-invalida'],
      [{ ...valido, ubicacion: '' }, 'ubicacion-invalida'],
      [{ ...valido, ubicacion: 'x'.repeat(301) }, 'ubicacion-invalida'],
      [{ ...valido, observadaEn: '2026-11-19T09:30:00' }, 'fecha-invalida'],
      [{ ...valido, observadaEn: '2026-02-30T09:30:00Z' }, 'fecha-invalida'],
      [{ ...valido, observadaEn: '2026-11-19T15:05:00.001Z' }, 'fecha-invalida'],
    ];
    for (const [cuerpo, esperado] of casos) assert.throws(() => validarReporte(cuerpo, RECEPCION), codigo(esperado), esperado);
  });

  test('la observación hasta 5 minutos después de la recepción se acepta (desfase del reloj)', () => {
    assert.equal(validarReporte({ ...valido, observadaEn: '2026-11-19T15:05:00Z' }, RECEPCION).observadaEn, '2026-11-19T15:05:00.000Z');
  });

  test('los datos que pone el servidor no se aceptan del cliente', () => {
    for (const extra of ['jassId', 'autorId', 'estado', 'prioridadConfirmada', 'sugerencia', 'creadaEn']) {
      assert.throws(() => validarReporte({ ...valido, [extra]: 'x' }, RECEPCION), codigo('campo-no-permitido'), extra);
    }
  });
});

describe('incidencias — ciclo de atención', () => {
  test('transiciones admitidas', () => {
    assert.deepEqual(validarTransicion('registrada', 'en-atencion', undefined), { estado: 'en-atencion', detalle: null });
    assert.deepEqual(validarTransicion('en-atencion', 'cerrada', ' Se cambió la unión '), { estado: 'cerrada', detalle: 'Se cambió la unión' });
    assert.deepEqual(validarTransicion('cerrada', 'en-atencion', ' Volvió a gotear '), { estado: 'en-atencion', detalle: 'Volvió a gotear' });
  });

  test('cerrar directamente una registrada y las demás transiciones no admitidas son conflicto', () => {
    const prohibidas: Array<[string, string]> = [['registrada', 'cerrada'], ['registrada', 'registrada'], ['en-atencion', 'registrada'], ['en-atencion', 'en-atencion'], ['cerrada', 'cerrada'], ['cerrada', 'registrada']];
    for (const [de, a] of prohibidas) {
      assert.throws(() => validarTransicion(de as 'registrada', a, 'detalle'), (e: unknown) => e instanceof ErrorConflicto && e.codigo === 'transicion-invalida', `${de} → ${a}`);
    }
    assert.throws(() => validarTransicion('registrada', 'pausada', 'x'), codigo('estado-invalido'));
  });

  test('el cierre exige la acción y la reapertura exige el motivo', () => {
    assert.throws(() => validarTransicion('en-atencion', 'cerrada', '  '), codigo('accion-requerida'));
    assert.throws(() => validarTransicion('en-atencion', 'cerrada', undefined), codigo('accion-requerida'));
    assert.throws(() => validarTransicion('cerrada', 'en-atencion', ''), codigo('motivo-requerido'));
  });

  test('la prioridad igual a la sugerida no exige motivo; una distinta, sí', () => {
    assert.deepEqual(validarPrioridad('alta', 'alta', undefined), { prioridad: 'alta', motivo: null });
    assert.throws(() => validarPrioridad('alta', 'media', '  '), codigo('motivo-requerido'));
    assert.deepEqual(validarPrioridad('alta', 'media', ' Solo una casa '), { prioridad: 'media', motivo: 'Solo una casa' });
    assert.throws(() => validarPrioridad('alta', 'urgente', 'x'), codigo('prioridad-invalida'));
  });

  test('la revisión es un entero positivo', () => {
    assert.equal(validarRevision(3), 3);
    for (const r of [0, -1, 1.5, '2', null, undefined]) assert.throws(() => validarRevision(r), codigo('revision-invalida'));
  });
});

describe('incidencias — foto', () => {
  test('el tipo sale de la firma, no de lo declarado', () => {
    assert.equal(tipoDeFoto(jpegConExif()), 'image/jpeg');
    assert.equal(tipoDeFoto(pngConTexto()), 'image/png');
    assert.equal(tipoDeFoto(Buffer.from('GIF89a')), null);
  });

  test('un JPEG pierde su segmento EXIF y conserva la imagen', () => {
    const original = jpegConExif('pixeles');
    const { tipo, bytes } = limpiarFoto(original, 'image/jpeg');
    assert.equal(tipo, 'image/jpeg');
    assert.ok(original.includes(MARCA_EXIF));
    assert.ok(!bytes.includes(MARCA_EXIF));
    assert.ok(bytes.includes(Buffer.from('pixeles')));
    assert.ok(bytes.includes(Buffer.from('JFIF')));
    assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8]);
    assert.deepEqual([...bytes.subarray(-2)], [0xff, 0xd9]);
  });

  test('un PNG pierde sus fragmentos de texto y EXIF y conserva la imagen', () => {
    const { tipo, bytes } = limpiarFoto(pngConTexto(), 'image/png; charset=binary');
    assert.equal(tipo, 'image/png');
    assert.ok(!bytes.includes(MARCA_TEXTO_PNG) && !bytes.includes(MARCA_EXIF));
    for (const f of ['IHDR', 'IDAT', 'IEND']) assert.ok(bytes.includes(Buffer.from(f)), f);
  });

  test('formato no admitido o distinto del declarado → 415; vacía o mal formada → 422; más de 5 MiB → 413', () => {
    assert.throws(() => limpiarFoto(Buffer.from('GIF89a....'), 'image/gif'), ErrorTipoNoAdmitido);
    assert.throws(() => limpiarFoto(jpegConExif(), 'image/png'), ErrorTipoNoAdmitido);
    assert.throws(() => limpiarFoto(jpegConExif(), undefined), ErrorTipoNoAdmitido);
    assert.throws(() => limpiarFoto(Buffer.alloc(0), 'image/jpeg'), (e: unknown) => e instanceof ErrorDatoInvalido && e.codigo === 'foto-invalida');
    assert.throws(() => limpiarFoto(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00]), 'image/jpeg'), (e: unknown) => e instanceof ErrorDatoInvalido && e.codigo === 'foto-invalida');
    assert.throws(() => limpiarFoto(pngConTexto().subarray(0, 40), 'image/png'), (e: unknown) => e instanceof ErrorDatoInvalido && e.codigo === 'foto-invalida');
    const enorme = Buffer.concat([jpegConExif(), Buffer.alloc(LIMITE_FOTO_BYTES)]);
    assert.throws(() => limpiarFoto(enorme, 'image/jpeg'), ErrorCargaExcesiva);
  });
});
