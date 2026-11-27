/**
 * Inicio de cada rol (maqueta v3). Consejo: el agua y la caja de un vistazo. Tesorería: la caja.
 * Operación: medir el agua y atender reportes (sin dinero). Todas las cifras salen de la API.
 */
import { useState } from 'react';
import { useApp } from '../contexto';
import { formatearSoles } from '../lib/dinero';
import { FOTOS } from '../lib/fotos';
import { CATEGORIAS } from '../lib/incidencias';
import {
  Av, Banda, Bt, Cargando, Columnas, Estanque, FalloCarga, fotoReservorio, Gotas, Heroe, IconoCat, useAvisar,
} from '../v3/base';
import { cuando, diaLargo, esHoy, mesDe, primerNombre, saludo, useCaja, useIncidencias, useServicio, type Caja } from '../v3/datos';
import { CajonLectura, TarjetaRes } from './Agua';
import { CajonesCaja, type Pedido } from './Cajones';
import { ChipEstado, CLAVE_REPORTE, FilaInc } from './Reportes';

function useIr() {
  const { navegar } = useApp();
  return {
    a: (seccion: string) => navegar(`/personal/${seccion}`),
    reporte: (id: string) => {
      try { sessionStorage.setItem(CLAVE_REPORTE, id); } catch { /* sin almacenamiento: se abre el primero */ }
      navegar('/personal/reportes');
    },
  };
}

export function Resumen({ rol }: { rol: string }) {
  if (rol === 'tesorero') return <ResumenTesoreria />;
  if (rol === 'operador') return <ResumenOperacion />;
  return <ResumenConsejo />;
}

function useEncabezado() {
  const { sesion } = useApp();
  return { dia: diaLargo(), jass: sesion?.jass?.nombre ?? 'Tu JASS', hola: `${saludo()}, ${primerNombre(sesion?.nombre ?? '') || 'equipo'}.` };
}

function CifrasCaja({ caja, recargar, error }: { caja: Caja | null; recargar: () => void; error: string | null }) {
  if (error && !caja) return <FalloCarga texto={error} recargar={recargar} />;
  if (!caja) return <Cargando texto="Sumando la caja…" />;
  return null;
}

// ───────────────────────── Consejo ─────────────────────────

function ResumenConsejo() {
  const e = useEncabezado();
  const ir = useIr();
  const caja = useCaja();
  const servicio = useServicio();
  const inc = useIncidencias();
  const c = caja.datos;
  const t = c?.totales;
  const activos = c?.asociados.filter((a) => a.estado === 'activo').length ?? 0;
  const abiertas = (inc.datos ?? []).filter((i) => i.estado !== 'cerrada');
  const familias = [...(t?.conSaldo ?? [])].sort((a, b) => b.saldoCentimos - a.saldoCentimos).slice(0, 2);
  const reservorios = servicio.datos?.reservorios ?? [];

  return (
    <>
      <Heroe foto={FOTOS.laguna69} sobre={`${e.dia} · ${e.jass}`} titulo={e.hola} texto="Así va el agua de tu comunidad hoy."
        acciones={<><Bt clase="agua" ic="megafono" onClick={() => ir.a('reportes')}>Ver reportes</Bt><Bt clase="claro" ic="wallet" onClick={() => ir.a('cuotas')}>Cuotas y pagos</Bt></>}
        vidrio={<><small>Saldo por cobrar</small><div className="n" data-testid="indicador-por-cobrar">{t ? formatearSoles(t.pendiente) : '…'}</div><small data-testid="indicador-con-saldo">{t ? `${t.conSaldo.length} de ${activos} asociados con saldo` : 'Leyendo el padrón…'}</small></>} />
      <CifrasCaja caja={c} error={caja.error} recargar={() => void caja.recargar()} />
      {c && t && (
        <div className="fila-2">
          <Estanque pct={t.pct} cobrado={t.cobrado} emitido={t.emitido} />
          <Columnas porMes={t.porMes} importeCuota={t.importeCuota} />
          <section className="tarj">
            <h3>Familias con saldo <small>{t.conSaldo.length}</small></h3>
            {familias.length === 0 && <p className="nota" style={{ padding: '12px 0' }}>Todas las familias están al día.</p>}
            {familias.map((a) => {
              const n = c.cuentas[a.id]?.cuotas.filter((x) => x.pendienteCentimos > 0).length;
              return <div className="fam" key={a.id}><Av id={a.id} tam="m" /><div><b>{a.nombre}</b><small>{n !== undefined ? `${n} ${n === 1 ? 'cuota' : 'cuotas'} con saldo` : 'Con saldo'}</small></div><span className="m">{formatearSoles(a.saldoCentimos)}</span></div>;
            })}
            <Bt clase="teal ancho" onClick={() => ir.a('asociados')}>Ver asociados</Bt>
          </section>
        </div>
      )}
      <div className="fila-3">
        {servicio.datos ? reservorios.slice(0, 2).map((r, i) => <TarjetaRes key={r.id} r={r} foto={fotoReservorio(i)} metodos={servicio.datos!.metodos} onClick={() => ir.a('agua')} />)
          : servicio.error ? <FalloCarga texto={servicio.error} recargar={() => void servicio.recargar()} /> : <Cargando texto="Leyendo los reservorios…" />}
        {servicio.datos && reservorios.length === 0 && <section className="tarj vacio" data-testid="sin-reservorios-resumen"><b>Aún no hay reservorios</b><p>Créalos en «El agua».</p><Bt clase="borde" onClick={() => ir.a('agua')}>Ir a El agua</Bt></section>}
        <section className="tarj rep-mini">
          <h3>Reportes abiertos <small>{inc.datos ? abiertas.length : '…'}</small></h3>
          {inc.datos && abiertas.length === 0 && <p className="nota">No hay reportes abiertos.</p>}
          {abiertas.slice(0, 3).map((i) => (
            <button type="button" className="mini-inc" key={i.id} onClick={() => ir.reporte(i.id)}>
              <Av id={i.reportadoPor?.asociadoId ?? i.id} tam="s" /><IconoCat categoria={i.categoria} tam="s" />
              <span><b>{CATEGORIAS[i.categoria].texto}</b><small>{i.reportadoPor?.nombre ?? 'Asociado'}</small></span>
              <ChipEstado i={i} />
            </button>
          ))}
          <Bt clase="borde ancho" ic="megafono" onClick={() => ir.a('reportes')}>Atender reportes</Bt>
        </section>
      </div>
    </>
  );
}

// ───────────────────────── Tesorería ─────────────────────────

function ResumenTesoreria() {
  const e = useEncabezado();
  const ir = useIr();
  const caja = useCaja();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const c = caja.datos;
  const t = c?.totales;
  const ultimos = (t?.pagos ?? []).filter((p) => p.estado === 'vigente').slice(0, 3);
  const deudores = [...(t?.conSaldo ?? [])].sort((a, b) => b.saldoCentimos - a.saldoCentimos).slice(0, 2);
  const activos = c?.asociados.filter((a) => a.estado === 'activo').length ?? 0;

  return (
    <>
      <Heroe foto={FOTOS.orilla} sobre={`${e.dia} · Tesorería`} titulo={e.hola} texto="Así va la caja de la JASS."
        acciones={<><Bt clase="agua" ic="wallet" onClick={() => setPedido({ tipo: 'pago', id: null })}>Registrar pago</Bt><Bt clase="claro" ic="mas" onClick={() => setPedido({ tipo: 'generar' })}>Generar cuotas</Bt></>}
        vidrio={<><small>Cobrado</small><div className="n" data-testid="indicador-cobrado">{t ? formatearSoles(t.cobrado) : '…'}</div><small data-testid="indicador-por-cobrar">{t ? `Falta cobrar ${formatearSoles(t.pendiente)}` : 'Leyendo la caja…'}</small></>} />
      <CifrasCaja caja={c} error={caja.error} recargar={() => void caja.recargar()} />
      {c && t && (
        <>
          <div className="fila-2">
            <Estanque pct={t.pct} cobrado={t.cobrado} emitido={t.emitido} />
            <Columnas porMes={t.porMes} importeCuota={t.importeCuota} />
            <section className="tarj">
              <h3>Últimos pagos <small>{ultimos.length}</small></h3>
              {ultimos.length === 0 && <p className="nota" style={{ padding: '12px 0' }}>Todavía no hay pagos.</p>}
              {ultimos.map((p) => <div className="fam corta" key={p.id}><Av id={p.asociadoId} tam="s" /><div><b>{p.nombre}</b><small>{mesDe(p.periodo)} · {cuando(p.pagadoEn, true)}</small></div><span className="m">{formatearSoles(p.importeCentimos)}</span></div>)}
            </section>
          </div>
          <div className="fila-3 cobrar">
            {deudores.map((a) => (
              <article className="tarj deudor" key={a.id}>
                <Av id={a.id} tam="xl" />
                <div className="info"><b>{a.nombre}</b><span className="monto">{formatearSoles(a.saldoCentimos)}</span></div>
                {c.cuentas[a.id] ? <Gotas cuotas={c.cuentas[a.id].cuotas} /> : <div className="gotas" />}
                <Bt clase="teal ancho" ic="wallet" onClick={() => setPedido({ tipo: 'pago', id: a.id })}>Cobrar</Bt>
              </article>
            ))}
            <Banda foto={FOTOS.bofedales} sobre={t.conSaldo.length ? 'Por cobrar' : 'Todo al día'} titulo={formatearSoles(t.pendiente)} texto={`${activos - t.conSaldo.length} al día · ${t.conSaldo.length} con saldo`}>
              <Bt clase="agua" ic="users" onClick={() => ir.a('asociados')}>Ver asociados</Bt>
            </Banda>
          </div>
        </>
      )}
      <CajonesCaja pedido={pedido} setPedido={setPedido} caja={c} recargar={() => void caja.recargar()} />
    </>
  );
}

// ───────────────────────── Operación ─────────────────────────

function ResumenOperacion() {
  const e = useEncabezado();
  const ir = useIr();
  const servicio = useServicio();
  const inc = useIncidencias();
  const avisar = useAvisar();
  const [lectura, setLectura] = useState<{ id: string | null } | null>(null);
  const lista = servicio.datos?.reservorios ?? [];
  const hoy = lista.filter((r) => r.ultima && esHoy(r.ultima.tomadaEn));
  const falta = lista.filter((r) => !hoy.includes(r));
  const abiertas = (inc.datos ?? []).filter((i) => i.estado !== 'cerrada');

  return (
    <>
      <Heroe foto={FOTOS.gocta} sobre={`${e.dia} · Operación`} titulo={e.hola} texto="Tu jornada: medir el agua y atender reportes."
        acciones={<><Bt clase="agua" ic="flask" disabled={!lista.length} onClick={() => setLectura({ id: falta[0]?.id ?? null })}>Registrar lectura</Bt><Bt clase="claro" ic="megafono" onClick={() => ir.a('reportes')}>Ver reportes</Bt></>}
        vidrio={<><small>Reservorios con lectura hoy</small><div className="n" data-testid="indicador-lecturas">{servicio.datos ? `${hoy.length} de ${lista.length}` : '…'}</div><small>{!servicio.datos ? 'Leyendo los reservorios…' : falta.length ? `Falta: ${falta.map((r) => r.nombre).join(', ')}` : 'Todos tienen lectura de hoy'}</small></>} />
      {servicio.error && !servicio.datos && <FalloCarga texto={servicio.error} recargar={() => void servicio.recargar()} />}
      {!servicio.datos && !servicio.error && <Cargando texto="Leyendo los reservorios…" />}
      {servicio.datos && lista.length === 0 && <section className="tarj vacio" data-testid="sin-reservorios-resumen"><b>Aún no hay reservorios</b><p>Pide al Consejo que los registre.</p></section>}
      {lista.length > 0 && (
        <div className="fila-res">
          {lista.slice(0, 3).map((r, i) => (
            <div className="res-w" key={r.id}>
              <TarjetaRes r={r} foto={fotoReservorio(i)} metodos={servicio.datos!.metodos} onClick={() => ir.a('agua')} />
              <Bt clase="agua anotar" ic="mas" aria-label={`Anotar lectura de ${r.nombre}`} onClick={() => setLectura({ id: r.id })}>Anotar</Bt>
            </div>
          ))}
        </div>
      )}
      <section className="tarj bandeja-mini">
        <h3>Reportes por atender <small>{inc.datos ? abiertas.length : '…'}</small></h3>
        <div className="rejilla-inc">
          {abiertas.slice(0, 4).map((i) => <FilaInc key={i.id} i={i} onClick={() => ir.reporte(i.id)} />)}
          {inc.datos && abiertas.length === 0 && <p className="nota">No hay reportes por atender.</p>}
        </div>
      </section>
      {lectura && <CajonLectura reservorios={lista} inicial={lectura.id} cerrar={() => setLectura(null)} alGuardar={() => { setLectura(null); avisar('Lectura guardada'); void servicio.recargar(); }} />}
    </>
  );
}
