/**
 * El modo de sistema (sin JASS fijada) es un conjunto cerrado de operaciones (s2a, spec
 * `aislamiento-multi-jass`, «Operaciones de sistema acotadas»): ninguna solicitud de negocio lo
 * activa.
 */
import { describe, test } from '../marco.js';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextoDe } from '../../aplicacion/acceso/comun.js';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

/** Operaciones que sí corren sin JASS: identidad, plataforma, comandos de servidor y la sonda de salud. */
const PERMITIDOS = new Set([
  'aplicacion/acceso/sesiones.ts',
  'aplicacion/acceso/administracion.ts',
  'aplicacion/acceso/plataforma.ts',
  'aplicacion/salud.ts',
  'aplicacion/acceso/comun.ts',
]);

describe('contexto de transacción', () => {
  test('el contexto de una solicitud autenticada es siempre su JASS o la plataforma, nunca el modo de sistema', () => {
    const jass = { usuarioId: 'u', jassId: 'j', perfil: 'personal' as const, rol: 'consejo' as const, asociadoId: null };
    const plataforma = { usuarioId: 'p', jassId: null, perfil: 'plataforma' as const, rol: null, asociadoId: null };
    assert.deepEqual(contextoDe(jass), { jassId: 'j' });
    assert.deepEqual(contextoDe(plataforma), { plataforma: true });
    assert.ok(!('sistema' in contextoDe(jass)) && !('sistema' in contextoDe(plataforma)));
  });

  test('solo el código de identidad, plataforma y salud usa el modo de sistema: los casos de negocio nunca', () => {
    const encontrados = new Map<string, number>();
    for (const carpeta of ['aplicacion', 'api']) {
      for (const ruta of archivos(join(SRC, carpeta))) {
        const veces = (readFileSync(ruta, 'utf8').match(/\bsistema: true\b/g) ?? []).length;
        if (veces > 0) encontrados.set(relative(SRC, ruta).replaceAll('\\', '/'), veces);
      }
    }
    const fueraDeLista = [...encontrados.keys()].filter((f) => !PERMITIDOS.has(f) && !f.startsWith('api/cli'));
    assert.deepEqual(fueraDeLista, [], `el modo de sistema no puede usarse en: ${fueraDeLista.join(', ')}`);
    assert.ok(encontrados.has('aplicacion/acceso/sesiones.ts'), 'el inicio de sesión sí corre en modo de sistema');
  });

  test('los casos de negocio fijan siempre la JASS del actor', () => {
    for (const rel of ['aplicacion/padron/padron.ts', 'aplicacion/padron/pagos.ts', 'aplicacion/reservorios.ts', 'aplicacion/acceso/equipo.ts', 'aplicacion/mediciones-autorizadas.ts', 'aplicacion/registrar-medicion.ts', 'aplicacion/asistente.ts']) {
      const texto = readFileSync(join(SRC, rel), 'utf8');
      assert.ok(!/unidadDeTrabajo\.ejecutar\(/.test(texto.replace(/\.ejecutar\([\s\S]*?\{ jassId: actor\.jassId \}\)/g, '')) || /enJass|jassId: actor\.jassId/.test(texto), rel);
      assert.ok(!/\bplataforma: true\b/.test(texto), `${rel} no debe usar el contexto de plataforma`);
    }
  });
});
