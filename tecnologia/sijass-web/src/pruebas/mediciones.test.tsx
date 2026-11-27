import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { ClienteApi } from '../api/cliente';
import { ingresarPorDni, respuestaYo } from './ayudas';
import { ahoraEnLima, formatearInstante, parsearValor, tomadaEnLima } from '../lib/medicion';

// Vite transforma los módulos diferidos al primer import. Esa preparación pertenece al setup de jsdom.
beforeAll(async () => {
  await Promise.all([import('../paginas/Personal')]);
});

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

const RES_ID = '44444444-4444-4444-8444-444444444444';
const catalogo = { metodos: [{ codigo: 'comparador-dpd', descripcion: 'Comparador de color con reactivo DPD' }, { codigo: 'colorimetro', descripcion: 'Colorímetro' }], unidad: 'mg/L' };
const medicion = { id: 'm1', reservorioId: RES_ID, metodo: 'comparador-dpd', valor: 0.65, unidad: 'mg/L', tomadaEn: '2026-11-19T14:00:00.000Z', registradaEn: '2026-11-19T15:00:00.000Z', registradoPor: 'u', estado: 'vigente', revision: 1 };

type Llamada = { metodo: string; ruta: string; cuerpo: unknown; cabeceras: Record<string, string> };

function montar(rol: string, opciones: { reservorios?: unknown[]; mediciones?: unknown[]; historial403?: boolean } = {}) {
  window.history.replaceState(null, '', '/');
  const llamadas: Llamada[] = [];
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const r = String(ruta);
    const cuerpo = init?.body ? JSON.parse(init.body as string) : undefined;
    llamadas.push({ metodo, ruta: r, cuerpo, cabeceras: (init?.headers ?? {}) as Record<string, string> });
    if (r === '/v1/auth/login') return json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil: 'personal', rol });
    if (r === '/v1/yo') return json(200, respuestaYo('personal', rol));
    if (r === '/v1/reservorios' && metodo === 'GET') return json(200, { reservorios: opciones.reservorios ?? [{ id: RES_ID, nombre: 'Reservorio Central' }] });
    if (r === '/v1/reservorios' && metodo === 'POST') return json(201, { id: 'nuevo', nombre: 'x', jassId: 'j' });
    if (r === '/v1/mediciones/catalogo') return json(200, catalogo);
    if (r === `/v1/reservorios/${RES_ID}/mediciones`) return opciones.historial403 ? json(403, { codigo: 'acceso-denegado', mensaje: 'Acceso denegado' }) : json(200, { mediciones: opciones.mediciones ?? [medicion] });
    if (r === '/v1/mediciones' && metodo === 'POST') return json(201, { medicionId: 'm2', revision: 1, registradaEn: '2026-11-19T15:00:00.000Z' });
    if (r === '/v1/asociados') return json(200, { asociados: [] });
    if (r.startsWith('/v1/incidencias')) return json(200, { incidencias: [] });
    return json(404, { codigo: 'no-encontrado', mensaje: 'x' });
  });
  const usuario = userEvent.setup();
  render(<App api={new ClienteApi(peticion as unknown as typeof fetch)} />);
  return { llamadas, usuario };
}

const ingresar = (usuario: ReturnType<typeof userEvent.setup>) => ingresarPorDni(usuario);

describe('conversión de lo que escribe la persona', () => {
  test.each([['0.65', 0.65], ['0,5', 0.5], ['1', 1], ['0', 0], [' 2.125 ', 2.125], ['999.999', 999.999]])('valor «%s» → %s', (t, v) => expect(parsearValor(t)).toBe(v));
  test.each(['', 'abc', '-1', '1.2345', '1000', '1,2,3', '1e2', '.5', '5.', 'NaN'])('valor «%s» no es válido', (t) => expect(parsearValor(t)).toBeNull());

  test('la hora de Lima se envía con desplazamiento explícito y equivale a UTC+5h', () => {
    const t = tomadaEnLima('2026-11-19T09:30')!;
    expect(t).toBe('2026-11-19T09:30:00-05:00');
    expect(new Date(t).toISOString()).toBe('2026-11-19T14:30:00.000Z');
    expect(tomadaEnLima('2026-11-19 09:30')).toBeNull();
    expect(tomadaEnLima('')).toBeNull();
  });

  test('ahoraEnLima precarga la hora de Lima, también al cruzar la medianoche UTC', () => {
    expect(ahoraEnLima(new Date('2026-11-19T15:00:00Z'))).toBe('2026-11-19T10:00');
    expect(ahoraEnLima(new Date('2026-11-20T03:30:00Z'))).toBe('2026-11-19T22:30');
  });

  test('formatearInstante muestra la hora de Lima', () => {
    expect(formatearInstante('2026-11-19T14:00:00.000Z')).toMatch(/09:00|9:00/);
  });
});

const irAlAgua = async (usuario: ReturnType<typeof userEvent.setup>) => {
  await usuario.click(await screen.findByRole('link', { name: 'El agua' }));
  await screen.findByRole('heading', { name: 'El agua' });
};
const abrirLectura = async (usuario: ReturnType<typeof userEvent.setup>) => {
  await usuario.click(await screen.findByRole('button', { name: 'Registrar lectura' }));
  return within(await screen.findByRole('dialog', { name: 'Nueva lectura' }));
};

describe('interfaz de «El agua»', () => {
  test('el operador ve el reservorio con su foto, sus lecturas y el aviso de no dictamen; no ve el padrón', async () => {
    const { usuario } = montar('operador');
    await ingresar(usuario);
    await irAlAgua(usuario);
    expect(screen.getByRole('button', { name: /Reservorio Central/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByTestId('tabla-mediciones')).toHaveTextContent('0.65 mg/L');
    expect(screen.getByTestId('tabla-mediciones')).toHaveTextContent('Comparador DPD');
    expect(screen.getByTestId('aviso-no-dictamen')).toHaveTextContent('no califica el agua');
    expect(screen.queryByRole('link', { name: 'Asociados' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar cuotas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo reservorio' })).not.toBeInTheDocument();
  });

  test('registra la lectura con valor decimal, unidad, hora de Lima con desplazamiento e Idempotency-Key, y refresca el historial', async () => {
    const { usuario, llamadas } = montar('operador');
    await ingresar(usuario);
    await irAlAgua(usuario);
    const cajon = await abrirLectura(usuario);
    expect(cajon.getByRole('form', { name: 'Registrar medición' })).toBeInTheDocument();
    expect(cajon.getByRole('button', { name: 'Reservorio Central' })).toHaveAttribute('aria-pressed', 'true');
    await usuario.click(await cajon.findByRole('button', { name: 'Colorímetro' }));
    await usuario.type(cajon.getByLabelText('Cloro residual (mg/L)'), '0,8');
    const toma = cajon.getByLabelText(/Fecha y hora de la toma/);
    await usuario.clear(toma);
    await usuario.type(toma, '2026-11-19T09:30');
    await usuario.click(cajon.getByRole('button', { name: 'Guardar lectura' }));
    expect(await screen.findByTestId('aviso-ok')).toHaveTextContent('Lectura guardada');
    const envio = llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/v1/mediciones')!;
    expect(envio.cuerpo).toEqual({ reservorioId: RES_ID, metodo: 'colorimetro', valor: 0.8, unidad: 'mg/L', tomadaEn: '2026-11-19T09:30:00-05:00' });
    expect(envio.cabeceras['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(llamadas.filter((l) => l.ruta === `/v1/reservorios/${RES_ID}/mediciones`).length).toBeGreaterThanOrEqual(2));
  });

  test('un valor inválido no envía nada y lo explica junto al campo', async () => {
    const { usuario, llamadas } = montar('operador');
    await ingresar(usuario);
    await irAlAgua(usuario);
    const cajon = await abrirLectura(usuario);
    await cajon.findByRole('button', { name: 'Colorímetro' });
    await usuario.type(cajon.getByLabelText('Cloro residual (mg/L)'), '1.2345');
    await usuario.click(cajon.getByRole('button', { name: 'Guardar lectura' }));
    expect(await cajon.findByRole('alert')).toHaveTextContent('Escribe un número de 0 en adelante');
    expect(cajon.getByLabelText('Cloro residual (mg/L)')).toHaveAttribute('aria-invalid', 'true');
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/v1/mediciones')).toBe(false);
  });

  test('un rechazo del servidor (422) muestra su mensaje y conserva lo escrito', async () => {
    window.history.replaceState(null, '', '/');
    const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => {
      const r = String(ruta);
      if (r === '/v1/auth/login') return json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil: 'personal', rol: 'operador' });
      if (r === '/v1/yo') return json(200, respuestaYo('personal', 'operador'));
      if (r === '/v1/reservorios') return json(200, { reservorios: [{ id: RES_ID, nombre: 'Reservorio Central' }] });
      if (r === '/v1/mediciones/catalogo') return json(200, catalogo);
      if (r === `/v1/reservorios/${RES_ID}/mediciones`) return json(200, { mediciones: [] });
      if (r.startsWith('/v1/incidencias')) return json(200, { incidencias: [] });
      if (r === '/v1/mediciones' && init?.method === 'POST') return json(422, { codigo: 'toma-posterior-a-recepcion', mensaje: 'toma-posterior-a-recepcion' });
      return json(404, {});
    });
    const usuario = userEvent.setup();
    render(<App api={new ClienteApi(peticion as unknown as typeof fetch)} />);
    await ingresar(usuario);
    await irAlAgua(usuario);
    expect(await screen.findByText('Sin lecturas todavía', { selector: 'b' })).toBeVisible();
    const cajon = await abrirLectura(usuario);
    await cajon.findByRole('button', { name: 'Colorímetro' });
    await usuario.type(cajon.getByLabelText('Cloro residual (mg/L)'), '0.5');
    await usuario.click(cajon.getByRole('button', { name: 'Guardar lectura' }));
    expect(await cajon.findByTestId('aviso-error')).toHaveTextContent('toma-posterior-a-recepcion');
    expect(cajon.getByLabelText('Cloro residual (mg/L)')).toHaveValue('0.5');
  });

  test('el Consejo ve el historial, no registra lecturas y puede crear reservorios', async () => {
    const { usuario, llamadas } = montar('consejo');
    await ingresar(usuario);
    await irAlAgua(usuario);
    expect(await screen.findByTestId('tabla-mediciones')).toHaveTextContent('0.65 mg/L');
    expect(screen.queryByRole('button', { name: 'Registrar lectura' })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Nuevo reservorio' }));
    const cajon = within(await screen.findByRole('dialog', { name: 'Nuevo reservorio' }));
    await usuario.type(cajon.getByLabelText('Nombre del reservorio'), 'Reservorio Norte');
    await usuario.click(cajon.getByRole('button', { name: 'Crear reservorio' }));
    expect(await screen.findByTestId('aviso-ok')).toHaveTextContent('Reservorio Norte quedó creado');
    expect(llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/v1/reservorios')!.cuerpo).toEqual({ nombre: 'Reservorio Norte' });
  });

  test('Tesorería ve el historial sin registrar lecturas ni crear reservorios', async () => {
    const { usuario } = montar('tesorero');
    await ingresar(usuario);
    await irAlAgua(usuario);
    expect(await screen.findByTestId('tabla-mediciones')).toHaveTextContent('0.65 mg/L');
    expect(screen.queryByRole('button', { name: 'Registrar lectura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo reservorio' })).not.toBeInTheDocument();
  });

  test('sin reservorios se explica qué hacer según el rol', async () => {
    const { usuario } = montar('operador', { reservorios: [] });
    await ingresar(usuario);
    await irAlAgua(usuario);
    expect(await screen.findByTestId('sin-reservorios')).toHaveTextContent('Pide al Consejo');
  });

  test('si el servidor niega el historial (403) se muestra un aviso y ningún dato', async () => {
    const { usuario } = montar('operador', { historial403: true });
    await ingresar(usuario);
    await irAlAgua(usuario);
    expect(await screen.findByText('Su rol no tiene acceso a este historial.')).toBeInTheDocument();
    expect(screen.queryByTestId('tabla-mediciones')).not.toBeInTheDocument();
  });

  test('no existe ningún control de dosis ni de estimación por imagen', async () => {
    const { usuario } = montar('operador');
    await ingresar(usuario);
    await irAlAgua(usuario);
    const cajon = await abrirLectura(usuario);
    await cajon.findByRole('button', { name: 'Colorímetro' });
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/dosis (recomendada|sugerida)|calcular dosis|subir foto|fotograf/i);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(cajon.getByText(/no mide ni califica el agua/)).toBeInTheDocument();
  });
});
