import { createContext, useContext } from 'react';
import type { ClienteApi, Sesion } from './api/cliente';

export interface ContextoApp {
  readonly api: ClienteApi;
  readonly sesion: Sesion | null;
  readonly navegar: (ruta: string) => void;
  readonly salir: () => Promise<void>;
}

export const Contexto = createContext<ContextoApp | null>(null);

export function useApp(): ContextoApp {
  const c = useContext(Contexto);
  if (!c) throw new Error('useApp fuera de <Contexto>');
  return c;
}

/** Texto de un error para mostrar a la persona; nunca expone detalles técnicos. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.name === 'ErrorApi') return e.message;
  return 'No se pudo completar la operación. Revise su conexión e intente de nuevo.';
}
