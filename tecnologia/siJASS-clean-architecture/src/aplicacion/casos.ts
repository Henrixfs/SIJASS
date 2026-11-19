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
}

export function construirCasos(d: DependenciasAcceso): Casos {
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
  };
}
