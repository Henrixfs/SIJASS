import { useCallback, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import type { EstadoDeCuenta, ResumenAsociado } from '../api/tipos';
import { useCarga } from '../hooks';
import { mensajeDeError, useApp } from '../contexto';
import { formatearSoles, parsearSoles } from '../lib/dinero';
import { Asistente } from './Asistente';
import { Mediciones } from './Mediciones';
import { nuevoUuid } from '../lib/uuid';

const RUTA_ASOCIADOS = '/personal';

function Aviso({ tipo, children }: { tipo: 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <p role={tipo === 'error' ? 'alert' : 'status'} className={tipo === 'error' ? 'error' : 'exito'} data-testid={tipo === 'error' ? 'aviso-error' : 'aviso-ok'}>
      {children}
    </p>
  );
}

function SinPermiso() {
  return (
    <p className="aviso" data-testid="sin-permiso">
      Su rol no tiene acceso a esta sección.
    </p>
  );
}

export function Personal({ ruta }: { ruta: string }) {
  const { api, sesion, navegar, salir } = useApp();
  const coincidencia = /^\/personal\/asociados\/([0-9a-f-]{36})$/.exec(ruta);
  // Tesorero y consejo gestionan el padrón y los pagos; el operador solo mediciones (matriz de actores).
  const puedePadron = sesion?.rol === 'tesorero' || sesion?.rol === 'consejo';
  const [seccion, setSeccion] = useState<'asociados' | 'cuotas' | 'mediciones' | 'asistente'>(puedePadron ? 'asociados' : 'mediciones');
  void api;

  return (
    <>
      <header className="barra">
        <strong>SIJASS</strong>
        <span className="suave" data-testid="rol-actual">
          Personal de la JASS · {sesion?.rol}
        </span>
        <button type="button" onClick={() => void salir()}>
          Salir
        </button>
      </header>
      <main>
        {coincidencia ? (
          <CuentaAsociado key={coincidencia[1]} id={coincidencia[1]} volver={() => navegar(RUTA_ASOCIADOS)} />
        ) : (
          <>
            <nav className="pestanas" aria-label="Secciones">
              {puedePadron && (
                <>
                  <button type="button" aria-pressed={seccion === 'asociados'} onClick={() => setSeccion('asociados')}>
                    Asociados
                  </button>
                  <button type="button" aria-pressed={seccion === 'cuotas'} onClick={() => setSeccion('cuotas')}>
                    Generar cuotas
                  </button>
                </>
              )}
              <button type="button" aria-pressed={seccion === 'mediciones'} onClick={() => setSeccion('mediciones')}>
                Mediciones
              </button>
              <button type="button" aria-pressed={seccion === 'asistente'} onClick={() => setSeccion('asistente')}>
                Asistente
              </button>
            </nav>
            {seccion === 'asociados' && puedePadron ? <Asociados /> : seccion === 'cuotas' && puedePadron ? <GenerarCuotas /> : seccion === 'asistente' ? <Asistente /> : <Mediciones />}
          </>
        )}
      </main>
    </>
  );
}

function Asociados() {
  const { api, navegar } = useApp();
  const cargar = useCallback(() => api.solicitar<{ asociados: ResumenAsociado[] }>('GET', '/v1/asociados'), [api]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [accesoDe, setAccesoDe] = useState<string | null>(null);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    try {
      await api.solicitar('POST', '/v1/asociados', { nombre, documento });
      setNombre('');
      setDocumento('');
      setAviso({ tipo: 'ok', texto: 'Asociado registrado.' });
      await recargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  }

  async function darDeBaja(a: ResumenAsociado) {
    if (!window.confirm(`¿Dar de baja a ${a.nombre}? Se conservan sus cuotas y pagos.`)) return;
    try {
      await api.solicitar('POST', `/v1/asociados/${a.id}/baja`);
      await recargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  }

  if (prohibido) return <SinPermiso />;
  return (
    <section aria-labelledby="titulo-asociados">
      <h1 id="titulo-asociados">Asociados</h1>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <form className="tarjeta en-linea" onSubmit={registrar} aria-label="Registrar asociado">
        <label>
          Nombre completo
          <input name="nombre" required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Documento
          <input name="documento" required minLength={4} maxLength={20} value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </label>
        <button type="submit" className="primario">
          Registrar asociado
        </button>
      </form>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {cargando && !datos ? (
        <p className="suave">Cargando…</p>
      ) : (
        <div className="tabla-envoltorio">
          <table data-testid="tabla-asociados">
            <caption className="solo-lectores">Padrón de asociados</caption>
            <thead>
              <tr>
                <th scope="col">Documento</th>
                <th scope="col">Nombre</th>
                <th scope="col">Estado</th>
                <th scope="col" className="num">
                  Saldo
                </th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {datos?.asociados.map((a) => (
                <tr key={a.id} data-testid={`fila-${a.documento}`}>
                  <td>{a.documento}</td>
                  <td>{a.nombre}</td>
                  <td>{a.estado === 'activo' ? 'Activo' : 'De baja'}</td>
                  <td className="num">{formatearSoles(a.saldoCentimos)}</td>
                  <td className="acciones">
                    <button type="button" onClick={() => navegar(`/personal/asociados/${a.id}`)}>
                      Ver cuenta
                    </button>
                    {a.estado === 'activo' && (
                      <>
                        <button type="button" onClick={() => setAccesoDe(accesoDe === a.id ? null : a.id)}>
                          Crear acceso
                        </button>
                        <button type="button" onClick={() => void darDeBaja(a)}>
                          Dar de baja
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {datos && datos.asociados.length === 0 && (
                <tr>
                  <td colSpan={5} className="suave">
                    Aún no hay asociados registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {accesoDe && datos && (
        <CrearAcceso
          asociado={datos.asociados.find((a) => a.id === accesoDe)!}
          alTerminar={(texto) => {
            setAccesoDe(null);
            setAviso({ tipo: 'ok', texto });
          }}
        />
      )}
    </section>
  );
}

function CrearAcceso({ asociado, alTerminar }: { asociado: ResumenAsociado; alTerminar: (texto: string) => void }) {
  const { api } = useApp();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.solicitar('POST', `/v1/asociados/${asociado.id}/acceso`, { correo, contrasena });
      alTerminar(`Se creó el acceso de ${asociado.nombre}. Entregue la contraseña inicial en persona.`);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }

  return (
    <form className="tarjeta en-linea" onSubmit={crear} aria-label={`Crear acceso de ${asociado.nombre}`}>
      <h2>Acceso de {asociado.nombre}</h2>
      <label>
        Correo del asociado
        <input name="correo-acceso" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </label>
      <label>
        Contraseña inicial (10 caracteres o más)
        <input name="contrasena-acceso" type="password" minLength={10} required autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
      </label>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button type="submit" className="primario">
        Crear acceso
      </button>
    </form>
  );
}

function GenerarCuotas() {
  const { api } = useApp();
  const hoy = new Date();
  const [periodo, setPeriodo] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);
  const [importe, setImporte] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  async function generar(e: FormEvent) {
    e.preventDefault();
    const importeCentimos = parsearSoles(importe);
    if (importeCentimos === null) {
      setAviso({ tipo: 'error', texto: 'Escriba un importe válido en soles, por ejemplo 15.00.' });
      return;
    }
    try {
      const r = await api.solicitar<{ creadas: number; existentes: number }>('POST', '/v1/cuotas/generar', { periodo, importeCentimos });
      setAviso({ tipo: 'ok', texto: `Cuotas de ${periodo}: ${r.creadas} creadas, ${r.existentes} ya existían.` });
    } catch (err) {
      setAviso({ tipo: 'error', texto: err instanceof ErrorApi && err.estado === 403 ? 'Su rol no puede generar cuotas.' : mensajeDeError(err) });
    }
  }

  return (
    <section aria-labelledby="titulo-cuotas">
      <h1 id="titulo-cuotas">Generar cuotas</h1>
      <form className="tarjeta en-linea" onSubmit={generar} aria-label="Generar cuotas del periodo">
        <label>
          Periodo
          <input name="periodo" type="month" required value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
        <label>
          Importe de la cuota (S/)
          <input name="importe-cuota" inputMode="decimal" required placeholder="15.00" value={importe} onChange={(e) => setImporte(e.target.value)} />
        </label>
        <button type="submit" className="primario">
          Generar cuotas
        </button>
      </form>
      <p className="suave">Se crea una cuota por cada asociado activo. Repetir el periodo no duplica cuotas.</p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
    </section>
  );
}

function CuentaAsociado({ id, volver }: { id: string; volver: () => void }) {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<EstadoDeCuenta>('GET', `/v1/asociados/${id}/estado-de-cuenta`), [api, id]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [cuotaId, setCuotaId] = useState('');
  const [importe, setImporte] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [clave, setClave] = useState(nuevoUuid);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

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
    try {
      await api.solicitar('POST', '/v1/pagos', { cuotaId, importeCentimos, comprobante }, { 'Idempotency-Key': clave });
      setImporte('');
      setComprobante('');
      setCuotaId('');
      setClave(nuevoUuid());
      setAviso({ tipo: 'ok', texto: `Pago de ${formatearSoles(importeCentimos)} registrado.` });
      await recargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  }

  async function reversar(pagoId: string) {
    const motivo = window.prompt('Motivo de la reversa (obligatorio):');
    if (!motivo || motivo.trim() === '') return;
    try {
      await api.solicitar('POST', `/v1/pagos/${pagoId}/reversa`, { motivo });
      setAviso({ tipo: 'ok', texto: 'Pago revertido.' });
      await recargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  }

  if (prohibido) return <SinPermiso />;
  const pendientes = datos?.cuotas.filter((c) => c.pendienteCentimos > 0) ?? [];
  return (
    <section aria-labelledby="titulo-cuenta">
      <button type="button" onClick={volver}>
        ← Volver al padrón
      </button>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {cargando && !datos && <p className="suave">Cargando…</p>}
      {datos && (
        <>
          <h1 id="titulo-cuenta">{datos.asociado.nombre}</h1>
          <p className="suave">
            Documento {datos.asociado.documento} · {datos.asociado.estado === 'activo' ? 'Activo' : 'De baja'}
          </p>
          <p className="saldo" data-testid="saldo-asociado">
            Saldo: <strong>{formatearSoles(datos.saldoCentimos)}</strong>
          </p>

          {datos.asociado.estado === 'activo' && (
            <form className="tarjeta en-linea" onSubmit={registrarPago} aria-label="Registrar pago">
              <h2>Registrar pago</h2>
              <label>
                Cuota
                <select name="cuota" value={cuotaId} onChange={(e) => cambiar(setCuotaId)(e.target.value)}>
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
                <input name="importe-pago" inputMode="decimal" required placeholder="5.00" value={importe} onChange={(e) => cambiar(setImporte)(e.target.value)} />
              </label>
              <label>
                Comprobante
                <input name="comprobante" required maxLength={60} value={comprobante} onChange={(e) => cambiar(setComprobante)(e.target.value)} />
              </label>
              <button type="submit" className="primario">
                Registrar pago
              </button>
            </form>
          )}
          {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

          <h2>Cuotas</h2>
          <div className="tabla-envoltorio">
            <table data-testid="tabla-cuotas">
              <thead>
                <tr>
                  <th scope="col">Periodo</th>
                  <th scope="col" className="num">Importe</th>
                  <th scope="col" className="num">Pagado</th>
                  <th scope="col" className="num">Pendiente</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.cuotas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.periodo}</td>
                    <td className="num">{formatearSoles(c.importeCentimos)}</td>
                    <td className="num">{formatearSoles(c.pagadoCentimos)}</td>
                    <td className="num">{formatearSoles(c.pendienteCentimos)}</td>
                    <td>{c.estado === 'pagada' ? 'Pagada' : c.estado === 'parcial' ? 'Pago parcial' : 'Pendiente'}</td>
                  </tr>
                ))}
                {datos.cuotas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="suave">Sin cuotas todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2>Pagos</h2>
          <div className="tabla-envoltorio">
            <table data-testid="tabla-pagos">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Periodo</th>
                  <th scope="col">Comprobante</th>
                  <th scope="col" className="num">Importe</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.pagos.map((p) => (
                  <tr key={p.id} data-testid={`pago-${p.comprobante}`}>
                    <td>{new Date(p.pagadoEn).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{p.periodo}</td>
                    <td>{p.comprobante}</td>
                    <td className="num">{formatearSoles(p.importeCentimos)}</td>
                    <td>{p.estado === 'vigente' ? 'Vigente' : 'Revertido'}</td>
                    <td>
                      {p.estado === 'vigente' && (
                        <button type="button" onClick={() => void reversar(p.id)}>
                          Reversar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {datos.pagos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="suave">Sin pagos registrados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
