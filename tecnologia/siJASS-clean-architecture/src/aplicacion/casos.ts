import { AsignarDocumento, CrearJassConConsejo, CrearPersonal, CrearPlataforma } from './acceso/administracion.js';
import { CrearMiembroEquipo, DesactivarMiembroEquipo, ListarEquipo, RestablecerClaveEquipo } from './acceso/equipo.js';
import { CrearJassPlataforma, ListarJass, ReactivarJass, RestablecerClaveConsejo, SuspenderJass } from './acceso/plataforma.js';
import type { DependenciasAcceso } from './acceso/comun.js';
import { AutenticarUsuario, AutorizarSolicitud, CambiarContrasena, CerrarSesion, ConsultarYo, RegistrarAccesoDenegado, RenovarSesion } from './acceso/sesiones.js';
import {
  ConsultarEstadoDeCuenta,
  ConsultarPortal,
  CrearAccesoAsociado,
  DarDeBajaAsociado,
  GenerarCuotas,
  ListarAsociados,
  RegistrarAsociado,
  RestablecerClaveAsociado,
} from './padron/padron.js';
import { ConsultarPago, RegistrarPago, ReversarPago } from './padron/pagos.js';
import { ConsultarCatalogo, ConsultarHistorial, RegistrarMedicionAutorizada } from './mediciones-autorizadas.js';
import { RegistrarMedicion } from './registrar-medicion.js';
import { CrearReservorio, ListarReservorios } from './reservorios.js';
import { ConsultarSalud } from './salud.js';
import {
  ActualizarReglasPrioridad,
  AsignarResponsableIncidencia,
  CambiarEstadoIncidencia,
  ConfirmarPrioridadIncidencia,
  ConsultarIncidencia,
  ConsultarReglasPrioridad,
  HistorialIncidencia,
  LeerFotoIncidencia,
  ListarIncidencias,
  RegistrarAccionIncidencia,
  RegistrarIncidencia,
  SubirFotoIncidencia,
} from './incidencias.js';
import { ConsultarAsistente, ListarDocumentosAsistente, type RedactorRespuesta } from './asistente.js';
import type { Corpus } from '../dominio/asistente/corpus.js';
import type { UnidadDeTrabajo } from '../dominio/puertos.js';

/** Todos los casos de uso de acceso, padrón y pagos, ya construidos con sus dependencias. */
export interface Casos {
  readonly autenticar: AutenticarUsuario;
  readonly renovar: RenovarSesion;
  readonly cerrarSesion: CerrarSesion;
  readonly autorizar: AutorizarSolicitud;
  readonly registrarDenegado: RegistrarAccesoDenegado;
  readonly cambiarContrasena: CambiarContrasena;
  readonly yo: ConsultarYo;
  readonly crearJass: CrearJassConConsejo;
  readonly crearPersonal: CrearPersonal;
  readonly crearPlataforma: CrearPlataforma;
  readonly asignarDocumento: AsignarDocumento;
  readonly listarEquipo: ListarEquipo;
  readonly crearMiembroEquipo: CrearMiembroEquipo;
  readonly desactivarMiembroEquipo: DesactivarMiembroEquipo;
  readonly restablecerClaveEquipo: RestablecerClaveEquipo;
  readonly listarJass: ListarJass;
  readonly crearJassPlataforma: CrearJassPlataforma;
  readonly suspenderJass: SuspenderJass;
  readonly reactivarJass: ReactivarJass;
  readonly restablecerClaveConsejo: RestablecerClaveConsejo;
  readonly restablecerClaveAsociado: RestablecerClaveAsociado;
  readonly registrarAsociado: RegistrarAsociado;
  readonly darDeBaja: DarDeBajaAsociado;
  readonly listarAsociados: ListarAsociados;
  readonly estadoDeCuenta: ConsultarEstadoDeCuenta;
  readonly portal: ConsultarPortal;
  readonly crearAcceso: CrearAccesoAsociado;
  readonly generarCuotas: GenerarCuotas;
  readonly registrarPago: RegistrarPago;
  readonly reversarPago: ReversarPago;
  readonly consultarPago: ConsultarPago;
  readonly crearReservorio: CrearReservorio;
  readonly listarReservorios: ListarReservorios;
  readonly registrarMedicion: RegistrarMedicionAutorizada;
  readonly historial: ConsultarHistorial;
  readonly catalogo: ConsultarCatalogo;
  readonly asistente: ConsultarAsistente;
  readonly documentosAsistente: ListarDocumentosAsistente;
  readonly salud: ConsultarSalud;
  readonly registrarIncidencia: RegistrarIncidencia;
  readonly listarIncidencias: ListarIncidencias;
  readonly consultarIncidencia: ConsultarIncidencia;
  readonly historialIncidencia: HistorialIncidencia;
  readonly cambiarEstadoIncidencia: CambiarEstadoIncidencia;
  readonly confirmarPrioridad: ConfirmarPrioridadIncidencia;
  readonly asignarResponsable: AsignarResponsableIncidencia;
  readonly registrarAccionIncidencia: RegistrarAccionIncidencia;
  readonly subirFotoIncidencia: SubirFotoIncidencia;
  readonly leerFotoIncidencia: LeerFotoIncidencia;
  readonly reglasPrioridad: ConsultarReglasPrioridad;
  readonly actualizarReglasPrioridad: ActualizarReglasPrioridad;
}

/**
 * @param corpus corpus validado del asistente documental (s1d); `redactor` es el punto de
 *   incorporación opcional del proveedor de modelo de lenguaje.
 * @param unidadMediciones unidad de trabajo del módulo de mediciones (distinta de la de acceso:
 *   un módulo no escribe las tablas de otro, diseño interno §1).
 */
export function construirCasos(d: DependenciasAcceso, unidadMediciones: UnidadDeTrabajo, corpus: Corpus, redactor?: RedactorRespuesta): Casos {
  return {
    autenticar: new AutenticarUsuario(d),
    renovar: new RenovarSesion(d),
    cerrarSesion: new CerrarSesion(d),
    autorizar: new AutorizarSolicitud(d),
    registrarDenegado: new RegistrarAccesoDenegado(d),
    cambiarContrasena: new CambiarContrasena(d),
    yo: new ConsultarYo(d),
    crearJass: new CrearJassConConsejo(d),
    crearPersonal: new CrearPersonal(d),
    crearPlataforma: new CrearPlataforma(d),
    asignarDocumento: new AsignarDocumento(d),
    listarEquipo: new ListarEquipo(d),
    crearMiembroEquipo: new CrearMiembroEquipo(d),
    desactivarMiembroEquipo: new DesactivarMiembroEquipo(d),
    restablecerClaveEquipo: new RestablecerClaveEquipo(d),
    listarJass: new ListarJass(d),
    crearJassPlataforma: new CrearJassPlataforma(d),
    suspenderJass: new SuspenderJass(d),
    reactivarJass: new ReactivarJass(d),
    restablecerClaveConsejo: new RestablecerClaveConsejo(d),
    restablecerClaveAsociado: new RestablecerClaveAsociado(d),
    registrarAsociado: new RegistrarAsociado(d),
    darDeBaja: new DarDeBajaAsociado(d),
    listarAsociados: new ListarAsociados(d),
    estadoDeCuenta: new ConsultarEstadoDeCuenta(d),
    portal: new ConsultarPortal(d),
    crearAcceso: new CrearAccesoAsociado(d),
    generarCuotas: new GenerarCuotas(d),
    registrarPago: new RegistrarPago(d),
    reversarPago: new ReversarPago(d),
    consultarPago: new ConsultarPago(d),
    crearReservorio: new CrearReservorio(d),
    listarReservorios: new ListarReservorios(d),
    registrarMedicion: new RegistrarMedicionAutorizada(new RegistrarMedicion({ unidadDeTrabajo: unidadMediciones, reloj: d.reloj, ids: d.ids })),
    historial: new ConsultarHistorial(unidadMediciones),
    catalogo: new ConsultarCatalogo(),
    asistente: new ConsultarAsistente(d, corpus, redactor),
    documentosAsistente: new ListarDocumentosAsistente(corpus),
    salud: new ConsultarSalud(d.unidadDeTrabajo),
    registrarIncidencia: new RegistrarIncidencia(d),
    listarIncidencias: new ListarIncidencias(d),
    consultarIncidencia: new ConsultarIncidencia(d),
    historialIncidencia: new HistorialIncidencia(d),
    cambiarEstadoIncidencia: new CambiarEstadoIncidencia(d),
    confirmarPrioridad: new ConfirmarPrioridadIncidencia(d),
    asignarResponsable: new AsignarResponsableIncidencia(d),
    registrarAccionIncidencia: new RegistrarAccionIncidencia(d),
    subirFotoIncidencia: new SubirFotoIncidencia(d),
    leerFotoIncidencia: new LeerFotoIncidencia(d),
    reglasPrioridad: new ConsultarReglasPrioridad(d),
    actualizarReglasPrioridad: new ActualizarReglasPrioridad(d),
  };
}
