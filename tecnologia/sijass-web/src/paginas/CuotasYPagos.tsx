import { useState } from 'react';
import { useApp } from '../contexto';
import { formatearSoles } from '../lib/dinero';
import { SinPermiso } from '../ui';
import { Av, Bt, Cargando, FalloCarga, Ic, Olas } from '../v3/base';
import { cuando, mesDe, useCaja } from '../v3/datos';
import { CajonesCaja, MotivoReversa, VerMotivo, type Pedido } from './Cajones';
import { TituloVista } from './NavegacionPersonal';

function Kpi({ nombre, valor, pct, clase, testid }: { nombre: string; valor: number; pct: number; clase: string; testid: string }) {
  return (
    <div className={`kpi ${clase}`}>
      <div className="nivel" style={{ ['--h' as string]: `${Math.max(0, Math.min(100, pct))}%` }}><Olas /></div>
      <span>{nombre}</span><b data-testid={testid}>{formatearSoles(valor)}</b>
    </div>
  );
}

/** Cuotas y pagos (maqueta v3): tres niveles de agua (emitido, cobrado, pendiente) y todos los pagos. */
export function CuotasYPagos({ cuentaId = null }: { cuentaId?: string | null }) {
  const { navegar } = useApp();
  const caja = useCaja();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [motivoDe, setMotivoDe] = useState<string | null>(null);
  if (caja.prohibido) return <SinPermiso />;
  const datos = caja.datos;
  const t = datos?.totales;
  const vigentes = t?.pagos.filter((p) => p.estado === 'vigente').length ?? 0;
  const pedidoActual: Pedido | null = cuentaId ? { tipo: 'cuenta', id: cuentaId } : pedido;

  return (
    <>
      <TituloVista titulo="Cuotas y pagos" sub={t ? `${t.importeCuota !== null ? `Cuota mensual ${formatearSoles(t.importeCuota)} · ` : ''}${vigentes} ${vigentes === 1 ? 'pago vigente' : 'pagos vigentes'}` : 'Cuotas por periodo e historial de pagos'}
        acciones={<><Bt clase="borde" ic="mas" onClick={() => setPedido({ tipo: 'generar' })}>Generar cuotas</Bt><Bt clase="teal" ic="wallet" onClick={() => setPedido({ tipo: 'pago', id: null })}>Registrar pago</Bt></>} />
      {caja.error && !datos && <FalloCarga texto={caja.error} recargar={() => void caja.recargar()} />}
      {!datos && !caja.error && <Cargando texto="Sumando cuotas y pagos…" />}
      {datos && t && (
        <>
          <div className="kpis">
            <Kpi nombre="Emitido" valor={t.emitido} pct={100} clase="k1" testid="kpi-emitido" />
            <Kpi nombre="Cobrado" valor={t.cobrado} pct={t.pct} clase="k2" testid="kpi-cobrado" />
            <Kpi nombre="Pendiente" valor={t.pendiente} pct={100 - t.pct} clase="k3" testid="kpi-pendiente" />
          </div>
          {datos.incompleta && <p className="nota-parcial" role="status">No se pudo leer el estado de cuenta de algunas familias: las cifras son parciales.</p>}
          <div className="tabla pagos-t" data-testid="pagos-jass" role="list" aria-label="Pagos registrados">
            {t.pagos.length === 0 && <p className="vacio-l">Todavía no hay pagos registrados.</p>}
            {t.pagos.map((p) => (
              <div className={`fam ${p.estado}`} key={p.id} role="listitem" data-testid={`pago-${p.comprobante}`}>
                <Av id={p.asociadoId} tam="m" />
                <div><b>{p.nombre}</b><small>Cuota de {mesDe(p.periodo).toLowerCase()} · {p.comprobante} · {cuando(p.pagadoEn)}</small></div>
                <span className={`chip ${p.estado === 'vigente' ? 'ok' : 'gris'}`}>{p.estado === 'vigente' ? <><Ic n="check" />Vigente</> : 'Revertido'}</span>
                <span className="m">{formatearSoles(p.importeCentimos)}</span>
                {p.estado === 'vigente'
                  ? <button type="button" className="mini-bt" aria-label={`Revertir el pago ${p.comprobante}`} onClick={() => setPedido({ tipo: 'reversa', pago: p, asociado: { id: p.asociadoId, nombre: p.nombre } })}><Ic n="revertir" />Revertir</button>
                  : <VerMotivo pago={p} abierto={motivoDe === p.id} alternar={() => setMotivoDe(motivoDe === p.id ? null : p.id)} />}
                {motivoDe === p.id && <MotivoReversa pagoId={p.id} />}
              </div>
            ))}
          </div>
        </>
      )}
      <CajonesCaja pedido={pedidoActual} setPedido={setPedido} caja={datos} recargar={() => void caja.recargar()} alCerrarCuenta={() => navegar('/personal/cuotas')} />
    </>
  );
}
