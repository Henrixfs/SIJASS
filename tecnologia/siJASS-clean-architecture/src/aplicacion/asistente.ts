/**
 * Asistente documental (s1d, spec `asistente-documental`): consulta con citas verificables,
 * abstención y límite sanitario. Solo lee el corpus: no escribe datos de negocio ni consulta
 * asociados, pagos ni mediciones.
 */
import { exigirPermiso, type ContextoAcceso } from '../dominio/acceso.js';
import type { Corpus, EstadoCorpus } from '../dominio/asistente/corpus.js';
import { ADVERTENCIA_EJEMPLO, contieneContenidoSanitarioRestringido, MENSAJE_FUERA_DE_ALCANCE, MENSAJE_SIN_EVIDENCIA, pideDosisOTratamiento, referenciaSanitariaPermitida } from '../dominio/asistente/guarda.js';
import { componerRespuesta, Indice, MAX_PREGUNTA, type Cita } from '../dominio/asistente/recuperacion.js';
import { ErrorDatoInvalido } from '../dominio/errores.js';
import { auditar, type DependenciasAcceso } from './acceso/comun.js';

export type EstadoConsulta = 'respondida' | 'sin-evidencia' | 'fuera-de-alcance';

export interface RespuestaAsistente {
  readonly estado: EstadoConsulta;
  readonly corpus: EstadoCorpus;
  readonly mensaje: string;
  /** Solo en `respondida`: concatenación de los fragmentos citados. */
  readonly respuesta?: string;
  readonly citas: readonly Cita[];
}

/**
 * Punto de incorporación del proveedor de modelo de lenguaje (ADR-012, design.md D6). Recibe
 * únicamente la pregunta y los fragmentos recuperados; su salida **no** puede añadir citas.
 * Sin proveedor acordado, `SinRedactor` deja el texto extractivo.
 */
export interface RedactorRespuesta {
  redactar(pregunta: string, citas: readonly Cita[]): Promise<string | undefined>;
}

export class SinRedactor implements RedactorRespuesta {
  async redactar(): Promise<string | undefined> {
    return undefined;
  }
}

export class ConsultarAsistente {
  private readonly indice: Indice;

  constructor(
    private readonly d: DependenciasAcceso,
    private readonly corpus: Corpus,
    private readonly redactor: RedactorRespuesta = new SinRedactor(),
  ) {
    this.indice = new Indice(corpus);
  }

  async ejecutar(actor: ContextoAcceso, pregunta: unknown): Promise<RespuestaAsistente> {
    exigirPermiso(actor, 'asistente.consultar');
    if (typeof pregunta !== 'string' || pregunta.trim().length === 0 || pregunta.length > MAX_PREGUNTA) {
      throw new ErrorDatoInvalido('pregunta-invalida', `texto de 1 a ${MAX_PREGUNTA} caracteres`);
    }
    const respuesta = await this.responder(pregunta);

    // La pregunta y la respuesta no se almacenan: el evento guarda solo el estado y los conteos.
    await this.d.unidadDeTrabajo.ejecutar((r) =>
      auditar(r, actor, { accion: 'asistente.consulta', recurso: 'asistente', detalle: { estado: respuesta.estado, citas: respuesta.citas.length, corpus: respuesta.corpus } }, this.d.reloj.ahora()),
    );
    return respuesta;
  }

  private async responder(pregunta: string): Promise<RespuestaAsistente> {
    const corpus = this.corpus.estado;
    const advertencia = corpus === 'ejemplo' ? ` ${ADVERTENCIA_EJEMPLO}` : '';
    if (pideDosisOTratamiento(pregunta)) {
      return { estado: 'fuera-de-alcance', corpus, mensaje: MENSAJE_FUERA_DE_ALCANCE + advertencia, citas: [] };
    }

    const citas = this.indice.buscar(pregunta);
    const extractiva = componerRespuesta(citas);
    if (citas.length === 0 || contieneContenidoSanitarioRestringido(extractiva)) {
      return { estado: 'sin-evidencia', corpus, mensaje: MENSAJE_SIN_EVIDENCIA + advertencia, citas: [] };
    }

    const redactada = await this.redactor.redactar(pregunta, citas);
    const respuesta = redactada
      && !contieneContenidoSanitarioRestringido(redactada)
      && redactada.split('\n').every((fragmento) => citas.some((cita) => cita.fragmento === fragmento))
      ? redactada
      : extractiva;
    return {
      estado: 'respondida',
      corpus,
      mensaje: corpus === 'ejemplo' ? ADVERTENCIA_EJEMPLO : 'Respuesta basada en los documentos citados.',
      respuesta,
      citas,
    };
  }
}

export interface ResumenDocumento {
  readonly id: string;
  readonly titulo: string;
  readonly version: string;
  readonly estado: 'aprobado' | 'ejemplo';
  readonly paginas: number;
}

export class ListarDocumentosAsistente {
  constructor(private readonly corpus: Corpus) {}

  ejecutar(actor: ContextoAcceso): { corpus: EstadoCorpus; nombre: string; documentos: ResumenDocumento[] } {
    exigirPermiso(actor, 'asistente.consultar');
    return {
      corpus: this.corpus.estado,
      nombre: contieneContenidoSanitarioRestringido(this.corpus.nombre) ? 'Corpus documental' : this.corpus.nombre,
      documentos: this.corpus.documentos
        .filter((d) => referenciaSanitariaPermitida(d) && d.paginas.some((p) => !contieneContenidoSanitarioRestringido(p.texto)))
        .map((d) => ({ id: d.id, titulo: d.titulo, version: d.version, estado: d.estado, paginas: d.paginas.length })),
    };
  }
}
