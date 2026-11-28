/**
 * Piezas de la interfaz v3, copiadas de la maqueta «Altiplano 3» (docs/diseno/propuesta-altiplano).
 * Mismo marcado y mismas clases que la maqueta; los datos llegan de la API.
 */
import {
  createContext, Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { VistaCuota } from '../api/tipos';
import { indiceAvatar, marcadoAvatar } from '../altiplano/avatares';
import { Olas } from '../altiplano/componentes';
import { formatearSoles } from '../lib/dinero';
import { FOTOS, type Foto, type NombreFoto } from '../lib/fotos';
import { CATEGORIAS, type Categoria } from '../lib/incidencias';
import { Ic, type NombreIcono } from './iconos';
import { mesDe } from './datos';
import '../paginas/clave.css';

export { Olas, Ic };
export type { NombreIcono };

// ───────────────────────── Avatares ─────────────────────────

/** Avatar ilustrado (s, m, l, xl). Decorativo: el nombre siempre va escrito al lado. */
export function Av({ id, indice, tam = '', insignia }: { id?: string; indice?: number; tam?: '' | 's' | 'm' | 'l' | 'xl'; insignia?: NombreIcono }) {
  const n = indice ?? indiceAvatar(id ?? '');
  return (
    <span className={`av ${tam}`} aria-hidden="true" data-avatar={n}>
      {/* El marcado sale del catálogo fijo de avatares.ts: ningún dato del usuario entra aquí. */}
      <svg className="cara" viewBox="0 0 80 80" dangerouslySetInnerHTML={{ __html: marcadoAvatar(n) }} />
      {insignia && <i><Ic n={insignia} /></i>}
    </span>
  );
}

/** Avatar e insignia de cada rol del personal (la cuenta no guarda un avatar propio). */
export const ROL_V3: Record<string, { titulo: string; avatar: number; insignia: NombreIcono }> = {
  consejo: { titulo: 'Consejo', avatar: 3, insignia: 'shield' },
  tesorero: { titulo: 'Tesorería', avatar: 4, insignia: 'wallet' },
  operador: { titulo: 'Operación', avatar: 5, insignia: 'flask' },
};

/** Avatar de una persona del equipo: el de su rol; si hay varias del mismo rol, alternan por su orden en la lista. */
const POR_ROL: Record<string, number[]> = { consejo: [3, 8], tesorero: [4, 15], operador: [5, 6, 13, 9] };
export function avatarDePersonal(rol: string, orden = 0): number {
  const lista = POR_ROL[rol] ?? POR_ROL.consejo;
  return lista[orden % lista.length];
}
/** Orden de cada persona dentro de su rol, para que dos del mismo rol no compartan avatar. */
export function ordenEnRol(equipo: Array<{ usuarioId: string; rol: string }>): Record<string, number> {
  const cuenta: Record<string, number> = {};
  return Object.fromEntries(equipo.map((p) => { const n = cuenta[p.rol] ?? 0; cuenta[p.rol] = n + 1; return [p.usuarioId, n]; }));
}

// ───────────────────────── Botones y campos ─────────────────────────

export function Bt({ clase = 'borde', ic, children, type = 'button', className = '', ...resto }: ButtonHTMLAttributes<HTMLButtonElement> & { clase?: string; ic?: NombreIcono }) {
  return <button type={type} className={`bt ${clase} ${className}`} {...resto}>{ic && <Ic n={ic} />}{children}</button>;
}

export function Campo({ id, etiqueta, icono, error, sufijo, alto = false, ...entrada }: InputHTMLAttributes<HTMLInputElement> & {
  id: string; etiqueta: ReactNode; icono?: NombreIcono; error?: string | null; sufijo?: ReactNode; alto?: boolean;
}) {
  return (
    <>
      <label htmlFor={id}>{etiqueta}</label>
      <div className={`campo ${alto ? 'alto' : ''} ${error ? 'mal' : ''}`}>
        {icono && <Ic n={icono} />}
        <input id={id} autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...entrada} />
        {sufijo}
      </div>
      {error && <p className="error" id={`${id}-error`} role="alert">{error}</p>}
    </>
  );
}

/** Opciones grandes que se tocan (segmentos, personas, avatares). */
export function Elegibles<T extends string>({ id, etiqueta, clase, opciones, valor, elegir, deshabilitado }: {
  id: string; etiqueta: ReactNode; clase: string; valor: T | null; elegir: (v: T) => void; deshabilitado?: boolean;
  opciones: Array<{ valor: T; contenido: ReactNode; nombre?: string }>;
}) {
  return (
    <>
      {etiqueta !== '' && <span className="etq" id={`${id}-t`}>{etiqueta}</span>}
      <div className={`elegibles ${clase}`} id={id} role="group" aria-labelledby={etiqueta !== '' ? `${id}-t` : undefined}>
        {opciones.map((o) => (
          <button key={o.valor} type="button" aria-pressed={o.valor === valor} aria-label={o.nombre} disabled={deshabilitado} onClick={() => elegir(o.valor)}>{o.contenido}</button>
        ))}
      </div>
    </>
  );
}

// ───────────────────────── Fotos ─────────────────────────

export const fondo = (f: Foto): CSSProperties => ({ backgroundImage: `url('${f.url}')`, backgroundPosition: f.encuadre });
export const Credito = ({ foto }: { foto: Foto }) => <span className="credito">Foto referencial · {foto.autor} · {foto.licencia}</span>;

/** Foto fija de cada reservorio según su lugar en la lista (las fotos son referenciales). */
const PARA_RESERVORIOS: NombreFoto[] = ['tinajones', 'puquio', 'gocta', 'bofedales', 'humedal'];
export const fotoReservorio = (i: number): Foto => FOTOS[PARA_RESERVORIOS[i % PARA_RESERVORIOS.length]];

export function Heroe({ foto, sobre, titulo, texto, acciones, vidrio }: { foto: Foto; sobre: string; titulo: string; texto: string; acciones: ReactNode; vidrio: ReactNode }) {
  return (
    <div className="heroe">
      <div className="img" style={fondo(foto)} role="img" aria-label={foto.descripcion} />
      <div className="v" />
      <div className="t"><small>{sobre}</small><h1>{titulo}</h1><p>{texto}</p><div className="acc">{acciones}</div></div>
      <div className="saldo">{vidrio}</div>
      <Credito foto={foto} />
      <Olas />
    </div>
  );
}

export function Banda({ foto, sobre, titulo, texto, children }: { foto: Foto; sobre: string; titulo: ReactNode; texto: ReactNode; children?: ReactNode }) {
  return (
    <div className="banda">
      <div className="img" style={fondo(foto)} role="img" aria-label={foto.descripcion} />
      <div className="v" />
      <div className="c"><span className="sobre">{sobre}</span><h3>{titulo}</h3><p>{texto}</p>{children}</div>
      <Credito foto={foto} />
      <Olas />
    </div>
  );
}

// ───────────────────────── Gotas por mes, estanque y columnas ─────────────────────────

const FORMA_GOTA = 'M19 2C19 2 3 20 3 29a16 16 0 0 0 32 0C35 20 19 2 19 2z';
const ESTADO_GOTA = { pagada: ['pag', 'pagado'], parcial: ['parc', 'parcial'], pendiente: ['pend', 'pendiente'] } as const;

/** Gota de un mes: llena = pagado, a medias = parcial, vacía = pendiente. */
export function GotaMes({ cuota }: { cuota: VistaCuota }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [clase, estado] = ESTADO_GOTA[cuota.estado];
  const nombre = mesDe(cuota.periodo);
  const marca = cuota.estado === 'pagada' ? '✓' : String(Math.round(cuota.pendienteCentimos / 10) / 10);
  const vacio = cuota.importeCentimos > 0 ? Math.min(1, Math.max(0, cuota.pendienteCentimos / cuota.importeCentimos)) : 1;
  return (
    <span className={`mes ${clase}`} title={`${nombre}: ${estado}`}>
      <svg viewBox="0 0 38 46" role="img" aria-label={`${nombre}: ${estado}`}>
        <clipPath id={id}><path d={FORMA_GOTA} /></clipPath>
        <path className="contorno" d={FORMA_GOTA} />
        <g clipPath={`url(#${id})`}><rect className="relleno" width="38" height="46" style={{ ['--vacio' as string]: `${vacio * 100}%` }} /></g>
        <text className="marca-m" x="19" y="34">{marca}</text>
      </svg>
      {nombre.slice(0, 3)}
    </span>
  );
}

export function Gotas({ cuotas, n = 4 }: { cuotas: VistaCuota[]; n?: number }) {
  const ultimas = [...cuotas].sort((a, b) => a.periodo.localeCompare(b.periodo)).slice(-n);
  return <div className="gotas">{ultimas.map((c) => <GotaMes key={c.id} cuota={c} />)}</div>;
}

export function Estanque({ pct, cobrado, emitido }: { pct: number; cobrado: number; emitido: number }) {
  return (
    <section className="tarj">
      <h3>Cobrado</h3>
      <div className="estanque" role="img" aria-label={`${pct} por ciento cobrado`}>
        <div className="nivel" style={{ ['--h' as string]: `${pct}%` }}><Olas /></div>
        <div className="lec"><b>{pct}%</b><span>de lo emitido</span></div>
        <p className="pie-e">{formatearSoles(cobrado)} de {formatearSoles(emitido)}</p>
      </div>
    </section>
  );
}

export function Columnas({ porMes, importeCuota }: { porMes: Array<{ periodo: string; emitido: number; cobrado: number }>; importeCuota: number | null }) {
  return (
    <section className="tarj">
      <h3>Cobranza por mes {importeCuota !== null && <small>cuota {formatearSoles(importeCuota)}</small>}</h3>
      {porMes.length === 0 ? <p className="nota">Todavía no hay cuotas generadas.</p> : (
        <div className="columnas" style={{ gridTemplateColumns: `repeat(${porMes.length},1fr)` }}>
          {porMes.map((m) => (
            <div className="col" key={m.periodo}>
              <div className="tubo" role="img" aria-label={`${mesDe(m.periodo)}: ${formatearSoles(m.cobrado)} de ${formatearSoles(m.emitido)}`}>
                <div className="nivel" style={{ ['--h' as string]: `${m.emitido ? ((m.cobrado / m.emitido) * 100).toFixed(1) : 0}%` }}><Olas /></div>
              </div>
              <b>{mesDe(m.periodo)}</b>
              <small>{formatearSoles(m.cobrado)} de {(m.emitido / 100).toFixed(2)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Reportes: iconos y chips ─────────────────────────

const ICONO_CAT: Record<Categoria, NombreIcono> = { fuga: 'c-fuga', interrupcion: 'c-corte', 'calidad-observada': 'c-turbia', presion: 'c-presion', averia: 'c-averia', otra: 'c-otro' };
export function IconoCat({ categoria, tam = '' }: { categoria: Categoria; tam?: '' | 's' | 'xl' }) {
  return <span className={`cat-i ${tam}`} style={{ ['--c' as string]: CATEGORIAS[categoria].color }} aria-hidden="true"><Ic n={ICONO_CAT[categoria]} /></span>;
}

// ───────────────────────── Avisos (cinta inferior) ─────────────────────────

type Avisar = (texto: string, icono?: NombreIcono) => void;
const ContextoAvisos = createContext<Avisar>(() => undefined);
export const useAvisar = () => useContext(ContextoAvisos);

export function Avisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{ texto: string; icono: NombreIcono; n: number } | null>(null);
  const reloj = useRef(0);
  const avisar = useCallback<Avisar>((texto, icono = 'check') => {
    window.clearTimeout(reloj.current);
    setAviso((a) => ({ texto, icono, n: (a?.n ?? 0) + 1 }));
    reloj.current = window.setTimeout(() => setAviso(null), 4200);
  }, []);
  useEffect(() => () => window.clearTimeout(reloj.current), []);
  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}
      {aviso && <div key={aviso.n} className="aviso ver" role="status" data-testid="aviso-ok"><Ic n={aviso.icono} /><span>{aviso.texto}</span></div>}
    </ContextoAvisos.Provider>
  );
}

// ───────────────────────── Cajón lateral ─────────────────────────

/**
 * Cajón que entra por la derecha (modal nativo: atrapa el foco y deja inerte el resto).
 * `onEnviar` recibe el envío del formulario del cajón.
 */
export function Cajon({ sobre, titulo, texto, children, pie, onEnviar, cerrar, etiqueta }: {
  sobre: string; titulo: string; texto?: ReactNode; children: ReactNode; pie: ReactNode; onEnviar?: () => void; cerrar: () => void; etiqueta?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const tituloAnterior = useRef(titulo);
  const tituloId = useId();
  // Si el cajón pasa a otro estado (por ejemplo, «Acceso creado»), el foco va al título nuevo.
  useEffect(() => {
    if (tituloAnterior.current !== titulo) encabezado.current?.focus({ preventScroll: true });
    tituloAnterior.current = titulo;
  }, [titulo]);
  useLayoutEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    const anterior = document.activeElement;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    const campo = d.querySelector<HTMLElement>('.contenido input:not([type="file"]):not([disabled]), .contenido textarea, .contenido select');
    (campo ?? d.querySelector<HTMLElement>('.pie button[type="submit"]') ?? d.querySelector<HTMLElement>('.cerrar'))?.focus({ preventScroll: true });
    return () => {
      if (typeof d.close === 'function' && d.open) d.close();
      if (anterior instanceof HTMLElement && anterior.isConnected && !d.contains(anterior)) anterior.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={dialogo} className="cajon ver" aria-labelledby={tituloId} aria-modal="true"
      onCancel={(e) => { e.preventDefault(); cerrar(); }}
      onClick={(e) => { if (e.target === dialogo.current) cerrar(); }}>
      <div className="cab">
        <span className="sobre">{sobre}</span>
        <h2 id={tituloId} ref={encabezado} tabIndex={-1}>{titulo}</h2>
        {texto && <p>{texto}</p>}
        <button type="button" className="cerrar" aria-label="Cerrar" onClick={cerrar}><Ic n="equis" /></button>
        <Olas />
      </div>
      <form className="cajon-form" noValidate aria-label={etiqueta ?? titulo} onSubmit={(e) => { e.preventDefault(); onEnviar?.(); }}>
        <div className="contenido">{children}</div>
        <div className="pie">{pie}</div>
      </form>
    </dialog>
  );
}

/** Final de un cajón: gota con check, título y lo que pasó. */
export function Final({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return <div className="final" role="status"><span className="gota"><Ic n="check" className="grande" /></span><h3>{titulo}</h3>{children}</div>;
}

// ───────────────────────── Clave temporal ─────────────────────────

/**
 * Clave temporal de tres palabras: se muestra una sola vez, grande, con nombre y DNI; se puede copiar o
 * imprimir en una tarjeta. Vive solo en el estado de quien la muestra (nunca en el almacenamiento).
 */
export function ClaveV3({ clave, nombre, documento, claras = true }: { clave: string; nombre: string; documento?: string | null; claras?: boolean }) {
  const [copia, setCopia] = useState<'' | 'ok' | 'fallo'>('');
  const partes = clave.split('-');
  return (
    <div className="clave-v3">
      <p className="nota">Clave temporal de <b>{nombre}</b>{documento ? ` (DNI ${documento})` : ''}. Se muestra una sola vez: entrégala en persona.</p>
      <div className={`palabras ${claras ? 'claras' : ''}`} data-testid="clave-temporal" role="group" aria-label="Clave temporal">
        {partes.map((p, i) => <Fragment key={i}>{i > 0 && <i className="sep">-</i>}<span>{p}</span></Fragment>)}
      </div>
      <div className="acc-clave">
        <Bt clase="borde" onClick={async () => { try { await navigator.clipboard.writeText(clave); setCopia('ok'); } catch { setCopia('fallo'); } }}>Copiar</Bt>
        <Bt clase="borde" onClick={() => window.print()}>Imprimir tarjeta</Bt>
      </div>
      {copia && <p className="nota" role="status">{copia === 'ok' ? 'Clave copiada.' : 'No se pudo copiar. Escríbela tal como está.'}</p>}
      {/* En <body>, para que al imprimir salga sola: ni el cajón ni los estilos de pantalla la recortan. */}
      {createPortal(
        <div className="tarjeta-impresa" aria-hidden="true">
          <h3>SIJASS · Tu acceso</h3>
          <dl><dt>Nombre</dt><dd>{nombre}</dd>{documento ? <><dt>DNI</dt><dd>{documento}</dd></> : null}<dt>Clave</dt><dd className="clave-impresa">{clave}</dd></dl>
          <p>Entra con tu DNI y esta clave. Escríbela tal como está. No la compartas.</p>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ───────────────────────── Tapa (confirmación dentro de una tarjeta) ─────────────────────────

export function Tapa({ abierta, children }: { abierta: boolean; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => { if (abierta) window.setTimeout(() => caja.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }), 60); }, [abierta]);
  return <div ref={caja} className={`tapa ${abierta ? 'ver' : ''}`} role={abierta ? 'group' : undefined}>{abierta ? children : null}</div>;
}

// ───────────────────────── Vacío y carga ─────────────────────────

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="cargando-v3" role="status"><span className="gota"><Ic n="gota" /></span><span>{texto}</span></div>;
}

export function FalloCarga({ texto, recargar }: { texto: string; recargar: () => void }) {
  return <div className="fallo-v3" role="alert"><p>{texto}</p><Bt clase="borde" onClick={recargar}>Reintentar</Bt></div>;
}
