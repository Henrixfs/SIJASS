import { ROLES, type Rol } from '../../dominio/acceso.js';
import { validarDni } from '../../dominio/documento.js';
import { ErrorDatoInvalido } from '../../dominio/errores.js';
import type { UbicacionJass } from '../../dominio/puertos-acceso.js';
import {
  prepararClaveTemporal,
  validarContrasena,
  validarNombrePersona,
  type DependenciasAcceso,
} from './comun.js';

export function validarRol(valor: unknown): Rol {
  if (typeof valor !== 'string' || !(ROLES as readonly string[]).includes(valor)) throw new ErrorDatoInvalido('rol-invalido');
  return valor as Rol;
}

export function validarNombreJass(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
  if (nombre.length === 0 || nombre.length > 120) throw new ErrorDatoInvalido('nombre-invalido');
  return nombre;
}

const CAMPOS_UBICACION = ['departamento', 'provincia', 'distrito', 'centroPoblado'] as const;

/** Ubicación opcional: cada campo, si viene, de 1 a 80 caracteres; vacío equivale a no indicado. */
export function validarUbicacion(valor: unknown): UbicacionJass {
  const origen = typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  const resultado: Record<string, string | null> = {};
  for (const campo of CAMPOS_UBICACION) {
    const dato = origen[campo];
    if (dato === undefined || dato === null || dato === '') {
      resultado[campo] = null;
      continue;
    }
    const texto = typeof dato === 'string' ? dato.trim().replace(/\s+/g, ' ') : '';
    if (texto.length === 0 || texto.length > 80) throw new ErrorDatoInvalido('ubicacion-invalida', campo);
    resultado[campo] = texto;
  }
  return resultado as unknown as UbicacionJass;
}

export interface ResultadoAltaJass {
  readonly jassId: string;
  readonly usuarioId: string;
  /** Solo si la clave se generó: es la única vez que se muestra. */
  readonly claveTemporal?: string;
}

export interface ComandoAltaJass {
  readonly nombre: unknown;
  readonly ubicacion?: unknown;
  readonly consejo: { readonly nombre: unknown; readonly documento: unknown };
  /** Clave elegida de antemano (comando de servidor); si falta, se genera una temporal. */
  readonly contrasena?: unknown;
  /** Por defecto el Consejo debe cambiar su clave en el primer ingreso. */
  readonly debeCambiarContrasena?: boolean;
}

/**
 * Alta de una JASS y de su primer Consejo en una sola transacción (spec `plataforma-jass`).
 * El Consejo queda con el cambio de clave pendiente. La usan el comando de servidor y la API de
 * plataforma (design.md D8).
 */
export class CrearJassConConsejo {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: ComandoAltaJass, auditoria: { actorId: string | null; origen: string } = { actorId: null, origen: 'plataforma' }): Promise<ResultadoAltaJass> {
    const nombre = validarNombreJass(comando.nombre);
    const ubicacion = validarUbicacion(comando.ubicacion);
    const nombreConsejo = validarNombrePersona(comando.consejo.nombre);
    const documento = validarDni(comando.consejo.documento);
    const generada = comando.contrasena === undefined;
    const preparada = generada
      ? await prepararClaveTemporal(this.d)
      : { clave: '', hash: await this.d.contrasenas.derivar(validarContrasena(comando.contrasena)) };
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const jassId = this.d.ids.nuevo();
      const usuarioId = this.d.ids.nuevo();
      await r.jass.crear({ id: jassId, nombre, ...ubicacion });
      await r.usuarios.crear({
        id: usuarioId,
        documento,
        nombre: nombreConsejo,
        correo: null,
        hashContrasena: preparada.hash,
        estado: 'activo',
        intentosFallidos: 0,
        bloqueadoHasta: null,
        claveGenerada: generada,
        debeCambiarContrasena: comando.debeCambiarContrasena ?? true,
      });
      await r.membresias.crear({ id: this.d.ids.nuevo(), usuarioId, jassId, perfil: 'personal', rol: 'consejo', asociadoId: null, estado: 'activa' });
      await r.auditoria.registrar({
        jassId,
        actorId: auditoria.actorId,
        accion: 'jass.creada',
        recurso: 'jass',
        recursoId: jassId,
        detalle: { primerConsejo: usuarioId },
        origen: auditoria.origen,
        creadaEn: ahora.toISOString(),
      });
      return generada ? { jassId, usuarioId, claveTemporal: preparada.clave } : { jassId, usuarioId };
    }, { sistema: true });
  }
}

/**
 * Alta de una cuenta de personal en una JASS existente con una clave elegida de antemano
 * (operación de servidor: demostración y pruebas). Por la API la crea el Consejo con una clave
 * generada (`gestion-de-accesos`).
 */
export class CrearPersonal {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: {
    jassId: string;
    nombre: unknown;
    documento: unknown;
    contrasena: unknown;
    rol: unknown;
    /** Por defecto la cuenta no tiene cambio pendiente. */
    debeCambiarContrasena?: boolean;
  }): Promise<{ usuarioId: string }> {
    const rol = validarRol(comando.rol);
    const nombre = validarNombrePersona(comando.nombre);
    const documento = validarDni(comando.documento);
    const hashContrasena = await this.d.contrasenas.derivar(validarContrasena(comando.contrasena));
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      if (!(await r.jass.existe(comando.jassId))) throw new ErrorDatoInvalido('jass-inexistente');
      const usuarioId = this.d.ids.nuevo();
      await r.usuarios.crear({
        id: usuarioId,
        documento,
        nombre,
        correo: null,
        hashContrasena,
        estado: 'activo',
        intentosFallidos: 0,
        bloqueadoHasta: null,
        claveGenerada: false,
        debeCambiarContrasena: comando.debeCambiarContrasena ?? false,
      });
      await r.membresias.crear({ id: this.d.ids.nuevo(), usuarioId, jassId: comando.jassId, perfil: 'personal', rol, asociadoId: null, estado: 'activa' });
      // El evento lleva la JASS aunque lo origine la plataforma (sin actor de la JASS).
      await r.auditoria.registrar({
        jassId: comando.jassId,
        actorId: null,
        accion: 'acceso.creado',
        recurso: 'usuario',
        recursoId: usuarioId,
        detalle: { perfil: 'personal', rol },
        origen: 'plataforma',
        creadaEn: ahora.toISOString(),
      });
      return { usuarioId };
    }, { sistema: true });
  }
}

/** Alta de la cuenta de plataforma (operación de servidor, con la clave leída del entorno). */
export class CrearPlataforma {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: { nombre: unknown; documento: unknown; contrasena: unknown; debeCambiarContrasena?: boolean }): Promise<{ usuarioId: string }> {
    const nombre = validarNombrePersona(comando.nombre);
    const documento = validarDni(comando.documento);
    const hashContrasena = await this.d.contrasenas.derivar(validarContrasena(comando.contrasena));
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const usuarioId = this.d.ids.nuevo();
      await r.usuarios.crear({
        id: usuarioId,
        documento,
        nombre,
        correo: null,
        hashContrasena,
        estado: 'activo',
        intentosFallidos: 0,
        bloqueadoHasta: null,
        claveGenerada: false,
        debeCambiarContrasena: comando.debeCambiarContrasena ?? true,
      });
      await r.membresias.crear({ id: this.d.ids.nuevo(), usuarioId, jassId: null, perfil: 'plataforma', rol: null, asociadoId: null, estado: 'activa' });
      await r.auditoria.registrar({
        jassId: null,
        actorId: null,
        accion: 'plataforma.creada',
        recurso: 'usuario',
        recursoId: usuarioId,
        detalle: {},
        origen: 'plataforma',
        creadaEn: ahora.toISOString(),
      });
      return { usuarioId };
    }, { sistema: true });
  }
}

/** Asigna DNI y nombre a una cuenta anterior a `s2a`, identificada por su correo (una sola vez). */
export class AsignarDocumento {
  constructor(private readonly d: DependenciasAcceso) {}

  async ejecutar(comando: { correo: unknown; documento: unknown; nombre: unknown }): Promise<{ usuarioId: string }> {
    const correo = typeof comando.correo === 'string' ? comando.correo.trim().toLowerCase() : '';
    const documento = validarDni(comando.documento);
    const nombre = validarNombrePersona(comando.nombre);
    const ahora = this.d.reloj.ahora();
    return this.d.unidadDeTrabajo.ejecutar(async (r) => {
      const usuario = await r.usuarios.buscarPorCorreo(correo);
      if (!usuario) throw new ErrorDatoInvalido('cuenta-inexistente');
      await r.usuarios.asignarDocumento(usuario.id, documento, nombre);
      const membresia = await r.membresias.activaDeUsuario(usuario.id);
      await r.auditoria.registrar({
        jassId: membresia?.jassId ?? null,
        actorId: null,
        accion: 'documento.asignado',
        recurso: 'usuario',
        recursoId: usuario.id,
        detalle: {},
        origen: 'plataforma',
        creadaEn: ahora.toISOString(),
      });
      return { usuarioId: usuario.id };
    }, { sistema: true });
  }
}
