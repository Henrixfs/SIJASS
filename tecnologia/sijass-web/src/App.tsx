import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClienteApi, Sesion } from './api/cliente';
import { Contexto } from './contexto';
import { destinoPara, RUTA_INGRESO } from './lib/rutas';
import { Ingreso } from './paginas/Ingreso';
import { Personal } from './paginas/Personal';
import { Portal } from './paginas/Portal';

/**
 * Raíz de la interfaz: restaura la sesión al cargar, aplica la guardia de pantallas por
 * perfil y elige la pantalla. No hay biblioteca de rutas: basta `history` y tres pantallas.
 */
export function App({ api }: { api: ClienteApi }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [listo, setListo] = useState(false);
  const [ruta, setRuta] = useState(() => window.location.pathname);

  const navegar = useCallback((destino: string) => {
    if (window.location.pathname !== destino) window.history.pushState(null, '', destino);
    setRuta(destino);
  }, []);

  useEffect(() => {
    let vigente = true;
    api.configurar({
      alIniciarSesion: setSesion,
      onSesionExpirada: () => {
        setSesion(null);
        navegar(RUTA_INGRESO);
      },
    });
    void api.restaurar().then((s) => {
      if (!vigente) return;
      setSesion(s);
      setListo(true);
    });
    const alRetroceder = () => setRuta(window.location.pathname);
    window.addEventListener('popstate', alRetroceder);
    return () => {
      vigente = false;
      window.removeEventListener('popstate', alRetroceder);
    };
  }, [api, navegar]);

  const salir = useCallback(async () => {
    await api.cerrarSesion();
    setSesion(null);
    navegar(RUTA_INGRESO);
  }, [api, navegar]);

  // Sin sesión solo existe el ingreso; con sesión, cada perfil ve únicamente sus pantallas.
  const destino = listo ? destinoPara(sesion?.perfil ?? null, ruta) : null;
  // La guardia solo corrige la barra de direcciones; la pantalla ya sale de `destino`.
  useEffect(() => {
    if (destino !== null && window.location.pathname !== destino) window.history.replaceState(null, '', destino);
  }, [destino]);

  const valor = useMemo(() => ({ api, sesion, navegar, salir }), [api, sesion, navegar, salir]);
  if (!listo || destino === null) return <p className="suave centrado">Cargando…</p>;

  return (
    <Contexto.Provider value={valor}>
      {sesion === null ? <Ingreso /> : sesion.perfil === 'personal' ? <Personal ruta={destino} /> : <Portal />}
    </Contexto.Provider>
  );
}
