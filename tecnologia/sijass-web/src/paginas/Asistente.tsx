import { useCallback, useState, type FormEvent } from 'react';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { Aviso, Boton, Carga, ErrorConsulta, SinPermiso } from '../ui';

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

/**
 * Asistente documental (s1d). Muestra respuestas extractivas con documento, versión y página, o la
 * abstención y el aviso de fuera de alcance. Todo se renderiza como texto (React lo escapa). No
 * hay ningún control de cálculo de dosis: ese cálculo requiere un protocolo validado.
 */
export function Asistente() {
  const { api } = useApp();
  const cargarDocumentos = useCallback(() => api.solicitar<Documentos>('GET', '/v1/asistente/documentos'), [api]);
  const documentos = useCarga(cargarDocumentos);
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { enviando: consultando, ejecutar } = useEnvio();

  async function consultar(e: FormEvent) {
    e.preventDefault();
    const texto = pregunta.trim();
    if (!texto) {
      setError('Escriba una pregunta para consultar.');
      return;
    }
    await ejecutar(async () => {
      setError(null);
      setRespuesta(null);
      try {
        setRespuesta(await api.solicitar<Respuesta>('POST', '/v1/asistente/consultas', { pregunta: texto }));
      } catch (err) {
        setError(mensajeDeError(err));
      }
    });
  }

  const esEjemplo = (documentos.datos?.corpus ?? respuesta?.corpus) === 'ejemplo';
  return (
    <section aria-labelledby="titulo-asistente">
      <h1 id="titulo-asistente">Asistente técnico</h1>
      {esEjemplo && (
        <p className="aviso" role="note" data-testid="aviso-corpus-ejemplo">
          <strong>Documentos de EJEMPLO.</strong> El corpus que consulta este asistente es ficticio y no está aprobado: no lo use como procedimiento. Cuando se incorpore el corpus aprobado, este aviso desaparece.
        </p>
      )}
      <p className="suave">
        Responde solo con lo que dicen los documentos y cita documento, versión y página. Si no hay evidencia, lo indica. No calcula dosis ni dictamina la calidad del agua.
      </p>

      <form className="tarjeta" onSubmit={consultar} aria-label="Consultar al asistente">
        <label>
          Su pregunta
          <textarea name="pregunta" required maxLength={500} rows={3} value={pregunta} disabled={consultando} onChange={(e) => setPregunta(e.target.value)} placeholder="Por ejemplo: ¿Cómo se hace la lectura con el comparador DPD?" />
        </label>
        <div className="pie-consulta"><small className="suave">{pregunta.length} / 500</small>
        <Boton type="submit" variante="primario" disabled={consultando}>
          {consultando ? 'Consultando…' : 'Consultar'}
        </Boton></div>
      </form>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {consultando && <Carga />}
      {documentos.error && <ErrorConsulta error={documentos.error} recargar={documentos.recargar} />}
      {documentos.prohibido && <SinPermiso />}

      {respuesta && (
        <article className="respuesta" aria-live="polite" data-testid="respuesta" data-estado={respuesta.estado}>
          {respuesta.estado === 'respondida' && (
            <>
              <h2>Respuesta</h2>
              <p className="aviso" data-testid="mensaje-asistente">{respuesta.mensaje}</p>
              <h3>Citas</h3>
              <ol data-testid="citas">
                {respuesta.citas.map((c) => (
                  <li key={`${c.documentoId}-${c.pagina}`}>
                    <p className="cita-origen">
                      <strong>{c.documento}</strong> · versión {c.version} · página {c.pagina}
                    </p>
                    <blockquote>{c.fragmento}</blockquote>
                  </li>
                ))}
              </ol>
            </>
          )}
          {respuesta.estado === 'sin-evidencia' && (
            <>
              <h2>Sin evidencia</h2>
              <p data-testid="mensaje-asistente">{respuesta.mensaje}</p>
            </>
          )}
          {respuesta.estado === 'fuera-de-alcance' && (
            <>
              <h2>Fuera de alcance</h2>
              <p data-testid="mensaje-asistente">{respuesta.mensaje}</p>
            </>
          )}
        </article>
      )}

      {documentos.datos && (
        <details className="documentos">
          <summary>Documentos disponibles ({documentos.datos.documentos.length})</summary>
          <ul data-testid="documentos">
            {documentos.datos.documentos.map((d) => (
              <li key={d.id}>
                {d.titulo} · versión {d.version} · {d.paginas} {d.paginas === 1 ? 'página' : 'páginas'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
