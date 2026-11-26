import { useCallback, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import type { PagoConReversa, VistaPago } from '../api/tipos';
import { useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { fechaPago, formatearSoles } from '../lib/dinero';
import { Aviso, Boton, Carga, Dialogo, ErrorConsulta, SinPermiso } from '../ui';
import { EstadoPago } from './TablasFinancieras';

export function PagoDialogo({ pago, asociado, iniciarReversa, cerrar, actualizar }: {
  pago: VistaPago;
  asociado: string;
  iniciarReversa: boolean;
  cerrar: () => void;
  actualizar: (revertido: boolean) => void;
}) {
  const [reversa, setReversa] = useState(iniciarReversa);
  const { enviando, ejecutar } = useEnvio();
  const cerrarSeguro = () => { if (!enviando) cerrar(); };
  return (
    <Dialogo titulo={reversa ? 'Reversar pago' : 'Detalle del pago'} cerrar={cerrarSeguro}>
      {reversa ? (
        <FormularioReversa pago={pago} cerrar={cerrarSeguro} actualizar={actualizar} enviando={enviando} ejecutar={ejecutar} />
      ) : (
        <DetallePago pago={pago} asociado={asociado} cerrar={cerrar} abrirReversa={() => setReversa(true)} />
      )}
    </Dialogo>
  );
}

function DetallePago({ pago, asociado, cerrar, abrirReversa }: { pago: VistaPago; asociado: string; cerrar: () => void; abrirReversa: () => void }) {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<PagoConReversa>('GET', `/v1/pagos/${pago.id}`), [api, pago.id]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  return (
    <>
      {cargando && <Carga />}
      {error && <ErrorConsulta error={error} recargar={recargar} />}
      {prohibido && <SinPermiso />}
      {datos && (
        <dl className="ficha ficha-pago">
          <div><dt>Asociado</dt><dd>{asociado}</dd></div>
          <div><dt>Periodo</dt><dd>{pago.periodo}</dd></div>
          <div><dt>Comprobante</dt><dd>{datos.comprobante}</dd></div>
          <div className="total-pago"><dt>Importe</dt><dd>{formatearSoles(datos.importeCentimos)}</dd></div>
          <div><dt>Fecha de pago (Lima)</dt><dd>{fechaPago(datos.pagadoEn)}</dd></div>
          <div><dt>Estado</dt><dd><EstadoPago estado={datos.estado} /></dd></div>
          <div className="ancho"><dt>Identificador</dt><dd>{datos.id}</dd></div>
          {datos.reversa && <>
            <div><dt>Fecha de reversa (Lima)</dt><dd>{fechaPago(datos.reversa.creadaEn)}</dd></div>
            <div className="ancho"><dt>Motivo de reversa</dt><dd>{datos.reversa.motivo}</dd></div>
          </>}
        </dl>
      )}
      <div className="pie-dialogo">
        <Boton onClick={cerrar}>Volver al historial</Boton>
        {datos?.estado === 'vigente' && !error && <Boton variante="peligro" onClick={abrirReversa}>Reversar pago</Boton>}
      </div>
    </>
  );
}

function FormularioReversa({ pago, cerrar, actualizar, enviando, ejecutar }: {
  pago: VistaPago;
  cerrar: () => void;
  actualizar: (revertido: boolean) => void;
  enviando: boolean;
  ejecutar: (operacion: () => Promise<void>) => Promise<void>;
}) {
  const { api } = useApp();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invalido, setInvalido] = useState(false);
  const [cerrado, setCerrado] = useState(false);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (cerrado) return;
    const texto = motivo.trim();
    if (texto.length < 1 || texto.length > 300) {
      setInvalido(true);
      return;
    }
    await ejecutar(async () => {
      setError(null);
      try {
        await api.solicitar('POST', `/v1/pagos/${pago.id}/reversa`, { motivo: texto });
        actualizar(true);
      } catch (err) {
        if (err instanceof ErrorApi && err.estado === 409) {
          setError('Este pago ya fue revertido. Vuelva al historial para revisar el estado de cuenta.');
          setCerrado(true);
          actualizar(false);
        } else if (err instanceof ErrorApi && err.estado === 403) {
          setError('Su rol no tiene permiso para reversar este pago.');
          setCerrado(true);
        } else if (err instanceof ErrorApi && err.estado === 422) {
          setError('Revise el motivo e intente de nuevo.');
          setInvalido(true);
        } else {
          setError('No se pudo confirmar la reversa. Revise el estado del pago en el historial antes de intentarlo de nuevo.');
          setCerrado(true);
          actualizar(false);
        }
      }
    });
  }

  return (
    <>
      <p className="referencia-pago"><strong>{pago.comprobante}</strong><span>{formatearSoles(pago.importeCentimos)}</span></p>
      <p>El pago original se conserva en el historial y la reversa queda registrada para auditoría.</p>
      <form onSubmit={confirmar} noValidate>
        <label>Motivo de la reversa
          <textarea required maxLength={300} rows={3} value={motivo} disabled={enviando || cerrado}
            aria-invalid={invalido || undefined} aria-describedby="regla-motivo"
            onChange={(e) => { setMotivo(e.target.value); setInvalido(false); }} />
        </label>
        <small id="regla-motivo" className="suave">Obligatorio · Máximo 300 caracteres</small>
        {invalido && !error && <Aviso tipo="error">Escriba un motivo de 1 a 300 caracteres.</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="pie-dialogo">
          <Boton disabled={enviando} onClick={cerrar}>{cerrado ? 'Volver al historial' : 'Cancelar'}</Boton>
          {!cerrado && <Boton variante="peligro" type="submit" disabled={enviando}>{enviando ? 'Reversando…' : 'Confirmar reversa'}</Boton>}
        </div>
      </form>
    </>
  );
}
