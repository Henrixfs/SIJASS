/**
 * Puertos de identidad, padrón, cuotas, pagos y auditoría (s1b-acceso-cuotas-pagos,
 * design.md D8). Son un contexto aparte de las mediciones (diseño interno §1: un módulo
 * no lee ni escribe tablas de otro), con su propia unidad de trabajo.
 *
 * Toda implementación debe superar la batería de `src/pruebas/contrato/acceso-padron.ts`.
 */
import type { Membresia, Rol, Sesion, Usuario } from './acceso.js';
import type { Asociado, Cuota, Pago, ReversaPago } from './padron.js';
import type { Reservorio } from './reservorio.js';

export type EstadoJass = 'activa' | 'suspendida';

/** Dónde queda la JASS. Todos los campos son opcionales (s2a, design.md D10). */
export interface UbicacionJass {
  readonly departamento: string | null;
  readonly provincia: string | null;
  readonly distrito: string | null;
  readonly centroPoblado: string | null;
}

export interface Jass extends UbicacionJass {
  readonly id: string;
  readonly nombre: string;
  readonly estado: EstadoJass;
}

/** Fila del listado de plataforma: la JASS y cuántas cuentas activas tiene (sin datos de negocio). */
export interface ResumenJass extends Jass {
  readonly cuentasActivas: number;
}

export interface RepositorioJass {
  /**
   * Crea la JASS (activa). La ubicación es opcional.
   * @throws ErrorConflicto('jass-duplicada') si el identificador ya existe o ya hay otra con el
   *   mismo nombre y la misma ubicación (sin distinguir mayúsculas).
   */
  crear(jass: { readonly id: string; readonly nombre: string } & Partial<UbicacionJass>): Promise<void>;
  existe(id: string): Promise<boolean>;
  buscar(id: string): Promise<Jass | undefined>;
  /** Todas, por nombre. Solo para el perfil de plataforma. */
  listar(): Promise<ResumenJass[]>;
  /** `false` si la JASS no existe. */
  cambiarEstado(id: string, estado: EstadoJass): Promise<boolean>;
}

/** Alta y consulta de reservorios (módulo `organizacion`, s1c). */
export interface RepositorioReservoriosJass {
  /** @throws ErrorConflicto('reservorio-duplicado') si el nombre ya existe en la JASS (sin distinguir mayúsculas). */
  crear(reservorio: Reservorio): Promise<void>;
  /** Solo los de esa JASS, por nombre sin distinguir mayúsculas y luego por `id`. */
  listar(jassId: string): Promise<Reservorio[]>;
}

export interface CredencialesNuevas {
  readonly hashContrasena: string;
  readonly claveGenerada: boolean;
  readonly debeCambiarContrasena: boolean;
}

export interface RepositorioUsuarios {
  /**
   * @throws ErrorConflicto('documento-con-acceso') si ya existe una cuenta con ese documento, en
   *   cualquier JASS; @throws ErrorConflicto('correo-duplicado') si ya existe una con ese correo.
   */
  crear(usuario: Usuario): Promise<void>;
  buscarPorDocumento(documento: string): Promise<Usuario | undefined>;
  buscarPorCorreo(correo: string): Promise<Usuario | undefined>;
  buscarPorId(id: string): Promise<Usuario | undefined>;
  /** Serializa las decisiones de la cuenta hasta el fin de la unidad de trabajo. */
  buscarPorIdBloqueando(id: string): Promise<Usuario | undefined>;
  /** Cambia la contraseña y las banderas, y además reinicia los intentos fallidos y el bloqueo. */
  actualizarCredenciales(id: string, nuevas: CredencialesNuevas): Promise<void>;
  /** `false` si la cuenta no existe. */
  cambiarEstado(id: string, estado: 'activo' | 'inactivo'): Promise<boolean>;
  /** Asigna documento y nombre a una cuenta anterior a `s2a`. `false` si no existe. */
  asignarDocumento(id: string, documento: string, nombre: string): Promise<boolean>;
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

/** Persona del equipo de una JASS tal como la ve el Consejo. */
export interface MiembroEquipo {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly documento: string;
  readonly rol: Rol;
  readonly estado: 'activo' | 'inactivo';
}

export interface RepositorioMembresias {
  /** @throws ErrorConflicto('membresia-activa-existente') si la cuenta ya tiene una activa. */
  crear(membresia: Membresia): Promise<void>;
  activaDeUsuario(usuarioId: string): Promise<Membresia | undefined>;
  /** Desactiva la membresía activa de la cuenta; `true` si había una. */
  desactivarDeUsuario(usuarioId: string): Promise<boolean>;
  /** Personal de la JASS (activo e inactivo), por rol y nombre. */
  listarPersonal(jassId: string): Promise<MiembroEquipo[]>;
  /** Membresías de asociado de la JASS, activas e inactivas. */
  listarDeAsociados(jassId: string): Promise<Membresia[]>;
}

export interface RepositorioSesiones {
  crear(sesion: Sesion): Promise<void>;
  buscarPorHash(refreshHash: string): Promise<Sesion | undefined>;
  /** Marca la sesión como usada solo si no estaba usada ni revocada; `true` si lo logró. */
  marcarUsada(id: string, ahora: string): Promise<boolean>;
  revocarFamilia(familiaId: string, ahora: string): Promise<void>;
  /** Revoca todas las sesiones vigentes de la cuenta (cambio o restablecimiento de clave, desactivación). */
  revocarDeUsuario(usuarioId: string, ahora: string): Promise<void>;
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
  /** Todas las cuotas de la JASS en una sola consulta (el padrón no pregunta asociado por asociado). */
  listarPorJass(jassId: string): Promise<Cuota[]>;
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
  /** Todos los pagos de la JASS en una sola consulta, del más antiguo al más reciente. */
  listarPorJass(jassId: string): Promise<Pago[]>;
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

/**
 * Con quién se ejecuta una transacción (s2a, design.md D11): una JASS concreta, una operación de
 * sistema (inicio y renovación de sesión, guardia, comandos de servidor) o el perfil de plataforma.
 * La implementación PostgreSQL lo convierte en rol y variables de sesión para la seguridad por filas.
 */
export type ContextoTransaccion =
  | { readonly jassId: string }
  | { readonly sistema: true }
  | { readonly plataforma: true };

/** Ejecuta `trabajo` en una transacción: confirma si se resuelve y revierte si lanza. */
export interface UnidadDeTrabajoAcceso {
  ejecutar<T>(trabajo: (repos: RepositoriosAcceso) => Promise<T>, contexto: ContextoTransaccion): Promise<T>;
}

/** Genera claves temporales legibles (tres palabras); el azar lo pone la implementación. */
export interface GeneradorClaves {
  generar(): string;
}

/**
 * Limita los intentos **fallidos** de inicio de sesión por origen (s2a, design.md D9): se consulta
 * antes de tocar la cuenta y se anota cada fallo de credenciales. Los inicios correctos no cuentan.
 */
export interface LimitadorDeIntentos {
  /** `true` si el origen ya superó el máximo de fallos de la ventana. */
  excedido(origen: string, ahora: Date): boolean;
  /** Anota un intento fallido del origen. */
  registrarFallo(origen: string, ahora: Date): void;
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
