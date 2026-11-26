import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApi } from './api/cliente';
import { mensajeDeError } from './contexto';

interface Estado<T> {
  datos: T | null;
  error: string | null;
  prohibido: boolean;
  cargando: boolean;
}

/**
 * Carga datos de la API al montar y cada vez que cambia `cargar`; `recargar` vuelve a pedirlos
 * sin borrar lo que ya se muestra. Un `403` se separa de los demás errores: no es un fallo,
 * es que el rol no tiene esa sección.
 */
export function useCarga<T>(cargar: () => Promise<T>) {
  const [estado, setEstado] = useState<Estado<T>>({ datos: null, error: null, prohibido: false, cargando: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let activo = true;
    cargar().then(
      (datos) => activo && setEstado({ datos, error: null, prohibido: false, cargando: false }),
      (e: unknown) => {
        if (!activo) return;
        if (e instanceof ErrorApi && e.estado === 403) setEstado({ datos: null, error: null, prohibido: true, cargando: false });
        else setEstado((s) => ({ ...s, error: mensajeDeError(e), cargando: false }));
      },
    );
    return () => {
      activo = false;
    };
  }, [cargar, version]);

  const recargar = useCallback(async () => {
    setEstado((s) => ({ ...s, error: null, cargando: true }));
    setVersion((v) => v + 1);
  }, []);

  return { ...estado, recargar };
}

export function useEnvio() {
  const bloqueo = useRef(false);
  const [enviando, setEnviando] = useState(false);

  async function ejecutar(operacion: () => Promise<void>) {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setEnviando(true);
    try {
      await operacion();
    } finally {
      bloqueo.current = false;
      setEnviando(false);
    }
  }

  return { enviando, ejecutar };
}
