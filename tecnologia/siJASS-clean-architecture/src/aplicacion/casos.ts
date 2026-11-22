import { CrearJassConConsejo, CrearPersonal } from './acceso/administracion.js';
import type { DependenciasAcceso } from './acceso/comun.js';
import { AutenticarUsuario, AutorizarSolicitud, CerrarSesion, RegistrarAccesoDenegado, RenovarSesion } from './acceso/sesiones.js';
import {
  ConsultarEstadoDeCuenta,
  ConsultarPortal,
  CrearAccesoAsociado,
  DarDeBajaAsociado,
  GenerarCuotas,
  ListarAsociados,
  RegistrarAsociado,
} from './padron/padron.js';
import { ConsultarPago, RegistrarPago, ReversarPago } from './padron/pagos.js';
import { ConsultarCatalogo, ConsultarHistorial, RegistrarMedicionAutorizada } from './mediciones-autorizadas.js';
import { RegistrarMedicion } from './registrar-medicion.js';
import { CrearReservorio, ListarReservorios } from './reservorios.js';
import type { UnidadDeTrabajo } from '../dominio/puertos.js';

/** Todos los casos de uso de acceso, padrón y pagos, ya construidos con sus dependencias. */
export interface Casos {
  readonly autenticar: AutenticarUsuario;
  readonly renovar: RenovarSesion;
  readonly cerrarSesion: CerrarSesion;
  readonly autorizar: AutorizarSolicitud;
  readonly registrarDenegado: RegistrarAccesoDenegado;
  readonly crearJass: CrearJassConConsejo;
  readonly crearPersonal: CrearPersonal;
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
}

/**
 * @param unidadMediciones unidad de trabajo del módulo de mediciones (distinta de la de acceso:
 *   un módulo no escribe las tablas de otro, diseño interno §1).
 */
export function construirCasos(d: DependenciasAcceso, unidadMediciones: UnidadDeTrabajo): Casos {
  return {
    autenticar: new AutenticarUsuario(d),
    renovar: new RenovarSesion(d),
    cerrarSesion: new CerrarSesion(d),
    autorizar: new AutorizarSolicitud(d),
    registrarDenegado: new RegistrarAccesoDenegado(d),
    crearJass: new CrearJassConConsejo(d),
    crearPersonal: new CrearPersonal(d),
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
  };
}
