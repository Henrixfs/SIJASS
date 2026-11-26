import { describe, expect, test, vi } from 'vitest';
import { ClienteApi, ErrorApi, ErrorTipoDeAcceso } from '../api/cliente';

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

const sesionOk = (n = 1) => ({ tokenAcceso: `acceso-${n}`, tokenRefresco: `refresco-${n}`, perfil: 'personal', rol: 'tesorero', debeCambiarContrasena: false });
const yoOk = { perfil: 'personal', rol: 'tesorero', nombre: 'Ana Morales', documento: '•••••678', jass: { nombre: 'JASS San Miguel' }, debeCambiarContrasena: false };

function cliente(manejador: (ruta: string, init: RequestInit) => Response | Promise<Response>) {
  // Tras iniciar sesión el cliente consulta `GET /v1/yo`; estas pruebas lo atienden aparte para no mezclarlo con lo que miden.
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => (String(ruta) === '/v1/yo' ? json(200, yoOk) : manejador(String(ruta), init ?? {})));
  const almacen = new Map<string, string>();
  const c = new ClienteApi(peticion as unknown as typeof fetch, {
    getItem: (k) => almacen.get(k) ?? null,
    setItem: (k, v) => void almacen.set(k, v),
    removeItem: (k) => void almacen.delete(k),
  });
  return { c, peticion, almacen };
}

const cabecera = (init: RequestInit, nombre: string) => (init.headers as Record<string, string>)[nombre];

function respuestaPendiente() {
  let resolver!: (r: Response) => void;
  const promise = new Promise<Response>((resolve) => { resolver = resolve; });
  return { promise, resolver };
}

describe('ClienteApi', () => {
  test('inicia sesión, guarda solo el refresco y envía el token de acceso', async () => {
    const { c, peticion, almacen } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(200, { ok: true })));
    const alIniciar = vi.fn();
    c.configurar({ alIniciarSesion: alIniciar });
    expect(await c.iniciarSesion('12345678', 'x', 'administrador')).toEqual(yoOk);
    expect(alIniciar).toHaveBeenCalledWith(yoOk);
    expect([...almacen.values()]).toEqual(['refresco-1']);
    const login = peticion.mock.calls[0];
    expect(JSON.parse((login[1] as RequestInit).body as string)).toEqual({ documento: '12345678', contrasena: 'x', tipo: 'administrador' });
    expect(cabecera(peticion.mock.calls[1][1] as RequestInit, 'Authorization')).toBe('Bearer acceso-1');
    await c.solicitar('GET', '/v1/asociados');
    expect(cabecera(peticion.mock.calls[2][1] as RequestInit, 'Authorization')).toBe('Bearer acceso-1');
  });

  test('un 409 de tipo de acceso distinto lanza ErrorTipoDeAcceso con el tipo real y no guarda ninguna sesión', async () => {
    const { c, almacen, peticion } = cliente(() => json(409, { codigo: 'tipo-de-acceso-distinto', mensaje: 'x', tipoReal: 'asociado' }));
    const alIniciar = vi.fn();
    c.configurar({ alIniciarSesion: alIniciar });
    const error = await c.iniciarSesion('12345678', 'x', 'administrador').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorTipoDeAcceso);
    expect((error as ErrorTipoDeAcceso).tipoReal).toBe('asociado');
    expect(almacen.size).toBe(0);
    expect(alIniciar).not.toHaveBeenCalled();
    expect(peticion.mock.calls.some(([r]) => r === '/v1/yo')).toBe(false);
  });

  test('un 409 con otro código sigue siendo un ErrorApi', async () => {
    const { c } = cliente(() => json(409, { codigo: 'otro', mensaje: 'x' }));
    await expect(c.iniciarSesion('12345678', 'x')).rejects.toBeInstanceOf(ErrorApi);
  });

  test('el login sin tipo no envía el campo tipo', async () => {
    const { c, peticion } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(200, {})));
    await c.iniciarSesion('12345678', 'x');
    expect(JSON.parse((peticion.mock.calls[0][1] as RequestInit).body as string)).toEqual({ documento: '12345678', contrasena: 'x' });
  });

  test('cambiarContrasena envía la actual y la nueva, guarda el refresco nuevo y avisa de la sesión', async () => {
    const { c, peticion, almacen } = cliente((ruta) => {
      if (ruta === '/v1/auth/login') return json(200, { ...sesionOk(1), debeCambiarContrasena: true });
      if (ruta === '/v1/auth/cambiar-contrasena') return json(200, sesionOk(2));
      return json(200, {});
    });
    const alIniciar = vi.fn();
    c.configurar({ alIniciarSesion: alIniciar });
    await c.iniciarSesion('12345678', 'temporal');
    const sesion = await c.cambiarContrasena('temporal', 'Mi-clave-nueva-1');
    expect(sesion.debeCambiarContrasena).toBe(false);
    expect([...almacen.values()]).toEqual(['refresco-2']);
    const llamada = peticion.mock.calls.find(([r]) => r === '/v1/auth/cambiar-contrasena');
    expect(JSON.parse((llamada![1] as RequestInit).body as string)).toEqual({ contrasenaActual: 'temporal', contrasenaNueva: 'Mi-clave-nueva-1' });
    expect(cabecera(llamada![1] as RequestInit, 'Authorization')).toBe('Bearer acceso-1');
    expect(alIniciar).toHaveBeenLastCalledWith(expect.objectContaining({ debeCambiarContrasena: false }));
  });

  test('una clave actual errónea al cambiar es un ErrorApi 401 y no cambia la sesión guardada', async () => {
    const { c, almacen } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk(1)) : ruta === '/v1/auth/cambiar-contrasena' ? json(401, { codigo: 'credenciales-invalidas', mensaje: 'x' }) : json(200, {})));
    await c.iniciarSesion('12345678', 'x');
    await expect(c.cambiarContrasena('mala', 'Mi-clave-nueva-1')).rejects.toMatchObject({ estado: 401 });
    expect([...almacen.values()]).toEqual(['refresco-1']);
  });

  test('credenciales inválidas → ErrorApi 401 con el mensaje del servidor', async () => {
    const { c } = cliente(() => json(401, { codigo: 'credenciales-invalidas', mensaje: 'Credenciales inválidas' }));
    await expect(c.iniciarSesion('12345678', 'mala')).rejects.toMatchObject({ estado: 401, codigo: 'credenciales-invalidas' });
  });

  test('ante un 401 renueva una vez y repite la solicitud con el token nuevo', async () => {
    let intento = 0;
    const { c, peticion } = cliente((ruta, init) => {
      if (ruta === '/v1/auth/login') return json(200, sesionOk(1));
      if (ruta === '/v1/auth/refresh') return json(200, sesionOk(2));
      intento++;
      return cabecera(init, 'Authorization') === 'Bearer acceso-2' ? json(200, { dato: intento }) : json(401, { codigo: 'token-invalido', mensaje: 'No autenticado' });
    });
    await c.iniciarSesion('12345678', 'x');
    expect(await c.solicitar('GET', '/v1/asociados')).toEqual({ dato: 2 });
    expect(peticion.mock.calls.filter(([r]) => r === '/v1/auth/refresh')).toHaveLength(1);
  });

  test('varias solicitudes con 401 simultáneas comparten una sola renovación', async () => {
    const { c, peticion } = cliente((ruta, init) => {
      if (ruta === '/v1/auth/login') return json(200, sesionOk(1));
      if (ruta === '/v1/auth/refresh') return json(200, sesionOk(2));
      return cabecera(init, 'Authorization') === 'Bearer acceso-2' ? json(200, {}) : json(401, { codigo: 'token-invalido', mensaje: '' });
    });
    await c.iniciarSesion('12345678', 'x');
    await Promise.all([c.solicitar('GET', '/v1/a'), c.solicitar('GET', '/v1/b'), c.solicitar('GET', '/v1/c')]);
    expect(peticion.mock.calls.filter(([r]) => r === '/v1/auth/refresh')).toHaveLength(1);
  });

  test('un 401 tardío usa el token ya renovado sin volver a rotar el refresco', async () => {
    const tardia = respuestaPendiente();
    const { c, peticion } = cliente((ruta, init) => {
      if (ruta === '/v1/auth/login') return json(200, sesionOk(1));
      if (ruta === '/v1/auth/refresh') return json(200, sesionOk(2));
      if (cabecera(init, 'Authorization') === 'Bearer acceso-2') return json(200, {});
      return ruta === '/v1/tardia' ? tardia.promise : json(401);
    });
    await c.iniciarSesion('12345678', 'x');
    const consulta = c.solicitar('GET', '/v1/tardia');
    await c.solicitar('GET', '/v1/inmediata');
    tardia.resolver(json(401));
    await expect(consulta).resolves.toEqual({});
    expect(peticion.mock.calls.filter(([r]) => r === '/v1/auth/refresh')).toHaveLength(1);
  });

  test('una renovación en curso al salir no restaura la sesión y revoca el refresco rotado', async () => {
    const pendiente = respuestaPendiente();
    const { c, peticion, almacen } = cliente((ruta) => {
      if (ruta === '/v1/auth/login') return json(200, sesionOk(1));
      if (ruta === '/v1/auth/refresh') return pendiente.promise;
      return json(204);
    });
    const alIniciarSesion = vi.fn();
    c.configurar({ alIniciarSesion });
    await c.iniciarSesion('12345678', 'x');
    const renovacion = c.renovar();
    await c.cerrarSesion();
    pendiente.resolver(json(200, sesionOk(2)));
    await expect(renovacion).resolves.toBe(false);
    expect(almacen.size).toBe(0);
    expect(alIniciarSesion).toHaveBeenCalledTimes(1);
    expect(peticion.mock.calls.filter(([r]) => r === '/v1/auth/logout').map(([, init]) => JSON.parse(String(init?.body)).tokenRefresco)).toEqual(['refresco-1', 'refresco-2']);
  });

  test('si la renovación falla, borra la sesión, avisa y lanza el 401', async () => {
    const { c, almacen } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(401, { codigo: 'sesion-invalida', mensaje: 'No autenticado' })));
    const expirada = vi.fn();
    c.configurar({ onSesionExpirada: expirada });
    await c.iniciarSesion('12345678', 'x');
    await expect(c.solicitar('GET', '/v1/asociados')).rejects.toMatchObject({ estado: 401 });
    expect(expirada).toHaveBeenCalledOnce();
    expect(almacen.size).toBe(0);
  });

  test('un 403 se propaga sin renovar ni cerrar la sesión', async () => {
    const { c, peticion } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(403, { codigo: 'acceso-denegado', mensaje: 'Acceso denegado' })));
    const expirada = vi.fn();
    c.configurar({ onSesionExpirada: expirada });
    await c.iniciarSesion('12345678', 'x');
    await expect(c.solicitar('GET', '/v1/asociados')).rejects.toMatchObject({ estado: 403, codigo: 'acceso-denegado' });
    expect(expirada).not.toHaveBeenCalled();
    expect(peticion.mock.calls.some(([r]) => r === '/v1/auth/refresh')).toBe(false);
  });

  test('restaurar: con refresco guardado recupera perfil y rol; sin refresco devuelve null', async () => {
    const { c, almacen } = cliente((ruta) => (ruta === '/v1/auth/refresh' ? json(200, sesionOk(3)) : json(200, {})));
    expect(await c.restaurar()).toBeNull();
    almacen.set('sijass.refresco', 'refresco-previo');
    expect(await c.restaurar()).toEqual(yoOk);
    expect(almacen.get('sijass.refresco')).toBe('refresco-3');
  });

  test('cerrar sesión borra el refresco y lo invalida en el servidor', async () => {
    const { c, peticion, almacen } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(204)));
    await c.iniciarSesion('12345678', 'x');
    await c.cerrarSesion();
    expect(almacen.size).toBe(0);
    const logout = peticion.mock.calls.find(([r]) => r === '/v1/auth/logout');
    expect(JSON.parse((logout![1] as RequestInit).body as string)).toEqual({ tokenRefresco: 'refresco-1' });
  });

  test('envía el cuerpo y las cabeceras adicionales (Idempotency-Key) y entiende el 204', async () => {
    const { c, peticion } = cliente((ruta) => (ruta === '/v1/auth/login' ? json(200, sesionOk()) : json(204)));
    await c.iniciarSesion('12345678', 'x');
    expect(await c.solicitar('POST', '/v1/pagos', { importeCentimos: 500 }, { 'Idempotency-Key': 'k-1' })).toBeUndefined();
    const init = peticion.mock.calls[2][1] as RequestInit;
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
    await expect(c.iniciarSesion('12345678', 'x')).resolves.toMatchObject({ perfil: 'personal' });
  });
});
