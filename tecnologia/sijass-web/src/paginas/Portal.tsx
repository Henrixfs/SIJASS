import { useCallback, useEffect } from 'react';
import type { SaldoPortal, VistaCuota, VistaPago } from '../api/tipos';
import { useApp } from '../contexto';
import { useCarga } from '../hooks';
import { formatearSoles } from '../lib/dinero';

interface Datos {
  saldo: SaldoPortal;
  cuotas: VistaCuota[];
  pagos: VistaPago[];
}

export function Portal() {
  const { api, salir } = useApp();
  const cargar = useCallback(async (): Promise<Datos> => {
    const [saldo, cuotas, pagos] = await Promise.all([
      api.solicitar<SaldoPortal>('GET', '/v1/portal/saldo'),
      api.solicitar<{ cuotas: VistaCuota[] }>('GET', '/v1/portal/cuotas'),
      api.solicitar<{ pagos: VistaPago[] }>('GET', '/v1/portal/pagos'),
    ]);
    return { saldo, cuotas: cuotas.cuotas, pagos: pagos.pagos };
  }, [api]);
  const { datos, error, cargando, recargar } = useCarga(cargar);

  useEffect(() => {
    // Al volver a la pestaña se actualiza: así el asociado ve un pago recién registrado.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [recargar]);

  const debe = datos !== null && datos.saldo.saldoCentimos > 0;
  return (
    <>
      <header className="barra">
        <strong>SIJASS</strong>
        <span className="suave">Portal del asociado</span>
        <button type="button" onClick={() => void salir()}>
          Salir
        </button>
      </header>
      <main>
        {error && (
          <p role="alert" className="error" data-testid="aviso-error">
            {error}
          </p>
        )}
        {cargando && !datos && <p className="suave">Cargando…</p>}
        {datos && (
          <>
            <h1 data-testid="nombre-asociado">{datos.saldo.asociado.nombre}</h1>
            <section className={`saldo-grande ${debe ? 'debe' : 'aldia'}`} aria-label="Saldo">
              <span className="suave">{debe ? 'Saldo pendiente' : 'Está al día'}</span>
              <strong data-testid="saldo">{formatearSoles(Math.max(0, datos.saldo.saldoCentimos))}</strong>
              {datos.saldo.saldoCentimos < 0 && (
                <span className="suave" data-testid="a-favor">
                  Saldo a su favor: {formatearSoles(-datos.saldo.saldoCentimos)}
                </span>
              )}
              <span className="suave">Al periodo {datos.saldo.periodoActual}</span>
            </section>
            <button type="button" onClick={() => void recargar()} disabled={cargando}>
              {cargando ? 'Actualizando…' : 'Actualizar'}
            </button>
            {datos.saldo.asociado.estado === 'baja' && <p className="aviso">Su cuenta de asociado está dada de baja; solo puede consultar su historial.</p>}

            <h2>Cuotas</h2>
            <div className="tabla-envoltorio">
              <table data-testid="portal-cuotas">
                <thead>
                  <tr>
                    <th scope="col">Periodo</th>
                    <th scope="col" className="num">Importe</th>
                    <th scope="col" className="num">Pendiente</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.cuotas.map((c) => (
                    <tr key={c.id}>
                      <td>{c.periodo}</td>
                      <td className="num">{formatearSoles(c.importeCentimos)}</td>
                      <td className="num">{formatearSoles(c.pendienteCentimos)}</td>
                      <td>{c.estado === 'pagada' ? 'Pagada' : c.estado === 'parcial' ? 'Pago parcial' : 'Pendiente'}</td>
                    </tr>
                  ))}
                  {datos.cuotas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="suave">Todavía no tiene cuotas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2>Pagos</h2>
            <div className="tabla-envoltorio">
              <table data-testid="portal-pagos">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Periodo</th>
                    <th scope="col">Comprobante</th>
                    <th scope="col" className="num">Importe</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.pagos.map((p) => (
                    <tr key={p.id} data-testid={`portal-pago-${p.comprobante}`}>
                      <td>{new Date(p.pagadoEn).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{p.periodo}</td>
                      <td>{p.comprobante}</td>
                      <td className="num">{formatearSoles(p.importeCentimos)}</td>
                      <td>{p.estado === 'vigente' ? 'Vigente' : 'Revertido'}</td>
                    </tr>
                  ))}
                  {datos.pagos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="suave">Todavía no tiene pagos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}
