/** Interfaz de incidencias (s2b): reporte del asociado, bandeja del personal, avatares y menú. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { ClienteApi } from '../api/cliente';
import { Avatar } from '../altiplano/componentes';
import { CANTIDAD_AVATARES, indiceAvatar } from '../altiplano/avatares';
import { ingresarPorDni, respuestaYo } from './ayudas';

beforeAll(async () => {
  await Promise.all([import('../paginas/Personal'), import('../paginas/Portal')]);
});

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

interface Llamada { metodo: string; ruta: string; cuerpo: unknown; cabeceras: Record<string, string> }
type Manejador = (l: Llamada) => Response | undefined;

const ID = '22222222-2222-4222-8222-222222222222';
const ASOCIADO = '11111111-1111-4111-8111-111111111111';
const incidencia = (extra: Record<string, unknown> = {}) => ({
  id: ID, categoria: 'fuga', alcanceReportado: 'varias-viviendas', descripcion: 'Sale agua junto a la escuela', observadaEn: '2026-11-26T12:30:00.000Z',
  ubicacion: 'Camino a la escuela', estado: 'registrada', creadaEn: '2026-11-26T13:05:00.000Z', revision: 1, tieneFoto: false,
  sugerencia: { prioridad: 'alta', regla: 'categoria:fuga/alcance:varias-viviendas', version: 0 }, prioridadConfirmada: null, responsableId: null,
  reportadoPor: { asociadoId: ASOCIADO, nombre: 'Ana Ccori' }, ...extra,
});

function montar(perfil: 'personal' | 'asociado', rol: string | null, manejador: Manejador, inicial = '/') {
  window.history.replaceState(null, '', inicial);
  const llamadas: Llamada[] = [];
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const cuerpo = init?.body instanceof Blob ? init.body : init?.body ? JSON.parse(init.body as string) : undefined;
    const l = { metodo, ruta: String(ruta), cuerpo, cabeceras: (init?.headers ?? {}) as Record<string, string> };
    llamadas.push(l);
    if (l.ruta === '/v1/auth/login') return json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil, rol });
    if (l.ruta === '/v1/yo') return json(200, respuestaYo(perfil, rol));
    return manejador(l) ?? json(404, { codigo: 'no-encontrado', mensaje: 'x' });
  });
  const usuario = userEvent.setup();
  render(<App api={new ClienteApi(peticion as unknown as typeof fetch)} />);
  return { usuario, llamadas };
}

const portalBase: Manejador = ({ ruta }) =>
  ruta === '/v1/portal/saldo' ? json(200, { asociado: { nombre: 'Ana Ccori', estado: 'activo' }, saldoCentimos: 0, periodoActual: '2026-11' })
    : ruta === '/v1/portal/cuotas' ? json(200, { cuotas: [] })
      : ruta === '/v1/portal/pagos' ? json(200, { pagos: [] }) : undefined;

describe('portal — reportar un problema', () => {
  test('tres pasos: qué pasa, a quiénes afecta y el detalle; envía con clave de idempotencia', async () => {
    let creado = false;
    const { usuario, llamadas } = montar('asociado', null, (l) => {
      if (l.ruta.startsWith('/v1/incidencias?')) return json(200, { incidencias: creado ? [incidencia({ categoria: 'calidad-observada' })] : [], siguienteCursor: null });
      if (l.ruta === '/v1/incidencias' && l.metodo === 'POST') { creado = true; return json(201, incidencia({ categoria: 'calidad-observada' })); }
      if (l.ruta.endsWith('/historial?limite=100')) return json(200, { eventos: [{ tipo: 'creada', detalle: { estado: 'registrada' }, creadoEn: '2026-11-26T13:05:00.000Z' }], siguienteCursor: null });
      return portalBase(l);
    }, '/portal/reportes');
    await ingresarPorDni(usuario, 'asociado');
    await usuario.click(await screen.findByRole('link', { name: /Reportar un problema/ }));
    expect(await screen.findByRole('heading', { name: '¿Qué está pasando?' })).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: /Agua turbia/ }));
    expect(await screen.findByRole('heading', { name: '¿A quiénes afecta?' })).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: /Varias casas/ }));
    expect(await screen.findByRole('heading', { name: 'Cuéntanos un poco más' })).toBeVisible();
    await usuario.click(screen.getByRole('button', { name: 'El agua sale con color' }));
    await usuario.click(screen.getByRole('button', { name: /Enviar a mi JASS/ }));
    expect(await screen.findByRole('heading', { name: '¡Enviado a tu JASS!' })).toBeVisible();
    const post = llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/v1/incidencias');
    expect(post?.cuerpo).toMatchObject({ categoria: 'calidad-observada', alcanceReportado: 'varias-viviendas', descripcion: 'El agua sale con color', ubicacion: 'Mi casa' });
    expect(post?.cabeceras['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    await usuario.click(screen.getByRole('link', { name: 'Ver mi reporte' }));
    const reporte = await screen.findByTestId(`mi-reporte-${ID}`);
    expect(within(reporte).getByRole('list', { name: 'Avance: Enviado' })).toBeVisible();
    expect(reporte).toHaveClass('nuevo');
    expect(await within(reporte).findByText('Enviaste el reporte')).toBeVisible();
  });

  test('sin detalle no envía y lo explica; la foto se sube después con If-Match', async () => {
    const { usuario, llamadas } = montar('asociado', null, (l) => {
      if (l.ruta.startsWith('/v1/incidencias?')) return json(200, { incidencias: [], siguienteCursor: null });
      if (l.ruta === '/v1/incidencias' && l.metodo === 'POST') return json(201, incidencia());
      if (l.ruta === `/v1/incidencias/${ID}/foto`) return json(200, { incidenciaId: ID, tipo: 'image/jpeg', tamano: 3, sha256: 'a'.repeat(64), revision: 2 });
      return portalBase(l);
    }, '/portal/reportes');
    await ingresarPorDni(usuario, 'asociado');
    await usuario.click(await screen.findByRole('link', { name: /Reportar un problema/ }));
    await usuario.click(await screen.findByRole('button', { name: /Fuga de agua/ }));
    await usuario.click(await screen.findByRole('button', { name: /Solo mi casa/ }));
    await usuario.click(await screen.findByRole('button', { name: /Enviar a mi JASS/ }));
    expect(await screen.findByText('Toca una frase o escribe qué viste.')).toBeVisible();
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/v1/incidencias')).toBe(false);
    await usuario.type(screen.getByLabelText('¿Qué viste?'), 'Un caño gotea');
    const foto = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'caño.jpg', { type: 'image/jpeg' });
    await usuario.upload(screen.getByLabelText(/Agregar foto/), foto);
    await usuario.click(screen.getByRole('button', { name: /Enviar a mi JASS/ }));
    expect(await screen.findByRole('heading', { name: '¡Enviado a tu JASS!' })).toBeVisible();
    const put = llamadas.find((l) => l.metodo === 'PUT');
    expect(put?.ruta).toBe(`/v1/incidencias/${ID}/foto`);
    expect(put?.cuerpo).toBeInstanceOf(Blob);
    expect(put?.cabeceras['If-Match']).toBe('1');
    expect(put?.cabeceras['Content-Type']).toBe('image/jpeg');
  });
});

describe('panel — bandeja de reportes', () => {
  const panel = (rol: string, extra?: Manejador) => (l: Llamada) => {
    const r = extra?.(l);
    if (r) return r;
    if (l.ruta.startsWith('/v1/incidencias?')) return json(200, { incidencias: [incidencia()], siguienteCursor: null });
    if (l.ruta.endsWith('/historial?limite=100')) return json(200, { eventos: [{ tipo: 'creada', detalle: {}, creadoEn: '2026-11-26T13:05:00.000Z', publico: true }] });
    if (l.ruta === '/v1/equipo' && rol === 'consejo') return json(200, { equipo: [{ usuarioId: '33333333-3333-4333-8333-333333333333', nombre: 'Julia Flores', rol: 'operador', estado: 'activo' }] });
    return undefined;
  };

  test('Operación empieza la atención con la revisión mostrada; un 409 recarga y conserva lo escrito', async () => {
    let revision = 1;
    const { usuario, llamadas } = montar('personal', 'operador', panel('operador', (l) => {
      if (l.ruta === `/v1/incidencias/${ID}/estado`) { revision = 2; return json(200, incidencia({ estado: 'en-atencion', revision })); }
      if (l.ruta === `/v1/incidencias/${ID}/acciones`) return json(409, { codigo: 'revision-desactualizada', mensaje: 'x' });
      if (l.ruta === `/v1/incidencias/${ID}`) return json(200, incidencia({ estado: 'en-atencion', revision: 3 }));
      return undefined;
    }), '/personal/reportes');
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: /^Reportes/ }));
    const ficha = await screen.findByTestId('ficha-reporte');
    expect(within(ficha).getByText('Ana Ccori')).toBeVisible();
    await usuario.click(within(ficha).getByRole('button', { name: /Empezar a atender/ }));
    await waitFor(() => expect(llamadas.find((l) => l.ruta === `/v1/incidencias/${ID}/estado`)?.cuerpo).toEqual({ revision: 1, estado: 'en-atencion' }));
    expect(await screen.findByText(/Reporte en atención/)).toBeVisible();
    await usuario.type(screen.getByLabelText('¿Qué se hizo?'), 'Se cambió la unión');
    await usuario.click(screen.getByRole('button', { name: 'Anotar' }));
    expect(await screen.findByText(/Otra persona cambió este reporte/)).toBeVisible();
    expect(llamadas.find((l) => l.ruta === `/v1/incidencias/${ID}/acciones`)?.cuerpo).toEqual({ revision: 2, descripcion: 'Se cambió la unión', visibilidad: 'publica' });
    expect(screen.getByLabelText('¿Qué se hizo?')).toHaveValue('Se cambió la unión');
    // Tras el 409 la ficha se recarga: el siguiente intento va con la revisión nueva.
    await waitFor(() => expect(llamadas.filter((l) => l.ruta === `/v1/incidencias/${ID}`)).toHaveLength(1));
    await usuario.click(screen.getByRole('button', { name: 'Anotar' }));
    await waitFor(() => expect(llamadas.filter((l) => l.ruta === `/v1/incidencias/${ID}/acciones`).at(-1)?.cuerpo).toEqual({ revision: 3, descripcion: 'Se cambió la unión', visibilidad: 'publica' }));
  });

  test('cambiar la prioridad sugerida pide motivo antes de enviar', async () => {
    const { usuario, llamadas } = montar('personal', 'operador', panel('operador', (l) => (l.ruta === `/v1/incidencias/${ID}/prioridad` ? json(200, incidencia({ prioridadConfirmada: 'media', revision: 2 })) : undefined)), '/personal/reportes');
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: /^Reportes/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Media' }));
    expect(llamadas.some((l) => l.ruta.endsWith('/prioridad'))).toBe(false);
    await usuario.type(screen.getByLabelText('¿Por qué prioridad media?'), 'Solo dos casas');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(llamadas.find((l) => l.ruta.endsWith('/prioridad'))?.cuerpo).toEqual({ revision: 1, prioridad: 'media', motivo: 'Solo dos casas' }));
  });

  test('Tesorería solo consulta; el Consejo elige responsable de su equipo', async () => {
    const tesoreria = montar('personal', 'tesorero', panel('tesorero'), '/personal/reportes');
    await ingresarPorDni(tesoreria.usuario);
    await tesoreria.usuario.click(await screen.findByRole('link', { name: /^Reportes/ }));
    expect(await screen.findByTestId('ficha-reporte')).toHaveTextContent('Tesorería solo puede consultar los reportes.');
    expect(screen.queryByRole('button', { name: /Empezar a atender/ })).not.toBeInTheDocument();
  });

  test('el Consejo asigna responsable con un toque', async () => {
    const { usuario, llamadas } = montar('personal', 'consejo', panel('consejo', (l) => (l.ruta.endsWith('/responsable') ? json(200, incidencia({ responsableId: '33333333-3333-4333-8333-333333333333', revision: 2 })) : undefined)), '/personal/reportes');
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: /^Reportes/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Julia Flores' }));
    await waitFor(() => expect(llamadas.find((l) => l.ruta.endsWith('/responsable'))?.cuerpo).toEqual({ revision: 1, responsableId: '33333333-3333-4333-8333-333333333333' }));
  });

  test('el menú se puede fijar y recuerda la elección; suelto, se cierra al salir el puntero', async () => {
    localStorage.removeItem('sijass.menu-fijado');
    const { usuario } = montar('personal', 'operador', panel('operador'));
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: /^Reportes/ }));
    const riel = screen.getByRole('complementary', { name: 'Menú del panel' });
    const fijar = screen.getByRole('button', { name: 'Fijar menú' });
    expect(fijar).toHaveAttribute('aria-pressed', 'false');
    await usuario.click(fijar);
    expect(screen.getByRole('button', { name: 'Soltar menú' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.esc-panel')).toHaveClass('fijado');
    expect(riel).toHaveClass('abierto');
    expect(localStorage.getItem('sijass.menu-fijado')).toBe('si');
    await usuario.click(screen.getByRole('link', { name: /^Asistente/ }));
    expect(screen.getByRole('link', { name: /^Asistente/ })).toHaveAttribute('aria-current', 'page');
    expect(riel).toHaveClass('abierto');
    await usuario.click(screen.getByRole('button', { name: 'Soltar menú' }));
    expect(localStorage.getItem('sijass.menu-fijado')).toBe('no');
    fireEvent.pointerLeave(riel, { pointerType: 'mouse' });
    await waitFor(() => expect(riel).not.toHaveClass('abierto'));
  });
});

describe('avatares', () => {
  test('el mismo identificador siempre da el mismo avatar y los índices están en el catálogo', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    for (const id of ids) {
      expect(indiceAvatar(id)).toBe(indiceAvatar(id));
      expect(indiceAvatar(id)).toBeGreaterThanOrEqual(0);
      expect(indiceAvatar(id)).toBeLessThan(CANTIDAD_AVATARES);
    }
    expect(new Set(ids.map(indiceAvatar)).size).toBeGreaterThan(8);
  });

  test('el avatar es decorativo y se dibuja igual en dos lugares', () => {
    render(<><Avatar id={ASOCIADO} /><Avatar id={ASOCIADO} tam="xl" /></>);
    const [a, b] = document.querySelectorAll('.avatar-alt');
    expect(a).toHaveAttribute('aria-hidden', 'true');
    expect(a.getAttribute('data-avatar')).toBe(b.getAttribute('data-avatar'));
    expect(a.querySelector('svg')?.innerHTML).toBe(b.querySelector('svg')?.innerHTML);
  });
});
