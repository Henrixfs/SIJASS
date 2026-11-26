/** Ayudantes compartidos de las pruebas de interfaz: respuesta de `GET /v1/yo` e ingreso por DNI. */
import { act, screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

export type Usuario = ReturnType<typeof userEvent.setup>;

export const DNI_PRUEBA = '12345678';
export const CLAVE_PRUEBA = 'Clave-de-prueba-123';

/** Lo que responde `GET /v1/yo` para el perfil con el que se inició sesión en la prueba. */
export function respuestaYo(perfil: 'personal' | 'asociado' | 'plataforma', rol: string | null, extra: Record<string, unknown> = {}) {
  return {
    perfil,
    rol,
    nombre: perfil === 'asociado' ? 'Elena Quispe' : perfil === 'plataforma' ? 'Equipo SIJASS' : 'Ana Morales',
    documento: '•••••678',
    jass: perfil === 'plataforma' ? null : { nombre: 'JASS San Miguel' },
    debeCambiarContrasena: false,
    ...extra,
  };
}

/** Elige el tipo de acceso, escribe el DNI y la clave e ingresa. */
export async function ingresarPorDni(usuario: Usuario, tipo: 'asociado' | 'administrador' = 'administrador', documento = DNI_PRUEBA, clave = CLAVE_PRUEBA) {
  await usuario.click(await screen.findByRole('button', { name: new RegExp(tipo === 'asociado' ? 'Soy asociado' : 'Soy administrador') }));
  await usuario.type(await screen.findByLabelText('Número de DNI'), documento);
  await usuario.type(screen.getByLabelText('Clave'), clave);
  await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
  await act(() => vi.dynamicImportSettled());
}
