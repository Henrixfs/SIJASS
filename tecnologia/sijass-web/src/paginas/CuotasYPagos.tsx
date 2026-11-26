import { useCallback, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import type { ResumenAsociado } from '../api/tipos';
import { useCarga, useEnvio } from '../hooks';
import { mensajeDeError, useApp } from '../contexto';
import { parsearSoles } from '../lib/dinero';
import { Aviso, Boton, Carga, ErrorConsulta, SinPermiso } from '../ui';
import { EnlacePersonal } from './NavegacionPersonal';

export function CuotasYPagos() {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<{ asociados: ResumenAsociado[] }>('GET', '/v1/asociados'), [api]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [asociado, setAsociado] = useState('');
  if (prohibido) return <SinPermiso />;
  return (
    <>
      <h1>Cuotas y pagos</h1>
      <GenerarCuotas />
      <h2>Estado de cuenta</h2>
      {cargando && !datos && <Carga />}
      {error && <ErrorConsulta error={error} recargar={recargar} />}
      {datos?.asociados.length === 0 && <p className="tarjeta suave">Aún no hay asociados registrados.</p>}
      {datos && datos.asociados.length > 0 && (
        <div className="tarjeta en-linea">
          <label>Asociado
            <select value={asociado} onChange={(e) => setAsociado(e.target.value)}>
              <option value="">Elija un asociado…</option>
              {datos.asociados.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {a.documento}</option>)}
            </select>
          </label>
          {datos.asociados.some((a) => a.id === asociado) && <EnlacePersonal id={`cuotas/${asociado}`}>Ver estado de cuenta</EnlacePersonal>}
        </div>
      )}
    </>
  );
}

function GenerarCuotas() {
  const { api } = useApp();
  const hoy = new Date();
  const [periodo, setPeriodo] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);
  const [importe, setImporte] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const { enviando, ejecutar } = useEnvio();

  async function generar(e: FormEvent) {
    e.preventDefault();
    const importeCentimos = parsearSoles(importe);
    if (importeCentimos === null) {
      setAviso({ tipo: 'error', texto: 'Escriba un importe válido en soles, por ejemplo 15.00.' });
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
      setAviso({ tipo: 'error', texto: 'Indique un periodo válido.' });
      return;
    }
    await ejecutar(async () => {
      setAviso(null);
      try {
        const r = await api.solicitar<{ creadas: number; existentes: number }>('POST', '/v1/cuotas/generar', { periodo, importeCentimos });
        setAviso({ tipo: 'ok', texto: `Cuotas de ${periodo}: ${r.creadas} creadas, ${r.existentes} ya existían.` });
      } catch (err) {
        setAviso({ tipo: 'error', texto: err instanceof ErrorApi && err.estado === 403 ? 'Su rol no puede generar cuotas.' : mensajeDeError(err) });
      }
    });
  }

  return (
    <section aria-labelledby="titulo-cuotas">
      <h2 id="titulo-cuotas">Generar cuotas</h2>
      <form className="tarjeta en-linea" onSubmit={generar} aria-label="Generar cuotas del periodo">
        <label>
          Periodo
          <input name="periodo" type="month" required disabled={enviando} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
        <label>
          Importe de la cuota (S/)
          <input name="importe-cuota" inputMode="decimal" required disabled={enviando} placeholder="15.00" value={importe} onChange={(e) => setImporte(e.target.value)} />
        </label>
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Generando…' : 'Generar cuotas'}</Boton>
      </form>
      <p className="suave">Se crea una cuota por cada asociado activo. Repetir el periodo no duplica cuotas.</p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
    </section>
  );
}
