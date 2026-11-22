import { describe, expect, test, vi } from 'vitest';
import { ClienteApi, ErrorApi } from '../api/cliente';

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

const sesionOk = (n = 1) => ({ tokenAcceso: `acceso-${n}`, tokenRefresco: `refresco-${n}`, perfil: 'personal', rol: 'tesorero' });

function cliente(manejador: (ruta: string, init: RequestInit) => Response | Promise<Response>) {
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => manejador(String(ruta), init ?? {}));
  const almacen = new Map<string, string>();
  const c = new ClienteApi(peticion as unknown as typeof fetch, {
    getItem: (k) => almacen.get(k) ?? null,
    setItem: (k, v) => void almacen.set(k, v),
    removeItem: (k) => void almacen.delete(k),
  });
  return { c, peticion, almacen };
}

const cabecera = (init: RequestInit, nombre: string) => (init.headers as Record<string, string>)[nombre];

describe('ClienteApi', () => {
  test('inicia sesión, guarda solo el refresco y envía el token de acceso', async () => {
    const { c, peticion, almacen } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(200, { ok: true })));
    const alIniciar = vi.fn();
    c.configurar({ alIniciarSesion: alIniciar });
    expect(await c.iniciarSesion('a@b.pe', 'x')).toEqual({ perfil: 'personal', rol: 'tesorero' });
    expect(alIniciar).toHaveBeenCalledWith({ perfil: 'personal', rol: 'tesorero' });
    expect([...almacen.values()]).toEqual(['refresco-1']);
    await c.solicitar('GET', '/v1/yo');
    expect(cabecera(peticion.mock.calls[1][1] as RequestInit, 'Authorization')).toBe('Bearer acceso-1');
  });

  test('credenciales inválidas → ErrorApi 401 con el mensaje del servidor', async () => {
    const { c } = cliente(() => json(401, { codigo: 'credenciales-invalidas', mensaje: 'Credenciales inválidas' }));
    await expect(c.iniciarSesion('a@b.pe', 'mala')).rejects.toMatchObject({ estado: 401, codigo: 'credenciales-invalidas' });
  });

  test('ante un 401 renueva una vez y repite la solicitud con el token nuevo', async () => {
    let intento = 0;
    const { c, peticion } = cliente((ruta, init) => {
      if (ruta === '/v1/auth/login') return json(200, sesionOk(1));
      if (ruta === '/v1/auth/refresh') return json(200, sesionOk(2));
      intento++;
      return cabecera(init, 'Authorization') === 'Bearer acceso-2' ? json(200, { dato: intento }) : json(401, { codigo: 'token-invalido', mensaje: 'No autenticado' });
    });
    await c.iniciarSesion('a@b.pe', 'x');
    expect(await c.solicitar('GET', '/v1/asociados')).toEqual({ dato: 2 });
    expect(peticion.mock.calls.filter(([r]) => r === '/v1/auth/refresh')).toHaveLength(1);
  });

  test('varias solicitudes con 401 simultáneas comparten una sola renovación', async () => {
    const { c, peticion } = cliente((ruta, init) => {
      if (ruta === '/v1/auth/login') return json(200, sesionOk(1));
      if (ruta === '/v1/auth/refresh') return json(200, sesionOk(2));
      return cabecera(init, 'Authorization') === 'Bearer acceso-2' ? json(200, {}) : json(401, { codigo: 'token-invalido', mensaje: '' });
    });
    await c.iniciarSesion('a@b.pe', 'x');
    await Promise.all([c.solicitar('GET', '/v1/a'), c.solicitar('GET', '/v1/b'), c.solicitar('GET', '/v1/c')]);
    expect(peticion.mock.calls.filter(([r]) => r === '/v1/auth/refresh')).toHaveLength(1);
  });

  test('si la renovación falla, borra la sesión, avisa y lanza el 401', async () => {
    const { c, almacen } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(401, { codigo: 'sesion-invalida', mensaje: 'No autenticado' })));
    const expirada = vi.fn();
    c.configurar({ onSesionExpirada: expirada });
    await c.iniciarSesion('a@b.pe', 'x');
    await expect(c.solicitar('GET', '/v1/asociados')).rejects.toMatchObject({ estado: 401 });
    expect(expirada).toHaveBeenCalledOnce();
    expect(almacen.size).toBe(0);
  });

  test('un 403 se propaga sin renovar ni cerrar la sesión', async () => {
    const { c, peticion } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(403, { codigo: 'acceso-denegado', mensaje: 'Acceso denegado' })));
    const expirada = vi.fn();
    c.configurar({ onSesionExpirada: expirada });
    await c.iniciarSesion('a@b.pe', 'x');
    await expect(c.solicitar('GET', '/v1/asociados')).rejects.toMatchObject({ estado: 403, codigo: 'acceso-denegado' });
    expect(expirada).not.toHaveBeenCalled();
    expect(peticion.mock.calls.some(([r]) => r === '/v1/auth/refresh')).toBe(false);
  });

  test('restaurar: con refresco guardado recupera perfil y rol; sin refresco devuelve null', async () => {
    const { c, almacen } = cliente((ruta) => (ruta === '/v1/auth/refresh' ? json(200, sesionOk(3)) : json(200, { perfil: 'personal', rol: 'consejo' })));
    expect(await c.restaurar()).toBeNull();
    almacen.set('sijass.refresco', 'refresco-previo');
    expect(await c.restaurar()).toEqual({ perfil: 'personal', rol: 'consejo' });
    expect(almacen.get('sijass.refresco')).toBe('refresco-3');
  });

  test('cerrar sesión borra el refresco y lo invalida en el servidor', async () => {
    const { c, peticion, almacen } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(204)));
    await c.iniciarSesion('a@b.pe', 'x');
    await c.cerrarSesion();
    expect(almacen.size).toBe(0);
    const logout = peticion.mock.calls.find(([r]) => r === '/v1/auth/logout');
    expect(JSON.parse((logout![1] as RequestInit).body as string)).toEqual({ tokenRefresco: 'refresco-1' });
  });

  test('envía el cuerpo y las cabeceras adicionales (Idempotency-Key) y entiende el 204', async () => {
    const { c, peticion } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(204)));
    await c.iniciarSesion('a@b.pe', 'x');
    expect(await c.solicitar('POST', '/v1/pagos', { importeCentimos: 500 }, { 'Idempotency-Key': 'k-1' })).toBeUndefined();
    const init = peticion.mock.calls[1][1] as RequestInit;
    expect(cabecera(init, 'Idempotency-Key')).toBe('k-1');
    expect(cabecera(init, 'Content-Type')).toBe('application/json');
    expect(init.body).toBe('{"importeCentimos":500}');
  });

  test('un cuerpo de error que no es JSON produce un ErrorApi genérico', async () => {
    const { c } = cliente(() => new Response('<html>502</html>', { status: 502 }));
    const e = await c.solicitar('GET', '/v1/x').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e).toMatchObject({ estado: 502, codigo: 'error' });
  });

  test('el sessionStorage no disponible no rompe el inicio de sesión', async () => {
    const peticion = vi.fn(async () => json(200, sesionOk())) as unknown as typeof fetch;
    const c = new ClienteApi(peticion, {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
      removeItem: () => { throw new Error('bloqueado'); },
    });
    await expect(c.iniciarSesion('a@b.pe', 'x')).resolves.toMatchObject({ perfil: 'personal' });
  });
});
