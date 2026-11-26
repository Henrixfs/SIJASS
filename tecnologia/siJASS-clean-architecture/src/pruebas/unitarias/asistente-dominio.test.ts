/** Corpus, recuperación con citas y guarda de dosis (s1d, tareas 1.1 a 1.3). */
import { fileURLToPath } from 'node:url';
import { describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { ErrorCorpus, validarManifiesto, type Corpus } from '../../dominio/asistente/corpus.js';
import { contieneContenidoSanitarioRestringido, normalizar, pideDosisOTratamiento } from '../../dominio/asistente/guarda.js';
import { componerRespuesta, Indice, MAX_CITAS, MAX_FRAGMENTO, terminos } from '../../dominio/asistente/recuperacion.js';
import { cargarCorpus, DIRECTORIO_CORPUS_EJEMPLO } from '../../infraestructura/corpus-archivo.js';

const ejemplo = cargarCorpus(fileURLToPath(DIRECTORIO_CORPUS_EJEMPLO));
const indice = new Indice(ejemplo);

const manifiestoValido = () => ({
  corpus: { nombre: 'C' },
  documentos: [{ id: 'd1', titulo: 'Guía aprobada', version: '1.0', estado: 'aprobado', responsable: 'Consejo', paginas: [{ numero: 1, texto: 'Texto uno.' }, { numero: 2, texto: 'Texto dos.' }] }],
});

describe('manifiesto del corpus', () => {
  test('uno válido se acepta; con todos aprobados el corpus es «aprobado»', () => {
    const c = validarManifiesto(manifiestoValido());
    assert.equal(c.estado, 'aprobado');
    assert.equal(c.documentos[0].paginas.length, 2);
  });

  const casos: Array<[string, (m: ReturnType<typeof manifiestoValido>) => unknown, RegExp]> = [
    ['no es un objeto', () => 'texto', /objeto/],
    ['sin nombre de corpus', (m) => ({ ...m, corpus: {} }), /corpus\.nombre/],
    ['sin documentos', (m) => ({ ...m, documentos: [] }), /al menos un documento/],
    ['sin versión', (m) => { delete (m.documentos[0] as Record<string, unknown>).version; return m; }, /«d1».*version/],
    ['sin responsable', (m) => { m.documentos[0].responsable = ''; return m; }, /«d1».*responsable/],
    ['sin título', (m) => { m.documentos[0].titulo = '  '; return m; }, /«d1».*titulo/],
    ['estado desconocido', (m) => { m.documentos[0].estado = 'borrador'; return m; }, /«d1».*estado desconocido/],
    ['identificador repetido', (m) => ({ ...m, documentos: [m.documentos[0], m.documentos[0]] }), /repetido/],
    ['sin páginas', (m) => { m.documentos[0].paginas = []; return m; }, /al menos una página/],
    ['página repetida', (m) => { m.documentos[0].paginas[1].numero = 1; return m; }, /numerarse desde 1/],
    ['la numeración no empieza en 1', (m) => { m.documentos[0].paginas[0].numero = 2; return m; }, /numerarse desde 1/],
    ['salta una página', (m) => { m.documentos[0].paginas[1].numero = 3; return m; }, /numerarse desde 1/],
    ['página vacía', (m) => { m.documentos[0].paginas[1].texto = '   '; return m; }, /página 2 está vacía/],
    ['número no entero', (m) => { (m.documentos[0].paginas[0] as { numero: unknown }).numero = '1'; return m; }, /número entero/],
    ['ejemplo sin rótulo', (m) => { m.documentos[0].estado = 'ejemplo'; return m; }, /prefijo «EJEMPLO»/],
  ];
  for (const [nombre, mutar, patron] of casos) {
    test(`se rechaza: ${nombre}`, () => {
      assert.throws(() => validarManifiesto(mutar(manifiestoValido())), (e: unknown) => e instanceof ErrorCorpus && patron.test(e.message), nombre);
    });
  }

  test('un documento de ejemplo con el prefijo se acepta y vuelve «ejemplo» al corpus', () => {
    const m = manifiestoValido();
    m.documentos.push({ ...m.documentos[0], id: 'd2', titulo: 'EJEMPLO — algo', estado: 'ejemplo' });
    assert.equal(validarManifiesto(m).estado, 'ejemplo');
  });

  test('el corpus de ejemplo del repositorio carga, es «ejemplo», todo documento lleva el rótulo y ninguna página contiene cantidades', () => {
    assert.equal(ejemplo.estado, 'ejemplo');
    assert.ok(ejemplo.documentos.length >= 3);
    for (const d of ejemplo.documentos) {
      assert.equal(d.estado, 'ejemplo');
      assert.ok(d.titulo.startsWith('EJEMPLO'), d.titulo);
      for (const p of d.paginas) assert.ok(!/\d/.test(p.texto), `${d.id} p.${p.numero} contiene dígitos (posibles cantidades)`);
    }
  });

  test('cargarCorpus falla con un directorio sin manifiesto', () => {
    assert.throws(() => cargarCorpus(fileURLToPath(new URL('../../../src/', import.meta.url))), /no se pudo leer/);
  });
});

describe('normalización y términos', () => {
  test('sin acentos, minúsculas y sin signos', () => {
    assert.equal(normalizar('¿Cómo se TOMA la Muestra?'), 'como se toma la muestra');
  });
  test('términos: distintos, de 3 o más caracteres y sin palabras vacías', () => {
    assert.deepEqual(terminos('¿Cómo tomo la muestra de la muestra en el reservorio?'), ['tomo', 'muestra', 'reservorio']);
    assert.deepEqual(terminos('de la en y el'), []);
    assert.deepEqual(terminos(''), []);
  });
});

/** Preguntas para las que el corpus de ejemplo tiene evidencia. */
const CON_EVIDENCIA = [
  '¿Cómo se toma la muestra de agua en el reservorio?',
  '¿Cómo enjuago el frasco de muestra?',
  '¿Qué hora debo anotar de la toma?',
  '¿Cómo se hace la lectura con el comparador DPD?',
  '¿Cómo comparo el color con la escala del comparador?',
  '¿Qué hago si no puedo comparar el color por falta de luz?',
  '¿Qué hago si la muestra tiene turbidez?',
  '¿Puedo registrar valores estimados?',
  '¿Quién registra las mediciones de cloro residual en el sistema?',
  '¿Qué pasa si envío un registro dos veces con la misma clave?',
  '¿Cómo corrijo una lectura registrada por error?',
  '¿Las correcciones conservan el valor original?',
  '¿El sistema emite dictámenes sobre la calidad del agua?',
  '¿Qué debo verificar antes de iniciar la cloración?',
  '¿Qué hago al terminar la cloración?',
  '¿Qué dice el procedimiento sobre el equipo de protección?',
];

const SIN_EVIDENCIA = [
  '¿Cuál es la capital de Francia?',
  '¿Cómo se paga una cuota atrasada?',
  'síntomas de la tuberculosis',
  '¿Qué es un asociado moroso?',
  'horario de atención de la municipalidad',
  'receta de lomo saltado',
  'de la en y el',
  '¿y?',
];

function textoDe(c: Corpus, documentoId: string, pagina: number): string {
  return c.documentos.find((d) => d.id === documentoId)!.paginas.find((p) => p.numero === pagina)!.texto;
}

describe('recuperación con citas', () => {
  for (const pregunta of CON_EVIDENCIA) {
    test(`con evidencia: ${pregunta}`, () => {
      const citas = indice.buscar(pregunta);
      assert.ok(citas.length >= 1 && citas.length <= MAX_CITAS, `citas: ${citas.length}`);
      const paginas = new Set(citas.map((c) => `${c.documentoId}#${c.pagina}`));
      assert.equal(paginas.size, citas.length, 'no repite la misma página');
      for (const c of citas) {
        assert.ok(c.version && c.documento.startsWith('EJEMPLO') && c.pagina >= 1);
        // La cita es comprobable: su fragmento (sin el «…» de recorte) es subcadena literal de la página citada.
        const literal = c.fragmento.endsWith('…') ? c.fragmento.slice(0, -1) : c.fragmento;
        assert.ok(textoDe(ejemplo, c.documentoId, c.pagina).includes(literal), `fragmento no literal: ${c.fragmento}`);
        assert.ok(c.fragmento.length <= MAX_FRAGMENTO + 1);
      }
    });
  }

  for (const pregunta of SIN_EVIDENCIA) {
    test(`abstención: ${pregunta}`, () => {
      assert.deepEqual(indice.buscar(pregunta), []);
    });
  }

  test('la pregunta de la lectura con DPD cita la página 2 de la guía DPD en primer lugar', () => {
    const [primera] = indice.buscar('¿Cómo se hace la lectura con el comparador DPD?');
    assert.equal(primera.documentoId, 'ejemplo-lectura-dpd');
    assert.equal(primera.pagina, 2);
    assert.equal(primera.version, '0.1-ejemplo');
  });

  test('es determinista: la misma pregunta da el mismo resultado', () => {
    for (const q of CON_EVIDENCIA) assert.deepEqual(new Indice(ejemplo).buscar(q), indice.buscar(q));
  });

  test('la respuesta compone solo fragmentos citados: cada línea es «Según …: fragmento»', () => {
    const citas = indice.buscar('¿Cómo se toma la muestra de agua en el reservorio?');
    const texto = componerRespuesta(citas);
    assert.equal(texto.split('\n').length, citas.length);
    for (const c of citas) assert.ok(texto.includes(`Según «${c.documento}» (versión ${c.version}, p. ${c.pagina}): ${c.fragmento}`));
  });

  test('un fragmento largo se recorta en límite de palabra con «…» y sigue siendo literal', () => {
    const frase = `${'palabra '.repeat(80)}final`;
    const corpus = validarManifiesto({ corpus: { nombre: 'C' }, documentos: [{ id: 'l', titulo: 'EJEMPLO largo', version: '1', estado: 'ejemplo', responsable: 'x', paginas: [{ numero: 1, texto: `Reservorio ${frase}.` }] }] });
    const [c] = new Indice(corpus).buscar('reservorio palabra final');
    assert.ok(c.fragmento.endsWith('…'));
    assert.ok(c.fragmento.length <= MAX_FRAGMENTO + 1);
    assert.ok(textoDe(corpus, 'l', 1).includes(c.fragmento.slice(0, -1)));
  });

  test('máximo 3 citas aunque haya muchas páginas relevantes', () => {
    const paginas = Array.from({ length: 6 }, (_, i) => ({ numero: i + 1, texto: `Lectura del comparador número ${'x'.repeat(i + 1)}. Registre la lectura.` }));
    const corpus = validarManifiesto({ corpus: { nombre: 'C' }, documentos: [{ id: 'm', titulo: 'EJEMPLO muchas', version: '1', estado: 'ejemplo', responsable: 'x', paginas }] });
    assert.equal(new Indice(corpus).buscar('lectura del comparador').length, MAX_CITAS);
  });
});

const PIDEN_DOSIS = [
  '¿Cuánto hipoclorito debo agregar al reservorio?',
  'Dosis de cloro para el tanque',
  '¿Cómo dosificar el cloro?',
  'calcula la dosis de cloro',
  'CALCULAR LA DOSIS',
  '¿Cuántos gramos de cloro necesito?',
  'cuántos litros de lejía echo al tanque',
  'cuantas pastillas de cloro pongo',
  'Recomiéndame una cantidad de cloro',
  'estima la cantidad de hipoclorito',
  '¿Qué cantidad de cloro se necesita para desinfectar?',
  '¿Cómo trato el agua del reservorio?',
  'tratamiento del agua con cloro',
  'fórmula para clorar el agua',
  'mezclar hipoclorito con agua',
  '¿Cuánto cloro agrego por litro?',
  'agregar cloro al reservorio',
  'echar lejía al tanque',
  'diluir el hipoclorito',
  '¿Cuántos mililitros de cloro?',
  'dosificación de la cloración',
  '¿Cuántos kilos de cal uso?',
  'Determina la concentración de cloro que debo preparar',
  'dosíficame el reservorio',
  'ayúdame a desinfectar el agua',
];

describe('guarda de fuera de alcance (dosis y tratamiento)', () => {
  for (const q of PIDEN_DOSIS) test(`bloquea: ${q}`, () => assert.equal(pideDosisOTratamiento(q), true));

  for (const q of [...CON_EVIDENCIA, '¿Cuántas lecturas debo registrar por día?', '¿Cuánto tiempo debo esperar para leer el comparador?', '¿Qué reactivo se usa en el frasco de muestra?', '¿Cómo registro una medición?', ...SIN_EVIDENCIA]) {
    test(`no bloquea: ${q}`, () => assert.equal(pideDosisOTratamiento(q), false));
  }
});

describe('límite sanitario en el contenido documental', () => {
  test('detecta fórmulas e instrucciones por contexto, incluidos saltos de línea', () => {
    for (const texto of [
      'Registro de muestra: FÓRMULA de dosificación [MARCADOR].',
      'Para el reservorio,\nincorpore el hipoclorito según [MARCADOR].',
      'Dosificación indicada en la tabla: [MARCADOR] 0 mL.',
      'Registro de muestra: dosis calculada = [MARCADOR].',
      'Calcule la dosis con [MARCADOR].',
      'Potabilice el agua siguiendo [MARCADOR].',
    ]) {
      assert.equal(contieneContenidoSanitarioRestringido(texto), true, texto);
    }
  });

  test('permite mediciones, unidades de lectura y remisiones al protocolo validado', () => {
    for (const texto of [
      'Registre la lectura de cloro residual en miligramos por litro.',
      'Registre el valor observado de 0,0 mg/L de cloro residual.',
      'Añada 0 mL de reactivo al frasco de muestra para leer el comparador DPD.',
      'Compare el color de la muestra. Anote el resultado en la página 2.',
      'Las indicaciones sobre dosificación deben provenir del protocolo validado de la JASS.',
    ]) {
      assert.equal(contieneContenidoSanitarioRestringido(texto), false, texto);
    }
  });

  test('revisa la página original incluso cuando el fragmento ganador se recortaría antes de la instrucción', () => {
    const manifiesto = manifiestoValido();
    manifiesto.documentos[0].paginas[0].texto =
      'Registro de muestra ' + 'documental '.repeat(35) + 'con fórmula de dosificación [MARCADOR].';
    assert.deepEqual(new Indice(validarManifiesto(manifiesto)).buscar('registro muestra'), []);
  });

  test('rechaza una cita con instrucciones repartidas entre la referencia y el fragmento', () => {
    const manifiesto = manifiestoValido();
    manifiesto.documentos[0].titulo = 'Procedimiento para incorporar';
    manifiesto.documentos[0].paginas[0].texto = 'Hipoclorito: nota de archivo para verificación documental.';
    assert.deepEqual(new Indice(validarManifiesto(manifiesto)).buscar('verificacion documental'), []);
  });
});
