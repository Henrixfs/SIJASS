import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ClienteApi, Sesion, SesionBasica } from './api/cliente';
import { Contexto } from './contexto';
import { destinoPara, RUTA_INGRESO } from './lib/rutas';
import { CambiarClave } from './paginas/CambiarClave';
import { Ingreso } from './paginas/Ingreso';
import { Carga } from './ui';

const Personal = lazy(() => import('./paginas/Personal').then(modulo => ({ default: modulo.Personal })));
const Portal = lazy(() => import('./paginas/Portal').then(modulo => ({ default: modulo.Portal })));
const Plataforma = lazy(() => import('./paginas/Plataforma').then(modulo => ({ default: modulo.Plataforma })));

/** Combina lo que llega en un inicio o una renovación con lo que ya se sabe de la persona. */
function fusionar(actual: Sesion | null, nueva: SesionBasica | Sesion): Sesion {
  if ('nombre' in nueva) return nueva;
  if (actual && actual.perfil === nueva.perfil && actual.rol === nueva.rol) return { ...actual, debeCambiarContrasena: nueva.debeCambiarContrasena };
  return { ...nueva, nombre: '', documento: null, jass: null };
}

/**
 * Restaura la sesión y separa el portal de familias de las rutas del personal.
 */
export function App({ api }: { api: ClienteApi }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [listo, setListo] = useState(false);
  const [expirada, setExpirada] = useState(false);
  const [ruta, setRuta] = useState(() => window.location.pathname);

  const navegar = useCallback((destino: string) => {
    if (window.location.pathname !== destino) {
      window.history.pushState({ retorno: window.location.pathname }, '', destino);
    }
    setRuta(destino);
  }, []);

  useEffect(() => {
    let vigente = true;
    api.configurar({
      alIniciarSesion: (nueva) => {
        setExpirada(false);
        setSesion((actual) => fusionar(actual, nueva));
      },
      onSesionExpirada: () => {
        setSesion(null);
        setExpirada(true);
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
    const cierre = api.cerrarSesion();
    setSesion(null);
    navegar(RUTA_INGRESO);
    await cierre;
  }, [api, navegar]);

  // Sin sesión solo existe el ingreso; con sesión, cada perfil ve únicamente sus pantallas.
  const destino = listo ? destinoPara(sesion?.perfil ?? null, ruta) : null;
  // La guardia solo corrige la barra de direcciones; la pantalla ya sale de `destino`.
  useEffect(() => {
    if (destino !== null && window.location.pathname !== destino) window.history.replaceState(null, '', destino);
  }, [destino]);

  const valor = useMemo(() => ({ api, sesion, navegar, salir }), [api, sesion, navegar, salir]);
  if (!listo || destino === null) return <main><Carga /></main>;

  return (
    <Contexto.Provider value={valor}>
      {sesion === null ? <Ingreso expirada={expirada} /> : sesion.debeCambiarContrasena ? <CambiarClave obligatorio /> : (
        <Suspense fallback={<main><Carga /></main>}>
          {sesion.perfil === 'personal' ? <Personal ruta={destino} /> : sesion.perfil === 'plataforma' ? <Plataforma /> : <Portal ruta={destino} />}
        </Suspense>
      )}
    </Contexto.Provider>
  );
}
