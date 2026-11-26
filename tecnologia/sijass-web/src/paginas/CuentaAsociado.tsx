import { useCallback, useRef, useState, type FormEvent } from 'react';
import type { EstadoDeCuenta, VistaPago } from '../api/tipos';
import { useCarga, useEnvio } from '../hooks';
import { mensajeDeError, useApp } from '../contexto';
import { Importe } from '../Importe';
import { formatearSoles, parsearSoles } from '../lib/dinero';
import { nuevoUuid } from '../lib/uuid';
import { Aviso, Boton, Carga, ErrorConsulta, SinPermiso } from '../ui';
import { PagoDialogo } from './PagoDialogo';
import { HistorialPagos, TablaCuotas } from './TablasFinancieras';
import { GestionarAcceso } from './Asociados';

export function CuentaAsociado({ id, volver, etiquetaVolver }: { id: string; volver: () => void; etiquetaVolver: string }) {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<EstadoDeCuenta>('GET', `/v1/asociados/${id}/estado-de-cuenta`), [api, id]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [cuotaId, setCuotaId] = useState('');
  const [importe, setImporte] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [clave, setClave] = useState(nuevoUuid);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [detalle, setDetalle] = useState<{ pago: VistaPago; reversa: boolean } | null>(null);
  const [crearAcceso, setCrearAcceso] = useState(false);
  const historial = useRef<HTMLHeadingElement>(null);
  const { enviando, ejecutar } = useEnvio();

  // Cada cambio de contenido es un pago distinto: otra clave. Un reintento del mismo envío conserva la suya.
  const cambiar = (poner: (v: string) => void) => (v: string) => {
    poner(v);
    setClave(nuevoUuid());
  };

  async function registrarPago(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    const importeCentimos = parsearSoles(importe);
    if (!cuotaId) return setAviso({ tipo: 'error', texto: 'Elija la cuota que se paga.' });
    if (importeCentimos === null) return setAviso({ tipo: 'error', texto: 'Escriba un importe válido en soles, por ejemplo 5.00.' });
    if (!comprobante.trim()) return setAviso({ tipo: 'error', texto: 'Escriba el comprobante del pago.' });
    await ejecutar(async () => {
      try {
        await api.solicitar('POST', '/v1/pagos', { cuotaId, importeCentimos, comprobante: comprobante.trim() }, { 'Idempotency-Key': clave });
        setImporte('');
        setComprobante('');
        setCuotaId('');
        setClave(nuevoUuid());
        setAviso({ tipo: 'ok', texto: `Pago de ${formatearSoles(importeCentimos)} registrado.` });
        await recargar();
      } catch (err) {
        setAviso({ tipo: 'error', texto: mensajeDeError(err) });
      }
    });
  }

  if (prohibido) return <SinPermiso />;
  const pendientes = datos?.cuotas.filter((c) => c.pendienteCentimos > 0) ?? [];
  return (
    <section aria-labelledby="titulo-cuenta">
      <Boton onClick={volver}>← {etiquetaVolver}</Boton>
      {error && <ErrorConsulta error={error} recargar={recargar} />}
      {cargando && !datos && <Carga />}
      {datos && (
        <>
          <h1 id="titulo-cuenta">{datos.asociado.nombre}</h1>
          <p className="suave">
            Documento {datos.asociado.documento} · {datos.asociado.estado === 'activo' ? 'Activo' : 'De baja'}
          </p>
          <p className="saldo saldo-grande" data-testid="saldo-asociado">
            Saldo: <strong><Importe centimos={datos.saldoCentimos} /></strong>
          </p>
          {cargando && <p className="suave" role="status">Actualizando el estado de cuenta…</p>}

          <section className="tarjeta" aria-labelledby="cuenta-acceso">
            <h2 id="cuenta-acceso">Cuenta de acceso</h2>
            {datos.asociado.estado === 'activo' ? (
              <div>
                <p className="suave" data-testid="estado-acceso">
                  {datos.acceso === 'activo' ? 'Tiene acceso al portal con su DNI.' : datos.acceso === 'inactivo' ? 'Su acceso está inactivo.' : 'Todavía no tiene acceso al portal.'}
                </p>
                {datos.acceso !== 'inactivo' && (
                  <Boton onClick={() => { setAviso(null); setCrearAcceso(true); }}>{datos.acceso === 'activo' ? 'Restablecer clave' : 'Crear acceso'}</Boton>
                )}
              </div>
            ) : <p className="suave">El asociado está dado de baja.</p>}
          </section>
          {crearAcceso && <GestionarAcceso asociado={{ ...datos.asociado, acceso: datos.acceso ?? 'sin-acceso' }} cerrar={() => setCrearAcceso(false)} alTerminar={(texto) => {
            setCrearAcceso(false);
            setAviso({ tipo: 'ok', texto });
            void recargar();
          }} />}

          {datos.asociado.estado === 'activo' && (
            <form className="tarjeta en-linea" onSubmit={registrarPago} aria-label="Registrar pago">
              <h2>Registrar pago</h2>
              <label>
                Cuota
                <select name="cuota" disabled={enviando || cargando} value={cuotaId} onChange={(e) => cambiar(setCuotaId)(e.target.value)}>
                  <option value="">Elija una cuota…</option>
                  {pendientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.periodo} — pendiente {formatearSoles(c.pendienteCentimos)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Importe (S/)
                <input name="importe-pago" inputMode="decimal" required disabled={enviando} placeholder="5.00" value={importe} onChange={(e) => cambiar(setImporte)(e.target.value)} />
              </label>
              <label>
                Comprobante
                <input name="comprobante" required maxLength={60} disabled={enviando} value={comprobante} onChange={(e) => cambiar(setComprobante)(e.target.value)} />
              </label>
              <Boton type="submit" variante="primario" disabled={enviando || cargando || pendientes.length === 0}>{enviando ? 'Registrando…' : 'Registrar pago'}</Boton>
            </form>
          )}
          {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

          <h2>Cuotas</h2>
          <TablaCuotas cuotas={datos.cuotas} />

          <h2 ref={historial} tabIndex={-1}>Pagos</h2>
          <HistorialPagos pagos={datos.pagos} acciones={(pago) => (
            <>
              <Boton onClick={() => { setAviso(null); setDetalle({ pago, reversa: false }); }}>Ver detalle</Boton>
              {pago.estado === 'vigente' && (
                <Boton disabled={cargando} onClick={() => { setAviso(null); setDetalle({ pago, reversa: true }); }}>Reversar</Boton>
              )}
            </>
          )} />
          {detalle && <PagoDialogo pago={detalle.pago} asociado={datos.asociado.nombre} iniciarReversa={detalle.reversa}
            cerrar={() => setDetalle(null)} actualizar={(revertido) => {
              if (revertido) {
                setDetalle(null);
                setAviso({ tipo: 'ok', texto: 'Pago revertido.' });
                window.requestAnimationFrame(() => historial.current?.focus());
              }
              void recargar();
            }} />}
        </>
      )}
    </section>
  );
}
