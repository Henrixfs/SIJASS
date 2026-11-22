import { useCallback, useState, type FormEvent } from 'react';
import { useCarga } from '../hooks';
import { mensajeDeError, useApp } from '../contexto';
import { ahoraEnLima, formatearInstante, parsearValor, tomadaEnLima } from '../lib/medicion';
import { nuevoUuid } from '../lib/uuid';

interface Reservorio {
  id: string;
  nombre: string;
}
interface Catalogo {
  metodos: Array<{ codigo: string; descripcion: string }>;
  unidad: string;
}
interface Medicion {
  id: string;
  metodo: string;
  valor: number;
  unidad: string;
  tomadaEn: string;
  registradaEn: string;
  estado: string;
}

type Aviso = { tipo: 'ok' | 'error'; texto: string };

function Mensaje({ aviso }: { aviso: Aviso }) {
  return (
    <p role={aviso.tipo === 'error' ? 'alert' : 'status'} className={aviso.tipo === 'error' ? 'error' : 'exito'} data-testid={aviso.tipo === 'error' ? 'aviso-error' : 'aviso-ok'}>
      {aviso.texto}
    </p>
  );
}

/**
 * Mediciones manuales de cloro residual (s1c). El operador registra; operador, tesorero y consejo
 * consultan el historial; el consejo además da de alta reservorios. Los permisos reales los
 * aplica el servidor: aquí solo se ocultan los controles que la persona no puede usar.
 */
export function Mediciones() {
  const { api, sesion } = useApp();
  const rol = sesion?.rol;
  const cargarReservorios = useCallback(() => api.solicitar<{ reservorios: Reservorio[] }>('GET', '/v1/reservorios'), [api]);
  const cargarCatalogo = useCallback(() => api.solicitar<Catalogo>('GET', '/v1/mediciones/catalogo'), [api]);
  const reservorios = useCarga(cargarReservorios);
  const catalogo = useCarga(cargarCatalogo);
  const [elegido, setElegido] = useState('');

  const lista = reservorios.datos?.reservorios ?? [];
  // Si el elegido ya no está en la lista (cambió la JASS o se recargó), no se muestra.
  const elegidoVigente = lista.some((r) => r.id === elegido) ? elegido : '';

  return (
    <section aria-labelledby="titulo-mediciones">
      <h1 id="titulo-mediciones">Mediciones de cloro residual</h1>
      <p className="aviso" data-testid="aviso-no-dictamen">
        SIJASS registra la lectura tomada en campo; no dictamina la calidad del agua ni indica dosis. Ante una duda sanitaria, consulte al responsable técnico.
      </p>
      {reservorios.error && <Mensaje aviso={{ tipo: 'error', texto: reservorios.error }} />}

      {rol === 'consejo' && <NuevoReservorio alCrear={() => void reservorios.recargar()} />}

      <label className="selector">
        Reservorio
        <select name="reservorio" value={elegidoVigente} onChange={(e) => setElegido(e.target.value)} disabled={reservorios.cargando && !reservorios.datos}>
          <option value="">Elija un reservorio…</option>
          {lista.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </label>
      {reservorios.datos && lista.length === 0 && (
        <p className="suave" data-testid="sin-reservorios">
          {rol === 'consejo' ? 'Aún no hay reservorios: cree el primero arriba.' : 'Aún no hay reservorios. Pida al consejo que los registre.'}
        </p>
      )}

      {elegidoVigente !== '' && <Reservorio key={elegidoVigente} id={elegidoVigente} nombre={lista.find((r) => r.id === elegidoVigente)?.nombre ?? ''} catalogo={catalogo.datos} puedeRegistrar={rol === 'operador'} />}
    </section>
  );
}

function NuevoReservorio({ alCrear }: { alCrear: () => void }) {
  const { api } = useApp();
  const [nombre, setNombre] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    try {
      await api.solicitar('POST', '/v1/reservorios', { nombre });
      setNombre('');
      setAviso({ tipo: 'ok', texto: 'Reservorio creado.' });
      alCrear();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  }

  return (
    <>
      <form className="tarjeta en-linea" onSubmit={crear} aria-label="Crear reservorio">
        <label>
          Nuevo reservorio
          <input name="nombre-reservorio" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <button type="submit" className="primario">
          Crear reservorio
        </button>
      </form>
      {aviso && <Mensaje aviso={aviso} />}
    </>
  );
}

function Reservorio({ id, nombre, catalogo, puedeRegistrar }: { id: string; nombre: string; catalogo: Catalogo | null; puedeRegistrar: boolean }) {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<{ mediciones: Medicion[] }>('GET', `/v1/reservorios/${id}/mediciones`), [api, id]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);

  return (
    <>
      {puedeRegistrar && <FormularioLectura reservorioId={id} catalogo={catalogo} alRegistrar={() => void recargar()} />}
      <h2>Historial de {nombre}</h2>
      {prohibido && <p className="aviso">Su rol no tiene acceso a este historial.</p>}
      {error && <Mensaje aviso={{ tipo: 'error', texto: error }} />}
      {cargando && !datos && <p className="suave">Cargando…</p>}
      {datos && (
        <div className="tabla-envoltorio">
          <table data-testid="tabla-mediciones">
            <thead>
              <tr>
                <th scope="col">Toma</th>
                <th scope="col" className="num">Valor</th>
                <th scope="col">Método</th>
                <th scope="col">Registrada</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.mediciones.map((m) => (
                <tr key={m.id}>
                  <td>{formatearInstante(m.tomadaEn)}</td>
                  <td className="num">
                    {String(m.valor).replace('.', ',')} {m.unidad}
                  </td>
                  <td>{catalogo?.metodos.find((x) => x.codigo === m.metodo)?.descripcion ?? m.metodo}</td>
                  <td>{formatearInstante(m.registradaEn)}</td>
                  <td>{m.estado === 'vigente' ? 'Vigente' : 'Anulada'}</td>
                </tr>
              ))}
              {datos.mediciones.length === 0 && (
                <tr>
                  <td colSpan={5} className="suave">Este reservorio aún no tiene mediciones.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {datos && datos.mediciones.length >= 200 && <p className="suave">Se muestran las 200 mediciones más recientes.</p>}
    </>
  );
}

function FormularioLectura({ reservorioId, catalogo, alRegistrar }: { reservorioId: string; catalogo: Catalogo | null; alRegistrar: () => void }) {
  const { api } = useApp();
  const [metodo, setMetodo] = useState('');
  const [valor, setValor] = useState('');
  const [toma, setToma] = useState(() => ahoraEnLima(new Date()));
  const [clave, setClave] = useState(nuevoUuid);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Cada cambio de contenido es otra lectura (otra clave); un reintento del mismo envío conserva la suya.
  const cambiar = (poner: (v: string) => void) => (v: string) => {
    poner(v);
    setClave(nuevoUuid());
  };

  async function registrar(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    const numero = parsearValor(valor);
    const tomadaEn = tomadaEnLima(toma);
    if (!metodo) return setAviso({ tipo: 'error', texto: 'Elija el método de medición.' });
    if (numero === null) return setAviso({ tipo: 'error', texto: 'Escriba el valor en mg/L, por ejemplo 0.65.' });
    if (tomadaEn === null) return setAviso({ tipo: 'error', texto: 'Indique la fecha y hora de la toma.' });
    try {
      await api.solicitar('POST', '/v1/mediciones', { reservorioId, metodo, valor: numero, unidad: catalogo?.unidad ?? 'mg/L', tomadaEn }, { 'Idempotency-Key': clave });
      setValor('');
      setClave(nuevoUuid());
      setAviso({ tipo: 'ok', texto: `Lectura de ${String(numero).replace('.', ',')} mg/L registrada.` });
      alRegistrar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeDeError(err) });
    }
  }

  return (
    <>
      <form className="tarjeta en-linea" onSubmit={registrar} aria-label="Registrar medición">
        <h2>Registrar lectura</h2>
        <label>
          Método
          <select name="metodo" value={metodo} onChange={(e) => cambiar(setMetodo)(e.target.value)}>
            <option value="">Elija un método…</option>
            {catalogo?.metodos.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.descripcion}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cloro residual (mg/L)
          <input name="valor" inputMode="decimal" required placeholder="0.65" value={valor} onChange={(e) => cambiar(setValor)(e.target.value)} />
        </label>
        <label>
          Fecha y hora de la toma (hora de Lima)
          <input name="toma" type="datetime-local" required value={toma} onChange={(e) => cambiar(setToma)(e.target.value)} />
        </label>
        <button type="submit" className="primario">
          Registrar lectura
        </button>
      </form>
      {aviso && <Mensaje aviso={aviso} />}
    </>
  );
}
