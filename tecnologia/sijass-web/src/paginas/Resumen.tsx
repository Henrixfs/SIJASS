import { useCallback } from 'react';
import { ArrowUpRight, Clock, Droplet, FlaskConical, RefreshCw, TriangleAlert, UsersRound, Wallet } from 'lucide-react';
import { useApp } from '../contexto';
import { useCarga } from '../hooks';
import { formatearSoles } from '../lib/dinero';
import { haceTiempo, horaLima, periodoTitulo } from '../lib/periodos';
import { ROL_NOMBRE, seccionesPersonal } from '../lib/personal';
import { Boton, ErrorConsulta, SinPermiso } from '../ui';
import { IconoModulo } from '../identidad';
import { ahoraEnLima } from '../lib/medicion';
import { EnlacePersonal } from './NavegacionPersonal';

interface FilaPadron { id: string; nombre: string; estado: 'activo' | 'baja'; saldoCentimos: number }
interface Medicion { id: string; metodo: string; valor: number; unidad: string; tomadaEn: string; estado: string }
interface Servicio {
  reservorios: Array<{ id: string; nombre: string; ultima: Medicion | null; fallo: boolean }>;
  recientes: Array<{ reservorio: string; medicion: Medicion }>;
  consultadoEn: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function Esqueleto({ filas = 3 }: { filas?: number }) {
  return <div className="resumen-esqueleto" role="status" aria-label="Cargando"><span className="solo-lectores">Cargando…</span>{Array.from({ length: filas }, (_, i) => <span key={i} className="esqueleto" aria-hidden="true" />)}</div>;
}

function Indicador({ icono, etiqueta, valor, nota, tono = 'claro', testid }: { icono: 'asociados' | 'saldo' | 'reservorios' | 'lecturas'; etiqueta: string; valor: string; nota: string; tono?: 'claro' | 'oscuro'; testid?: string }) {
  const Icono = { asociados: UsersRound, saldo: Wallet, reservorios: Droplet, lecturas: FlaskConical }[icono];
  return (
    <article className={`indicador ${tono}`} aria-label={etiqueta}>
      <span className="indicador-icono"><Icono size={20} aria-hidden="true" /></span>
      <span className="indicador-etiqueta">{etiqueta}</span>
      <strong className="indicador-valor" data-testid={testid}>{valor}</strong>
      <span className="indicador-nota">{nota}</span>
    </article>
  );
}

export function Resumen({ rol }: { rol: string }) {
  const { api } = useApp();
  const finanzas = rol === 'consejo' || rol === 'tesorero';

  const cargarPadron = useCallback(
    () => finanzas ? api.solicitar<{ asociados: FilaPadron[] }>('GET', '/v1/asociados') : Promise.resolve(null),
    [api, finanzas],
  );
  const cargarServicio = useCallback(async (): Promise<Servicio> => {
    const { reservorios } = await api.solicitar<{ reservorios: Array<{ id: string; nombre: string }> }>('GET', '/v1/reservorios');
    const filas = await Promise.all(reservorios.map(async (r) => {
      try {
        const { mediciones } = await api.solicitar<{ mediciones: Medicion[] }>('GET', `/v1/reservorios/${r.id}/mediciones`);
        const vigentes = mediciones.filter((m) => m.estado === 'vigente').sort((a, b) => Date.parse(b.tomadaEn) - Date.parse(a.tomadaEn));
        return { id: r.id, nombre: r.nombre, ultima: vigentes[0] ?? null, fallo: false, vigentes: vigentes.slice(0, 5) };
      } catch {
        return { id: r.id, nombre: r.nombre, ultima: null, fallo: true, vigentes: [] as Medicion[] };
      }
    }));
    const recientes = filas
      .flatMap((f) => f.vigentes.map((medicion) => ({ reservorio: f.nombre, medicion })))
      .sort((a, b) => Date.parse(b.medicion.tomadaEn) - Date.parse(a.medicion.tomadaEn))
      .slice(0, 5);
    return { reservorios: filas.map(({ id, nombre, ultima, fallo }) => ({ id, nombre, ultima, fallo })), recientes, consultadoEn: Date.now() };
  }, [api]);

  const padron = useCarga(cargarPadron);
  const servicio = useCarga(cargarServicio);

  const principal = seccionesPersonal.find((s) => s.id === (rol === 'operador' ? 'campo' : 'asociados'));
  const filas = padron.datos?.asociados ?? [];
  const activos = filas.filter((f) => f.estado === 'activo');
  const conSaldo = activos.filter((f) => f.saldoCentimos > 0);
  const porCobrar = conSaldo.reduce((suma, f) => suma + f.saldoCentimos, 0);
  const ahora = servicio.datos?.consultadoEn ?? 0;
  const instante = new Date(ahora);
  const lista = servicio.datos?.reservorios ?? [];
  const conLecturaReciente = lista.filter((r) => r.ultima && ahora - Date.parse(r.ultima.tomadaEn) < DIA_MS).length;
  const ultimaGeneral = lista.map((r) => r.ultima?.tomadaEn).filter((x): x is string => !!x).sort().at(-1);

  return (
    <section className="resumen" aria-labelledby="titulo-resumen">
      <div className="resumen-cabecera">
        <div>
          <h1 id="titulo-resumen">Dashboard general</h1>
          <p className="suave">Monitorea la operación y el servicio de tu JASS.</p>
        </div>
        <span className="chip-periodo" data-testid="periodo-actual"><Clock size={16} aria-hidden="true" />{periodoTitulo(ahoraEnLima(new Date()).slice(0, 7))}</span>
      </div>

      {principal && (
        <section className="resumen-hero" aria-label="Acceso principal">
          <svg className="hero-ondas" viewBox="0 0 560 180" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
            <g fill="none" stroke="#2cc5ae" strokeLinecap="round">
              <path d="M0 150 C80 140 150 150 230 110 C310 70 380 95 460 60 C500 44 530 30 560 20" strokeWidth="1.8" />
              <path d="M40 175 C120 165 200 170 280 135 C350 105 430 120 560 70" strokeWidth="1" strokeOpacity=".5" />
            </g>
            <circle cx="342" cy="88" r="12" fill="#2cc5ae" fillOpacity=".2" /><circle cx="342" cy="88" r="4.5" fill="#44e0c4" />
            <circle cx="472" cy="55" r="3.5" fill="#9af0dd" />
          </svg>
          <span className="hero-etiqueta">Operación del servicio</span>
          <h2>El servicio de agua de tu comunidad</h2>
          <p>{principal.descripcion}.</p>
          <EnlacePersonal id={principal.id} className="hero-boton"><IconoModulo id={principal.id} />Abrir {principal.nombre.toLowerCase()}<ArrowUpRight size={18} aria-hidden="true" /></EnlacePersonal>
        </section>
      )}

      <div className="indicadores">
        {finanzas && (padron.prohibido ? null : padron.cargando && !padron.datos ? <article className="indicador claro"><Esqueleto filas={3} /></article> : padron.error && !padron.datos ? (
          <article className="indicador claro indicador-error" role="alert"><TriangleAlert size={20} aria-hidden="true" /><strong>No pudimos cargar el padrón</strong><Boton onClick={() => void padron.recargar()}>Reintentar</Boton></article>
        ) : (
          <>
            <Indicador icono="asociados" etiqueta="Asociados activos" valor={String(activos.length)} nota={`${filas.length - activos.length} ${filas.length - activos.length === 1 ? 'dado' : 'dados'} de baja · ${filas.length} en el padrón`} testid="indicador-activos" />
            <Indicador icono="saldo" tono="oscuro" etiqueta="Saldo por cobrar" valor={formatearSoles(porCobrar)} nota="Suma de los saldos pendientes del padrón" testid="indicador-por-cobrar" />
            <Indicador icono="asociados" etiqueta="Asociados con saldo" valor={String(conSaldo.length)} nota={activos.length ? `de ${activos.length} activos` : 'Sin asociados activos'} testid="indicador-con-saldo" />
          </>
        ))}
        {servicio.cargando && !servicio.datos
          ? <article className="indicador claro"><Esqueleto filas={3} /></article>
          : servicio.datos && (
            <>
              <Indicador icono="reservorios" etiqueta="Reservorios registrados" valor={String(lista.length)} nota={ultimaGeneral ? `Última lectura ${haceTiempo(ultimaGeneral, instante)}` : 'Aún sin lecturas'} testid="indicador-reservorios" />
              {!finanzas && <Indicador icono="lecturas" tono="oscuro" etiqueta="Con lectura en 24 h" valor={`${conLecturaReciente} de ${lista.length}`} nota="Según las lecturas manuales vigentes" testid="indicador-lecturas" />}
            </>
          )}
      </div>

      <div className="resumen-columnas">
        <section className="resumen-panel" aria-labelledby="titulo-reservorios">
          <header><h2 id="titulo-reservorios">Reservorios</h2><span className="chip-neutro">{lista.length} en registro</span></header>
          <p className="suave">Última lectura manual de cloro residual</p>
          {servicio.cargando && !servicio.datos && <Esqueleto />}
          {servicio.prohibido && <SinPermiso />}
          {servicio.error && !servicio.datos && <ErrorConsulta error={servicio.error} recargar={servicio.recargar} />}
          {servicio.datos && lista.length === 0 && <p className="vacio" data-testid="sin-reservorios-resumen">Aún no hay reservorios registrados.</p>}
          {lista.length > 0 && (
            <ul className="resumen-lista">
              {lista.map((r) => {
                const reciente = r.ultima && ahora - Date.parse(r.ultima.tomadaEn) < DIA_MS;
                return (
                  <li key={r.id}>
                    <span className="icono-lista"><Droplet size={18} aria-hidden="true" /></span>
                    <span className="texto-lista"><strong>{r.nombre}</strong>
                      <small>{r.fallo ? 'No pudimos consultar sus lecturas' : r.ultima ? `${r.ultima.valor.toLocaleString('es-PE')} ${r.ultima.unidad} · ${haceTiempo(r.ultima.tomadaEn, instante)}` : 'Sin lecturas registradas'}</small></span>
                    <span className={`chip-estado ${r.ultima ? (reciente ? 'ok' : 'aviso') : 'neutro'}`}><i aria-hidden="true" />{r.ultima ? (reciente ? 'Lectura reciente' : 'Sin lectura reciente') : 'Sin lecturas'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="resumen-panel" aria-labelledby="titulo-actividad">
          <header><h2 id="titulo-actividad">Actividad reciente</h2></header>
          <p className="suave">Últimas mediciones registradas</p>
          {servicio.cargando && !servicio.datos && <Esqueleto />}
          {servicio.datos && servicio.datos.recientes.length === 0 && <p className="vacio">Todavía no hay mediciones registradas.</p>}
          {servicio.datos && servicio.datos.recientes.length > 0 && (
            <ul className="resumen-lista">
              {servicio.datos.recientes.map(({ reservorio, medicion }) => (
                <li key={medicion.id}>
                  <span className="icono-lista"><FlaskConical size={18} aria-hidden="true" /></span>
                  <span className="texto-lista"><strong>Lectura de {reservorio}</strong><small>{medicion.valor.toLocaleString('es-PE')} {medicion.unidad}</small></span>
                  <span className="hora-lista">{haceTiempo(medicion.tomadaEn, instante)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="resumen-pie">
        <span>{servicio.datos ? `Última actualización · hoy a las ${horaLima(instante)}` : 'Actualizando…'} · Rol {ROL_NOMBRE[rol] ?? ''}</span>
        <Boton onClick={() => { void padron.recargar(); void servicio.recargar(); }} disabled={padron.cargando || servicio.cargando}><RefreshCw size={16} aria-hidden="true" /> Actualizar</Boton>
      </footer>
    </section>
  );
}
