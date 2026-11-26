import { useCallback, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import type { AccesoEntregado, EstadoAcceso, ResumenAsociado } from '../api/tipos';
import { useCarga, useEnvio } from '../hooks';
import { mensajeDeError, useApp } from '../contexto';
import { formatearSoles } from '../lib/dinero';
import { Aviso, Boton, Carga, Dialogo, ErrorConsulta, Insignia, SinPermiso, Tabla } from '../ui';
import { ClaveEntregada } from './ClaveEntregada';

export function Asociados() {
  const { api, navegar } = useApp();
  const cargar = useCallback(() => api.solicitar<{ asociados: ResumenAsociado[] }>('GET', '/v1/asociados'), [api]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [accesoDe, setAccesoDe] = useState<ResumenAsociado | null>(null);
  const [bajaDe, setBajaDe] = useState<ResumenAsociado | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const { enviando, ejecutar } = useEnvio();
  const termino = busqueda.trim().toLocaleLowerCase('es-PE');
  const filtrados = datos?.asociados.filter((a) =>
    (!estado || a.estado === estado) && `${a.nombre} ${a.documento}`.toLocaleLowerCase('es-PE').includes(termino),
  ) ?? [];
  const porPagina = 12;
  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const actual = Math.min(pagina, paginas);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      setAviso(null);
      try {
        await api.solicitar('POST', '/v1/asociados', { nombre: nombre.trim(), documento: documento.trim() });
        setNombre('');
        setDocumento('');
        setAviso({ tipo: 'ok', texto: 'Asociado registrado.' });
        await recargar();
      } catch (err) {
        setAviso({ tipo: 'error', texto: mensajeDeError(err) });
      }
    });
  }

  if (prohibido) return <SinPermiso />;
  return (
    <section aria-labelledby="titulo-asociados">
      <h1 id="titulo-asociados">Asociados</h1>
      {error && <ErrorConsulta error={error} recargar={recargar} />}
      <form className="tarjeta en-linea" onSubmit={registrar} aria-label="Registrar asociado">
        <h2>Registrar asociado</h2>
        <label>
          Nombre completo
          <input name="nombre" required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Documento
          <input name="documento" required minLength={4} maxLength={20} value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </label>
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar asociado'}</Boton>
      </form>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {datos && datos.asociados.length > 0 && (
        <div className="tarjeta en-linea" role="group" aria-label="Filtros del padrón">
          <label>Buscar por nombre o documento
            <input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} />
          </label>
          <label>Estado
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
              <option value="">Todos</option><option value="activo">Activos</option><option value="baja">De baja</option>
            </select>
          </label>
        </div>
      )}
      {cargando && !datos ? (
        <Carga />
      ) : datos && (
        <Tabla nombre="Padrón de asociados">
          <table className="tabla-padron" role="table" data-testid="tabla-asociados">
            <caption className="solo-lectores">Padrón de asociados</caption>
            <thead>
              <tr>
                <th scope="col">Documento</th>
                <th scope="col">Nombre</th>
                <th scope="col">Estado</th>
                <th scope="col">Acceso</th>
                <th scope="col" className="num">
                  Saldo
                </th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice((actual - 1) * porPagina, actual * porPagina).map((a) => (
                <tr key={a.id} data-testid={`fila-${a.documento}`}>
                  <td className="documento-padron"><span className="etiqueta-compacta" aria-hidden="true">Documento </span>{a.documento}</td>
                  <td className="nombre-padron">{a.nombre}</td>
                  <td><Insignia tipo={a.estado === 'activo' ? 'ok' : 'advertencia'}>{a.estado === 'activo' ? 'Activo' : 'De baja'}</Insignia></td>
                  <td><Insignia tipo={a.acceso === 'activo' ? 'ok' : 'info'}>{a.acceso === 'activo' ? 'Con acceso' : a.acceso === 'inactivo' ? 'Acceso inactivo' : 'Sin acceso'}</Insignia></td>
                  <td className="num saldo-padron"><span className="etiqueta-compacta" aria-hidden="true">Saldo </span>{formatearSoles(a.saldoCentimos)}</td>
                  <td className="acciones">
                    <button type="button" onClick={() => navegar(`/personal/asociados/${a.id}`)}>
                      Ver cuenta
                    </button>
                    {a.estado === 'activo' && (
                      <>
                        {a.acceso !== 'inactivo' && (
                          <button type="button" onClick={() => { setAviso(null); setAccesoDe(a); }}>
                            {a.acceso === 'activo' ? 'Restablecer clave' : 'Crear acceso'}
                          </button>
                        )}
                        <button type="button" onClick={() => { setAviso(null); setBajaDe(a); }}>
                          Dar de baja
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="suave">
                    {datos.asociados.length === 0 ? 'Aún no hay asociados registrados.' : 'No se encontraron asociados con estos filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Tabla>
      )}
      {paginas > 1 && (
        <nav className="paginacion" aria-label="Paginación del padrón">
          <Boton disabled={actual === 1} onClick={() => setPagina(actual - 1)}>Anterior</Boton>
          <span aria-live="polite">Página {actual} de {paginas}</span>
          <Boton disabled={actual === paginas} onClick={() => setPagina(actual + 1)}>Siguiente</Boton>
        </nav>
      )}
      {accesoDe && (
        <GestionarAcceso
          asociado={accesoDe}
          cerrar={() => setAccesoDe(null)}
          alTerminar={(texto) => {
            setAccesoDe(null);
            setAviso({ tipo: 'ok', texto });
            void recargar();
          }}
        />
      )}
      {bajaDe && <ConfirmarBaja asociado={bajaDe} cerrar={() => setBajaDe(null)} alTerminar={() => {
        setAviso({ tipo: 'ok', texto: `${bajaDe.nombre} fue dado de baja. Su historial de cuotas y pagos se conserva.` });
        setBajaDe(null);
        void recargar();
      }} />}
    </section>
  );
}

/**
 * Crea el acceso de un asociado o restablece su clave. La clave la genera el sistema (tres palabras)
 * y se muestra una sola vez para entregarla en persona (spec `gestion-de-accesos`).
 */
export function GestionarAcceso({ asociado, cerrar, alTerminar }: {
  asociado: { id: string; nombre: string; documento?: string; acceso: EstadoAcceso };
  cerrar: () => void;
  alTerminar: (texto: string) => void;
}) {
  const { api } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [entregada, setEntregada] = useState<AccesoEntregado | null>(null);
  const { enviando, ejecutar } = useEnvio();
  const restablecer = asociado.acceso === 'activo';

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      setError(null);
      try {
        setEntregada(await api.solicitar<AccesoEntregado>('POST', `/v1/asociados/${asociado.id}/acceso${restablecer ? '/restablecer' : ''}`));
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'asociado-con-cuenta') setError('El asociado ya tiene acceso. Usa «Restablecer clave».');
        else if (err instanceof ErrorApi && err.codigo === 'asociado-sin-acceso') setError('El asociado todavía no tiene acceso. Usa «Crear acceso».');
        else if (err instanceof ErrorApi && err.codigo === 'documento-con-acceso') setError('Ese DNI ya tiene un acceso en el sistema.');
        else if (err instanceof ErrorApi && err.codigo === 'documento-no-es-dni') setError('El documento del padrón no es un DNI de 8 números. Corrígelo antes de crear el acceso.');
        else if (err instanceof ErrorApi && err.estado === 409 && err.codigo === 'asociado-de-baja') setError('El asociado está dado de baja.');
        else if (err instanceof ErrorApi && err.estado === 403) setError('Su rol no tiene permiso para esta operación.');
        else setError(mensajeDeError(err));
      }
    });
  }

  if (entregada) {
    return (
      <ClaveEntregada
        titulo={restablecer ? 'Clave restablecida' : 'Acceso creado'}
        nombre={asociado.nombre}
        documento={asociado.documento}
        clave={entregada.claveTemporal}
        cerrar={() => alTerminar(restablecer ? `Se restableció la clave de ${asociado.nombre}.` : `Se creó el acceso de ${asociado.nombre}.`)}
      />
    );
  }
  return (
    <Dialogo titulo={restablecer ? `Restablecer la clave de ${asociado.nombre}` : `Crear acceso de ${asociado.nombre}`} cerrar={() => { if (!enviando) cerrar(); }}>
      <form onSubmit={confirmar} aria-label={restablecer ? 'Restablecer clave' : 'Crear acceso'}>
        <p>
          {restablecer
            ? 'Se generará una clave temporal nueva y la clave anterior dejará de servir. Podrás entregársela en persona.'
            : 'Entrará con su DNI. El sistema generará una clave temporal de tres palabras para que se la entregues en persona.'}
        </p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="pie-dialogo">
          <Boton disabled={enviando} onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Generando…' : restablecer ? 'Restablecer clave' : 'Crear acceso'}</Boton>
        </div>
      </form>
    </Dialogo>
  );
}

function ConfirmarBaja({ asociado, cerrar, alTerminar }: { asociado: ResumenAsociado; cerrar: () => void; alTerminar: () => void }) {
  const { api } = useApp();
  const [error, setError] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();
  async function confirmar(e: FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      setError(null);
      try {
        await api.solicitar('POST', `/v1/asociados/${asociado.id}/baja`);
        alTerminar();
      } catch (err) {
        setError(err instanceof ErrorApi && err.estado === 403 ? 'Su rol no tiene permiso para dar de baja a este asociado.' : mensajeDeError(err));
      }
    });
  }
  return (
    <Dialogo titulo="Dar de baja al asociado" cerrar={() => { if (!enviando) cerrar(); }}>
      <form onSubmit={confirmar}>
        <strong>{asociado.nombre}</strong>
        <p>¿Confirma que desea dar de baja a este asociado? Su historial de cuotas y pagos se conservará.</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="pie-dialogo">
          <Boton disabled={enviando} onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" variante="peligro" disabled={enviando}>{enviando ? 'Procesando…' : 'Confirmar baja'}</Boton>
        </div>
      </form>
    </Dialogo>
  );
}
