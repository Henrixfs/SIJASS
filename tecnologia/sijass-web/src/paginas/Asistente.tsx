import { useCallback, useState, type FormEvent } from 'react';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { FOTOS } from '../lib/fotos';
import { SinPermiso } from '../ui';
import { Banda, Bt, Cargando, Ic } from '../v3/base';
import { TituloVista } from './NavegacionPersonal';

interface Cita {
  documentoId: string;
  documento: string;
  version: string;
  pagina: number;
  fragmento: string;
}
interface Respuesta {
  estado: 'respondida' | 'sin-evidencia' | 'fuera-de-alcance';
  corpus: 'ejemplo' | 'aprobado';
  mensaje: string;
  respuesta?: string;
  citas: Cita[];
}
interface Documentos {
  corpus: 'ejemplo' | 'aprobado';
  nombre: string;
  documentos: Array<{ id: string; titulo: string; version: string; estado: string; paginas: number }>;
}

const SUGERIDAS = ['¿Cómo se mide el cloro residual con un comparador DPD?', '¿Qué hago si hay una fuga de agua?'];

/**
 * Asistente documental (maqueta v3). Respuestas extractivas con documento, versión y página, o la
 * abstención. Todo se muestra como texto. No calcula dosis ni dictamina la calidad del agua.
 */
export function Asistente() {
  const { api } = useApp();
  const cargarDocumentos = useCallback(() => api.solicitar<Documentos>('GET', '/v1/asistente/documentos'), [api]);
  const documentos = useCarga(cargarDocumentos);
  const [pregunta, setPregunta] = useState('');
  const [preguntada, setPreguntada] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { enviando: consultando, ejecutar } = useEnvio();

  async function consultar(texto: string) {
    const q = texto.trim();
    if (!q) return setError('Escribe una pregunta para consultar.');
    await ejecutar(async () => {
      setError(null);
      setRespuesta(null);
      setPreguntada(q);
      try {
        setRespuesta(await api.solicitar<Respuesta>('POST', '/v1/asistente/consultas', { pregunta: q }));
      } catch (err) {
        setError(mensajeDeError(err));
      }
    });
  }

  if (documentos.prohibido) return <SinPermiso />;
  const esEjemplo = (documentos.datos?.corpus ?? respuesta?.corpus) === 'ejemplo';
  const docs = documentos.datos?.documentos ?? [];
  return (
    <>
      <TituloVista titulo="Asistente documental" sub="Responde con citas de los documentos, o dice que no sabe" />
      {esEjemplo && <p className="alerta" role="note" data-testid="aviso-corpus-ejemplo"><Ic n="shield" />Documentos de EJEMPLO, no aprobados: no los uses como procedimiento.</p>}
      <div className="asis">
        <div className="asis-i">
          <form className="campo grande-c" aria-label="Consultar al asistente" onSubmit={(e: FormEvent) => { e.preventDefault(); void consultar(pregunta); }}>
            <Ic n="lupa" />
            <input name="pregunta" maxLength={500} placeholder="Escribe tu pregunta" value={pregunta} disabled={consultando} aria-label="Su pregunta" onChange={(e) => setPregunta(e.target.value)} />
            <Bt type="submit" clase="teal" disabled={consultando}>{consultando ? 'Consultando…' : 'Preguntar'}</Bt>
          </form>
          <div className="sugeridas" role="group" aria-label="Preguntas sugeridas">
            {SUGERIDAS.map((q) => <button key={q} type="button" aria-pressed={preguntada === q} disabled={consultando} onClick={() => { setPregunta(q); void consultar(q); }}>{q}</button>)}
          </div>
          {error && <p className="error-cajon" role="alert" data-testid="aviso-error">{error}</p>}
          <div className="tarj respuesta" aria-live="polite">
            {consultando && <Cargando texto="Buscando en los documentos…" />}
            {!consultando && !respuesta && (
              <div className="vacio-r"><Ic n="libro" className="grande" /><b>Pregunta lo que necesites</b><p>Respondo solo con lo que dicen los documentos y cito documento, versión y página. No calculo dosis ni califico el agua.</p></div>
            )}
            {respuesta && (
              <div data-testid="respuesta" data-estado={respuesta.estado}>
                {respuesta.estado === 'respondida' ? (
                  <>
                    <span className="sobre-r">Respuesta con citas</span>
                    <p className="mensaje-asis" data-testid="mensaje-asistente">{respuesta.mensaje}</p>
                    <ol data-testid="citas" className="citas-v3">
                      {respuesta.citas.map((c, n) => (
                        <li key={`${c.documentoId}-${c.pagina}`}>
                          <blockquote><i>{n + 1}</i><p>{c.fragmento}</p><cite><Ic n="libro" /><span><strong>{c.documento}</strong> · versión {c.version} · página {c.pagina}</span></cite></blockquote>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <div className="vacio-r">
                    <Ic n={respuesta.estado === 'sin-evidencia' ? 'gota' : 'shield'} className="grande" />
                    <b>{respuesta.estado === 'sin-evidencia' ? 'No encontré evidencia suficiente' : 'Fuera de alcance'}</b>
                    <p data-testid="mensaje-asistente">{respuesta.mensaje}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="asis-d">
          <Banda foto={FOTOS.humedal} sobre="Biblioteca" titulo={documentos.datos ? `${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'}` : 'Documentos'}
            texto={documentos.datos ? <span data-testid="documentos" className="docs-v3">{docs.length ? docs.map((d) => <span key={d.id}>{d.titulo} · versión {d.version} · {d.paginas} {d.paginas === 1 ? 'página' : 'páginas'}</span>) : 'Todavía no hay documentos.'}</span> : 'Leyendo la biblioteca…'} />
        </div>
      </div>
    </>
  );
}
