/** Acceso sobre la memoria + matriz de permisos perfil/rol (tarea 2.3). */
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { tienePermiso, type ContextoAcceso, type Permiso } from '../../dominio/acceso.js';
import { AlmacenAccesoMemoria, UnidadDeTrabajoAccesoMemoria } from '../../infraestructura/memoria-acceso.js';
import { suiteAcceso } from '../contrato/casos-acceso.js';

describe('acceso (memoria)', () => {
  const almacen = new AlmacenAccesoMemoria();
  suiteAcceso((decorar) => new UnidadDeTrabajoAccesoMemoria(almacen, decorar));
});

describe('acceso — matriz de permisos perfil/rol', () => {
  const base = { usuarioId: 'u', jassId: 'j' };
  const cuentas: Record<string, ContextoAcceso> = {
    consejo: { ...base, perfil: 'personal', rol: 'consejo', asociadoId: null },
    tesorero: { ...base, perfil: 'personal', rol: 'tesorero', asociadoId: null },
    operador: { ...base, perfil: 'personal', rol: 'operador', asociadoId: null },
    asociado: { ...base, perfil: 'asociado', rol: null, asociadoId: 'a' },
  };
  const permisos: Permiso[] = ['padron.leer', 'padron.escribir', 'pagos.leer', 'pagos.registrar', 'acceso-asociado.crear', 'portal.consultar'];
  const esperado: Record<string, Permiso[]> = {
    consejo: ['padron.leer', 'padron.escribir', 'pagos.leer', 'pagos.registrar', 'acceso-asociado.crear'],
    tesorero: ['padron.leer', 'padron.escribir', 'pagos.leer', 'pagos.registrar', 'acceso-asociado.crear'],
    operador: [],
    asociado: ['portal.consultar'],
  };
  for (const [cuenta, actor] of Object.entries(cuentas)) {
    for (const permiso of permisos) {
      const permitido = esperado[cuenta].includes(permiso);
      test(`${cuenta} ${permitido ? 'puede' : 'NO puede'} ${permiso}`, () => {
        assert.equal(tienePermiso(actor, permiso), permitido);
      });
    }
  }
  test('un rol nulo en perfil personal (dato corrupto) no obtiene permisos de personal', () => {
    assert.equal(tienePermiso({ ...base, perfil: 'personal', rol: null, asociadoId: null }, 'padron.leer'), false);
  });
});
