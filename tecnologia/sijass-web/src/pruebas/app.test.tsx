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

const asociados = { asociados: [{ id: '11111111-1111-4111-8111-111111111111', nombre: 'Rosa Quispe', documento: '70000001', estado: 'activo', saldoCentimos: 1500 }] };

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

  test('el personal entra a su pantalla y ve el padrón con saldos en soles', async () => {
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ?? (r === '/v1/asociados' ? json(200, asociados) : undefined));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: 'Asociados' })).toBeInTheDocument();
    const fila = await screen.findByTestId('fila-70000001');
    expect(within(fila).getByText('S/ 15.00')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/personal')); // la guardia corrige la barra de direcciones tras renderizar
  });

  test('el panel de tesorería prioriza el padrón y el perfil refleja el rol autorizado', async () => {
    const { usuario } = montar((m, r, c, h) => loginPersonal()(m, r, c, h)
      ?? (r === '/v1/asociados' ? json(200, asociados) : r === '/v1/yo' ? json(200, { perfil: 'personal', rol: 'tesorero' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('link', { name: 'Resumen' }));
    expect(await screen.findByRole('link', { name: 'Abrir asociados' })).toHaveAttribute('href', '/personal/asociados');
    const nav = screen.getByRole('navigation', { name: 'Secciones del personal' });
    await usuario.click(within(nav).getByRole('link', { name: 'Mi perfil' }));
    expect(await screen.findByText('Información de sesión')).toBeVisible();
    expect(screen.queryByText('Operaciones de campo')).toBeNull();
    await usuario.click(within(nav).getByRole('link', { name: 'Cuotas y pagos' }));
    expect(await screen.findByRole('form', { name: 'Generar cuotas del periodo' })).toBeVisible();
    expect(await screen.findByRole('combobox', { name: 'Asociado' })).toBeVisible();
  });

  test('el dashboard calcula sus indicadores con el padrón y las lecturas, sin inventar datos', async () => {
    const hace = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const padron = { asociados: [
      { id: 'a1', nombre: 'Rosa Quispe', documento: '1', estado: 'activo', saldoCentimos: 1500 },
      { id: 'a2', nombre: 'Ana Ccori', documento: '2', estado: 'activo', saldoCentimos: 4500 },
      { id: 'a3', nombre: 'Luis Mamani', documento: '3', estado: 'activo', saldoCentimos: 0 },
      { id: 'a4', nombre: 'Pedro Huamán', documento: '4', estado: 'baja', saldoCentimos: 0 }] };
    const { usuario } = montar((m, r, c, h) => loginPersonal('tesorero')(m, r, c, h) ?? (
      r === '/v1/asociados' ? json(200, padron) :
      r === '/v1/reservorios' ? json(200, { reservorios: [{ id: 'r1', nombre: 'La Alameda' }, { id: 'r2', nombre: 'La Loma' }] }) :
      r === '/v1/reservorios/r1/mediciones' ? json(200, { mediciones: [{ id: 'm1', metodo: 'colorimetro', valor: 0.8, unidad: 'mg/L', tomadaEn: hace(35), registradaEn: hace(30), estado: 'vigente' }] }) :
      r === '/v1/reservorios/r2/mediciones' ? json(200, { mediciones: [] }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('link', { name: 'Resumen' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard general' })).toBeVisible();
    expect(await screen.findByTestId('indicador-activos')).toHaveTextContent('3');
    expect(screen.getByTestId('indicador-por-cobrar')).toHaveTextContent('S/ 60.00');
    expect(screen.getByTestId('indicador-con-saldo')).toHaveTextContent('2');
    expect(await screen.findByTestId('indicador-reservorios')).toHaveTextContent('2');
    expect(await screen.findByText('Sin lecturas registradas')).toBeVisible();
    expect(screen.getByText(/0\.8 mg\/L · hace 35 min/)).toBeVisible();
    expect(screen.queryByText(/Incidencias/i)).not.toBeInTheDocument();
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
    const { usuario, llamadas } = montar(respuestas, '/personal/asociados/11111111-1111-4111-8111-111111111111');
    await ingresar(usuario);
    expect(await screen.findByTestId('nombre-asociado')).toHaveTextContent('Rosa');
    await waitFor(() => expect(window.location.pathname).toBe('/portal')); // la guardia corrige la barra de direcciones tras renderizar
    await usuario.click(within(screen.getByRole('navigation', { name: 'Secciones del portal' })).getByRole('link', { name: 'Pagos' }));
    expect(await screen.findByTestId('saldo')).toHaveTextContent('S/ 15.00');
    expect(window.location.pathname).toBe('/portal/pagos');
    expect(screen.queryByRole('heading', { name: 'Asociados' })).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta.startsWith('/v1/asociados'))).toBe(false);
  });

  const portalCompleto = (pagos: unknown[] = []): Manejador => (m, r, c, h) => loginAsociado(m, r, c, h) ??
    (r === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Elena Quispe', estado: 'activo' }, saldoCentimos: 1800, periodoActual: '2026-11' }) :
     r === '/v1/portal/cuotas' ? json(200, { cuotas: [
       { id: 'c2', periodo: '2026-11', importeCentimos: 1800, pagadoCentimos: 0, pendienteCentimos: 1800, estado: 'pendiente' },
       { id: 'c1', periodo: '2026-10', importeCentimos: 1800, pagadoCentimos: 1800, pendienteCentimos: 0, estado: 'pagada' }] }) :
     r === '/v1/portal/pagos' ? json(200, { pagos }) :
     r === '/v1/auth/logout' ? json(204) : undefined);
  const pagosMuestra = [
    { id: 'p2', cuotaId: 'c1', periodo: '2026-10', importeCentimos: 1800, pagadoEn: new Date().toISOString(), comprobante: 'RC-1028', estado: 'vigente' },
    { id: 'p1', cuotaId: 'c0', periodo: '2026-09', importeCentimos: 1800, pagadoEn: new Date().toISOString(), comprobante: 'RC-0810', estado: 'revertido' },
  ];
  const menuPortal = () => within(screen.getByRole('navigation', { name: 'Secciones del portal' }));

  test('el inicio del portal saluda por el nombre y destaca la cuota pendiente más antigua', async () => {
    const { usuario } = montar(portalCompleto(pagosMuestra));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: /Hola, Elena/ })).toBeVisible();
    const cuota = screen.getByRole('region', { name: 'Cuota pendiente' });
    expect(within(cuota).getByText('Cuota de noviembre')).toBeVisible();
    expect(within(cuota).getByText('S/ 18.00')).toBeVisible();
    await usuario.click(within(cuota).getByRole('button', { name: 'Ver cuota' }));
    expect(await screen.findByRole('dialog', { name: 'Detalle de la cuota' })).toBeVisible();
    expect(screen.getByTestId('detalle-importe')).toHaveTextContent('S/ 18.00');
  });

  test('el historial del portal filtra por estado y conserva los pagos revertidos', async () => {
    const { usuario } = montar(portalCompleto(pagosMuestra));
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Pagos' }));
    await usuario.click(await screen.findByRole('link', { name: 'Ver historial' }));
    expect(await screen.findByTestId('portal-pago-RC-1028')).toHaveTextContent('Vigente');
    expect(screen.getByTestId('portal-pago-RC-0810')).toHaveTextContent('Revertido');
    expect(screen.getByText('2 pagos')).toBeVisible();
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'revertido');
    expect(screen.queryByTestId('portal-pago-RC-1028')).not.toBeInTheDocument();
    expect(screen.getByText('1 pago')).toBeVisible();
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'vigente');
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), 'todo');
    expect(screen.getByTestId('portal-pago-RC-1028')).toBeVisible();
  });

  test('sin pagos el historial lo explica y la pantalla de reportes avisa que aún no está disponible', async () => {
    const { usuario } = montar(portalCompleto([]));
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Pagos' }));
    await usuario.click(await screen.findByRole('link', { name: 'Ver historial' }));
    expect(await screen.findByText('Sin pagos en este periodo')).toBeVisible();
    await usuario.click(menuPortal().getByRole('link', { name: 'Reportes' }));
    expect(await screen.findByText('Próximamente')).toBeVisible();
  });

  test('cerrar sesión desde el perfil pide confirmación y revoca la sesión', async () => {
    const { usuario, llamadas } = montar(portalCompleto());
    await ingresar(usuario);
    await screen.findByTestId('nombre-asociado');
    await usuario.click(menuPortal().getByRole('link', { name: 'Perfil' }));
    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeVisible();
    expect(screen.getByText('Acceso activo')).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cerrar sesión' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(llamadas.some((l) => l.ruta === '/v1/auth/logout')).toBe(false);
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Cerrar sesión' })).getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(llamadas.some((l) => l.ruta === '/v1/auth/logout')).toBe(true);
  });

  test('un asociado al día ve «Está al día» y su saldo a favor se muestra aparte', async () => {
    const { usuario } = montar((_m, r, c, h) => loginAsociado(_m, r, c, h) ??
      (r === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Ana', estado: 'activo' }, saldoCentimos: -250, periodoActual: '2026-11' }) :
       r === '/v1/portal/cuotas' ? json(200, { cuotas: [] }) : r === '/v1/portal/pagos' ? json(200, { pagos: [] }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByText('Estás al día')).toBeInTheDocument();
    await usuario.click(within(screen.getByRole('navigation', { name: 'Secciones del portal' })).getByRole('link', { name: 'Pagos' }));
    expect(await screen.findByTestId('saldo')).toHaveTextContent('S/ 0.00');
    expect(screen.getByTestId('a-favor')).toHaveTextContent('S/ 2.50');
  });

  test('salir vuelve al ingreso e invalida la sesión en el servidor', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ?? (r === '/v1/asociados' ? json(200, asociados) : r === '/v1/auth/logout' ? json(204) : undefined));
    await ingresar(usuario);
    await screen.findByRole('heading', { name: 'Asociados' });
    await usuario.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta === '/v1/auth/logout')).toBe(true);
  });

  test('un operador no ve las pestañas del padrón: entra directo a Mediciones', async () => {
    const { usuario } = montar((_m, r, c, h) => loginPersonal('operador')(_m, r, c, h) ?? (r === '/v1/reservorios' ? json(200, { reservorios: [] }) : r === '/v1/mediciones/catalogo' ? json(200, { metodos: [], unidad: 'mg/L' }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: 'Mediciones de cloro residual' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Asociados' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tabla-asociados')).not.toBeInTheDocument();
  });

  test('un operador no carga una cuenta ajena ni consulta el padrón por URL directa', async () => {
    const { llamadas } = montar((_m, r) => {
      if (r === '/v1/auth/refresh') return json(200, { tokenAcceso: 'a', tokenRefresco: 'r2', perfil: 'personal', rol: 'operador' });
      if (r === '/v1/yo') return json(200, { perfil: 'personal', rol: 'operador' });
      return undefined;
    }, '/personal/asociados/11111111-1111-4111-8111-111111111111', 'r');
    expect(await screen.findByTestId('sin-permiso')).toBeInTheDocument();
    expect(llamadas.some(({ ruta }) => ruta.startsWith('/v1/asociados'))).toBe(false);
  });

  test('perfil consulta el contrato y regresa a la pantalla anterior', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal('consejo')(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r === '/v1/yo' ? json(200, { perfil: 'personal', rol: 'consejo' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('link', { name: /^Mi perfil$/ }));
    expect(await screen.findByText('Información de sesión')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('Consejo', { exact: true })).toBeInTheDocument();
    expect(llamadas.some(({ ruta, metodo }) => ruta === '/v1/yo' && metodo === 'GET')).toBe(true);
    await usuario.click(screen.getByRole('link', { name: '← Volver' }));
    expect(await screen.findByTestId('fila-70000001')).toBeInTheDocument();
  });

  test('el modal de baja cancela sin escribir y al confirmar conserva el asociado en el padrón', async () => {
    let baja = false;
    const { usuario, llamadas } = montar((_m, r, c, h) => {
      if (r.endsWith('/baja')) { baja = true; return json(204); }
      if (r === '/v1/asociados') return json(200, { asociados: asociados.asociados.map((a) => ({ ...a, estado: baja ? 'baja' : a.estado })) });
      return loginPersonal()(_m, r, c, h);
    });
    await ingresar(usuario);
    const abrir = await screen.findByRole('button', { name: 'Dar de baja' });
    await usuario.click(abrir);
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(llamadas.filter(({ ruta }) => ruta.endsWith('/baja'))).toHaveLength(0);
    await usuario.click(abrir);
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar baja' }));
    expect(await screen.findByTestId('aviso-ok')).toHaveTextContent('Su historial de cuotas y pagos se conserva.');
    const fila = screen.getByTestId('fila-70000001');
    expect(await within(fila).findByText('De baja')).toBeInTheDocument();
    expect(within(fila).getByRole('button', { name: 'Ver cuenta' })).toBeInTheDocument();
  });

  test('crear acceso genera la clave en el servidor, la muestra una sola vez y no la guarda en el navegador', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, { asociados: [{ ...asociados.asociados[0], acceso: 'sin-acceso' }] }) : r.endsWith('/acceso') ? json(201, { usuarioId: 'u1', claveTemporal: 'rio-luna-maiz' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Crear acceso' }));
    const confirmacion = within(screen.getByRole('dialog'));
    expect(confirmacion.queryByLabelText(/Contraseña|Correo/)).toBeNull();
    await usuario.click(confirmacion.getByRole('button', { name: 'Crear acceso' }));
    const entrega = await screen.findByRole('dialog', { name: 'Acceso creado' });
    expect(within(entrega).getByTestId('clave-temporal')).toHaveTextContent('rio-luna-maiz');
    expect(within(entrega).getByText(/no se podrá ver de nuevo/i)).toBeVisible();
    expect(within(entrega).getByRole('button', { name: /Copiar/ })).toBeVisible();
    expect(within(entrega).getByRole('button', { name: /Imprimir tarjeta/ })).toBeVisible();
    const alta = llamadas.find(({ ruta }) => ruta.endsWith('/acceso'));
    expect(alta?.cuerpo).toBeUndefined();
    expect(JSON.stringify(sessionStorage)).not.toContain('rio-luna-maiz');
    await usuario.click(within(entrega).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText('rio-luna-maiz')).toBeNull();
    expect(await screen.findByText(/Se creó el acceso de Rosa Quispe/)).toBeVisible();
  });

  test('un asociado con acceso ofrece restablecer la clave y los conflictos se explican en lenguaje común', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, { asociados: [{ ...asociados.asociados[0], acceso: 'activo' }] })
        : r.endsWith('/acceso/restablecer') ? json(200, { usuarioId: 'u1', claveTemporal: 'cima-tela-pozo' }) : undefined));
    await ingresar(usuario);
    expect(screen.queryByRole('button', { name: 'Crear acceso' })).toBeNull();
    await usuario.click(await screen.findByRole('button', { name: 'Restablecer clave' }));
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restablecer clave' }));
    expect(await screen.findByTestId('clave-temporal')).toHaveTextContent('cima-tela-pozo');
    expect(llamadas.some(({ ruta, metodo }) => metodo === 'POST' && ruta.endsWith('/acceso/restablecer'))).toBe(true);
  });

  test('crear acceso: documento que no es DNI y documento con acceso se explican sin códigos técnicos', async () => {
    let codigo = 'documento-no-es-dni';
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, { asociados: [{ ...asociados.asociados[0], acceso: 'sin-acceso' }] })
        : r.endsWith('/acceso') ? json(codigo === 'documento-no-es-dni' ? 422 : 409, { codigo, mensaje: 'x' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Crear acceso' }));
    const modal = within(screen.getByRole('dialog'));
    await usuario.click(modal.getByRole('button', { name: 'Crear acceso' }));
    expect(await modal.findByRole('alert')).toHaveTextContent('no es un DNI de 8 números');
    codigo = 'documento-con-acceso';
    await usuario.click(modal.getByRole('button', { name: 'Crear acceso' }));
    await waitFor(() => expect(modal.getByRole('alert')).toHaveTextContent('Ese DNI ya tiene un acceso'));
    expect(screen.queryByText(/documento-con-acceso|409|422/)).toBeNull();
  });
});

describe('interfaz — registro de pagos', () => {
  const idAsociado = '11111111-1111-4111-8111-111111111111';
  const cuenta = (pagos: unknown[] = []) => ({
    asociado: { id: idAsociado, nombre: 'Rosa Quispe', documento: '70000001', estado: 'activo' },
    saldoCentimos: 1500,
    periodoActual: '2026-11',
    cuotas: [{ id: '22222222-2222-4222-8222-222222222222', periodo: '2026-11', importeCentimos: 1500, pagadoCentimos: 0, pendienteCentimos: 1500, estado: 'pendiente' }],
    pagos,
  });

  test('registra un pago con importe en soles → céntimos, comprobante y Idempotency-Key; reintento estable, otra clave si cambia el contenido', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r === `/v1/asociados/${idAsociado}/estado-de-cuenta` ? json(200, cuenta()) :
       r === '/v1/pagos' ? json(201, { id: 'p' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Ver cuenta' }));
    await screen.findByRole('heading', { name: 'Rosa Quispe' });

    await usuario.selectOptions(screen.getByLabelText('Cuota'), '22222222-2222-4222-8222-222222222222');
    await usuario.type(screen.getByLabelText('Importe (S/)'), '5,00');
    await usuario.type(screen.getByLabelText('Comprobante'), 'REC-0001');
    await usuario.click(screen.getByRole('button', { name: 'Registrar pago' }));
    await screen.findByText(/Pago de S\/ 5\.00 registrado/);

    const envio = llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/v1/pagos')!;
    expect(envio.cuerpo).toEqual({ cuotaId: '22222222-2222-4222-8222-222222222222', importeCentimos: 500, comprobante: 'REC-0001' });
    expect(envio.cabeceras['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('un importe inválido no envía nada y explica el error', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) : r === `/v1/asociados/${idAsociado}/estado-de-cuenta` ? json(200, cuenta()) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Ver cuenta' }));
    await screen.findByRole('heading', { name: 'Rosa Quispe' });
    await usuario.selectOptions(screen.getByLabelText('Cuota'), '22222222-2222-4222-8222-222222222222');
    await usuario.type(screen.getByLabelText('Importe (S/)'), '1.234');
    await usuario.type(screen.getByLabelText('Comprobante'), 'X');
    await usuario.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(await screen.findByTestId('aviso-error')).toHaveTextContent('importe válido');
    expect(llamadas.some((l) => l.ruta === '/v1/pagos')).toBe(false);
  });

  test('si el servidor rechaza el pago (422), se muestra su mensaje y los datos se conservan para corregir', async () => {
    const { usuario } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r === `/v1/asociados/${idAsociado}/estado-de-cuenta` ? json(200, cuenta()) :
       r === '/v1/pagos' ? json(422, { codigo: 'sobrepago', mensaje: 'sobrepago: el importe supera el saldo pendiente de la cuota' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Ver cuenta' }));
    await screen.findByRole('heading', { name: 'Rosa Quispe' });
    await usuario.selectOptions(screen.getByLabelText('Cuota'), '22222222-2222-4222-8222-222222222222');
    await usuario.type(screen.getByLabelText('Importe (S/)'), '99');
    await usuario.type(screen.getByLabelText('Comprobante'), 'REC-9');
    await usuario.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(await screen.findByTestId('aviso-error')).toHaveTextContent('sobrepago');
    expect(screen.getByLabelText('Comprobante')).toHaveValue('REC-9');
  });

  test('reversar pide un motivo y lo envía; sin motivo no envía nada', async () => {
    const pago = { id: '33333333-3333-4333-8333-333333333333', cuotaId: 'c', periodo: '2026-11', importeCentimos: 500, pagadoEn: '2026-11-19T15:00:00.000Z', comprobante: 'REC-1', estado: 'vigente' };
    const { usuario, llamadas } = montar((_m, r, c, h) =>
      loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r === `/v1/asociados/${idAsociado}/estado-de-cuenta` ? json(200, cuenta([pago])) :
       r === `/v1/pagos/${pago.id}/reversa` ? json(200, { pagoId: pago.id }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Ver cuenta' }));
    await screen.findByRole('heading', { name: 'Rosa Quispe' });

    await usuario.click(screen.getByRole('button', { name: 'Reversar' }));
    const dialogo = within(screen.getByRole('dialog'));
    await usuario.type(dialogo.getByLabelText('Motivo de la reversa'), '   ');
    await usuario.click(dialogo.getByRole('button', { name: 'Confirmar reversa' }));
    expect(dialogo.getByRole('alert')).toHaveTextContent('1 a 300 caracteres');
    expect(llamadas.some((l) => l.ruta.endsWith('/reversa'))).toBe(false);
    await usuario.clear(dialogo.getByLabelText('Motivo de la reversa'));
    await usuario.type(dialogo.getByLabelText('Motivo de la reversa'), ' Error de digitación ');
    await usuario.click(dialogo.getByRole('button', { name: 'Confirmar reversa' }));
    await screen.findByText('Pago revertido.');
    expect(llamadas.find((l) => l.ruta.endsWith('/reversa'))!.cuerpo).toEqual({ motivo: 'Error de digitación' });
  });

  test('el detalle de un pago revertido conserva el comprobante y muestra datos de auditoría', async () => {
    const pago = { id: 'p-1', cuotaId: 'c', periodo: '2026-11', importeCentimos: 500, pagadoEn: '2026-11-19T15:00:00.000Z', comprobante: 'REC-1', estado: 'revertido' };
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r.endsWith('/estado-de-cuenta') ? json(200, cuenta([pago])) :
       r === '/v1/pagos/p-1' ? json(200, { ...pago, reversa: { motivo: 'Pago duplicado', creadaEn: '2026-11-20T15:00:00.000Z' } }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Ver cuenta' }));
    const abrir = await screen.findByRole('button', { name: 'Ver detalle' });
    await usuario.click(abrir);
    const dialogo = within(screen.getByRole('dialog'));
    expect(await dialogo.findByText('Pago duplicado')).toBeInTheDocument();
    expect(dialogo.getByText('REC-1')).toBeInTheDocument();
    expect(dialogo.queryByRole('button', { name: 'Reversar pago' })).not.toBeInTheDocument();
    await usuario.click(dialogo.getByRole('button', { name: 'Volver al historial' }));
    expect(abrir).toHaveFocus();
  });

  test('una reversa en conflicto ofrece volver al historial y no anuncia éxito', async () => {
    const pago = { id: 'p-1', cuotaId: 'c', periodo: '2026-11', importeCentimos: 500, pagadoEn: '2026-11-19T15:00:00.000Z', comprobante: 'REC-1', estado: 'vigente' };
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ??
      (r === '/v1/asociados' ? json(200, asociados) :
       r.endsWith('/estado-de-cuenta') ? json(200, cuenta([pago])) :
       r.endsWith('/reversa') ? json(409, { codigo: 'ya-revertido' }) : undefined));
    await ingresar(usuario);
    await usuario.click(await screen.findByRole('button', { name: 'Ver cuenta' }));
    await usuario.click(await screen.findByRole('button', { name: 'Reversar' }));
    const dialogo = within(screen.getByRole('dialog'));
    await usuario.type(dialogo.getByLabelText('Motivo de la reversa'), 'Registro duplicado');
    await usuario.click(dialogo.getByRole('button', { name: 'Confirmar reversa' }));
    expect(await dialogo.findByRole('alert')).toHaveTextContent('ya fue revertido');
    expect(screen.queryByTestId('aviso-ok')).not.toBeInTheDocument();
    await waitFor(() => expect(llamadas.filter(({ ruta }) => ruta.endsWith('/estado-de-cuenta'))).toHaveLength(2));
  });
});
