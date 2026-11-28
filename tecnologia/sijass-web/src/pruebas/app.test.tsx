import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { ClienteApi } from '../api/cliente';
import { ingresarPorDni, respuestaYo } from './ayudas';

// Vite transforma los módulos diferidos al primer import. Esa preparación pertenece al setup de jsdom.
beforeAll(async () => {
  await Promise.all([import('../paginas/Personal'), import('../paginas/Portal')]);
});

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

type Manejador = (metodo: string, ruta: string, cuerpo: unknown, cabeceras: Record<string, string>) => Response | undefined;

function montar(manejador: Manejador, inicial = '/', refresco?: string) {
  window.history.replaceState(null, '', inicial);
  if (refresco) sessionStorage.setItem('sijass.refresco', refresco);
  const llamadas: Array<{ metodo: string; ruta: string; cuerpo: unknown; cabeceras: Record<string, string> }> = [];
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const cuerpo = init?.body ? JSON.parse(init.body as string) : undefined;
    const cabeceras = (init?.headers ?? {}) as Record<string, string>;
    llamadas.push({ metodo, ruta: String(ruta), cuerpo, cabeceras });
    return manejador(metodo, String(ruta), cuerpo, cabeceras) ?? (String(ruta) === '/v1/yo' ? json(200, respuestaYo(sesionDePrueba.perfil, sesionDePrueba.rol)) : json(404, { codigo: 'no-encontrado', mensaje: 'x' }));
  });
  const api = new ClienteApi(peticion as unknown as typeof fetch);
  const usuario = userEvent.setup();
  render(<App api={api} />);
  return { llamadas, usuario };
}

/** Perfil con el que respondió el último inicio de sesión simulado: lo usa `GET /v1/yo` por defecto. */
let sesionDePrueba: { perfil: 'personal' | 'asociado'; rol: string | null } = { perfil: 'personal', rol: 'tesorero' };

const loginPersonal = (rol = 'tesorero'): Manejador => (_m, r) => {
  if (r === '/v1/auth/login') {
    sesionDePrueba = { perfil: 'personal', rol };
    return json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil: 'personal', rol });
  }
  return undefined;
};
const loginAsociado: Manejador = (_m, r) => {
  if (r !== '/v1/auth/login') return undefined;
  sesionDePrueba = { perfil: 'asociado', rol: null };
  return json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil: 'asociado', rol: null });
};

const ingresar = (usuario: ReturnType<typeof userEvent.setup>) => ingresarPorDni(usuario);

const ID = '11111111-1111-4111-8111-111111111111';
const CUOTA = '22222222-2222-4222-8222-222222222222';
const asociados = { asociados: [{ id: ID, nombre: 'Rosa Quispe', documento: '70000001', estado: 'activo', saldoCentimos: 1500, acceso: 'sin-acceso' }] };
/** Estado de cuenta de Rosa (una cuota de noviembre pendiente). */
const cuenta = (pagos: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  asociado: { id: ID, nombre: 'Rosa Quispe', documento: '70000001', estado: 'activo' },
  acceso: 'sin-acceso',
  saldoCentimos: 1500,
  periodoActual: '2026-11',
  cuotas: [{ id: CUOTA, periodo: '2026-11', importeCentimos: 1500, pagadoCentimos: 0, pendienteCentimos: 1500, estado: 'pendiente' }],
  pagos,
  ...extra,
});
const menuPersonal = () => within(screen.getByRole('navigation', { name: 'Secciones del personal' }));
const cajon = (nombre: string | RegExp) => screen.findByRole('dialog', { name: nombre });
async function irA(usuario: ReturnType<typeof userEvent.setup>, seccion: string) {
  await usuario.click(await menuPersonal().findByRole('link', { name: seccion }));
}
async function abrirCuenta(usuario: ReturnType<typeof userEvent.setup>) {
  await irA(usuario, 'Asociados');
  await usuario.click(await within(await screen.findByTestId('fila-70000001')).findByRole('button', { name: 'Ver cuenta' }));
  return within(await cajon('Rosa Quispe'));
}

describe('interfaz — ingreso y guardia por perfil', () => {
  test('sin sesión muestra el ingreso, también al pedir una pantalla del personal', async () => {
    montar(() => undefined, '/personal');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/ingresar')); // la guardia corrige la barra de direcciones tras renderizar
  });

  test('credenciales incorrectas muestran un mensaje claro y no entran', async () => {
    const { usuario } = montar((_m, r) => (r === '/v1/auth/login' ? json(401, { codigo: 'credenciales-invalidas', mensaje: 'Credenciales inválidas' }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByTestId('error-ingreso')).toHaveTextContent('Datos de acceso incorrectos');
  });

  test('un bloqueo (429) se explica sin revelar detalles', async () => {
    const { usuario } = montar((_m, r) => (r === '/v1/auth/login' ? json(429, { codigo: 'cuenta-bloqueada', mensaje: 'x' }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByTestId('error-ingreso')).toHaveTextContent('Acceso temporalmente bloqueado');
  });

  test('el personal entra a su inicio y en Asociados ve el padrón con saldos en soles', async () => {
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ?? (r === '/v1/asociados' ? json(200, asociados) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta()) : undefined));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: /Ana\.$/ })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/personal')); // la guardia corrige la barra de direcciones tras renderizar
    await usuario.click(menuPersonal().getByRole('link', { name: 'Asociados' }));
    const fila = await screen.findByTestId('fila-70000001');
    expect(within(fila).getByText('S/ 15.00')).toBeInTheDocument();
    expect(within(fila).getByText('Pendiente')).toBeInTheDocument();
    expect(await within(fila).findByRole('img', { name: 'Noviembre: pendiente' })).toBeInTheDocument();
  });

  test('Tesorería entra a «Mi caja», el perfil refleja el rol autorizado y Cuotas y pagos ofrece generar y registrar', async () => {
    const { usuario } = montar((m, r, c, h) => loginPersonal()(m, r, c, h)
      ?? (r === '/v1/asociados' ? json(200, asociados) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta()) : r === '/v1/yo' ? json(200, { perfil: 'personal', rol: 'tesorero' }) : undefined));
    await ingresar(usuario);
    expect(await menuPersonal().findByRole('link', { name: 'Mi caja' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByTestId('indicador-por-cobrar')).toHaveTextContent('Falta cobrar S/ 15.00');
    expect(menuPersonal().queryByRole('link', { name: 'Equipo' })).toBeNull();
    await usuario.click(screen.getByRole('link', { name: /Mi perfil/ }));
    expect(await screen.findByText('Información de sesión')).toBeVisible();
    await usuario.click(menuPersonal().getByRole('link', { name: 'Cuotas y pagos' }));
    expect(await screen.findByRole('button', { name: 'Generar cuotas' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeVisible();
    expect(await screen.findByTestId('kpi-emitido')).toHaveTextContent('S/ 15.00');
    expect(screen.getByTestId('kpi-pendiente')).toHaveTextContent('S/ 15.00');
  });

  test('el resumen del Consejo calcula sus cifras con el padrón y las lecturas, sin inventar datos', async () => {
    const hace = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const padron = { asociados: [
      { id: 'a1', nombre: 'Rosa Quispe', documento: '1', estado: 'activo', saldoCentimos: 1500, acceso: 'activo' },
      { id: 'a2', nombre: 'Ana Ccori', documento: '2', estado: 'activo', saldoCentimos: 4500, acceso: 'activo' },
      { id: 'a3', nombre: 'Luis Mamani', documento: '3', estado: 'activo', saldoCentimos: 0, acceso: 'activo' },
      { id: 'a4', nombre: 'Pedro Huamán', documento: '4', estado: 'baja', saldoCentimos: 0, acceso: 'sin-acceso' }] };
    const { usuario } = montar((m, r, c, h) => loginPersonal('consejo')(m, r, c, h) ?? (
      r === '/v1/asociados' ? json(200, padron) :
      r === '/v1/reservorios' ? json(200, { reservorios: [{ id: 'r1', nombre: 'La Alameda' }, { id: 'r2', nombre: 'La Loma' }] }) :
      r === '/v1/reservorios/r1/mediciones' ? json(200, { mediciones: [{ id: 'm1', metodo: 'colorimetro', valor: 0.8, unidad: 'mg/L', tomadaEn: hace(35), registradaEn: hace(30), estado: 'vigente' }] }) :
      r === '/v1/reservorios/r2/mediciones' ? json(200, { mediciones: [] }) :
      r.startsWith('/v1/incidencias') ? json(200, { incidencias: [] }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: /Ana\.$/ })).toBeVisible();
    expect(await screen.findByTestId('indicador-por-cobrar')).toHaveTextContent('S/ 60.00');
    expect(screen.getByTestId('indicador-con-saldo')).toHaveTextContent('2 de 3 asociados con saldo');
    const alameda = await screen.findByRole('button', { name: /La Alameda/ });
    expect(alameda).toHaveTextContent('0.8');
    expect(alameda).toHaveTextContent('Colorímetro');
    expect(screen.getByRole('button', { name: /La Loma/ })).toHaveTextContent('Sin lecturas todavía');
    expect(await screen.findByText('No hay reportes abiertos.')).toBeVisible();
  });

  test('mostrar y ocultar la contraseña conserva el campo y no envía el formulario', async () => {
    const { usuario, llamadas } = montar(() => undefined, '/ingresar');
    await usuario.click(await screen.findByRole('button', { name: /Soy administrador/ }));
    const clave = await screen.findByLabelText('Clave');
    await usuario.type(clave, 'solo-prueba');
    await usuario.click(screen.getByRole('button', { name: 'Mostrar clave' }));
    expect(clave).toHaveAttribute('type', 'text');
    await usuario.click(screen.getByRole('button', { name: 'Ocultar clave' }));
    expect(clave).toHaveAttribute('type', 'password');
    expect(clave).toHaveValue('solo-prueba');
    expect(llamadas).toHaveLength(0);
  });

  test('el asociado entra al portal y, si abre una ruta del personal, lo redirige sin mostrar nada del personal', async () => {
    const respuestas: Manejador = (_m, r, c, h) =>
      loginAsociado(_m, r, c, h) ??
      (r === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Rosa Quispe', estado: 'activo' }, saldoCentimos: 1500, periodoActual: '2026-11' }) :
       r === '/v1/portal/cuotas' ? json(200, { cuotas: [] }) :
       r === '/v1/portal/pagos' ? json(200, { pagos: [] }) : undefined);
    const { usuario, llamadas } = montar(respuestas, `/personal/asociados/${ID}`);
    await ingresar(usuario);
    expect(await screen.findByTestId('nombre-asociado')).toHaveTextContent('Rosa');
    await waitFor(() => expect(window.location.pathname).toBe('/portal')); // la guardia corrige la barra de direcciones tras renderizar
    expect(screen.getByTestId('saldo')).toHaveTextContent('S/ 15.00');
    await usuario.click(within(screen.getByRole('navigation', { name: 'Secciones del portal' })).getByRole('link', { name: 'Pagos' }));
    expect(window.location.pathname).toBe('/portal/pagos');
    expect(screen.queryByRole('navigation', { name: 'Secciones del personal' })).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta.startsWith('/v1/asociados'))).toBe(false);
  });

  const portalCompleto = (pagos: unknown[] = []): Manejador => (m, r, c, h) => loginAsociado(m, r, c, h) ??
    (r === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Elena Quispe', estado: 'activo' }, saldoCentimos: 1800, periodoActual: '2026-11' }) :
     r === '/v1/portal/cuotas' ? json(200, { cuotas: [
       { id: 'c2', periodo: '2026-11', importeCentimos: 1800, pagadoCentimos: 0, pendienteCentimos: 1800, estado: 'pendiente' },
       { id: 'c1', periodo: '2026-10', importeCentimos: 1800, pagadoCentimos: 1800, pendienteCentimos: 0, estado: 'pagada' }] }) :
     r === '/v1/portal/pagos' ? json(200, { pagos }) :
     r.startsWith('/v1/incidencias') ? json(200, { incidencias: [], siguienteCursor: null }) :
     r === '/v1/auth/logout' ? json(204) : undefined);
  const pagosMuestra = [
    { id: 'p2', cuotaId: 'c1', periodo: '2026-10', importeCentimos: 1800, pagadoEn: new Date().toISOString(), comprobante: 'RC-1028', estado: 'vigente' },
    { id: 'p1', cuotaId: 'c0', periodo: '2026-09', importeCentimos: 1800, pagadoEn: new Date().toISOString(), comprobante: 'RC-0810', estado: 'revertido' },
  ];
  const menuPortal = () => within(screen.getByRole('navigation', { name: 'Secciones del portal' }));

  test('el inicio del portal saluda por el nombre y muestra el saldo con una gota por mes', async () => {
    const { usuario } = montar(portalCompleto(pagosMuestra));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: /Hola, Elena/ })).toBeVisible();
    expect(await screen.findByText('Tienes 1 cuota por pagar')).toBeVisible();
    expect(screen.getByTestId('saldo')).toHaveTextContent('S/ 18.00');
    expect(screen.getByRole('img', { name: 'Noviembre: pendiente' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Octubre: pagado' })).toBeInTheDocument();
    await usuario.click(menuPortal().getByRole('link', { name: 'Cuotas' }));
    const cuotas = await screen.findByTestId('portal-cuotas');
    expect(cuotas).toHaveTextContent('Noviembre 2026');
    expect(cuotas).toHaveTextContent('Pendiente');
    expect(cuotas).toHaveTextContent('Pagada');
  });

  test('los pagos del portal conservan los revertidos y lo dicen', async () => {
    const { usuario } = montar(portalCompleto(pagosMuestra));
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Pagos' }));
    expect(await screen.findByTestId('portal-pago-RC-1028')).toHaveTextContent('Octubre');
    expect(screen.getByTestId('portal-pago-RC-1028')).not.toHaveTextContent('revertido');
    expect(screen.getByTestId('portal-pago-RC-0810')).toHaveTextContent('revertido');
    expect(screen.getByText(/su importe vuelve al saldo/)).toBeVisible();
  });

  test('sin pagos la pantalla lo explica y sin reportes el inicio invita a reportar', async () => {
    const { usuario } = montar(portalCompleto([]));
    await ingresar(usuario);
    expect(await screen.findByText('Todavía no has reportado nada.')).toBeVisible();
    expect(screen.getByRole('link', { name: /Reportar un problema/ })).toHaveAttribute('href', '/portal/reportar');
    await usuario.click(menuPortal().getByRole('link', { name: 'Pagos' }));
    expect(await screen.findByText('Todavía no hay pagos registrados.')).toBeVisible();
  });

  test('salir desde el perfil pide confirmación y revoca la sesión', async () => {
    const { usuario, llamadas } = montar(portalCompleto());
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Perfil' }));
    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeVisible();
    expect(screen.getByText('Acceso activo')).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'Salir' }));
    await usuario.click(within(screen.getByRole('group', { name: 'Confirmar salida' })).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('group', { name: 'Confirmar salida' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Salir' })).toHaveFocus();
    expect(llamadas.some((l) => l.ruta === '/v1/auth/logout')).toBe(false);
    await usuario.click(screen.getByRole('button', { name: 'Salir' }));
    await usuario.click(screen.getByRole('button', { name: 'Sí, salir' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(llamadas.some((l) => l.ruta === '/v1/auth/logout')).toBe(true);
  });

  test('tocar una cuota del portal muestra su detalle y volver a tocarla lo oculta', async () => {
    const { usuario } = montar(portalCompleto(pagosMuestra));
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Cuotas' }));
    const cuota = await screen.findByRole('button', { name: /Octubre 2026/ });
    expect(cuota).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(cuota);
    const detalle = screen.getByTestId('detalle-cuota');
    expect(detalle).toHaveTextContent('Importe de la cuotaS/ 18.00');
    expect(detalle).toHaveTextContent('PagadoS/ 18.00');
    expect(detalle).toHaveTextContent('Por pagarS/ 0.00');
    await usuario.click(cuota);
    expect(screen.queryByTestId('detalle-cuota')).toBeNull();
  });

  test('los pagos del portal se filtran por periodo y por estado', async () => {
    const antiguo = { id: 'p0', cuotaId: 'c-1', periodo: '2024-01', importeCentimos: 1800, pagadoEn: '2024-01-10T15:00:00.000Z', comprobante: 'RC-0001', estado: 'vigente' };
    const { usuario } = montar(portalCompleto([...pagosMuestra, antiguo]));
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Pagos' }));
    expect(await screen.findByTestId('contador-pagos')).toHaveTextContent('3 pagos');
    await usuario.click(within(screen.getByRole('group', { name: 'Periodo' })).getByRole('button', { name: 'Últimos 6 meses' }));
    expect(screen.queryByTestId('portal-pago-RC-0001')).toBeNull();
    expect(screen.getByTestId('contador-pagos')).toHaveTextContent('2 pagos');
    await usuario.click(within(screen.getByRole('group', { name: 'Estado' })).getByRole('button', { name: 'Revertidos' }));
    expect(screen.queryByTestId('portal-pago-RC-1028')).toBeNull();
    expect(screen.getByTestId('portal-pago-RC-0810')).toBeVisible();
    expect(screen.getByTestId('contador-pagos')).toHaveTextContent('1 pago');
  });

  test('«Actualizar» vuelve a pedir los datos del portal', async () => {
    const { usuario, llamadas } = montar(portalCompleto(pagosMuestra));
    await ingresar(usuario);
    await screen.findByTestId('saldo');
    const pedidos = () => llamadas.filter((l) => l.ruta === '/v1/portal/saldo').length;
    const antes = pedidos();
    await usuario.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(pedidos()).toBe(antes + 1));
  });

  test('el avatar del portal lo elige la persona y se recuerda en el celular', async () => {
    const { usuario } = montar(portalCompleto());
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Perfil' }));
    const avatares = await screen.findByRole('group', { name: 'Avatares' });
    expect(within(avatares).getByRole('button', { name: 'Avatar 1' })).toHaveAttribute('aria-pressed', 'true');
    await usuario.click(within(avatares).getByRole('button', { name: 'Avatar 5' }));
    expect(within(avatares).getByRole('button', { name: 'Avatar 5' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('sijass.avatar-portal')).toBe('4');
    expect(await screen.findByTestId('aviso-ok')).toHaveTextContent('Avatar actualizado');
    localStorage.removeItem('sijass.avatar-portal');
  });

  test('un asociado al día ve «Estás al día» y su saldo a favor se muestra aparte', async () => {
    const { usuario } = montar((_m, r, c, h) => loginAsociado(_m, r, c, h) ??
      (r === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Ana', estado: 'activo' }, saldoCentimos: -250, periodoActual: '2026-11' }) :
       r === '/v1/portal/cuotas' ? json(200, { cuotas: [] }) : r === '/v1/portal/pagos' ? json(200, { pagos: [] }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByText('Estás al día')).toBeInTheDocument();
    expect(screen.getByTestId('saldo')).toHaveTextContent('S/ 0.00');
    expect(screen.getByTestId('a-favor')).toHaveTextContent('S/ 2.50');
  });

  test('salir vuelve al ingreso e invalida la sesión en el servidor', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ?? (r === '/v1/asociados' ? json(200, asociados) : r === '/v1/auth/logout' ? json(204) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta === '/v1/auth/logout')).toBe(true);
  });

  test('un operador no ve las secciones del padrón: entra a «Mi jornada» y no consulta dinero', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal('operador')(_m, r, c, h) ?? (r === '/v1/reservorios' ? json(200, { reservorios: [] }) : r === '/v1/mediciones/catalogo' ? json(200, { metodos: [], unidad: 'mg/L' }) : r.startsWith('/v1/incidencias') ? json(200, { incidencias: [] }) : undefined));
    await ingresar(usuario);
    expect(await menuPersonal().findByRole('link', { name: 'Mi jornada' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByTestId('indicador-lecturas')).toHaveTextContent('0 de 0');
    expect(menuPersonal().queryByRole('link', { name: 'Asociados' })).not.toBeInTheDocument();
    expect(menuPersonal().queryByRole('link', { name: 'Cuotas y pagos' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tabla-asociados')).not.toBeInTheDocument();
    expect(llamadas.some(({ ruta }) => ruta.startsWith('/v1/asociados'))).toBe(false);
  });

  test('un operador no carga una cuenta ajena ni consulta el padrón por URL directa', async () => {
    const { llamadas } = montar((_m, r) => {
      if (r === '/v1/auth/refresh') return json(200, { tokenAcceso: 'a', tokenRefresco: 'r2', perfil: 'personal', rol: 'operador' });
      if (r === '/v1/yo') return json(200, { perfil: 'personal', rol: 'operador' });
      return undefined;
    }, `/personal/asociados/${ID}`, 'r');
    expect(await screen.findByTestId('sin-permiso')).toBeInTheDocument();
    expect(llamadas.some(({ ruta }) => ruta.startsWith('/v1/asociados'))).toBe(false);
  });

  test('perfil consulta el contrato y regresa a la pantalla anterior', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal('consejo')(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r === '/v1/yo' ? json(200, { perfil: 'personal', rol: 'consejo' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await menuPersonal().findByRole('link', { name: 'Asociados' }));
    await screen.findByTestId('fila-70000001');
    await usuario.click(screen.getByRole('link', { name: /Mi perfil/ }));
    expect(await screen.findByText('Información de sesión')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getAllByText('Consejo', { exact: true }).length).toBeGreaterThan(0);
    expect(llamadas.some(({ ruta, metodo }) => ruta === '/v1/yo' && metodo === 'GET')).toBe(true);
    await usuario.click(screen.getByRole('link', { name: 'Volver' }));
    expect(await screen.findByTestId('fila-70000001')).toBeInTheDocument();
  });

  test('dar de baja se confirma dentro de la cuenta: cancelar no escribe y confirmar conserva al asociado', async () => {
    let baja = false;
    const { usuario, llamadas } = montar((_m, r, c, h) => {
      if (r.endsWith('/baja')) { baja = true; return json(204); }
      if (r === '/v1/asociados') return json(200, { asociados: asociados.asociados.map((a) => ({ ...a, estado: baja ? 'baja' : a.estado })) });
      if (r.endsWith('/estado-de-cuenta')) return json(200, cuenta([], { asociado: { ...cuenta().asociado, estado: baja ? 'baja' : 'activo' } }));
      return loginPersonal()(_m, r, c, h);
    });
    await ingresar(usuario);
    const dialogo = await abrirCuenta(usuario);
    await usuario.click(await dialogo.findByRole('button', { name: 'Dar de baja' }));
    await usuario.click(within(dialogo.getByRole('group', { name: 'Confirmar baja' })).getByRole('button', { name: 'Cancelar' }));
    expect(llamadas.filter(({ ruta }) => ruta.endsWith('/baja'))).toHaveLength(0);
    await usuario.click(dialogo.getByRole('button', { name: 'Dar de baja' }));
    await usuario.click(dialogo.getByRole('button', { name: 'Confirmar baja' }));
    expect(await screen.findByTestId('aviso-ok')).toHaveTextContent('Su historial se conserva.');
    expect(await dialogo.findByText(/solo se consulta su historial/)).toBeInTheDocument();
    await usuario.click(dialogo.getAllByRole('button', { name: 'Cerrar' })[0]);
    expect(await within(screen.getByTestId('fila-70000001')).findByText('De baja')).toBeInTheDocument();
  });

  test('crear acceso genera la clave en el servidor, la muestra una sola vez y no la guarda en el navegador', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta()) : r.endsWith('/acceso') ? json(201, { usuarioId: 'u1', claveTemporal: 'rio-luna-maiz' }) : undefined));
    await ingresar(usuario);
    const dialogo = await abrirCuenta(usuario);
    expect(await dialogo.findByText('Aún no tiene acceso')).toBeVisible();
    expect(dialogo.queryByLabelText(/Contraseña|Correo/)).toBeNull();
    await usuario.click(dialogo.getByRole('button', { name: 'Crear acceso' }));
    expect(await dialogo.findByTestId('clave-temporal')).toHaveTextContent('rio-luna-maiz');
    expect(dialogo.getByText(/Se muestra una sola vez/)).toBeVisible();
    expect(dialogo.getByRole('button', { name: 'Copiar' })).toBeVisible();
    expect(dialogo.getByRole('button', { name: 'Imprimir tarjeta' })).toBeVisible();
    // La tarjeta que se imprime cuelga de <body>: así sale sola, fuera del cajón.
    expect(document.body.querySelector(':scope > .tarjeta-impresa')).toHaveTextContent('rio-luna-maiz');
    const alta = llamadas.find(({ ruta }) => ruta.endsWith('/acceso'));
    expect(alta?.cuerpo).toBeUndefined();
    expect(JSON.stringify(sessionStorage) + JSON.stringify(localStorage)).not.toContain('rio-luna-maiz');
    await usuario.click(dialogo.getAllByRole('button', { name: 'Cerrar' })[0]);
    await waitFor(() => expect(screen.queryByTestId('clave-temporal')).toBeNull());
    expect(document.body.querySelector('.tarjeta-impresa')).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe('/personal/asociados'));
  });

  test('un asociado con acceso pide confirmación para restablecer la clave', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, { asociados: [{ ...asociados.asociados[0], acceso: 'activo' }] })
        : r.endsWith('/estado-de-cuenta') ? json(200, cuenta([], { acceso: 'activo' }))
          : r.endsWith('/acceso/restablecer') ? json(200, { usuarioId: 'u1', claveTemporal: 'cima-tela-pozo' }) : undefined));
    await ingresar(usuario);
    const dialogo = await abrirCuenta(usuario);
    await usuario.click(await dialogo.findByRole('button', { name: 'Restablecer clave' }));
    expect(dialogo.queryByRole('button', { name: 'Crear acceso' })).toBeNull();
    expect(llamadas.some(({ ruta }) => ruta.endsWith('/acceso/restablecer'))).toBe(false);
    await usuario.click(dialogo.getByRole('button', { name: 'Sí, restablecer' }));
    expect(await dialogo.findByTestId('clave-temporal')).toHaveTextContent('cima-tela-pozo');
    expect(llamadas.some(({ ruta, metodo }) => metodo === 'POST' && ruta.endsWith('/acceso/restablecer'))).toBe(true);
  });

  test('crear acceso: documento que no es DNI y documento con acceso se explican sin códigos técnicos', async () => {
    let codigo = 'documento-no-es-dni';
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta())
        : r.endsWith('/acceso') ? json(codigo === 'documento-no-es-dni' ? 422 : 409, { codigo, mensaje: 'x' }) : undefined));
    await ingresar(usuario);
    const dialogo = await abrirCuenta(usuario);
    await usuario.click(await dialogo.findByRole('button', { name: 'Crear acceso' }));
    expect(await dialogo.findByRole('alert')).toHaveTextContent('no es un DNI de 8 números');
    codigo = 'documento-con-acceso';
    await usuario.click(dialogo.getByRole('button', { name: 'Crear acceso' }));
    await waitFor(() => expect(dialogo.getByRole('alert')).toHaveTextContent('Ese DNI ya tiene un acceso'));
    expect(screen.queryByText(/documento-con-acceso|409|422/)).toBeNull();
  });
});

describe('interfaz — registro de pagos', () => {
  const pagoVigente = { id: '33333333-3333-4333-8333-333333333333', cuotaId: CUOTA, periodo: '2026-11', importeCentimos: 500, pagadoEn: '2026-11-19T15:00:00.000Z', comprobante: 'REC-1', estado: 'vigente' };

  async function cobrar(usuario: ReturnType<typeof userEvent.setup>) {
    await ingresar(usuario);
    await irA(usuario, 'Asociados');
    const fila = await screen.findByTestId('fila-70000001');
    await usuario.click(await within(fila).findByRole('button', { name: 'Cobrar' }));
    return within(await cajon('Registrar pago'));
  }

  test('registra un pago con importe en soles → céntimos, comprobante y Idempotency-Key', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r === `/v1/asociados/${ID}/estado-de-cuenta` ? json(200, cuenta()) :
       r === '/v1/pagos' ? json(201, { id: 'p' }) : undefined));
    const dialogo = await cobrar(usuario);
    expect(dialogo.getByRole('button', { name: 'Rosa Quispe' })).toHaveAttribute('aria-pressed', 'true');
    expect(dialogo.getByRole('button', { name: /Noviembre 2026, pendiente S\/ 15\.00/ })).toHaveAttribute('aria-pressed', 'true');
    const importe = dialogo.getByLabelText('Importe (S/)');
    expect(importe).toHaveValue('15.00');
    await usuario.clear(importe);
    await usuario.type(importe, '5,00');
    await usuario.type(dialogo.getByLabelText('Número de comprobante'), 'REC-0001');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar pago' }));
    expect(await dialogo.findByText('Pago registrado', { selector: 'h3' })).toBeVisible();
    const envio = llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/v1/pagos')!;
    expect(envio.cuerpo).toEqual({ cuotaId: CUOTA, importeCentimos: 500, comprobante: 'REC-0001' });
    expect(envio.cabeceras['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('un importe inválido o mayor que lo pendiente no envía nada y lo explica junto al campo', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r === `/v1/asociados/${ID}/estado-de-cuenta` ? json(200, cuenta()) : undefined));
    const dialogo = await cobrar(usuario);
    const importe = dialogo.getByLabelText('Importe (S/)');
    await usuario.clear(importe);
    await usuario.type(importe, '1.234');
    await usuario.type(dialogo.getByLabelText('Número de comprobante'), 'X');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar pago' }));
    expect(await dialogo.findByRole('alert')).toHaveTextContent('importe mayor que 0');
    await usuario.clear(importe);
    await usuario.type(importe, '20');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar pago' }));
    expect(await dialogo.findByRole('alert')).toHaveTextContent('No puede superar lo pendiente: S/ 15.00');
    expect(llamadas.some((l) => l.ruta === '/v1/pagos')).toBe(false);
  });

  test('si el servidor rechaza el pago (422), se muestra su mensaje y los datos se conservan para corregir', async () => {
    const { usuario } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r === `/v1/asociados/${ID}/estado-de-cuenta` ? json(200, cuenta()) :
       r === '/v1/pagos' ? json(422, { codigo: 'sobrepago', mensaje: 'sobrepago: el importe supera el saldo pendiente de la cuota' }) : undefined));
    const dialogo = await cobrar(usuario);
    await usuario.type(dialogo.getByLabelText('Número de comprobante'), 'REC-9');
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar pago' }));
    expect(await dialogo.findByTestId('aviso-error')).toHaveTextContent('sobrepago');
    expect(dialogo.getByLabelText('Número de comprobante')).toHaveValue('REC-9');
  });

  test('revertir pide un motivo y lo envía; sin motivo no envía nada', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r === `/v1/asociados/${ID}/estado-de-cuenta` ? json(200, cuenta([pagoVigente])) :
       r === `/v1/pagos/${pagoVigente.id}/reversa` ? json(200, { pagoId: pagoVigente.id }) : undefined));
    await ingresar(usuario);
    const cuentaAbierta = await abrirCuenta(usuario);
    await usuario.click(await within(await cuentaAbierta.findByTestId('pago-REC-1')).findByRole('button', { name: 'Revertir' }));
    const dialogo = within(await cajon('Revertir un pago'));
    await usuario.type(dialogo.getByLabelText('Motivo (obligatorio)'), '   ');
    await usuario.click(dialogo.getByRole('button', { name: 'Revertir pago' }));
    expect(dialogo.getByRole('alert')).toHaveTextContent('1 a 300 caracteres');
    expect(llamadas.some((l) => l.ruta.endsWith('/reversa'))).toBe(false);
    await usuario.clear(dialogo.getByLabelText('Motivo (obligatorio)'));
    await usuario.type(dialogo.getByLabelText('Motivo (obligatorio)'), ' Error de digitación ');
    await usuario.click(dialogo.getByRole('button', { name: 'Revertir pago' }));
    expect(await screen.findByTestId('aviso-ok')).toHaveTextContent('Pago revertido.');
    expect(llamadas.find((l) => l.ruta.endsWith('/reversa'))!.cuerpo).toEqual({ motivo: 'Error de digitación' });
  });

  test('el motivo y la fecha de una reversa se ven desde la lista de pagos y desde la cuenta', async () => {
    const revertido = { ...pagoVigente, estado: 'revertido' };
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta([revertido]))
        : r === `/v1/pagos/${pagoVigente.id}` ? json(200, { ...revertido, reversa: { motivo: 'Pago duplicado', creadaEn: '2026-11-20T15:00:00.000Z' } }) : undefined));
    await ingresar(usuario);
    await irA(usuario, 'Cuotas y pagos');
    const boton = await screen.findByRole('button', { name: 'Motivo de la reversa del pago REC-1' });
    expect(llamadas.some((l) => l.ruta === `/v1/pagos/${pagoVigente.id}`)).toBe(false);
    await usuario.click(boton);
    const motivo = await screen.findByTestId(`motivo-${pagoVigente.id}`);
    await waitFor(() => expect(motivo).toHaveTextContent('Pago duplicado'));
    expect(motivo).toHaveTextContent('20/11');
    await usuario.click(boton);
    expect(screen.queryByTestId(`motivo-${pagoVigente.id}`)).toBeNull();
    const cuentaAbierta = await abrirCuenta(usuario);
    await usuario.click(await cuentaAbierta.findByRole('button', { name: 'Motivo de la reversa del pago REC-1' }));
    expect(await cuentaAbierta.findByText('Pago duplicado')).toBeVisible();
  });

  test('el padrón filtra a los activos y a los dados de baja', async () => {
    const dos = { asociados: [...asociados.asociados, { id: '99999999-9999-4999-8999-999999999999', nombre: 'Luis Baja', documento: '70000009', estado: 'baja', saldoCentimos: 0, acceso: 'sin-acceso' }] };
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, dos) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta()) : undefined));
    await ingresar(usuario);
    await irA(usuario, 'Asociados');
    const filtros = within(await screen.findByRole('group', { name: 'Filtrar' }));
    await usuario.click(filtros.getByRole('button', { name: /^De baja/ }));
    expect(screen.getByTestId('fila-70000009')).toBeVisible();
    expect(screen.queryByTestId('fila-70000001')).toBeNull();
    await usuario.click(filtros.getByRole('button', { name: /^Activos/ }));
    expect(screen.getByTestId('fila-70000001')).toBeVisible();
    expect(screen.queryByTestId('fila-70000009')).toBeNull();
  });

  test('el resumen del Consejo muestra las últimas lecturas y «Actualizar» vuelve a pedir los datos', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal('consejo')(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta())
        : r === '/v1/reservorios' ? json(200, { reservorios: [{ id: 'r1', nombre: 'Reservorio Alto' }] })
          : r === '/v1/reservorios/r1/mediciones' ? json(200, { mediciones: [{ id: 'm1', metodo: 'comparador-dpd', valor: 0.8, unidad: 'mg/L', tomadaEn: '2026-11-20T15:00:00.000Z', estado: 'vigente' }] })
            : r.startsWith('/v1/incidencias') ? json(200, { incidencias: [] }) : undefined));
    await ingresar(usuario);
    const actividad = await screen.findByRole('region', { name: /Actividad reciente/ });
    expect(actividad).toHaveTextContent('Lectura de Reservorio Alto');
    expect(actividad).toHaveTextContent('0.8 mg/L');
    expect(await screen.findByText(/Última actualización/)).toBeVisible();
    const pedidos = () => llamadas.filter((l) => l.ruta === '/v1/asociados').length;
    const antes = pedidos();
    await usuario.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(pedidos()).toBe(antes + 1));
  });

  test('un pago revertido se conserva en el historial y ya no ofrece revertir', async () => {
    const revertido = { ...pagoVigente, estado: 'revertido' };
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r.endsWith('/estado-de-cuenta') ? json(200, cuenta([revertido])) : undefined));
    await ingresar(usuario);
    await irA(usuario, 'Cuotas y pagos');
    const fila = await screen.findByTestId('pago-REC-1');
    expect(fila).toHaveTextContent('Revertido');
    expect(within(fila).queryByRole('button', { name: /^Revertir/ })).toBeNull();
  });

  test('una reversa en conflicto no anuncia éxito y vuelve a leer las cuentas', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r.endsWith('/estado-de-cuenta') ? json(200, cuenta([pagoVigente])) :
       r.endsWith('/reversa') ? json(409, { codigo: 'ya-revertido' }) : undefined));
    await ingresar(usuario);
    await irA(usuario, 'Cuotas y pagos');
    await usuario.click(await screen.findByRole('button', { name: 'Revertir el pago REC-1' }));
    const dialogo = within(await cajon('Revertir un pago'));
    await usuario.type(dialogo.getByLabelText('Motivo (obligatorio)'), 'Registro duplicado');
    await usuario.click(dialogo.getByRole('button', { name: 'Revertir pago' }));
    expect(await dialogo.findByTestId('aviso-error')).toHaveTextContent('ya fue revertido');
    expect(screen.queryByTestId('aviso-ok')).not.toBeInTheDocument();
    await waitFor(() => expect(llamadas.filter(({ ruta }) => ruta.endsWith('/estado-de-cuenta')).length).toBeGreaterThanOrEqual(2));
  });
});
