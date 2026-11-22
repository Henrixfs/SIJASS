/**
 * Arnés de las pruebas HTTP: la aplicación NestJS real sobre PostgreSQL, escuchando en un
 * puerto efímero, y un cliente mínimo con `fetch`.
 */
import type { INestApplication } from '@nestjs/common';
import type pg from 'pg';
import { crearAplicacion } from '../../api/aplicacion.js';
import type { Corpus } from '../../dominio/asistente/corpus.js';
import type { DecoradorRepositoriosAcceso } from '../../dominio/puertos-acceso.js';
import { UnidadDeTrabajoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-postgres.js';
import { UnidadDeTrabajoAccesoPostgres } from '../../infraestructura/postgres/unidad-de-trabajo-acceso-postgres.js';
import { CLAVE, crearEntorno, sembrarEscenario, type Entorno, type Escenario } from '../entorno-acceso.js';

export interface Respuesta {
  readonly estado: number;
  readonly cuerpo: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  readonly cabeceras: Headers;
  readonly texto: string;
}

export interface Peticion {
  readonly token?: string;
  readonly cuerpo?: unknown;
  readonly cuerpoCrudo?: string;
  readonly cabeceras?: Record<string, string>;
}

export interface Api {
  readonly app: INestApplication;
  readonly url: string;
  readonly entorno: Entorno;
  peticion(metodo: string, ruta: string, opciones?: Peticion): Promise<Respuesta>;
  /** Inicia sesión por HTTP y devuelve los tokens. */
  iniciarSesion(correo: string, contrasena?: string): Promise<{ tokenAcceso: string; tokenRefresco: string }>;
  cerrar(): Promise<void>;
}

export async function iniciarApi(pool: pg.Pool, decorar?: DecoradorRepositoriosAcceso, corpus?: Corpus): Promise<Api> {
  const entorno = crearEntorno(new UnidadDeTrabajoAccesoPostgres(pool, decorar), { mediciones: new UnidadDeTrabajoPostgres(pool), corpus });
  const errores: string[] = [];
  const app = await crearAplicacion({ casos: entorno.casos, registrar: (m) => errores.push(m) });
  await app.listen(0, '127.0.0.1');
  const direccion = app.getHttpServer().address() as { port: number };
  const url = `http://127.0.0.1:${direccion.port}`;

  async function peticion(metodo: string, ruta: string, opciones: Peticion = {}): Promise<Respuesta> {
    const cabeceras: Record<string, string> = { ...(opciones.cabeceras ?? {}) };
    if (opciones.token) cabeceras.authorization = `Bearer ${opciones.token}`;
    let cuerpo: string | undefined;
    if (opciones.cuerpoCrudo !== undefined) {
      cuerpo = opciones.cuerpoCrudo;
      cabeceras['content-type'] ??= 'application/json';
    } else if (opciones.cuerpo !== undefined) {
      cuerpo = JSON.stringify(opciones.cuerpo);
      cabeceras['content-type'] = 'application/json';
    }
    const r = await fetch(`${url}${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo });
    const texto = await r.text();
    let json: unknown = undefined;
    try {
      json = texto === '' ? undefined : JSON.parse(texto);
    } catch {
      json = undefined;
    }
    return { estado: r.status, cuerpo: json, cabeceras: r.headers, texto };
  }

  return {
    app,
    url,
    entorno,
    peticion,
    async iniciarSesion(correo, contrasena = CLAVE) {
      const r = await peticion('POST', '/v1/auth/login', { cuerpo: { correo, contrasena } });
      if (r.estado !== 200) throw new Error(`inicio de sesión fallido (${r.estado}): ${r.texto}`);
      return { tokenAcceso: r.cuerpo.tokenAcceso, tokenRefresco: r.cuerpo.tokenRefresco };
    },
    async cerrar() {
      await app.close();
    },
  };
}

export interface Mundo {
  readonly api: Api;
  readonly esc: Escenario;
  /** Token de acceso de cada cuenta del escenario. */
  readonly token: Record<'consejoA' | 'tesoreroA' | 'operadorA' | 'tesoreroB' | 'consejoB' | 'operadorB' | 'asociadoA1' | 'asociadoA2' | 'asociadoB1', string>;
}

/** API + escenario sembrado + un token de acceso por cuenta. */
export async function crearMundo(pool: pg.Pool, decorar?: DecoradorRepositoriosAcceso, corpus?: Corpus): Promise<Mundo> {
  const api = await iniciarApi(pool, decorar, corpus);
  const esc = await sembrarEscenario(api.entorno);
  const token = {
    consejoA: (await api.iniciarSesion(esc.consejoA.correo)).tokenAcceso,
    tesoreroA: (await api.iniciarSesion(esc.tesoreroA.correo)).tokenAcceso,
    operadorA: (await api.iniciarSesion(esc.operadorA.correo)).tokenAcceso,
    tesoreroB: (await api.iniciarSesion(esc.tesoreroB.correo)).tokenAcceso,
    consejoB: (await api.iniciarSesion(esc.consejoB.correo)).tokenAcceso,
    operadorB: (await api.iniciarSesion(esc.operadorB.correo)).tokenAcceso,
    asociadoA1: (await api.iniciarSesion(esc.asociadoA1.cuenta.correo)).tokenAcceso,
    asociadoA2: (await api.iniciarSesion(esc.asociadoA2.cuenta.correo)).tokenAcceso,
    asociadoB1: (await api.iniciarSesion(esc.asociadoB1.cuenta.correo)).tokenAcceso,
  };
  return { api, esc, token };
}
