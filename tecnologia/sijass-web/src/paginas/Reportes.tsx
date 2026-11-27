import { useCallback, useEffect, useState } from 'react';
import { ErrorApi } from '../api/cliente';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import {
  ALCANCES, CATEGORIAS, ESTADO_PERSONAL, fechaHora, textoEvento,
  type EstadoIncidencia, type EventoIncidencia, type Incidencia, type Prioridad,
} from '../lib/incidencias';
import { SinPermiso } from '../ui';
import { Av, avatarDePersonal, ordenEnRol, Bt, Cargando, Elegibles, FalloCarga, Ic, IconoCat, Olas, useAvisar } from '../v3/base';
import { cuando } from '../v3/datos';
import { TituloVista } from './NavegacionPersonal';

type Filtro = 'todos' | EstadoIncidencia;
const FILTROS: Array<[Filtro, string]> = [['todos', 'Todos'], ['registrada', 'Nuevos'], ['en-atencion', 'En atención'], ['cerrada', 'Cerrados']];
const PRIORIDADES: Prioridad[] = ['baja', 'media', 'alta'];
const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' };
/** Otra pantalla (el resumen) puede pedir que se abra un reporte concreto. */
export const CLAVE_REPORTE = 'sijass.reporte-elegido';

interface MiembroEquipo { usuarioId: string; nombre: string; rol: string; estado: 'activo' | 'inactivo' }

export const ChipEstado = ({ i }: { i: Incidencia }) => <span className={`chip e-${i.estado}`}>{ESTADO_PERSONAL[i.estado]}</span>;
export const ChipPrioridad = ({ i }: { i: Incidencia }) => (i.prioridadConfirmada
  ? <span className={`chip p-${i.prioridadConfirmada}`}>Prioridad {i.prioridadConfirmada}</span>
  : i.sugerencia ? <span className="chip p-sug">Sugerida: {i.sugerencia.prioridad}</span> : null);

/** Un reporte en la bandeja (o en el resumen). */
export function FilaInc({ i, sel, onClick }: { i: Incidencia; sel?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`item-inc ${sel ? 'sel' : ''} ${i.estado === 'registrada' ? 'nuevo' : ''}`} aria-pressed={sel} onClick={onClick} data-testid={`reporte-${i.id}`}>
      <Av id={i.reportadoPor?.asociadoId ?? i.id} tam="m" />
      <IconoCat categoria={i.categoria} />
      <span className="d"><b>{CATEGORIAS[i.categoria].texto}</b><small>{i.reportadoPor?.nombre ?? 'Asociado'} · {i.ubicacion}</small><small className="h">{cuando(i.creadaEn)}</small></span>
      <span className="chips"><ChipEstado i={i} /><ChipPrioridad i={i} /></span>
    </button>
  );
}

/** Bandeja de reportes de las familias y ficha para atenderlos (maqueta v3). */
export function Reportes({ rol }: { rol: string }) {
  const { api } = useApp();
  const gestiona = rol === 'consejo' || rol === 'operador';
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [elegida, setElegida] = useState<string | null>(() => {
    try {
      const id = sessionStorage.getItem(CLAVE_REPORTE);
      sessionStorage.removeItem(CLAVE_REPORTE);
      return id;
    } catch { return null; }
  });
  const cargar = useCallback(() => api.solicitar<{ incidencias: Incidencia[] }>('GET', '/v1/incidencias?limite=100'), [api]);
  const { datos, error, prohibido, recargar } = useCarga(cargar);
  const todas = datos?.incidencias ?? [];
  const lista = todas.filter((i) => filtro === 'todos' || i.estado === filtro);
  const actual = lista.find((i) => i.id === elegida) ?? lista[0] ?? null;

  if (prohibido) return <SinPermiso />;
  return (
    <>
      <TituloVista titulo="Reportes de las familias" sub={gestiona ? 'Atiende y deja constancia de cada paso' : 'Solo lectura'} />
      <div className="filtros">
        <div className="chips-f" role="group" aria-label="Filtrar por estado">
          {FILTROS.map(([v, t]) => (
            <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}<em>{todas.filter((i) => v === 'todos' || i.estado === v).length}</em></button>
          ))}
        </div>
      </div>
      {error && !datos && <FalloCarga texto={error} recargar={() => void recargar()} />}
      {!datos && !error ? <Cargando /> : datos && (
        <div className="inc-grid">
          <div className="bandeja" role="list" aria-label="Reportes">
            {lista.map((i) => <div role="listitem" key={i.id}><FilaInc i={i} sel={actual?.id === i.id} onClick={() => setElegida(i.id)} /></div>)}
          </div>
          <div className="ficha">
            {actual ? <Ficha key={actual.id} incidencia={actual} gestiona={gestiona} esConsejo={rol === 'consejo'} alCambiar={() => void recargar()} /> : (
              <div className="tarj vacio" role="status"><span className="gota"><Ic n="megafono" className="grande" /></span><b>No hay reportes aquí</b><p>Cuando una familia envíe uno, aparecerá en esta lista.</p></div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Ficha({ incidencia, gestiona, esConsejo, alCambiar }: { incidencia: Incidencia; gestiona: boolean; esConsejo: boolean; alCambiar: () => void }) {
  const { api } = useApp();
  const avisar = useAvisar();
  const [inc, setInc] = useState(incidencia);
  const [texto, setTexto] = useState('');
  const [publica, setPublica] = useState<'publica' | 'interna'>('publica');
  const [motivoPrio, setMotivoPrio] = useState<{ prioridad: Prioridad; motivo: string } | null>(null);
  const [falta, setFalta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();
  const cat = CATEGORIAS[inc.categoria];
  const sug = inc.sugerencia?.prioridad;

  const pedirHistorial = useCallback(() => api.solicitar<{ eventos: EventoIncidencia[] }>('GET', `/v1/incidencias/${incidencia.id}/historial?limite=100`), [api, incidencia.id]);
  const { datos: datosHistorial, recargar: cargarHistorial } = useCarga(pedirHistorial);
  const historial = datosHistorial?.eventos ?? null;
  useEffect(() => {
    if (!incidencia.tieneFoto) return;
    let url: string | null = null;
    let vigente = true;
    // La foto va con el token: se pide por la API y se muestra como objeto local.
    api.solicitarArchivo(`/v1/incidencias/${incidencia.id}/foto`).then((b) => {
      if (!vigente || !b) return;
      url = URL.createObjectURL(b);
      setFoto(url);
    }, () => undefined);
    return () => { vigente = false; if (url) URL.revokeObjectURL(url); };
  }, [api, incidencia.id, incidencia.tieneFoto]);

  /** Envía un cambio con la revisión mostrada; ante 409 recarga y lo explica, sin borrar lo escrito. */
  async function cambiar(ruta: string, cuerpo: Record<string, unknown>, exito: string, limpiar = false) {
    await ejecutar(async () => {
      setError(null);
      try {
        const nueva = await api.solicitar<Incidencia>('POST', `/v1/incidencias/${inc.id}/${ruta}`, { revision: inc.revision, ...cuerpo });
        setInc((a) => ({ ...a, ...nueva }));
        if (limpiar) setTexto('');
        avisar(exito);
        await cargarHistorial();
        alCambiar();
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'revision-desactualizada') {
          setError('Otra persona cambió este reporte. Ya se actualizó: revisa y vuelve a intentarlo.');
          try {
            setInc(await api.solicitar<Incidencia>('GET', `/v1/incidencias/${inc.id}`));
            await cargarHistorial();
          } catch { /* se mantiene lo mostrado */ }
          alCambiar();
        } else setError(mensajeDeError(err));
      }
    });
  }

  function elegirPrioridad(p: Prioridad) {
    if (p === sug) {
      setMotivoPrio(null);
      void cambiar('prioridad', { prioridad: p }, `Prioridad ${p} confirmada`);
    } else setMotivoPrio({ prioridad: p, motivo: '' });
  }

  function accion(cerrar: boolean) {
    if (!texto.trim()) return setFalta(cerrar ? 'Para cerrar, escribe qué se hizo' : 'Escribe qué se hizo');
    if (cerrar) void cambiar('estado', { estado: 'cerrada', detalle: texto.trim() }, 'Reporte cerrado: la familia ya lo ve como atendido', true);
    else void cambiar('acciones', { descripcion: texto.trim(), visibilidad: publica }, 'Acción anotada', true);
  }

  return (
    <article className="ficha-c" aria-labelledby="titulo-ficha" data-testid="ficha-reporte">
      <header style={{ ['--c' as string]: cat.color }}>
        <IconoCat categoria={inc.categoria} tam="xl" />
        <div>
          <span className="sobre">Reporte · {ESTADO_PERSONAL[inc.estado]}</span>
          <h2 id="titulo-ficha">{cat.texto}</h2>
          <p>{inc.ubicacion} · observado {cuando(inc.observadaEn)}</p>
        </div>
        <Olas />
      </header>
      <div className="cuerpo-f">
        <div className="reporta">
          <Av id={inc.reportadoPor?.asociadoId ?? inc.id} tam="l" />
          <div>
            <b>{inc.reportadoPor?.nombre ?? 'Asociado'}</b>
            <small>Alcance declarado (no verificado): <strong>{ALCANCES[inc.alcanceReportado]}</strong></small>
            <p>«{inc.descripcion}»</p>
            {foto && <img src={foto} alt="Foto enviada por la familia" className="foto-reporte" />}
            {inc.tieneFoto && !foto && <small><Ic n="camara" /> Tiene foto adjunta</small>}
          </div>
        </div>

        {error && <p className="error-cajon" role="alert" data-testid="aviso-error" style={{ marginTop: 12 }}>{error}</p>}

        <div className="rejilla-f">
          <div className="bloque">
            <span className="etq">Prioridad {sug && <small>sugerida: {sug} (por tipo y alcance)</small>}</span>
            {gestiona && inc.estado !== 'cerrada' ? (
              <div className="prio" role="group" aria-label="Prioridad">
                {PRIORIDADES.map((p) => (
                  <button key={p} type="button" className={`p-${p}`} aria-pressed={(motivoPrio?.prioridad ?? inc.prioridadConfirmada) === p} disabled={enviando} onClick={() => elegirPrioridad(p)}>
                    {NOMBRE_PRIORIDAD[p]}{p === sug && <em>sugerida</em>}
                  </button>
                ))}
              </div>
            ) : (inc.prioridadConfirmada || sug ? <ChipPrioridad i={inc} /> : <small className="nota">Sin confirmar</small>)}
            {motivoPrio && (
              <form className="motivo-p" onSubmit={(e) => {
                e.preventDefault();
                if (!motivoPrio.motivo.trim()) return setFalta('motivo');
                void cambiar('prioridad', { prioridad: motivoPrio.prioridad, motivo: motivoPrio.motivo.trim() }, 'Prioridad guardada con su motivo').then(() => setMotivoPrio(null));
              }}>
                <div className={`campo ${falta === 'motivo' ? 'mal' : ''}`}>
                  <input id="motivo-prioridad" maxLength={300} value={motivoPrio.motivo} aria-label={`¿Por qué prioridad ${motivoPrio.prioridad}?`}
                    placeholder={falta === 'motivo' ? 'Escribe el motivo para cambiarla' : `¿Por qué prioridad ${motivoPrio.prioridad}?`}
                    onChange={(e) => { setFalta(null); setMotivoPrio({ ...motivoPrio, motivo: e.target.value }); }} />
                  <Bt type="submit" clase="teal" disabled={enviando}>Guardar</Bt>
                </div>
              </form>
            )}
          </div>
          <div className="bloque">
            <span className="etq">Responsable</span>
            {esConsejo && inc.estado !== 'cerrada'
              ? <Responsables actual={inc.responsableId ?? null} deshabilitado={enviando} elegir={(id) => void cambiar('responsable', { responsableId: id }, id ? 'Responsable asignado' : 'Responsable quitado')} />
              : <small className="nota">{inc.responsableId ? 'Asignado' : 'Sin asignar'}</small>}
          </div>

          {!gestiona ? (
            <p className="solo-lectura"><Ic n="ojo" />Tesorería solo puede consultar los reportes.</p>
          ) : inc.estado === 'cerrada' ? (
            <div className="bloque ancho">
              <label htmlFor="texto-reporte">Motivo para reabrir</label>
              <div className={`campo alto ${falta ? 'mal' : ''}`}><textarea id="texto-reporte" maxLength={2000} value={texto} placeholder={falta ?? 'Ejemplo: volvió a ocurrir'} onChange={(e) => { setTexto(e.target.value); setFalta(null); }} /></div>
              <Bt clase="borde" ic="revertir" disabled={enviando} onClick={() => {
                if (!texto.trim()) return setFalta('Escribe el motivo para reabrir');
                void cambiar('estado', { estado: 'en-atencion', detalle: texto.trim() }, 'Reporte reabierto', true);
              }}>Reabrir reporte</Bt>
            </div>
          ) : (
            <div className="bloque ancho">
              <label htmlFor="texto-reporte">¿Qué se hizo?</label>
              <div className={`campo alto ${falta && falta !== 'motivo' ? 'mal' : ''}`}><textarea id="texto-reporte" maxLength={2000} value={texto} placeholder={falta && falta !== 'motivo' ? falta : 'Ejemplo: se cambió la unión de la tubería'} onChange={(e) => { setTexto(e.target.value); setFalta(null); }} /></div>
              {falta && falta !== 'motivo' && <p className="error" role="alert">{falta}.</p>}
              <div className="linea-a">
                <Elegibles id="i-vis" etiqueta="" clase="segmentos" valor={publica} elegir={setPublica} deshabilitado={enviando}
                  opciones={[{ valor: 'publica', contenido: 'La familia lo ve' }, { valor: 'interna', contenido: 'Solo el personal' }]} />
                <Bt clase="borde" ic="mas" disabled={enviando} onClick={() => accion(false)}>Anotar</Bt>
                {inc.estado === 'registrada'
                  ? <Bt clase="teal" ic="empezar" disabled={enviando} onClick={() => void cambiar('estado', { estado: 'en-atencion' }, 'Reporte en atención: la familia ya lo ve')}>Empezar a atender</Bt>
                  : <Bt clase="teal" ic="check" disabled={enviando} onClick={() => accion(true)}>Cerrar reporte</Bt>}
              </div>
            </div>
          )}
        </div>

        <div className="bloque ancho">
          <span className="etq">Historial</span>
          {historial === null ? <Cargando /> : (
            <ol className="tiempo">
              {[...historial].reverse().map((e, n) => (
                <li key={`${e.creadoEn}-${n}`} className={e.publico === false ? 'interno' : ''}>
                  <b>{textoEvento(e, false)}</b>
                  <small>{fechaHora(e.creadoEn)}{e.publico === false ? ' · solo personal' : ''}</small>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </article>
  );
}

/** Equipo activo para elegir responsable (solo el Consejo puede leer el equipo). */
function Responsables({ actual, deshabilitado, elegir }: { actual: string | null; deshabilitado: boolean; elegir: (id: string | null) => void }) {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<{ equipo: MiembroEquipo[] }>('GET', '/v1/equipo'), [api]);
  const { datos } = useCarga(cargar);
  const orden = ordenEnRol(datos?.equipo ?? []);
  const activos = (datos?.equipo ?? []).filter((m) => m.estado === 'activo');
  if (!datos) return <small className="nota">Cargando equipo…</small>;
  return (
    <div className="resp" role="group" aria-label="Responsable">
      {activos.map((m) => (
        <button key={m.usuarioId} type="button" aria-pressed={actual === m.usuarioId} disabled={deshabilitado} onClick={() => elegir(actual === m.usuarioId ? null : m.usuarioId)} aria-label={`${m.nombre}${actual === m.usuarioId ? ' (quitar)' : ''}`}>
          <Av indice={avatarDePersonal(m.rol, orden[m.usuarioId])} tam="s" /><small>{m.nombre.split(' ')[0]}</small>
        </button>
      ))}
    </div>
  );
}
