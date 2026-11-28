/**
 * «El agua» (maqueta v3): reservorios con foto, gráfico de cloro residual y lecturas.
 * El Consejo crea reservorios; Operación anota lecturas; Tesorería consulta. SIJASS registra la
 * lectura tomada en campo: no dictamina la calidad del agua ni indica dosis.
 */
import { useCallback, useState } from 'react';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { ahoraEnLima, parsearValor, tomadaEnLima } from '../lib/medicion';
import { nuevoUuid } from '../lib/uuid';
import { Bt, Cajon, Campo, Cargando, Credito, Elegibles, FalloCarga, fondo, fotoReservorio, Ic, Olas, useAvisar } from '../v3/base';
import { cuando, useServicio, valorCloro, type Medicion, type ReservorioConLecturas } from '../v3/datos';
import { SinPermiso } from '../ui';
import { TituloVista } from './NavegacionPersonal';
import type { Foto } from '../lib/fotos';

/** Tarjeta con foto de un reservorio y su última lectura. */
export function TarjetaRes({ r, foto, metodos, sel, onClick }: { r: ReservorioConLecturas; foto: Foto; metodos: Record<string, string>; sel?: boolean; onClick: () => void }) {
  const u = r.ultima;
  return (
    <button type="button" className={`res-c ${sel ? 'sel' : ''}`} aria-pressed={sel === undefined ? undefined : sel} onClick={onClick}>
      <div className="img" style={fondo(foto)} />
      <div className="v" />
      <Credito foto={foto} />
      <div className="c">
        <h3>{r.nombre}</h3>
        {u ? <><div className="valor">{valorCloro(u.valor)}<em>{u.unidad} de cloro</em></div><p>{cuando(u.tomadaEn)} · {metodos[u.metodo] ?? u.metodo}</p></>
          : <p>{r.fallo ? 'No pudimos leer sus lecturas' : 'Sin lecturas todavía'}</p>}
      </div>
      <Olas />
    </button>
  );
}

/** Gráfico de gotas: las últimas 8 lecturas vigentes (dato tal cual, sin calificarlo). */
function Grafico({ lecturas }: { lecturas: Medicion[] }) {
  const datos = lecturas.slice(-8);
  const W = 864, H = 240, izq = 54, base = 200, alto = 168;
  const tope = Math.max(1.2, Math.ceil((Math.max(...datos.map((d) => d.valor)) * 1.2) / 0.4) * 0.4);
  const x = (i: number) => (datos.length === 1 ? W / 2 : izq + 46 + (i * (W - izq - 100)) / (datos.length - 1));
  const y = (v: number) => base - (v / tope) * alto;
  const trazo = datos.map((d, i) => `${i ? 'L' : 'M'}${x(i)} ${y(d.valor)}`).join('');
  return (
    <svg viewBox="0 0 864 240" role="img" aria-label={`Últimas ${datos.length} lecturas de cloro residual: ${datos.map((d) => valorCloro(d.valor)).join(', ')} ${datos[0]?.unidad ?? 'mg/L'}`}>
      <defs><linearGradient id="relleno-agua" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#43E0C2" stopOpacity=".42" /><stop offset="1" stopColor="#43E0C2" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map((k) => {
        const v = (tope * k) / 3;
        return <g key={k}><line className="eje" x1={izq} x2={W} y1={y(v)} y2={y(v)} /><text className="txt-eje" x={izq - 12} y={y(v) + 4} textAnchor="end">{v.toFixed(1)}</text></g>;
      })}
      {datos.length > 1 && <><path className="area" d={`${trazo}L${x(datos.length - 1)} ${base}L${x(0)} ${base}Z`} /><path className="linea-g" d={trazo} pathLength={1} /></>}
      {datos.map((d, i) => (
        <g key={d.id}>
          <g transform={`translate(${x(i)} ${y(d.valor)})`}>
            <g className="punto" style={{ animationDelay: `${80 + i * 70}ms` }}><path d="M0-11C0-11-8-2-8 3a8 8 0 0 0 16 0C8-2 0-11 0-11z" /><text className="val" y="-19" textAnchor="middle">{valorCloro(d.valor)}</text></g>
          </g>
          <text className="txt-eje" x={x(i)} y={H - 18} textAnchor="middle">{cuando(d.tomadaEn, true)}</text>
          <text className="txt-eje" x={x(i)} y={H - 2} textAnchor="middle">{cuando(d.tomadaEn).split(', ')[1]}</text>
        </g>
      ))}
    </svg>
  );
}

function Detalle({ r, foto, metodos, rol, anotar }: { r: ReservorioConLecturas; foto: Foto; metodos: Record<string, string>; rol: string; anotar: () => void }) {
  const u = r.ultima;
  return (
    <>
      <div className="agua-foto">
        <div className="img" style={fondo(foto)} role="img" aria-label={foto.descripcion} />
        <div className="v" />
        <div className="t"><span className="sobre">Reservorio</span><h3>{r.nombre}</h3><p>{r.vigentes.length ? `${r.vigentes.length} ${r.vigentes.length === 1 ? 'lectura' : 'lecturas'} · la última ${cuando(u!.tomadaEn)}` : 'Aún no tiene lecturas'}</p></div>
        {rol === 'operador' && <Bt clase="agua" ic="mas" onClick={anotar}>Registrar lectura</Bt>}
        <Credito foto={foto} />
        <Olas />
      </div>
      {r.fallo ? (
        <section className="tarj vacio" role="alert">
          <span className="gota"><Ic n="gota" className="grande" /></span>
          <b>{r.fallo === 'prohibido' ? 'Su rol no tiene acceso a este historial.' : 'No pudimos leer sus lecturas.'}</b>
          <p>{r.fallo === 'prohibido' ? 'Consulta con el Consejo de tu JASS.' : 'Revisa tu conexión e inténtalo de nuevo.'}</p>
        </section>
      ) : r.mediciones.length ? (
        <>
          {r.vigentes.length > 0 && (
            <section className="tarj grafico">
              <h3>Cloro residual <small data-testid="aviso-no-dictamen">{r.vigentes[0].unidad} · SIJASS registra la lectura; no califica el agua</small></h3>
              <Grafico lecturas={r.vigentes} />
            </section>
          )}
          <section className="tarj lecturas" data-testid="tabla-mediciones" aria-label={`Lecturas de ${r.nombre}`}>
            {[...r.mediciones].reverse().map((m) => (
              <div className="fam" key={m.id}>
                <span className="gota-i"><Ic n="gota" /></span>
                <div><b>{valorCloro(m.valor)} {m.unidad}</b><small>{cuando(m.tomadaEn)} · {metodos[m.metodo] ?? m.metodo}</small></div>
                <span className={`chip ${m.estado === 'vigente' ? 'ok' : 'gris'}`}>{m.estado === 'vigente' ? 'Vigente' : 'Anulada'}</span>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="tarj vacio">
          <span className="gota"><Ic n="gota" className="grande" /></span>
          <b>Sin lecturas todavía</b>
          <p>{rol === 'operador' ? 'Anota la primera con «Registrar lectura».' : 'Cuando Operación anote la primera, aparecerá aquí.'}</p>
          <p className="nota" data-testid="aviso-no-dictamen">SIJASS registra la lectura tomada en campo; no dictamina la calidad del agua ni indica dosis.</p>
        </section>
      )}
    </>
  );
}

export function Agua({ rol }: { rol: string }) {
  const servicio = useServicio();
  const avisar = useAvisar();
  const [elegido, setElegido] = useState<string | null>(null);
  const [pedido, setPedido] = useState<{ tipo: 'lectura'; id: string | null } | { tipo: 'reservorio' } | null>(null);
  const lista = servicio.datos?.reservorios ?? [];
  const posicion = Math.max(0, lista.findIndex((r) => r.id === elegido));
  const actual = lista[posicion] ?? null;
  const nota = { consejo: 'El Consejo crea reservorios y ve el historial', tesorero: 'Tesorería ve el historial', operador: 'Operación anota las lecturas a mano' }[rol] ?? '';

  if (servicio.prohibido) return <SinPermiso />;
  return (
    <>
      <TituloVista titulo="El agua" sub={nota} acciones={rol === 'consejo' ? <Bt clase="teal" ic="mas" onClick={() => setPedido({ tipo: 'reservorio' })}>Nuevo reservorio</Bt> : undefined} />
      {servicio.error && !servicio.datos && <FalloCarga texto={servicio.error} recargar={() => void servicio.recargar()} />}
      {!servicio.datos && !servicio.error && <Cargando />}
      {servicio.datos && lista.length === 0 && (
        <section className="tarj vacio" data-testid="sin-reservorios">
          <span className="gota"><Ic n="gota" className="grande" /></span>
          <b>Aún no hay reservorios</b>
          <p>{rol === 'consejo' ? 'Crea el primero con «Nuevo reservorio».' : 'Pide al Consejo que los registre.'}</p>
        </section>
      )}
      {actual && (
        <div className="agua-grid">
          <div className="lista-res" role="group" aria-label="Reservorios">
            {lista.map((r, i) => <TarjetaRes key={r.id} r={r} foto={fotoReservorio(i)} metodos={servicio.datos!.metodos} sel={r.id === actual.id} onClick={() => setElegido(r.id)} />)}
          </div>
          <div className="detalle" key={actual.id}>
            <Detalle r={actual} foto={fotoReservorio(posicion)} metodos={servicio.datos!.metodos} rol={rol} anotar={() => setPedido({ tipo: 'lectura', id: actual.id })} />
          </div>
        </div>
      )}
      {pedido?.tipo === 'lectura' && (
        <CajonLectura reservorios={lista} inicial={pedido.id} cerrar={() => setPedido(null)}
          alGuardar={(id) => { setPedido(null); setElegido(id); avisar('Lectura guardada'); void servicio.recargar(); }} />
      )}
      {pedido?.tipo === 'reservorio' && (
        <CajonReservorio cerrar={() => setPedido(null)} alCrear={(nombre) => { setPedido(null); avisar(`${nombre} quedó creado`); void servicio.recargar(); }} />
      )}
    </>
  );
}

interface Catalogo { metodos: Array<{ codigo: string; descripcion: string }>; unidad: string }

/** Nueva lectura (solo Operación): reservorio, método, valor y hora de la toma. */
export function CajonLectura({ reservorios, inicial, cerrar, alGuardar }: { reservorios: Array<{ id: string; nombre: string }>; inicial: string | null; cerrar: () => void; alGuardar: (id: string) => void }) {
  const { api } = useApp();
  const pedirCatalogo = useCallback(() => api.solicitar<Catalogo>('GET', '/v1/mediciones/catalogo'), [api]);
  const catalogo = useCarga(pedirCatalogo);
  const [reservorio, setReservorio] = useState(inicial ?? reservorios[0]?.id ?? '');
  const [metodo, setMetodo] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [toma, setToma] = useState(() => ahoraEnLima(new Date()));
  const [clave, setClave] = useState(nuevoUuid);
  const [errores, setErrores] = useState<{ metodo?: string; valor?: string; toma?: string; general?: string }>({});
  const { enviando, ejecutar } = useEnvio();
  const metodos = catalogo.datos?.metodos ?? [];
  const metodoElegido = metodo ?? metodos[0]?.codigo ?? null;
  const cambiar = <T,>(poner: (v: T) => void) => (v: T) => { poner(v); setClave(nuevoUuid()); setErrores({}); };

  async function guardar() {
    const numero = parsearValor(valor);
    const tomadaEn = tomadaEnLima(toma);
    if (!metodoElegido) return setErrores({ metodo: 'Elige el método de medición.' });
    if (numero === null) return setErrores({ valor: 'Escribe un número de 0 en adelante, por ejemplo 0.7.' });
    if (tomadaEn === null) return setErrores({ toma: 'Indica la fecha y la hora de la toma.' });
    await ejecutar(async () => {
      setErrores({});
      try {
        await api.solicitar('POST', '/v1/mediciones', { reservorioId: reservorio, metodo: metodoElegido, valor: numero, unidad: catalogo.datos?.unidad ?? 'mg/L', tomadaEn }, { 'Idempotency-Key': clave });
        alGuardar(reservorio);
      } catch (err) {
        setErrores({ general: mensajeDeError(err) });
      }
    });
  }

  return (
    <Cajon sobre="Operación" titulo="Nueva lectura" texto="Anota lo que marcó tu equipo de medición." etiqueta="Registrar medición" cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void guardar()}
      pie={<><Bt clase="borde" disabled={enviando} onClick={cerrar}>Cancelar</Bt><Bt type="submit" clase="teal" disabled={enviando || !catalogo.datos}>{enviando ? 'Guardando…' : 'Guardar lectura'}</Bt></>}>
      <Elegibles id="l-res" etiqueta="Reservorio" clase="segmentos tres" valor={reservorio} deshabilitado={enviando} elegir={cambiar(setReservorio)}
        opciones={reservorios.map((r) => ({ valor: r.id, contenido: r.nombre }))} />
      {catalogo.error && <p className="error-cajon" role="alert">{catalogo.error}</p>}
      {!catalogo.datos && !catalogo.error ? <Cargando texto="Leyendo los métodos…" /> : (
        <Elegibles id="l-metodo" etiqueta="Método" clase="segmentos" valor={metodoElegido} deshabilitado={enviando} elegir={cambiar((v: string) => setMetodo(v))}
          opciones={metodos.map((m) => ({ valor: m.codigo, contenido: m.descripcion }))} />
      )}
      {errores.metodo && <p className="error" role="alert">{errores.metodo}</p>}
      <Campo id="l-valor" etiqueta={`Cloro residual (${catalogo.datos?.unidad ?? 'mg/L'})`} icono="flask" inputMode="decimal" placeholder="Ejemplo: 0.7" value={valor} disabled={enviando}
        error={errores.valor} sufijo={<b>{catalogo.datos?.unidad ?? 'mg/L'}</b>} onChange={(e) => cambiar(setValor)(e.target.value)} />
      <Campo id="l-toma" etiqueta="Fecha y hora de la toma (hora de Lima)" type="datetime-local" value={toma} disabled={enviando} error={errores.toma} onChange={(e) => cambiar(setToma)(e.target.value)} />
      <p className="nota">SIJASS guarda lo que escribes; no mide ni califica el agua.</p>
      {errores.general && <p className="error-cajon" role="alert" data-testid="aviso-error">{errores.general}</p>}
    </Cajon>
  );
}

/** Nuevo reservorio (solo el Consejo): solo necesita un nombre. */
function CajonReservorio({ cerrar, alCrear }: { cerrar: () => void; alCrear: (nombre: string) => void }) {
  const { api } = useApp();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();
  async function crear() {
    if (!nombre.trim()) return setError('Escribe un nombre.');
    await ejecutar(async () => {
      setError(null);
      try {
        await api.solicitar('POST', '/v1/reservorios', { nombre: nombre.trim() });
        alCrear(nombre.trim());
      } catch (err) {
        setError(mensajeDeError(err));
      }
    });
  }
  return (
    <Cajon sobre="Consejo" titulo="Nuevo reservorio" texto="Solo necesita un nombre." etiqueta="Crear reservorio" cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void crear()}
      pie={<><Bt clase="borde" disabled={enviando} onClick={cerrar}>Cancelar</Bt><Bt type="submit" clase="teal" disabled={enviando}>{enviando ? 'Creando…' : 'Crear reservorio'}</Bt></>}>
      <Campo id="r-nombre" name="nombre-reservorio" etiqueta="Nombre del reservorio" maxLength={80} placeholder="Ejemplo: Reservorio Bajo" value={nombre} disabled={enviando} error={error} onChange={(e) => { setNombre(e.target.value); setError(null); }} />
    </Cajon>
  );
}
