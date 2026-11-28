/**
 * Portal de las familias (maqueta v3): un celular. Inicio con saldo y gotas, «Reportar un problema»,
 * cuotas, pagos, perfil con avatar y el reporte en tres pasos. En una pantalla grande el celular se
 * muestra sobre la laguna; en el celular ocupa toda la pantalla.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { SaldoPortal, VistaCuota, VistaPago } from '../api/tipos';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { formatearSoles } from '../lib/dinero';
import { ALCANCES, CATEGORIAS, ESTADO_FAMILIA, FRASES, fechaHora, textoEvento, type Alcance, type Categoria, type EventoIncidencia, type Incidencia } from '../lib/incidencias';
import { horaLima } from '../lib/periodos';
import { nuevoUuid } from '../lib/uuid';
import { CANTIDAD_AVATARES } from '../altiplano/avatares';
import { Av, Avisos, Bt, Cargando, Elegibles, Gotas, Ic, IconoCat, Olas, useAvisar, type NombreIcono } from '../v3/base';
import { cuando, mesDe, primerNombre } from '../v3/datos';
import { createPortal } from 'react-dom';
import { CambiarClave } from './CambiarClave';

interface Datos { saldo: SaldoPortal; cuotas: VistaCuota[]; pagos: VistaPago[] }

const RUTAS = { inicio: '/portal', cuotas: '/portal/cuotas', reportar: '/portal/reportar', pagos: '/portal/pagos', perfil: '/portal/perfil', reportes: '/portal/reportes' } as const;
type Pantalla = keyof typeof RUTAS;
const ALIAS: Record<string, Pantalla> = { '/portal/historial': 'pagos' };
const TITULOS: Record<Pantalla, string> = { inicio: 'Inicio', cuotas: 'Mis cuotas', reportar: 'Reportar un problema', pagos: 'Mis pagos', perfil: 'Mi perfil', reportes: 'Mis reportes' };
const PESTANAS: Array<[Pantalla, NombreIcono, string]> = [['inicio', 'home', 'Inicio'], ['cuotas', 'wallet', 'Cuotas'], ['reportar', 'megafono', 'Reportar'], ['pagos', 'recibo', 'Pagos'], ['perfil', 'persona', 'Perfil']];
const ICONO_ALCANCE: Record<Alcance, NombreIcono> = { individual: 'a-casa', 'varias-viviendas': 'a-casas', general: 'a-zona', desconocido: 'a-nose' };
const LUGARES = ['Mi casa', 'Camino principal', 'Cerca de la escuela'];
const LIMITE_FOTO = 5 * 1024 * 1024;
const CLAVE_AVATAR = 'sijass.avatar-portal';

function pantallaDe(ruta: string): Pantalla | null {
  const limpia = ruta.replace(/\/+$/, '') || '/portal';
  return ALIAS[limpia] ?? (Object.keys(RUTAS) as Pantalla[]).find((p) => RUTAS[p] === limpia) ?? null;
}

function Enlace({ a, className, children, ...resto }: { a: string; className?: string; children: ReactNode; 'aria-current'?: 'page'; 'aria-label'?: string }) {
  const { navegar } = useApp();
  const alPulsar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navegar(a);
  };
  return <a href={a} className={className} onClick={alPulsar} {...resto}>{children}</a>;
}

/** Barra de estado del celular: decorativa, solo en el marco de pantalla grande. */
const Hora = () => <div className="hora" aria-hidden="true"><span>{horaLima(new Date()).replace(/^0/, '')}</span><span>▂▄▆ ▮</span></div>;

/** El avatar lo elige cada persona; se recuerda en este celular. */
function useMiAvatar(): [number, (n: number) => void] {
  const [n, setN] = useState(() => {
    try { const v = Number(localStorage.getItem(CLAVE_AVATAR)); return Number.isInteger(v) && v >= 0 && v < CANTIDAD_AVATARES ? v : 0; } catch { return 0; }
  });
  return [n, (v) => { setN(v); try { localStorage.setItem(CLAVE_AVATAR, String(v)); } catch { /* solo esta sesión */ } }];
}

function CabSimple({ titulo, atras, avatar }: { titulo: string; atras?: string; avatar: number }) {
  return (
    <div className="p-top">
      <Hora />
      <div className="p-tit">
        {atras && <Enlace a={atras} className="p-atras" aria-label="Volver"><Ic n="volver" /></Enlace>}
        <h1 tabIndex={-1} data-titulo-pantalla>{titulo}</h1>
        <Av indice={avatar} tam="s" />
      </div>
      <Olas />
    </div>
  );
}

function Avance({ estado }: { estado: Incidencia['estado'] }) {
  const n = { registrada: 1, 'en-atencion': 2, cerrada: 3 }[estado];
  return (
    <ol className="avance" aria-label={`Avance: ${ESTADO_FAMILIA[estado]}`}>
      {['Enviado', 'En atención', 'Atendido'].map((t, k) => <li key={t} className={k < n ? 'hecho' : ''}><i><Ic n={k < n ? 'check' : 'gota'} /></i>{t}</li>)}
    </ol>
  );
}

// ───────────────────────── Pantallas ─────────────────────────

interface Refresco { cargando: boolean; actualizar: () => void }

/** Vuelve a pedir saldo, cuotas, pagos y reportes sin recargar la página. */
function Actualizar({ cargando, actualizar }: Refresco) {
  return <Bt clase="borde ancho p-salir" ic="actualizar" disabled={cargando} onClick={actualizar}>{cargando ? 'Actualizando…' : 'Actualizar'}</Bt>;
}

function Inicio({ datos, reportes, avatar, refresco }: { datos: Datos; reportes: Incidencia[] | null; avatar: number; refresco: Refresco }) {
  const { sesion } = useApp();
  const s = datos.saldo.saldoCentimos;
  const conSaldo = datos.cuotas.filter((c) => c.pendienteCentimos > 0).length;
  return (
    <>
      <div className="cab-m">
        <div className="img" role="img" aria-label="Laguna 69, Áncash: foto referencial" /><div className="v" /><Hora />
        <div className="t"><Av indice={avatar} tam="l" /><div><h1 tabIndex={-1} data-titulo-pantalla>Hola, <span data-testid="nombre-asociado">{primerNombre(datos.saldo.asociado.nombre)}</span></h1><p data-testid="portal-jass">{sesion?.jass?.nombre ?? 'Tu JASS'}</p></div></div>
        <Olas />
      </div>
      <div className="p-scroll sube">
        <div className="estado">
          <span className={`chip ${s > 0 ? 'pen' : 'ok'}`}><Ic n={s > 0 ? 'gota' : 'check'} />{s > 0 ? `Tienes ${conSaldo} ${conSaldo === 1 ? 'cuota' : 'cuotas'} por pagar` : 'Estás al día'}</span>
          <div className="n" data-testid="saldo">{formatearSoles(Math.max(0, s))}</div>
          {s < 0 && <p data-testid="a-favor">Saldo a tu favor: {formatearSoles(-s)}</p>}
          {datos.saldo.asociado.estado === 'baja' && <p>Cuenta dada de baja: solo puedes consultar tu historial.</p>}
          <Gotas cuotas={datos.cuotas} />
        </div>
        <Enlace a={RUTAS.reportar} className="reportar"><span className="r-i"><Ic n="megafono" /></span><span><b>Reportar un problema</b><small>Fuga, agua turbia, sin agua…</small></span><Ic n="flecha" /></Enlace>
        <div className="lista-m">
          <h2 className="h3">Mis reportes {reportes && reportes.length > 0 && <Enlace a={RUTAS.reportes} className="ver-todo">Ver todos</Enlace>}</h2>
          {reportes === null ? <Cargando /> : reportes.length === 0 ? <p className="p-nota">Todavía no has reportado nada.</p> : reportes.slice(0, 2).map((i) => (
            <Enlace key={i.id} a={RUTAS.reportes} className="p-inc"><IconoCat categoria={i.categoria} tam="s" /><span><b>{CATEGORIAS[i.categoria].texto}</b><small>{cuando(i.creadaEn)}</small></span><span className={`chip e-${i.estado}`}>{ESTADO_FAMILIA[i.estado]}</span></Enlace>
          ))}
        </div>
        <Actualizar {...refresco} />
      </div>
    </>
  );
}

function Cuotas({ datos, avatar, refresco }: { datos: Datos; avatar: number; refresco: Refresco }) {
  const ordenadas = [...datos.cuotas].sort((a, b) => b.periodo.localeCompare(a.periodo));
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <>
      <CabSimple titulo="Mis cuotas" avatar={avatar} />
      <div className="p-scroll">
        <div className="estado plano"><span className="etq">Saldo</span><div className="n" data-testid="saldo">{formatearSoles(Math.max(0, datos.saldo.saldoCentimos))}</div><Gotas cuotas={datos.cuotas} /></div>
        <div className="lista-m" data-testid="portal-cuotas">
          {ordenadas.length === 0 && <p className="p-nota">Todavía no tienes cuotas. Cuando tu JASS genere una, la verás aquí.</p>}
          {ordenadas.map((c) => (
            <div className="cuota-w" key={c.id}>
              <button type="button" className="fam" aria-expanded={abierta === c.id} aria-controls={abierta === c.id ? `cuota-${c.id}` : undefined}
                onClick={() => setAbierta(abierta === c.id ? null : c.id)}>
                <span className={`icono ${c.estado === 'pagada' ? '' : 'pen'}`}><Ic n={c.estado === 'pagada' ? 'check' : 'gota'} /></span>
                <span className="txt"><b>{mesDe(c.periodo)} {c.periodo.slice(0, 4)}</b><small>{c.estado === 'pagada' ? 'Pagada' : c.estado === 'parcial' ? `Parcial: faltan ${formatearSoles(c.pendienteCentimos)}` : 'Pendiente'}</small></span>
                <span className="m">{formatearSoles(c.importeCentimos)}</span>
                <Ic n="flecha" className="ver" />
              </button>
              {abierta === c.id && (
                <dl className="cuota-det" id={`cuota-${c.id}`} data-testid="detalle-cuota">
                  <div><dt>Importe de la cuota</dt><dd>{formatearSoles(c.importeCentimos)}</dd></div>
                  <div><dt>Pagado</dt><dd>{formatearSoles(c.pagadoCentimos)}</dd></div>
                  <div><dt>Por pagar</dt><dd>{formatearSoles(c.pendienteCentimos)}</dd></div>
                </dl>
              )}
            </div>
          ))}
        </div>
        <p className="p-nota" style={{ padding: '12px 22px' }}>Toca una cuota para ver su detalle. Coordina el pago y el comprobante con tu JASS.</p>
        <Actualizar {...refresco} />
      </div>
    </>
  );
}

type Rango = 'todo' | 'seis';
type EstadoFiltro = 'todos' | VistaPago['estado'];

function Pagos({ datos, avatar, refresco }: { datos: Datos; avatar: number; refresco: Refresco }) {
  const [rango, setRango] = useState<Rango>('todo');
  const [estado, setEstado] = useState<EstadoFiltro>('todos');
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 6);
  const filtrados = datos.pagos.filter((p) => (estado === 'todos' || p.estado === estado) && (rango === 'todo' || new Date(p.pagadoEn) >= limite));
  return (
    <>
      <CabSimple titulo="Mis pagos" avatar={avatar} />
      <div className="p-scroll">
        {datos.pagos.length > 0 && (
          <div className="filtros-p">
            <Elegibles id="f-periodo" etiqueta="Periodo" clase="segmentos" valor={rango} elegir={setRango}
              opciones={[{ valor: 'todo', contenido: 'Todo' }, { valor: 'seis', contenido: 'Últimos 6 meses' }]} />
            <Elegibles id="f-estado" etiqueta="Estado" clase="segmentos tres" valor={estado} elegir={setEstado}
              opciones={[{ valor: 'todos', contenido: 'Todos' }, { valor: 'vigente', contenido: 'Vigentes' }, { valor: 'revertido', contenido: 'Revertidos' }]} />
            <p className="p-nota" aria-live="polite" data-testid="contador-pagos">{filtrados.length} {filtrados.length === 1 ? 'pago' : 'pagos'}</p>
          </div>
        )}
        <div className="lista-m" data-testid="portal-pagos">
          {datos.pagos.length === 0 && <p className="p-nota">Todavía no hay pagos registrados.</p>}
          {datos.pagos.length > 0 && filtrados.length === 0 && <p className="p-nota">No hay pagos con ese filtro.</p>}
          {filtrados.map((p) => (
            <div className="fam" key={p.id} data-testid={`portal-pago-${p.comprobante}`}>
              <span className={`icono ${p.estado === 'vigente' ? '' : 'pen'}`}><Ic n={p.estado === 'vigente' ? 'check' : 'revertir'} /></span>
              <div><b>{mesDe(p.periodo)}</b><small>{cuando(p.pagadoEn)} · {p.comprobante}{p.estado === 'vigente' ? '' : ' · revertido'}</small></div>
              <span className="m">{formatearSoles(p.importeCentimos)}</span>
            </div>
          ))}
        </div>
        {datos.pagos.some((p) => p.estado === 'revertido') && <p className="p-nota" style={{ padding: '12px 22px' }}>Los pagos revertidos se conservan; su importe vuelve al saldo.</p>}
        <Actualizar {...refresco} />
      </div>
    </>
  );
}

function Perfil({ datos, avatar, elegirAvatar }: { datos: Datos; avatar: number; elegirAvatar: (n: number) => void }) {
  const { salir, sesion } = useApp();
  const avisar = useAvisar();
  const [cambiando, setCambiando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const botonSalir = useRef<HTMLDivElement>(null);
  const { enviando, ejecutar } = useEnvio();
  const quedarse = () => { setSaliendo(false); botonSalir.current?.querySelector('button')?.focus(); };
  const activo = datos.saldo.asociado.estado === 'activo';
  return (
    <>
      <CabSimple titulo="Mi perfil" avatar={avatar} />
      <div className="p-scroll">
        <div className="perfil-c">
          <Av indice={avatar} tam="xl" />
          <b>{datos.saldo.asociado.nombre}</b>
          {sesion?.documento && <small>DNI <span data-testid="portal-documento">{sesion.documento}</span></small>}
          <span className={`chip ${activo ? 'ok' : 'gris'}`}>{activo ? 'Acceso activo' : 'Cuenta dada de baja'}</span>
        </div>
        <div className="lista-m av-p">
          <h2 className="h3">Elige tu avatar</h2>
          <div className="avatares" role="group" aria-label="Avatares">
            {Array.from({ length: CANTIDAD_AVATARES }, (_, n) => (
              <button key={n} type="button" aria-pressed={n === avatar} aria-label={`Avatar ${n + 1}`} onClick={() => { elegirAvatar(n); avisar('Avatar actualizado'); }}><Av indice={n} tam="m" /></button>
            ))}
          </div>
          <p className="nota">Se guarda en este celular.</p>
        </div>
        <div className="lista-m">
          <dl className="p-datos">
            {sesion?.jass && <div><dt>JASS</dt><dd>{sesion.jass.nombre}</dd></div>}
            <div><dt>Estado en el padrón</dt><dd>{activo ? 'Activo' : 'Baja'}</dd></div>
            <div><dt>Periodo actual</dt><dd>{mesDe(datos.saldo.periodoActual)} {datos.saldo.periodoActual.slice(0, 4)}</dd></div>
          </dl>
        </div>
        <Bt clase="borde ancho p-salir" ic="candado" onClick={() => setCambiando(true)}>Cambiar mi clave</Bt>
        {cambiando && createPortal(<CambiarClave cerrar={() => setCambiando(false)} />, document.body)}
        <div ref={botonSalir} style={{ display: 'contents' }}>
          <Bt clase="borde ancho p-salir" ic="salir" aria-expanded={saliendo} disabled={enviando} onClick={() => setSaliendo(true)}>Salir</Bt>
        </div>
        {saliendo && (
          <div className="confirmar-c p-confirma" role="group" aria-label="Confirmar salida">
            <p>¿Cerrar tu sesión? Para volver a entrar necesitas tu DNI y tu clave.</p>
            <div className="botones-cuenta">
              <Bt clase="teal" autoFocus disabled={enviando} onClick={() => void ejecutar(salir)}>{enviando ? 'Saliendo…' : 'Sí, salir'}</Bt>
              <Bt clase="borde" disabled={enviando} onClick={quedarse}>Cancelar</Bt>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function HistorialPublico({ id }: { id: string }) {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<{ eventos: EventoIncidencia[] }>('GET', `/v1/incidencias/${id}/historial?limite=100`), [api, id]);
  const { datos } = useCarga(cargar);
  if (!datos) return null;
  return <ol className="tiempo">{[...datos.eventos].reverse().map((e, n) => <li key={`${e.creadoEn}-${n}`}><b>{textoEvento(e, true)}</b><small>{fechaHora(e.creadoEn)}</small></li>)}</ol>;
}

function MisReportes({ reportes, error, avatar, recien }: { reportes: Incidencia[] | null; error: string | null; avatar: number; recien: string | null }) {
  return (
    <>
      <CabSimple titulo="Mis reportes" atras={RUTAS.inicio} avatar={avatar} />
      <div className="p-scroll">
        {error && !reportes && <p className="p-aviso error" role="alert">No pudimos cargar tus reportes. {error}</p>}
        {reportes === null && !error && <Cargando />}
        {reportes?.length === 0 && <p className="p-nota" style={{ padding: 20 }}>Todavía no has reportado nada.</p>}
        <ul className="mis-reportes" aria-label="Mis reportes" style={{ listStyle: 'none' }}>
          {reportes?.slice(0, 10).map((i) => (
            <li key={i.id} className={`rep-f ${i.id === recien ? 'nuevo' : ''}`} data-testid={`mi-reporte-${i.id}`}>
              <header><IconoCat categoria={i.categoria} /><div><b>{CATEGORIAS[i.categoria].texto}</b><small>{i.ubicacion} · {cuando(i.creadaEn)}</small></div></header>
              <Avance estado={i.estado} />
              <p>«{i.descripcion}»</p>
              <HistorialPublico id={i.id} />
            </li>
          ))}
        </ul>
        <Enlace a={RUTAS.reportar} className="bt teal ancho p-salir"><Ic n="megafono" />Nuevo reporte</Enlace>
      </div>
    </>
  );
}

interface Borrador { paso: 1 | 2 | 3; categoria: Categoria | null; alcance: Alcance | null; ubicacion: string; descripcion: string; cuando: 'hoy' | 'ayer'; foto: File | null }
const nuevoBorrador = (): Borrador => ({ paso: 1, categoria: null, alcance: null, ubicacion: 'Mi casa', descripcion: '', cuando: 'hoy', foto: null });

function Reportar({ avatar, alEnviar }: { avatar: number; alEnviar: (i: Incidencia) => void }) {
  const { api, navegar } = useApp();
  const { enviando, ejecutar } = useEnvio();
  const [b, setB] = useState<Borrador>(nuevoBorrador);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ incidencia: Incidencia; avisoFoto: string | null } | null>(null);
  const [vistaFoto, setVistaFoto] = useState<string | null>(null);
  const clave = useRef(nuevoUuid());
  const titulo = useRef<HTMLHeadingElement>(null);
  const preguntas = ['¿Qué está pasando?', '¿A quiénes afecta?', 'Cuéntanos un poco más'];
  const ir = (cambios: Partial<Borrador>) => { setError(null); setB((x) => ({ ...x, ...cambios })); };
  useEffect(() => { titulo.current?.focus({ preventScroll: true }); }, [b.paso, enviado]);
  const urlFoto = useRef<string | null>(null);
  useEffect(() => () => { if (urlFoto.current) URL.revokeObjectURL(urlFoto.current); }, []);
  const ponerFoto = (f: File | null) => {
    if (urlFoto.current) URL.revokeObjectURL(urlFoto.current);
    urlFoto.current = f && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null;
    setVistaFoto(urlFoto.current);
    ir({ foto: f });
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!b.categoria || !b.alcance) return;
    if (!b.ubicacion.trim()) return setError('Escribe dónde es.');
    if (!b.descripcion.trim()) return setError('Toca una frase o escribe qué viste.');
    const categoria = b.categoria;
    const alcanceReportado = b.alcance;
    await ejecutar(async () => {
      setError(null);
      const observada = new Date();
      if (b.cuando === 'ayer') observada.setDate(observada.getDate() - 1);
      try {
        const incidencia = await api.solicitar<Incidencia>('POST', '/v1/incidencias', {
          categoria, alcanceReportado, descripcion: b.descripcion.trim(), ubicacion: b.ubicacion.trim(), observadaEn: observada.toISOString(),
        }, { 'Idempotency-Key': clave.current });
        let avisoFoto: string | null = null;
        if (b.foto) {
          try {
            await api.solicitar('PUT', `/v1/incidencias/${incidencia.id}/foto`, b.foto, { 'Idempotency-Key': nuevoUuid(), 'If-Match': String(incidencia.revision) });
          } catch {
            avisoFoto = 'Tu reporte se envió, pero la foto no se pudo subir. Puedes mostrarla a tu JASS.';
          }
        }
        setEnviado({ incidencia, avisoFoto });
        alEnviar(incidencia);
      } catch (err) {
        setError(mensajeDeError(err));
      }
    });
  }

  if (enviado) {
    return (
      <div className="p-hecho" role="status">
        <Hora />
        <span className="gota"><Ic n="check" className="grande" /></span>
        <h1 ref={titulo} tabIndex={-1} data-titulo-pantalla>¡Enviado a tu JASS!</h1>
        <p><b>{CATEGORIAS[enviado.incidencia.categoria].texto}</b></p>
        <p>Aquí verás cómo avanza.</p>
        {enviado.avisoFoto && <p className="aviso-foto" role="alert">{enviado.avisoFoto}</p>}
        <Enlace a={RUTAS.reportes} className="bt agua ancho">Ver mi reporte</Enlace>
        <Enlace a={RUTAS.inicio} className="bt claro ancho">Volver al inicio</Enlace>
        <Olas />
      </div>
    );
  }

  const atras = () => (b.paso === 1 ? navegar(RUTAS.inicio) : ir({ paso: (b.paso - 1) as 1 | 2 }));
  return (
    <>
      <div className="p-top paso-r">
        <Hora />
        <div className="p-tit">
          <button type="button" className="p-atras" onClick={atras} aria-label={b.paso === 1 ? 'Cancelar el reporte' : 'Volver al paso anterior'}><Ic n="volver" /></button>
          <div className="p-pasos" role="img" aria-label={`Paso ${b.paso} de 3`}>{[1, 2, 3].map((n) => <i key={n} className={n <= b.paso ? 'hecho' : ''} />)}</div>
          <Av indice={avatar} tam="s" />
        </div>
        <h1 ref={titulo} tabIndex={-1} data-titulo-pantalla>{preguntas[b.paso - 1]}</h1>
        <Olas />
      </div>
      {b.paso === 1 && (
        <div className="p-scroll"><div className="cats" role="group" aria-label="Qué está pasando">
          {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => (
            <button key={c} type="button" className="cat" aria-pressed={b.categoria === c} style={{ ['--c' as string]: CATEGORIAS[c].color }} onClick={() => ir({ categoria: c, paso: 2 })}>
              <IconoCat categoria={c} tam="xl" /><b>{CATEGORIAS[c].texto}</b><small>{CATEGORIAS[c].ayuda}</small>
            </button>
          ))}
        </div></div>
      )}
      {b.paso === 2 && (
        <div className="p-scroll"><div className="alcs" role="group" aria-label="A quiénes afecta">
          {(Object.keys(ALCANCES) as Alcance[]).map((a) => (
            <button key={a} type="button" className="alc" aria-pressed={b.alcance === a} onClick={() => ir({ alcance: a, paso: 3 })}>
              <span className="a-i"><Ic n={ICONO_ALCANCE[a]} /></span><b>{ALCANCES[a]}</b><Ic n="flecha" />
            </button>
          ))}
        </div></div>
      )}
      {b.paso === 3 && b.categoria && (
        <form className="p-scroll p-form" onSubmit={enviar} noValidate aria-label="Detalle del reporte">
          <label htmlFor="reporte-donde">¿Dónde es?</label>
          <div className="rapidas">{LUGARES.map((t) => <button key={t} type="button" onClick={() => ir({ ubicacion: t })}>{t}</button>)}</div>
          <div className="campo"><input id="reporte-donde" maxLength={300} value={b.ubicacion} autoComplete="off" onChange={(e) => ir({ ubicacion: e.target.value })} /></div>
          <label htmlFor="reporte-que">¿Qué viste?</label>
          <div className="rapidas">{FRASES[b.categoria].map((t) => <button key={t} type="button" onClick={() => ir({ descripcion: t })}>{t}</button>)}</div>
          <div className="campo alto"><textarea id="reporte-que" maxLength={2000} value={b.descripcion} placeholder="Toca una frase o escribe" onChange={(e) => ir({ descripcion: e.target.value })} /></div>
          <span className="etq" id="reporte-cuando">¿Cuándo lo viste?</span>
          <div className="segmentos" role="group" aria-labelledby="reporte-cuando">
            {(['hoy', 'ayer'] as const).map((c) => <button key={c} type="button" aria-pressed={b.cuando === c} onClick={() => ir({ cuando: c })}>{c === 'hoy' ? 'Hoy' : 'Ayer'}</button>)}
          </div>
          <label className="foto-b">
            {vistaFoto ? <><img src={vistaFoto} alt="Foto elegida" /><span>Cambiar foto</span></> : <><Ic n="camara" /><span>Agregar foto <small>(opcional)</small></span></>}
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f && (!/^image\/(jpeg|png)$/.test(f.type) || f.size > LIMITE_FOTO)) return setError('La foto debe ser JPG o PNG de hasta 5 MB.');
              ponerFoto(f);
            }} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <Bt type="submit" clase="teal ancho enviar" ic="megafono" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar a mi JASS'}</Bt>
        </form>
      )}
    </>
  );
}

// ───────────────────────── Armazón ─────────────────────────

export function Portal({ ruta = '/portal' }: { ruta?: string }) {
  return <div className="v3"><Avisos><PortalCelular ruta={ruta} /></Avisos></div>;
}

function PortalCelular({ ruta }: { ruta: string }) {
  const { api } = useApp();
  const cargar = useCallback(async (): Promise<Datos> => {
    const [saldo, cuotas, pagos] = await Promise.all([
      api.solicitar<SaldoPortal>('GET', '/v1/portal/saldo'),
      api.solicitar<{ cuotas: VistaCuota[] }>('GET', '/v1/portal/cuotas'),
      api.solicitar<{ pagos: VistaPago[] }>('GET', '/v1/portal/pagos'),
    ]);
    return { saldo, cuotas: cuotas.cuotas, pagos: pagos.pagos };
  }, [api]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const cargarReportes = useCallback(() => api.solicitar<{ incidencias: Incidencia[] }>('GET', '/v1/incidencias?limite=100').then((r) => r.incidencias), [api]);
  const reportes = useCarga(cargarReportes);
  const recargarReportes = reportes.recargar;
  const [avatar, elegirAvatar] = useMiAvatar();
  const [recien, setRecien] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState(false);
  const saldoPrevio = useRef<number | null>(null);
  const pantalla = pantallaDe(ruta);
  const telefono = useRef<HTMLDivElement>(null);
  const primeraVez = useRef(true);

  useEffect(() => {
    // Al volver a la pestaña se actualiza: así la familia ve un pago recién registrado.
    const alVolver = () => { if (document.visibilityState === 'visible') { void recargar(); void recargarReportes(); } };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [recargar, recargarReportes]);

  useEffect(() => {
    if (!datos) return;
    if (saldoPrevio.current !== null && saldoPrevio.current !== datos.saldo.saldoCentimos) setActualizado(true);
    saldoPrevio.current = datos.saldo.saldoCentimos;
  }, [datos]);

  useEffect(() => {
    // Tras cambiar de pantalla, el foco pasa al título para que los lectores de pantalla lo anuncien.
    if (primeraVez.current) { primeraVez.current = false; return; }
    setActualizado(false);
    telefono.current?.querySelector('.p-scroll')?.scrollTo?.(0, 0);
    telefono.current?.querySelector<HTMLElement>('[data-titulo-pantalla]')?.focus({ preventScroll: true });
  }, [pantalla]);

  const refresco: Refresco = { cargando: cargando || reportes.cargando, actualizar: () => { void recargar(); void recargarReportes(); } };

  let contenido: ReactNode;
  if (pantalla === null) contenido = <><CabSimple titulo="Página no encontrada" avatar={avatar} /><div className="p-scroll"><Enlace a={RUTAS.inicio} className="bt teal ancho p-salir">Volver al inicio</Enlace></div></>;
  else if (prohibido) contenido = <><CabSimple titulo="Sin acceso" avatar={avatar} /><p className="p-aviso error" data-testid="sin-permiso">Tu cuenta no tiene acceso a esta sección.</p></>;
  else if (pantalla === 'reportar') contenido = <Reportar key={ruta} avatar={avatar} alEnviar={(i) => { setRecien(i.id); void reportes.recargar(); }} />;
  else if (pantalla === 'reportes') contenido = <MisReportes reportes={reportes.datos} error={reportes.error} avatar={avatar} recien={recien} />;
  else if (error && !datos) contenido = <><CabSimple titulo={TITULOS[pantalla]} avatar={avatar} /><div className="p-aviso error" role="alert"><b>No pudimos cargar tus datos</b><p>Revisa tu conexión e inténtalo de nuevo.</p><Bt clase="borde" onClick={() => void recargar()}>Reintentar</Bt></div></>;
  else if (!datos) contenido = <><CabSimple titulo={TITULOS[pantalla]} avatar={avatar} /><Cargando /></>;
  else contenido = {
    inicio: <Inicio datos={datos} reportes={reportes.datos} avatar={avatar} refresco={refresco} />,
    cuotas: <Cuotas datos={datos} avatar={avatar} refresco={refresco} />,
    pagos: <Pagos datos={datos} avatar={avatar} refresco={refresco} />,
    perfil: <Perfil datos={datos} avatar={avatar} elegirAvatar={elegirAvatar} />,
  }[pantalla];

  return (
    <div className="esc-portal">
      <Olas />
      <div className="telefono" ref={telefono} data-pantalla={pantalla ?? ''}>
        <main className="p-vista" id="portal-principal" aria-label={pantalla ? TITULOS[pantalla] : 'Portal'}>
          {actualizado && <p className="p-aviso" role="status">Saldo actualizado: la JASS registró un nuevo pago en tu cuenta.</p>}
          {error && datos && <p className="p-aviso error" role="alert">No pudimos actualizar tus datos. <Bt clase="borde" onClick={() => void recargar()}>Reintentar</Bt></p>}
          {contenido}
        </main>
        <nav className="barra-m" aria-label="Secciones del portal">
          {PESTANAS.map(([id, icono, nombre]) => {
            const activa = pantalla === id || (id === 'inicio' && pantalla === 'reportes');
            return (
              <Enlace key={id} a={RUTAS[id]} aria-current={activa ? 'page' : undefined} className={`${activa ? 'on' : ''} ${id === 'reportar' ? 'central' : ''}`}>
                <i><Ic n={icono} lleno={icono === 'persona'} /></i>{nombre}
              </Enlace>
            );
          })}
        </nav>
      </div>
      <p className="pie-portal">Fotos referenciales: R. M. Cristina y Txolo, CC BY-SA 4.0 · Wikimedia Commons</p>
    </div>
  );
}
