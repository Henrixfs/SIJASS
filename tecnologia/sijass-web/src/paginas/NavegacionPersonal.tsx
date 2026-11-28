import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../contexto';
import { useEnvio } from '../hooks';
import { ROL_NOMBRE, nombreSeccion, seccionesPersonal } from '../lib/personal';
import { Av, Avisos, Ic, Olas, ROL_V3, useAvisar } from '../v3/base';

export function EnlacePersonal({ id, children, actual, alNavegar, className, etiqueta }: { id: string; children: ReactNode; actual?: boolean; alNavegar?: () => void; className?: string; etiqueta?: string }) {
  const { navegar } = useApp();
  const href = `/personal/${id}`;
  return <a href={href} className={className} aria-label={etiqueta} aria-current={actual ? 'page' : undefined} onClick={(e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    alNavegar?.();
    navegar(href);
  }}>{children}</a>;
}

const CLAVE_FIJADO = 'sijass.menu-fijado';

function leerFijado(): boolean {
  try {
    return localStorage.getItem(CLAVE_FIJADO) === 'si';
  } catch {
    return false;
  }
}

/** Al entrar al panel, una sola vez: si hay reportes nuevos de las familias, se avisa en la cinta inferior. */
function AvisoReportesNuevos({ n }: { n: number }) {
  const avisar = useAvisar();
  const avisado = useRef(false);
  useEffect(() => {
    if (avisado.current || n <= 0) return;
    const reloj = window.setTimeout(() => {
      avisado.current = true;
      avisar(n === 1 ? 'Hay 1 reporte nuevo de las familias' : `Hay ${n} reportes nuevos de las familias`, 'megafono');
    }, 1300);
    return () => window.clearTimeout(reloj);
  }, [n, avisar]);
  return null;
}

/** El menú se abre al pasar el puntero solo en el riel de escritorio; en pantallas angostas lo abre «Menú». */
const menuDeEscritorio = () => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 901px)').matches;

/** Reportes recién llegados (registrados y sin atender): el globo junto a «Reportes». */
function useReportesNuevos(activo: boolean, ruta: string): number {
  const { api } = useApp();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    api.solicitar<{ incidencias: unknown[] }>('GET', '/v1/incidencias?estado=registrada&limite=100')
      .then((r) => { if (vigente) setN(Array.isArray(r?.incidencias) ? r.incidencias.length : 0); }, () => undefined);
    return () => { vigente = false; };
  }, [api, activo, ruta]);
  return n;
}

/**
 * Armazón del panel del personal (maqueta v3): menú oscuro a la izquierda que se abre al pasar el
 * mouse y se cierra al salir; se puede fijar. En pantallas angostas, el botón «Menú» lo abre.
 */
export function MarcoPersonal({ ruta, seccion, rol, children }: { ruta: string; seccion: string; rol: string; children: ReactNode }) {
  const { salir, sesion } = useApp();
  const { enviando, ejecutar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [fijado, setFijado] = useState(leerFijado);
  const riel = useRef<HTMLElement>(null);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const principal = useRef<HTMLElement>(null);
  const tAbrir = useRef(0);
  const tCerrar = useRef(0);
  const tocoCerrado = useRef(false);
  const anterior = useRef(seccion);

  useEffect(() => {
    // Al cambiar de sección el foco pasa al contenido; abrir o cerrar una cuenta no lo mueve.
    if (anterior.current !== seccion && !document.querySelector('dialog[open]')) {
      principal.current?.focus({ preventScroll: true });
      document.scrollingElement?.scrollTo?.(0, 0);
    }
    anterior.current = seccion;
  }, [seccion]);
  useEffect(() => () => { window.clearTimeout(tAbrir.current); window.clearTimeout(tCerrar.current); }, []);
  useEffect(() => {
    // En pantalla táctil, tocar fuera del menú lo cierra.
    const fuera = (e: PointerEvent) => { if (e.pointerType === 'touch' && !riel.current?.contains(e.target as Node) && !botonMenu.current?.contains(e.target as Node)) setAbierto(false); };
    window.addEventListener('pointerdown', fuera);
    return () => window.removeEventListener('pointerdown', fuera);
  }, []);

  const permitidas = seccionesPersonal.filter((s) => s.roles.includes(rol));
  const enMenu = permitidas.filter((s) => s.enMenu);
  const posicion = enMenu.findIndex((s) => s.id === seccion);
  const nombreRol = Object.hasOwn(ROL_NOMBRE, rol) ? ROL_NOMBRE[rol] : 'Acceso restringido';
  const v3 = ROL_V3[rol] ?? ROL_V3.consejo;
  const nuevos = useReportesNuevos(rol === 'consejo' || rol === 'operador', ruta);
  const abiertoVisible = abierto || fijado;
  const elegir = () => { window.clearTimeout(tAbrir.current); setAbierto(false); };
  const alternarFijado = () => setFijado((f) => {
    try { localStorage.setItem(CLAVE_FIJADO, f ? 'no' : 'si'); } catch { /* sin almacenamiento: solo esta sesión */ }
    return !f;
  });

  return (
    <div className="v3">
      <Avisos>
        <AvisoReportesNuevos n={nuevos} />
        <div className={`esc-panel ${fijado ? 'fijado' : ''}`} data-rol={rol}>
          <a className="saltar" href="#principal">Ir al contenido</a>
          <header className="barra-movil">
            <span className="marca"><span className="gota"><Ic n="gota" /></span>SIJASS</span>
            <button ref={botonMenu} type="button" className="abrir-menu" aria-expanded={abierto} aria-controls="riel-personal" onClick={() => { window.clearTimeout(tCerrar.current); window.clearTimeout(tAbrir.current); setAbierto((v) => !v); }}>
              <Ic n={abierto ? 'equis' : 'grid'} />Menú
            </button>
          </header>
          <aside
            ref={riel} id="riel-personal" className={`riel ${abiertoVisible ? 'abierto' : ''}`} aria-label="Menú del panel"
            onPointerEnter={(e) => { if (e.pointerType === 'touch' || !menuDeEscritorio()) return; window.clearTimeout(tCerrar.current); tAbrir.current = window.setTimeout(() => setAbierto(true), 80); }}
            onPointerLeave={(e) => { if (e.pointerType === 'touch' || !menuDeEscritorio()) return; window.clearTimeout(tAbrir.current); tCerrar.current = window.setTimeout(() => setAbierto(false), 220); }}
            onPointerDown={(e) => { tocoCerrado.current = e.pointerType === 'touch' && !abiertoVisible; }}
            onClickCapture={(e) => { if (tocoCerrado.current) { tocoCerrado.current = false; e.preventDefault(); e.stopPropagation(); setAbierto(true); } }}
            onFocus={(e) => { if ((e.target as HTMLElement).matches?.(':focus-visible')) setAbierto(true); }}
            onBlur={(e) => { if (!riel.current?.contains(e.relatedTarget as Node) && !riel.current?.matches(':hover')) setAbierto(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape' && abierto) { setAbierto(false); if (botonMenu.current?.offsetParent) botonMenu.current.focus(); } }}
          >
            <Olas />
            <div className="marca"><span className="gota"><Ic n="gota" /></span><span className="txt">SIJASS</span></div>
            <div className="jass-r"><span><Ic n="lugar" /></span><div className="txt"><b data-testid="nombre-jass">{sesion?.jass?.nombre ?? 'Tu JASS'}</b><small data-testid="rol-actual">{nombreRol}</small></div></div>
            <nav className="nav" aria-label="Secciones del personal">
              <div className="luz" style={{ transform: `translateY(${Math.max(0, posicion) * 54}px)`, opacity: posicion < 0 ? 0 : 1 }} />
              {enMenu.map((s) => (
                <EnlacePersonal key={s.id} id={s.id} actual={seccion === s.id} alNavegar={elegir} className={seccion === s.id ? 'on' : ''}>
                  <Ic n={s.icono} /><span className="txt">{nombreSeccion(s, rol)}</span>
                  {s.id === 'reportes' && nuevos > 0 && <em className="globo" aria-label={`${nuevos} sin atender`}>{nuevos}</em>}
                </EnlacePersonal>
              ))}
            </nav>
            <div className="abajo">
              <button type="button" className="rail-bt" aria-pressed={fijado} onClick={alternarFijado}><Ic n="pin" /><span className="txt">{fijado ? 'Soltar menú' : 'Fijar menú'}</span></button>
              <button type="button" className="rail-bt" disabled={enviando} onClick={() => void ejecutar(salir)}><Ic n="salir" /><span className="txt">{enviando ? 'Saliendo…' : 'Salir'}</span></button>
              <EnlacePersonal id="perfil" className="yo" etiqueta={`Mi perfil (${nombreRol})`} actual={seccion === 'perfil'} alNavegar={elegir}>
                <Av indice={v3.avatar} insignia={v3.insignia} />
                <div className="txt"><b>{sesion?.nombre || nombreRol}</b><small>{nombreRol}</small></div>
              </EnlacePersonal>
            </div>
          </aside>
          <div className="sombra-riel" />
          <div className="velo-riel" onClick={() => setAbierto(false)} />
          <main id="principal" className="cuerpo" ref={principal} tabIndex={-1}>
            <div key={seccion} className={`vista ver v-${seccion} r-${rol}`}>{children}</div>
          </main>
        </div>
      </Avisos>
    </div>
  );
}

/** Cabecera de cada vista: título, subtítulo, acciones y la persona que usa el panel. */
export function TituloVista({ titulo, sub, acciones }: { titulo: string; sub: ReactNode; acciones?: ReactNode }) {
  const { sesion } = useApp();
  const rol = sesion?.rol ?? '';
  const v3 = ROL_V3[rol] ?? ROL_V3.consejo;
  return (
    <div className="titulo-v">
      <div><h1 tabIndex={-1}>{titulo}</h1><p>{sub}</p></div>
      <div className="titulo-a">{acciones}<span className="quien"><Av indice={v3.avatar} tam="s" /><span><b>{sesion?.nombre || v3.titulo}</b><small>{v3.titulo}</small></span></span></div>
    </div>
  );
}
