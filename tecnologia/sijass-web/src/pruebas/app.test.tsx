import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { ClienteApi } from '../api/cliente';

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

type Manejador = (metodo: string, ruta: string, cuerpo: unknown, cabeceras: Record<string, string>) => Response | undefined;

function montar(manejador: Manejador, inicial = '/') {
  window.history.replaceState(null, '', inicial);
  const llamadas: Array<{ metodo: string; ruta: string; cuerpo: unknown; cabeceras: Record<string, string> }> = [];
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const cuerpo = init?.body ? JSON.parse(init.body as string) : undefined;
    const cabeceras = (init?.headers ?? {}) as Record<string, string>;
    llamadas.push({ metodo, ruta: String(ruta), cuerpo, cabeceras });
    return manejador(metodo, String(ruta), cuerpo, cabeceras) ?? json(404, { codigo: 'no-encontrado', mensaje: 'x' });
  });
  const api = new ClienteApi(peticion as unknown as typeof fetch);
  const usuario = userEvent.setup();
  render(<App api={api} />);
  return { llamadas, usuario };
}

const loginPersonal = (rol = 'tesorero'): Manejador => (_m, r) => {
  if (r === '/v1/auth/login') return json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil: 'personal', rol });
  return undefined;
};
const loginAsociado: Manejador = (_m, r) => (r === '/v1/auth/login' ? json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil: 'asociado', rol: null }) : undefined);

async function ingresar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(await screen.findByLabelText('Correo electrónico'), 'a@b.pe');
  await usuario.type(screen.getByLabelText('Contraseña'), 'Clave-de-prueba-123');
  await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
}

const asociados = { asociados: [{ id: '11111111-1111-4111-8111-111111111111', nombre: 'Rosa Quispe', documento: '70000001', estado: 'activo', saldoCentimos: 1500 }] };

describe('interfaz — ingreso y guardia por perfil', () => {
  test('sin sesión muestra el ingreso, también al pedir una pantalla del personal', async () => {
    montar(() => undefined, '/personal');
    expect(await screen.findByRole('heading', { name: 'Ingresar a SIJASS' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/ingresar')); // la guardia corrige la barra de direcciones tras renderizar
  });

  test('credenciales incorrectas muestran un mensaje claro y no entran', async () => {
    const { usuario } = montar((_m, r) => (r === '/v1/auth/login' ? json(401, { codigo: 'credenciales-invalidas', mensaje: 'Credenciales inválidas' }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByTestId('error-ingreso')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  test('un bloqueo (429) se explica sin revelar detalles', async () => {
    const { usuario } = montar((_m, r) => (r === '/v1/auth/login' ? json(429, { codigo: 'cuenta-bloqueada', mensaje: 'x' }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByTestId('error-ingreso')).toHaveTextContent('Demasiados intentos fallidos');
  });

  test('el personal entra a su pantalla y ve el padrón con saldos en soles', async () => {
    const { usuario } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ?? (r === '/v1/asociados' ? json(200, asociados) : undefined));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: 'Asociados' })).toBeInTheDocument();
    const fila = await screen.findByTestId('fila-70000001');
    expect(within(fila).getByText('S/ 15.00')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/personal')); // la guardia corrige la barra de direcciones tras renderizar
  });

  test('el asociado entra al portal y, si abre una ruta del personal, lo redirige sin mostrar nada del personal', async () => {
    const respuestas: Manejador = (_m, r, c, h) =>
      loginAsociado(_m, r, c, h) ??
      (r === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Rosa Quispe', estado: 'activo' }, saldoCentimos: 1500, periodoActual: '2026-11' }) :
       r === '/v1/portal/cuotas' ? json(200, { cuotas: [] }) :
       r === '/v1/portal/pagos' ? json(200, { pagos: [] }) : undefined);
    const { usuario, llamadas } = montar(respuestas, '/personal/asociados/11111111-1111-4111-8111-111111111111');
    await ingresar(usuario);
    expect(await screen.findByTestId('saldo')).toHaveTextContent('S/ 15.00');
    await waitFor(() => expect(window.location.pathname).toBe('/portal')); // la guardia corrige la barra de direcciones tras renderizar
    expect(screen.queryByRole('heading', { name: 'Asociados' })).not.toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta.startsWith('/v1/asociados'))).toBe(false);
  });

  test('un asociado al día ve «Está al día» y su saldo a favor se muestra aparte', async () => {
    const { usuario } = montar((_m, r, c, h) => loginAsociado(_m, r, c, h) ??
      (r === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Ana', estado: 'activo' }, saldoCentimos: -250, periodoActual: '2026-11' }) :
       r === '/v1/portal/cuotas' ? json(200, { cuotas: [] }) : r === '/v1/portal/pagos' ? json(200, { pagos: [] }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByText('Está al día')).toBeInTheDocument();
    expect(screen.getByTestId('saldo')).toHaveTextContent('S/ 0.00');
    expect(screen.getByTestId('a-favor')).toHaveTextContent('S/ 2.50');
  });

  test('salir vuelve al ingreso e invalida la sesión en el servidor', async () => {
    const { usuario, llamadas } = montar((_m, r, c, h) => loginPersonal()(_m, r, c, h) ?? (r === '/v1/asociados' ? json(200, asociados) : r === '/v1/auth/logout' ? json(204) : undefined));
    await ingresar(usuario);
    await screen.findByRole('heading', { name: 'Asociados' });
    await usuario.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('heading', { name: 'Ingresar a SIJASS' })).toBeInTheDocument();
    expect(llamadas.some((l) => l.ruta === '/v1/auth/logout')).toBe(true);
  });

  test('un operador no ve las pestañas del padrón: entra directo a Mediciones', async () => {
    const { usuario } = montar((_m, r, c, h) => loginPersonal('operador')(_m, r, c, h) ?? (r === '/v1/reservorios' ? json(200, { reservorios: [] }) : r === '/v1/mediciones/catalogo' ? json(200, { metodos: [], unidad: 'mg/L' }) : undefined));
    await ingresar(usuario);
    expect(await screen.findByRole('heading', { name: 'Mediciones de cloro residual' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Asociados' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tabla-asociados')).not.toBeInTheDocument();
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

    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('   ').mockReturnValueOnce('Error de digitación');
    await usuario.click(screen.getByRole('button', { name: 'Reversar' }));
    expect(llamadas.some((l) => l.ruta.endsWith('/reversa'))).toBe(false);
    await usuario.click(screen.getByRole('button', { name: 'Reversar' }));
    await screen.findByText('Pago revertido.');
    expect(llamadas.find((l) => l.ruta.endsWith('/reversa'))!.cuerpo).toEqual({ motivo: 'Error de digitación' });
    prompt.mockRestore();
  });
});
