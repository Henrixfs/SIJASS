import { useState } from 'react';
import type { ResumenAsociado } from '../api/tipos';
import { useApp } from '../contexto';
import { formatearSoles } from '../lib/dinero';
import { FOTOS } from '../lib/fotos';
import { SinPermiso } from '../ui';
import { Av, Banda, Bt, Cargando, FalloCarga, Gotas, Ic } from '../v3/base';
import { useCaja, type Caja } from '../v3/datos';
import { CajonesCaja, type Pedido } from './Cajones';
import { TituloVista } from './NavegacionPersonal';

type Filtro = 'todos' | 'deuda' | 'dia';
const POR_TANDA = 30;

function estadoDe(a: ResumenAsociado, caja: Caja): { texto: string; clase: string } {
  if (a.estado === 'baja') return { texto: 'De baja', clase: 'gris' };
  if (a.saldoCentimos <= 0) return { texto: 'Al día', clase: 'ok' };
  const parcial = caja.cuentas[a.id]?.cuotas.some((c) => c.estado === 'parcial');
  return { texto: parcial ? 'Pago parcial' : 'Pendiente', clase: 'pen' };
}

const TEXTO_ACCESO = { activo: 'con acceso', inactivo: 'acceso inactivo', 'sin-acceso': 'sin acceso' } as const;

/** Padrón (maqueta v3): una fila por familia con su avatar, sus gotas por mes, su saldo y sus acciones. */
export function Asociados({ cuentaId = null }: { cuentaId?: string | null }) {
  const { navegar } = useApp();
  const caja = useCaja();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [texto, setTexto] = useState('');
  const [tanda, setTanda] = useState(POR_TANDA);
  const [pedido, setPedido] = useState<Pedido | null>(null);

  if (caja.prohibido) return <SinPermiso />;
  const datos = caja.datos;
  const lista = datos?.asociados ?? [];
  const conSaldo = lista.filter((a) => a.estado === 'activo' && a.saldoCentimos > 0);
  const alDia = lista.filter((a) => a.estado === 'activo' && a.saldoCentimos <= 0);
  const termino = texto.trim().toLocaleLowerCase('es-PE');
  const filtrados = lista.filter((a) =>
    (filtro === 'todos' || (filtro === 'deuda' ? conSaldo.includes(a) : alDia.includes(a)))
    && `${a.nombre} ${a.documento}`.toLocaleLowerCase('es-PE').includes(termino));
  const visibles = filtrados.slice(0, tanda);
  const pedidoActual: Pedido | null = cuentaId ? { tipo: 'cuenta', id: cuentaId } : pedido;

  return (
    <>
      <TituloVista titulo="Asociados" sub={datos ? `${lista.length} en el padrón · saldo total ${formatearSoles(datos.totales.pendiente)}` : 'Padrón de la JASS'}
        acciones={<Bt clase="teal" ic="mas" onClick={() => setPedido({ tipo: 'nuevo' })}>Registrar asociado</Bt>} />
      {caja.error && !datos && <FalloCarga texto={caja.error} recargar={() => void caja.recargar()} />}
      {!datos && !caja.error && <Cargando texto="Leyendo el padrón…" />}
      {datos && (
        <>
          <div className="filtros">
            <label className="buscar"><Ic n="lupa" /><input type="search" placeholder="Buscar por nombre o DNI" aria-label="Buscar asociado por nombre o DNI" value={texto} onChange={(e) => { setTexto(e.target.value); setTanda(POR_TANDA); }} /></label>
            <div className="chips-f" role="group" aria-label="Filtrar">
              {([['todos', 'Todos', lista.length], ['deuda', 'Con saldo', conSaldo.length], ['dia', 'Al día', alDia.length]] as const).map(([v, n, c]) => (
                <button key={v} type="button" aria-pressed={filtro === v} onClick={() => { setFiltro(v); setTanda(POR_TANDA); }}>{n}<em>{c}</em></button>
              ))}
            </div>
          </div>
          {datos.incompleta && <p className="nota-parcial" role="status">No se pudo leer el estado de cuenta de algunas familias: sus gotas no se muestran.</p>}
          <div className="lista-aso" data-testid="tabla-asociados" role="list" aria-label="Padrón de asociados">
            {visibles.map((a) => {
              const est = estadoDe(a, datos);
              const cuenta = datos.cuentas[a.id];
              return (
                <article className="fila-aso" key={a.id} role="listitem" data-testid={`fila-${a.documento}`} aria-label={a.nombre}>
                  <Av id={a.id} tam="l" />
                  <div className="n"><b>{a.nombre}</b><small>DNI {a.documento} · {TEXTO_ACCESO[a.acceso] ?? 'sin acceso'}</small></div>
                  {cuenta ? <Gotas cuotas={cuenta.cuotas} /> : <div className="gotas" />}
                  <span className={`chip ${est.clase}`}>{est.texto}</span>
                  <span className="m">{formatearSoles(Math.max(0, a.saldoCentimos))}</span>
                  <span className="botones">
                    <Bt clase="borde" onClick={() => navegar(`/personal/asociados/${a.id}`)}>Ver cuenta</Bt>
                    {a.estado === 'activo' && a.saldoCentimos > 0 && <Bt clase="teal" onClick={() => setPedido({ tipo: 'pago', id: a.id })}>Cobrar</Bt>}
                  </span>
                </article>
              );
            })}
            {filtrados.length === 0 && <p className="vacio-l">{lista.length === 0 ? 'Aún no hay asociados registrados.' : 'Nadie coincide con la búsqueda.'}</p>}
          </div>
          {visibles.length < filtrados.length && <Bt clase="borde" className="mas-aso" onClick={() => setTanda((n) => n + POR_TANDA)}>Mostrar {Math.min(POR_TANDA, filtrados.length - visibles.length)} más</Bt>}
          <p className="nota">El avatar se asigna a cada familia por su registro; no se deduce de su nombre.</p>
          {lista.length < 5 && <Banda foto={FOTOS.bofedales} sobre="Padrón de la JASS" titulo={`${alDia.length} al día · ${conSaldo.length} con saldo`} texto="Cada familia con su estado de cuenta." />}
        </>
      )}
      <CajonesCaja pedido={pedidoActual} setPedido={setPedido} caja={datos} recargar={() => void caja.recargar()} alCerrarCuenta={() => navegar('/personal/asociados')} />
    </>
  );
}
