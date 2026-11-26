import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock, CalendarDays, Inbox, Info, House, TriangleAlert, UserRound, Wallet, WalletCards, X } from 'lucide-react';
import type { SaldoPortal, VistaCuota, VistaPago } from '../api/tipos';
import { useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { formatearSoles } from '../lib/dinero';
import { fechaCorta, iniciales, periodoLargo, periodoTitulo, soloMes } from '../lib/periodos';
import { Marca } from '../identidad';
import { Importe } from '../Importe';
import { Boton, Carga, Dialogo, ErrorConsulta, SinPermiso } from '../ui';
import { CambiarClave } from './CambiarClave';
import './portal.css';

interface Datos {
  saldo: SaldoPortal;
  cuotas: VistaCuota[];
  pagos: VistaPago[];
}

const RUTAS = {
  inicio: '/portal',
  pagos: '/portal/pagos',
  historial: '/portal/historial',
  reportes: '/portal/reportes',
  perfil: '/portal/perfil',
} as const;
type Pantalla = keyof typeof RUTAS;

const TITULOS: Record<Pantalla, string> = { inicio: 'Inicio', pagos: 'Estado de pagos', historial: 'Historial de pagos', reportes: 'Reportes', perfil: 'Mi perfil' };

function pantallaDe(ruta: string): Pantalla | null {
  const limpia = ruta.replace(/\/+$/, '') || '/portal';
  return (Object.keys(RUTAS) as Pantalla[]).find((p) => RUTAS[p] === limpia) ?? null;
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

function Ondas() {
  return (
    <svg className="portal-ondas" viewBox="0 0 390 200" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#2cc5ae" strokeLinecap="round">
        <path d="M60 190 C120 170 190 175 250 130 C300 92 340 100 390 40" strokeWidth="1.6" />
        <path d="M80 200 C150 185 215 190 275 150 C320 118 360 125 390 80" strokeWidth="1" strokeOpacity=".5" />
      </g>
      <circle cx="268" cy="118" r="11" fill="#2cc5ae" fillOpacity=".2" />
      <circle cx="268" cy="118" r="4" fill="#44e0c4" />
      <circle cx="348" cy="62" r="3" fill="#9af0dd" />
    </svg>
  );
}

function Estado({ tipo, titulo, children }: { tipo: 'info' | 'ok' | 'error' | 'vacio'; titulo: string; children: ReactNode }) {
  const Icono = { info: Info, ok: Check, error: TriangleAlert, vacio: Inbox }[tipo];
  return (
    <div className={`portal-estado ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <span className="portal-estado-icono"><Icono size={18} aria-hidden="true" /></span>
      <div><strong>{titulo}</strong><span>{children}</span></div>
    </div>
  );
}

function pendiente(cuotas: VistaCuota[]): VistaCuota | null {
  return [...cuotas].filter((c) => c.pendienteCentimos > 0).sort((a, b) => a.periodo.localeCompare(b.periodo))[0] ?? null;
}

function NombreCuota({ c }: { c: VistaCuota }) {
  return <>{periodoTitulo(c.periodo)}</>;
}

function EstadoCuota({ c }: { c: VistaCuota }) {
  const texto = c.estado === 'pagada' ? 'Pagada' : c.estado === 'parcial' ? 'Pago parcial' : 'Pendiente';
  return <span className={`portal-estado-texto ${c.estado === 'pagada' ? 'ok' : 'aviso'}`}>{texto}</span>;
}

function Inicio({ datos }: { datos: Datos }) {
  const { sesion } = useApp();
  const primero = datos.saldo.asociado.nombre.trim().split(/\s+/)[0] ?? '';
  const proxima = pendiente(datos.cuotas);
  const recientes = datos.pagos.slice(0, 3);
  const [detalle, setDetalle] = useState<VistaCuota | null>(null);
  return (
    <>
      <h1 tabIndex={-1} data-titulo-pantalla>Hola, <span data-testid="nombre-asociado">{primero}</span></h1>
      <p className="portal-sub" data-testid="portal-jass">{sesion?.jass ? `${sesion.jass.nombre} · ` : ''}Tu cuenta de agua al periodo {datos.saldo.periodoActual}.</p>
      {datos.saldo.asociado.estado === 'baja' && <Estado tipo="info" titulo="Cuenta dada de baja">Solo puedes consultar tu historial.</Estado>}
      <section className="portal-tarjeta cuota-inicio" aria-label="Cuota pendiente">
        {proxima ? (
          <>
            <div className="cuota-inicio-cabecera">
              <span className="portal-icono"><WalletCards size={20} aria-hidden="true" /></span>
              <div><strong>Cuota de {soloMes(proxima.periodo)}</strong><span>{periodoTitulo(proxima.periodo)}</span></div>
              <span className="portal-chip aviso"><i aria-hidden="true" />{proxima.estado === 'parcial' ? 'Pago parcial' : 'Pendiente'}</span>
            </div>
            <div className="cuota-inicio-pie">
              <div><strong className="portal-monto"><Importe centimos={proxima.pendienteCentimos} /></strong><span>Por pagar</span></div>
              <Boton variante="primario" onClick={() => setDetalle(proxima)}>Ver cuota</Boton>
            </div>
          </>
        ) : (
          <div className="cuota-inicio-cabecera">
            <span className="portal-icono ok"><Check size={20} aria-hidden="true" /></span>
            <div><strong>Estás al día</strong><span>No tienes cuotas pendientes.</span></div>
          </div>
        )}
      </section>
      <h2>Accesos rápidos</h2>
      <div className="portal-accesos">
        <Enlace a={RUTAS.reportes} className="portal-acceso"><span className="portal-icono aviso"><TriangleAlert size={20} aria-hidden="true" /></span>Reportar</Enlace>
        <Enlace a={RUTAS.historial} className="portal-acceso"><span className="portal-icono ok"><Clock size={20} aria-hidden="true" /></span>Historial</Enlace>
        <Enlace a={RUTAS.perfil} className="portal-acceso"><span className="portal-icono info"><UserRound size={20} aria-hidden="true" /></span>Mi perfil</Enlace>
      </div>
      <h2>Actividad reciente</h2>
      {recientes.length === 0
        ? <Estado tipo="vacio" titulo="Sin pagos todavía">Cuando la JASS registre un pago, lo verás aquí.</Estado>
        : (
          <ul className="portal-lista" aria-label="Actividad reciente">
            {recientes.map((p) => (
              <li key={p.id}>
                <span className={`portal-icono ${p.estado === 'vigente' ? 'ok' : 'neutro'}`}>{p.estado === 'vigente' ? <Check size={18} aria-hidden="true" /> : <Clock size={18} aria-hidden="true" />}</span>
                <div><strong>Pago de {soloMes(p.periodo)} {p.estado === 'vigente' ? 'recibido' : 'revertido'}</strong></div>
                <div className="portal-der"><strong>{formatearSoles(p.importeCentimos)}</strong><span>{fechaCorta(p.pagadoEn)}</span></div>
              </li>
            ))}
          </ul>
        )}
      {detalle && <DetalleCuota cuota={detalle} cerrar={() => setDetalle(null)} />}
    </>
  );
}

function DetalleCuota({ cuota, cerrar }: { cuota: VistaCuota; cerrar: () => void }) {
  const pagada = cuota.estado === 'pagada';
  return (
    <Dialogo titulo="Detalle de la cuota" cerrar={cerrar}>
      <div className="portal-dialogo">
        <p className="portal-sub">{periodoTitulo(cuota.periodo)}</p>
        <dl className="portal-datos">
          <div><dt>Importe de la cuota</dt><dd data-testid="detalle-importe">{formatearSoles(cuota.importeCentimos)}</dd></div>
          <div><dt>Pagado</dt><dd>{formatearSoles(cuota.pagadoCentimos)}</dd></div>
          <div><dt>Por pagar</dt><dd className={pagada ? '' : 'aviso'}>{formatearSoles(cuota.pendienteCentimos)}</dd></div>
        </dl>
        <Estado tipo={pagada ? 'ok' : 'info'} titulo={pagada ? 'Cuota pagada' : cuota.estado === 'parcial' ? 'Pago parcial' : 'Pago pendiente'}>
          {pagada ? 'La JASS registró el pago completo de esta cuota.' : 'Coordina el pago y el comprobante con tu JASS.'}
        </Estado>
        <div className="portal-dialogo-pie"><Boton onClick={cerrar}><X size={16} aria-hidden="true" /> Cerrar</Boton></div>
      </div>
    </Dialogo>
  );
}

function Pagos({ datos }: { datos: Datos }) {
  const { saldo, cuotas } = datos;
  const debe = saldo.saldoCentimos > 0;
  const proxima = pendiente(cuotas);
  const ordenadas = [...cuotas].sort((a, b) => b.periodo.localeCompare(a.periodo));
  const [detalle, setDetalle] = useState<VistaCuota | null>(null);
  return (
    <>
      <h1 tabIndex={-1} data-titulo-pantalla>Estado de pagos</h1>
      <p className="portal-sub">Tus cuotas de agua.</p>
      <section className={`portal-saldo ${debe ? 'debe' : 'aldia'}`} aria-label="Saldo">
        <Ondas />
        <span className="portal-saldo-etiqueta"><span className="portal-icono-claro"><Wallet size={18} aria-hidden="true" /></span>{debe ? 'Saldo exigible' : 'Estás al día'}</span>
        <strong data-testid="saldo"><Importe centimos={Math.max(0, saldo.saldoCentimos)} /></strong>
        {saldo.saldoCentimos < 0 && <span className="portal-saldo-linea" data-testid="a-favor">Saldo a su favor: {formatearSoles(-saldo.saldoCentimos)}</span>}
        <span className="portal-saldo-linea">{proxima ? `Cuota de ${periodoLargo(proxima.periodo)}` : `Al periodo ${saldo.periodoActual}`}</span>
        {proxima && <span className="portal-chip claro"><i aria-hidden="true" />Pendiente de pago</span>}
      </section>
      <div className="portal-fila-titulo">
        <h2 id="portal-cuotas">Mis cuotas</h2>
        <Enlace a={RUTAS.historial} className="portal-boton-enlace">Ver historial</Enlace>
      </div>
      {ordenadas.length === 0
        ? <Estado tipo="vacio" titulo="Todavía no tienes cuotas">Cuando tu JASS genere una cuota, la verás aquí.</Estado>
        : (
          <ul className="portal-lista" aria-labelledby="portal-cuotas" data-testid="portal-cuotas">
            {ordenadas.map((c) => (
              <li key={c.id}>
                <button type="button" className="portal-fila-boton" onClick={() => setDetalle(c)} aria-label={`Ver detalle de la cuota de ${periodoTitulo(c.periodo)}`}>
                  <span className={`portal-icono ${c.estado === 'pagada' ? 'ok' : 'aviso'}`}>{c.estado === 'pagada' ? <Check size={18} aria-hidden="true" /> : <CalendarDays size={18} aria-hidden="true" />}</span>
                  <span className="portal-texto"><strong><NombreCuota c={c} /></strong><span>Cuota de agua</span></span>
                  <span className="portal-der"><strong>{formatearSoles(c.importeCentimos)}</strong><EstadoCuota c={c} /></span>
                  <ChevronRight className="portal-flecha" size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      <Estado tipo="info" titulo="Registro de pagos">Coordina el pago y el comprobante con tu JASS.</Estado>
      {detalle && <DetalleCuota cuota={detalle} cerrar={() => setDetalle(null)} />}
    </>
  );
}

function Historial({ datos }: { datos: Datos }) {
  const [rango, setRango] = useState<'seis' | 'todo'>('seis');
  const [estado, setEstado] = useState<'todos' | VistaPago['estado']>('todos');
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 6);
  const filtrados = datos.pagos.filter((p) => (estado === 'todos' || p.estado === estado) && (rango === 'todo' || new Date(p.pagadoEn) >= limite));
  const hayRevertidos = datos.pagos.some((p) => p.estado === 'revertido');
  return (
    <>
      <h1 tabIndex={-1} data-titulo-pantalla>Historial de pagos</h1>
      <p className="portal-sub">Revisa tus pagos y sus comprobantes.</p>
      <div className="portal-filtros">
        <label><span className="solo-lectores">Periodo</span>
          <select value={rango} onChange={(e) => setRango(e.target.value as 'seis' | 'todo')}>
            <option value="seis">Últimos seis meses</option>
            <option value="todo">Todo el historial</option>
          </select>
        </label>
        <label><span className="solo-lectores">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
            <option value="todos">Estado: todos</option>
            <option value="vigente">Estado: vigente</option>
            <option value="revertido">Estado: revertido</option>
          </select>
        </label>
      </div>
      <div className="portal-fila-titulo">
        <h2 id="portal-pagos">Pagos registrados</h2>
        <span className="portal-contador" aria-live="polite">{filtrados.length} {filtrados.length === 1 ? 'pago' : 'pagos'}</span>
      </div>
      {filtrados.length === 0
        ? <Estado tipo="vacio" titulo="Sin pagos en este periodo">{datos.pagos.length === 0 ? 'Todavía no tienes pagos registrados.' : 'Selecciona otro periodo para ver tus comprobantes.'}</Estado>
        : (
          <ul className="portal-lista" aria-labelledby="portal-pagos" data-testid="portal-pagos">
            {filtrados.map((p) => (
              <li key={p.id} data-testid={`portal-pago-${p.comprobante}`}>
                <span className={`portal-icono ${p.estado === 'vigente' ? 'ok' : 'neutro'}`}>{p.estado === 'vigente' ? <Wallet size={18} aria-hidden="true" /> : <Clock size={18} aria-hidden="true" />}</span>
                <span className="portal-texto"><strong>Pago de {soloMes(p.periodo)}</strong><span>{fechaCorta(p.pagadoEn)} · {p.comprobante}</span></span>
                <span className="portal-der"><strong className={p.estado === 'vigente' ? 'ok' : ''}>{formatearSoles(p.importeCentimos)}</strong><span className={`portal-estado-texto ${p.estado === 'vigente' ? 'ok' : ''}`}>{p.estado === 'vigente' ? 'Vigente' : 'Revertido'}</span></span>
              </li>
            ))}
          </ul>
        )}
      {hayRevertidos && <Estado tipo="info" titulo="Pagos revertidos">Se conservan en el historial. El importe vuelve al saldo.</Estado>}
    </>
  );
}

function Reportes() {
  return (
    <>
      <h1 tabIndex={-1} data-titulo-pantalla>Reportes</h1>
      <p className="portal-sub">Avisa a tu JASS si tienes un problema con el servicio de agua.</p>
      <Estado tipo="info" titulo="Próximamente">El envío y el seguimiento de reportes se activará cuando tu JASS habilite las incidencias. Mientras tanto, comunícate con tu JASS.</Estado>
    </>
  );
}

function Perfil({ datos }: { datos: Datos }) {
  const { salir, sesion } = useApp();
  const [confirmando, setConfirmando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const { enviando, ejecutar } = useEnvio();
  const activo = datos.saldo.asociado.estado === 'activo';
  const nombre = datos.saldo.asociado.nombre;
  return (
    <>
      <h1 tabIndex={-1} data-titulo-pantalla>Mi perfil</h1>
      <p className="portal-sub">Tus datos y el acceso a tu JASS.</p>
      <section className="portal-tarjeta portal-identidad" aria-label="Asociado">
        <span className="portal-avatar" aria-hidden="true">{iniciales(nombre)}</span>
        <div>
          <strong className="portal-nombre">{nombre}</strong>
          <span>Asociado</span>
          <span className={`portal-chip ${activo ? 'ok' : 'neutro'}`}><i aria-hidden="true" />{activo ? 'Acceso activo' : 'Cuenta dada de baja'}</span>
        </div>
      </section>
      <section className="portal-tarjeta" aria-labelledby="portal-datos">
        <h2 id="portal-datos">Datos de mi cuenta</h2>
        <dl className="portal-datos">
          <div><dt>Nombre</dt><dd>{nombre}</dd></div>
          {sesion?.documento && <div><dt>DNI</dt><dd data-testid="portal-documento">{sesion.documento}</dd></div>}
          {sesion?.jass && <div><dt>JASS</dt><dd>{sesion.jass.nombre}</dd></div>}
          <div><dt>Estado en el padrón</dt><dd>{activo ? 'Activo' : 'Baja'}</dd></div>
          <div><dt>Periodo actual</dt><dd>{periodoTitulo(datos.saldo.periodoActual)}</dd></div>
        </dl>
      </section>
      <Boton onClick={() => setCambiando(true)}>Cambiar mi clave</Boton>
      {cambiando && <CambiarClave cerrar={() => setCambiando(false)} />}
      <button type="button" className="portal-salir" onClick={() => setConfirmando(true)}><ArrowRight size={18} aria-hidden="true" />Cerrar sesión</button>
      {confirmando && (
        <Dialogo titulo="Cerrar sesión" cerrar={() => setConfirmando(false)}>
          <div className="portal-dialogo">
            <p className="portal-sub">Confirma si quieres salir de SIJASS.</p>
            <Estado tipo="info" titulo="Tu sesión se cerrará">Podrás volver a ingresar con tu correo.</Estado>
            <div className="portal-dialogo-pie">
              <Boton onClick={() => setConfirmando(false)} disabled={enviando}>Cancelar</Boton>
              <Boton variante="primario" disabled={enviando} onClick={() => void ejecutar(salir)}>{enviando ? 'Saliendo…' : 'Cerrar sesión'}</Boton>
            </div>
          </div>
        </Dialogo>
      )}
    </>
  );
}

const NAVEGACION: Array<{ id: Pantalla; nombre: string; Icono: typeof House }> = [
  { id: 'inicio', nombre: 'Inicio', Icono: House },
  { id: 'pagos', nombre: 'Pagos', Icono: Wallet },
  { id: 'reportes', nombre: 'Reportes', Icono: TriangleAlert },
  { id: 'perfil', nombre: 'Perfil', Icono: UserRound },
];

export function Portal({ ruta = '/portal' }: { ruta?: string }) {
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
  const [actualizado, setActualizado] = useState(false);
  const saldoPrevio = useRef<number | null>(null);
  const pantalla = pantallaDe(ruta);
  const principal = useRef<HTMLElement>(null);
  const primeraVez = useRef(true);
  const cargado = datos !== null;

  useEffect(() => {
    // Al volver a la pestaña se actualiza: así el asociado ve un pago recién registrado.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [recargar]);

  useEffect(() => {
    if (!datos) return;
    if (saldoPrevio.current !== null && saldoPrevio.current !== datos.saldo.saldoCentimos) setActualizado(true);
    saldoPrevio.current = datos.saldo.saldoCentimos;
  }, [datos]);

  useEffect(() => {
    // Tras cambiar de pantalla, el foco pasa al título para que lectores de pantalla lo anuncien.
    if (primeraVez.current) { primeraVez.current = false; return; }
    setActualizado(false);
    principal.current?.querySelector<HTMLElement>('[data-titulo-pantalla]')?.focus();
  }, [pantalla, cargado]);

  let contenido: ReactNode;
  if (pantalla === null) contenido = <><h1 tabIndex={-1} data-titulo-pantalla>Página no encontrada</h1><Enlace a={RUTAS.inicio} className="portal-boton-enlace">Volver al inicio</Enlace></>;
  else if (prohibido) contenido = <SinPermiso />;
  else if (error && !datos) contenido = <Estado tipo="error" titulo="No pudimos cargar tus datos">Revisa tu conexión e inténtalo de nuevo.</Estado>;
  else if (cargando && !datos) contenido = <Carga />;
  else if (datos) {
    contenido = {
      inicio: <Inicio datos={datos} />, pagos: <Pagos datos={datos} />, historial: <Historial datos={datos} />,
      reportes: <Reportes />, perfil: <Perfil datos={datos} />,
    }[pantalla ?? 'inicio'];
  }

  const enSecundaria = pantalla === 'historial';
  const nombre = datos?.saldo.asociado.nombre ?? '';
  return (
    <div className="portal">
      <header className="portal-cabecera">
        {enSecundaria
          ? <Enlace a={RUTAS.pagos} className="portal-boton-icono" aria-label="Volver a pagos"><ChevronLeft size={20} aria-hidden="true" /></Enlace>
          : null}
        <Marca />
        {nombre && <Enlace a={RUTAS.perfil} className="portal-boton-avatar" aria-label={`Mi perfil, ${nombre}`}>{iniciales(nombre)}</Enlace>}
      </header>
      <main id="portal-principal" ref={principal} aria-label={pantalla ? TITULOS[pantalla] : undefined}>
        {actualizado && (
          <Estado tipo="ok" titulo="Saldo actualizado">La JASS registró un nuevo pago en tu cuenta.</Estado>
        )}
        {error && datos && <ErrorConsulta error="No pudimos actualizar tus datos. Revisa tu conexión e inténtalo de nuevo." recargar={recargar} />}
        {contenido}
        {(error && !datos) && <Boton onClick={() => void recargar()}>Reintentar</Boton>}
        {datos && pantalla === 'pagos' && (
          <Boton className="portal-actualizar" onClick={() => void recargar()} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</Boton>
        )}
      </main>
      <nav className="portal-menu" aria-label="Secciones del portal">
        {NAVEGACION.map(({ id, nombre: n, Icono }) => {
          const activa = pantalla === id || (id === 'pagos' && pantalla === 'historial');
          return <Enlace key={id} a={RUTAS[id]} aria-current={activa ? 'page' : undefined} className={activa ? 'activa' : ''}><span className="portal-menu-icono"><Icono size={20} aria-hidden="true" /></span>{n}</Enlace>;
        })}
      </nav>
    </div>
  );
}

