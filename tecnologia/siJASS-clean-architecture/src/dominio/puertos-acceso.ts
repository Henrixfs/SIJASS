/**
 * Puertos de identidad, padrón, cuotas, pagos y auditoría (s1b-acceso-cuotas-pagos,
 * design.md D8). Son un contexto aparte de las mediciones (diseño interno §1: un módulo
 * no lee ni escribe tablas de otro), con su propia unidad de trabajo.
 *
 * Toda implementación debe superar la batería de `src/pruebas/contrato/acceso-padron.ts`.
 */
import type { Membresia, Sesion, Usuario } from './acceso.js';
import type { Asociado, Cuota, Pago, ReversaPago } from './padron.js';
import type { Reservorio } from './reservorio.js';

export interface RepositorioJass {
  /** @throws ErrorConflicto('jass-duplicada') si el identificador ya existe. */
  crear(jass: { readonly id: string; readonly nombre: string }): Promise<void>;
  existe(id: string): Promise<boolean>;
}

/** Alta y consulta de reservorios (módulo `organizacion`, s1c). */
export interface RepositorioReservoriosJass {
  /** @throws ErrorConflicto('reservorio-duplicado') si el nombre ya existe en la JASS (sin distinguir mayúsculas). */
  crear(reservorio: Reservorio): Promise<void>;
  /** Solo los de esa JASS, por nombre sin distinguir mayúsculas y luego por `id`. */
  listar(jassId: string): Promise<Reservorio[]>;
}

export interface RepositorioUsuarios {
  /** @throws ErrorConflicto('correo-duplicado') si ya existe una cuenta con ese correo. */
  crear(usuario: Usuario): Promise<void>;
  buscarPorCorreo(correo: string): Promise<Usuario | undefined>;
  buscarPorId(id: string): Promise<Usuario | undefined>;
  /**
   * Suma un intento fallido de forma atómica y, al alcanzar `umbral`, fija el bloqueo
   * hasta `bloqueadoHasta`. Devuelve el estado resultante.
   */
  registrarFallo(
    id: string,
    umbral: number,
    bloqueadoHasta: string,
  ): Promise<{ readonly intentosFallidos: number; readonly bloqueadoHasta: string | null }>;
  /** Pone el contador en 0 y quita el bloqueo. */
  reiniciarIntentos(id: string): Promise<void>;
}

export interface RepositorioMembresias {
  /** @throws ErrorConflicto('membresia-activa-existente') si la cuenta ya tiene una activa. */
  crear(membresia: Membresia): Promise<void>;
  activaDeUsuario(usuarioId: string): Promise<Membresia | undefined>;
  /** Desactiva la membresía activa de la cuenta; `true` si había una. */
  desactivarDeUsuario(usuarioId: string): Promise<boolean>;
}

export interface RepositorioSesiones {
  crear(sesion: Sesion): Promise<void>;
  buscarPorHash(refreshHash: string): Promise<Sesion | undefined>;
  /** Marca la sesión como usada solo si no estaba usada ni revocada; `true` si lo logró. */
  marcarUsada(id: string, ahora: string): Promise<boolean>;
  revocarFamilia(familiaId: string, ahora: string): Promise<void>;
}

export interface RepositorioAsociados {
  /** @throws ErrorConflicto('documento-duplicado') si el documento ya existe en la JASS. */
  crear(asociado: Asociado): Promise<void>;
  /** Solo busca dentro de la JASS indicada. */
  buscar(jassId: string, id: string): Promise<Asociado | undefined>;
  /** Por documento, de menor a mayor. */
  listar(jassId: string): Promise<Asociado[]>;
  /** Pasa a `baja` sin borrar; `false` si no existe en esa JASS. */
  darDeBaja(jassId: string, id: string): Promise<boolean>;
}

export interface RepositorioCuotas {
  /** Crea la cuota salvo que ya exista (jass, asociado, periodo); `true` si la creó. */
  crearSiNoExiste(cuota: Cuota): Promise<boolean>;
  buscar(jassId: string, id: string): Promise<Cuota | undefined>;
  /**
   * Igual que `buscar` y, en PostgreSQL, bloquea la fila (`FOR UPDATE`) hasta el final de
   * la transacción, para serializar los pagos de una misma cuota (design.md D7).
   */
  buscarBloqueando(jassId: string, id: string): Promise<Cuota | undefined>;
  /** De la más antigua a la más reciente. */
  listarPorAsociado(jassId: string, asociadoId: string): Promise<Cuota[]>;
}

export type ResultadoCreacionPago =
  | { readonly creado: true }
  | { readonly creado: false; readonly existente: Pago };

export interface RepositorioPagos {
  /**
   * Inserta el pago salvo que ya exista la misma (jass, claveIdempotencia); en ese caso
   * devuelve el existente sin modificarlo.
   */
  crear(pago: Pago): Promise<ResultadoCreacionPago>;
  buscar(jassId: string, id: string): Promise<Pago | undefined>;
  buscarPorClave(jassId: string, claveIdempotencia: string): Promise<Pago | undefined>;
  /** Pagos (vigentes y revertidos) de una cuota, del más antiguo al más reciente. */
  listarPorCuota(jassId: string, cuotaId: string): Promise<Pago[]>;
  /** Pagos de todas las cuotas del asociado, del más antiguo al más reciente. */
  listarPorAsociado(jassId: string, asociadoId: string): Promise<Pago[]>;
  /** Pasa a `revertido` solo si estaba `vigente`; `true` si lo logró. */
  marcarRevertido(jassId: string, id: string): Promise<boolean>;
  /** @throws ErrorConflicto('pago-ya-revertido') si el pago ya tiene reversa. */
  crearReversa(reversa: ReversaPago): Promise<void>;
  buscarReversa(jassId: string, pagoId: string): Promise<ReversaPago | undefined>;
}

export interface EventoAuditoria {
  readonly jassId: string | null;
  readonly actorId: string | null;
  readonly accion: string;
  readonly recurso: string;
  readonly recursoId: string | null;
  /** Datos mínimos del hecho; nunca contraseñas, tokens ni datos del recurso denegado. */
  readonly detalle: Readonly<Record<string, unknown>>;
  readonly origen: string;
  readonly creadaEn: string;
}

export interface RepositorioAuditoria {
  registrar(evento: EventoAuditoria): Promise<void>;
  /** Eventos de una JASS, del más antiguo al más reciente. */
  listarPorJass(jassId: string): Promise<EventoAuditoria[]>;
  /** Eventos sin JASS (por ejemplo, inicios de sesión de cuentas inexistentes). */
  listarSinJass(): Promise<EventoAuditoria[]>;
}

export interface RepositoriosAcceso {
  readonly jass: RepositorioJass;
  readonly reservorios: RepositorioReservoriosJass;
  readonly usuarios: RepositorioUsuarios;
  readonly membresias: RepositorioMembresias;
  readonly sesiones: RepositorioSesiones;
  readonly asociados: RepositorioAsociados;
  readonly cuotas: RepositorioCuotas;
  readonly pagos: RepositorioPagos;
  readonly auditoria: RepositorioAuditoria;
}

/** Costura de pruebas: envuelve los repositorios de cada transacción (p. ej. para inyectar un fallo). */
export type DecoradorRepositoriosAcceso = (repos: RepositoriosAcceso) => RepositoriosAcceso;

/** Ejecuta `trabajo` en una transacción: confirma si se resuelve y revierte si lanza. */
export interface UnidadDeTrabajoAcceso {
  ejecutar<T>(trabajo: (repos: RepositoriosAcceso) => Promise<T>): Promise<T>;
}

/** Derivación de contraseñas (design.md D2). */
export interface ServicioContrasenas {
  derivar(contrasena: string): Promise<string>;
  /** Comparación en tiempo constante; `false` si el formato del hash no es válido. */
  verificar(contrasena: string, hash: string): Promise<boolean>;
}

export interface ClaimsAcceso {
  readonly usuarioId: string;
  readonly expiraEn: number;
}

/** Tokens de acceso y de refresco (design.md D2). */
export interface ServicioTokens {
  emitirAcceso(usuarioId: string, ahora: Date): string;
  /** `undefined` si la firma, el algoritmo, el formato o la vigencia no son válidos. */
  verificarAcceso(token: string, ahora: Date): ClaimsAcceso | undefined;
  /** Token opaco aleatorio y su hash SHA-256 hexadecimal. */
  nuevoRefresco(): { readonly token: string; readonly hash: string };
  hashDeRefresco(token: string): string;
}
