import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../contexto';
import { Boton } from '../ui';
import { ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { IconoModulo, Marca } from '../identidad';
import { useEnvio } from '../hooks';
import { GRUPOS_PERSONAL, ROL_NOMBRE, seccionesPersonal } from '../lib/personal';
import { guardarPanelPlegado, leerPanelPlegado } from '../lib/panel';
import './personal.css';

export function EnlacePersonal({ id, children, actual, alNavegar, className, etiqueta, titulo }: { id: string; children: ReactNode; actual?: boolean; alNavegar?: () => void; className?: string; etiqueta?: string; titulo?: string }) {
  const { navegar } = useApp();
  const href = `/personal/${id}`;
  return <a href={href} className={className} aria-label={etiqueta} title={titulo} aria-current={actual ? 'page' : undefined} onClick={(e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    alNavegar?.();
    navegar(href);
  }}>{children}</a>;
}

const INICIALES_ROL: Record<string, string> = { consejo: 'CO', tesorero: 'TE', operador: 'OP' };

export function MarcoPersonal({ ruta, seccion, rol, children }: { ruta: string; seccion: string; rol: string; children: ReactNode }) {
  const { salir, sesion } = useApp();
  const { enviando, ejecutar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  // Panel plegado en escritorio (solo desde 1024 px): se recuerda en el navegador y abre ya en su estado, sin animar.
  const [plegado, setPlegado] = useState(leerPanelPlegado);
  const [listo, setListo] = useState(false);
  const principal = useRef<HTMLElement>(null);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const anterior = useRef(ruta);
  useEffect(() => {
    if (anterior.current !== ruta) {
      // Sin `preventScroll` el foco desplazaría la página y ocultaría la cabecera.
      principal.current?.focus({ preventScroll: true });
      document.scrollingElement?.scrollTo?.(0, 0);
    }
    anterior.current = ruta;
  }, [ruta]);
  useEffect(() => {
    // La transición del panel se activa tras el primer pintado: así la página no «se pliega sola» al cargar.
    const cuadro = window.requestAnimationFrame(() => setListo(true));
    return () => window.cancelAnimationFrame(cuadro);
  }, []);

  function alternarPanel() {
    const siguiente = !plegado;
    setPlegado(siguiente);
    guardarPanelPlegado(siguiente);
  }

  const permitidas = seccionesPersonal.filter((s) => s.roles.includes(rol));
  const actual = seccionesPersonal.find((s) => s.id === seccion);
  const nombreRol = Object.hasOwn(ROL_NOMBRE, rol) ? ROL_NOMBRE[rol] : 'Acceso restringido';
  const iniciales = Object.hasOwn(INICIALES_ROL, rol) ? INICIALES_ROL[rol] : '··';

  return (
    <div className="marco-personal" data-plegado={plegado ? 'true' : 'false'} data-listo={listo ? 'true' : undefined}>
      <a className="saltar" href="#principal">Ir al contenido</a>
      <aside className="lateral">
        <div className="lateral-marca">
          <EnlacePersonal id="inicio"><Marca /></EnlacePersonal>
          <button ref={botonMenu} type="button" className="abrir-menu" aria-expanded={abierto} aria-controls="secciones-personal" onClick={() => setAbierto((visible) => !visible)}>{abierto ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}<span>Menú</span></button>
        </div>
        <p className="lateral-lema">Gestión de agua comunitaria</p>
        <div className="lateral-jass" aria-label="Tu JASS">
          <span className="lateral-jass-icono"><IconoModulo id="reservorios" /></span>
          <span className="lateral-texto"><strong data-testid="nombre-jass">{sesion?.jass?.nombre ?? 'Tu JASS'}</strong><small>Administración · {nombreRol}</small></span>
        </div>
        <nav aria-label="Secciones del personal" id="secciones-personal" data-abierto={abierto} onKeyDown={(e) => {
          if (e.key !== 'Escape' || !abierto) return;
          setAbierto(false);
          botonMenu.current?.focus();
        }}>
          {GRUPOS_PERSONAL.map((g) => {
            const enGrupo = permitidas.filter((s) => s.grupo === g.id);
            if (enGrupo.length === 0) return null;
            return (
              <div key={g.id} className="lateral-grupo" role="group" aria-label={g.titulo}>
                <span className="lateral-grupo-titulo" aria-hidden="true">{g.titulo}</span>
                {enGrupo.map((s) => (
                  <EnlacePersonal key={s.id} id={s.id} actual={seccion === s.id} alNavegar={() => setAbierto(false)} titulo={plegado ? s.nombre : undefined}>
                    <IconoModulo id={s.id} /><span className="lateral-texto">{s.nombre}</span>
                  </EnlacePersonal>
                ))}
              </div>
            );
          })}
          <div className="lateral-grupo lateral-cuenta">
            {permitidas.filter((s) => s.grupo === 'cuenta').map((s) => (
              <EnlacePersonal key={s.id} id={s.id} actual={seccion === s.id} alNavegar={() => setAbierto(false)} className="lateral-usuario" etiqueta="Mi perfil" titulo={plegado ? 'Mi perfil' : undefined}>
                <span className="avatar-rol" aria-hidden="true">{iniciales}</span>
                <span className="lateral-texto"><strong>{sesion?.nombre || nombreRol}</strong><small>{nombreRol}</small></span>
                <ChevronRight className="lateral-flecha" size={16} aria-hidden="true" />
              </EnlacePersonal>
            ))}
          </div>
        </nav>
        <button
          type="button"
          className="plegar-panel"
          aria-expanded={!plegado}
          aria-controls="secciones-personal"
          aria-label={plegado ? 'Desplegar panel lateral' : 'Plegar panel lateral'}
          title={plegado ? 'Desplegar panel lateral' : undefined}
          onClick={alternarPanel}
        >
          {plegado ? <PanelLeftOpen aria-hidden="true" size={21} strokeWidth={1.7} /> : <PanelLeftClose aria-hidden="true" size={21} strokeWidth={1.7} />}
          <span className="lateral-texto">{plegado ? 'Desplegar' : 'Plegar panel'}</span>
        </button>
      </aside>
      <header className="cabecera-personal">
        <nav aria-label="Ruta de navegación" className="migas">
          <span>Operación</span><ChevronRight size={14} aria-hidden="true" />
          <strong aria-current="page">{actual?.nombre ?? 'Sección'}</strong>
        </nav>
        <span className="chip-rol" data-testid="rol-actual"><span className="nombre-area">Personal de la JASS · </span>{nombreRol}</span>
        <EnlacePersonal id="perfil" className="avatar-cabecera"><span className="solo-lectores">Mi perfil ({nombreRol})</span><span aria-hidden="true">{iniciales}</span></EnlacePersonal>
        <Boton disabled={enviando} onClick={() => void ejecutar(salir)}><LogOut size={17} aria-hidden="true" /> {enviando ? 'Saliendo…' : 'Salir'}</Boton>
      </header>
      <main id="principal" ref={principal} tabIndex={-1}><div key={ruta} className={`pagina-personal${seccion === 'inicio' ? ' pagina-inicio' : ''}`}>{children}</div></main>
    </div>
  );
}
