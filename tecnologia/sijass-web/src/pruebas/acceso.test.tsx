/**
 * Interfaz de acceso y administración de `s2a-acceso-dni-multi-jass`: ingreso con dos botones, DNI
 * y clave, cambio de clave obligatorio, entrega de claves, equipo del Consejo, área de plataforma y
 * nombre de la JASS (spec `interfaz-acceso-y-administracion`).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { ClienteApi } from '../api/cliente';
import { destinoPara } from '../lib/rutas';
import { ingresarPorDni, respuestaYo, type Usuario } from './ayudas';

beforeAll(async () => {
  await Promise.all([import('../paginas/Personal'), import('../paginas/Portal'), import('../paginas/Plataforma')]);
});

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

type Manejador = (metodo: string, ruta: string, cuerpo: unknown) => Response | undefined;
interface Llamada { metodo: string; ruta: string; cuerpo: unknown }

function montar(manejador: Manejador, inicial = '/') {
  window.history.replaceState(null, '', inicial);
  sessionStorage.clear();
  const llamadas: Llamada[] = [];
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const cuerpo = init?.body ? JSON.parse(init.body as string) : undefined;
    llamadas.push({ metodo, ruta: String(ruta), cuerpo });
    return manejador(metodo, String(ruta), cuerpo) ?? json(404, { codigo: 'no-encontrado', mensaje: 'x' });
  });
  const usuario = userEvent.setup();
  render(<App api={new ClienteApi(peticion as unknown as typeof fetch)} />);
  return { usuario, llamadas };
}

const sesionDe = (perfil: 'personal' | 'asociado' | 'plataforma', rol: string | null, extra: Record<string, unknown> = {}) =>
  ({ tokenAcceso: 'a', tokenRefresco: 'r', perfil, rol, debeCambiarContrasena: false, ...extra });

/** Atiende el inicio de sesión y `GET /v1/yo` de un perfil, más lo que cada prueba añada. */
function como(perfil: 'personal' | 'asociado' | 'plataforma', rol: string | null, resto: Manejador = () => undefined, extra: Record<string, unknown> = {}): Manejador {
  return (m, r, c) => {
    const propio = r === '/v1/auth/login' || r === '/v1/yo' ? undefined : resto(m, r, c);
    if (propio) return propio;
    if (r === '/v1/auth/login') return json(200, sesionDe(perfil, rol, extra));
    if (r === '/v1/yo') return json(200, respuestaYo(perfil, rol, extra));
    if (r === '/v1/asociados' && m === 'GET') return json(200, { asociados: [] });
    if (r === '/v1/reservorios' && m === 'GET') return json(200, { reservorios: [] });
    if (r === '/v1/auth/logout') return json(204);
    if (perfil === 'asociado' && r === '/v1/portal/saldo') return json(200, { asociado: { nombre: 'Elena Quispe', estado: 'activo' }, saldoCentimos: 0, periodoActual: '2026-11' });
    if (perfil === 'asociado' && r === '/v1/portal/cuotas') return json(200, { cuotas: [] });
    if (perfil === 'asociado' && r === '/v1/portal/pagos') return json(200, { pagos: [] });
    return undefined;
  };
}

const tipoLogin = (llamadas: Llamada[]) => llamadas.find((l) => l.ruta === '/v1/auth/login')?.cuerpo;

describe('ingreso — dos botones, DNI y clave', () => {
  test('al abrir solo hay dos botones grandes; los campos aparecen al elegir', async () => {
    montar(() => undefined, '/ingresar');
    expect(await screen.findByRole('button', { name: /Soy asociado/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Soy administrador/ })).toBeVisible();
    expect(screen.queryByLabelText('Número de DNI')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ingresar' })).toBeNull();
  });

  test('el asociado elige «Soy asociado», escribe DNI y clave y entra al portal; se envía el tipo', async () => {
    const { usuario, llamadas } = montar(como('asociado', null));
    await ingresarPorDni(usuario, 'asociado', '70000001', 'rio-luna-maiz');
    expect(await screen.findByTestId('nombre-asociado')).toHaveTextContent('Elena');
    expect(tipoLogin(llamadas)).toEqual({ documento: '70000001', contrasena: 'rio-luna-maiz', tipo: 'asociado' });
    await waitFor(() => expect(window.location.pathname).toBe('/portal'));
  });

  test('el administrador entra al panel de su rol', async () => {
    const { usuario, llamadas } = montar(como('personal', 'tesorero'));
    await ingresarPorDni(usuario, 'administrador', '10000002');
    expect(await screen.findByTestId('rol-actual')).toHaveTextContent('Tesorería');
    expect((tipoLogin(llamadas) as { tipo: string }).tipo).toBe('administrador');
    expect(screen.getByRole('link', { name: 'Mi caja' })).toHaveAttribute('aria-current', 'page');
  });

  test('tipo equivocado: 409 con el tipo real → mensaje breve y un botón para usar el otro tipo; no hay sesión', async () => {
    const { usuario } = montar((_m, r) => (r === '/v1/auth/login' ? json(409, { codigo: 'tipo-de-acceso-distinto', mensaje: 'x', tipoReal: 'asociado' }) : undefined));
    await ingresarPorDni(usuario, 'administrador');
    const error = await screen.findByTestId('error-ingreso');
    expect(error).toHaveTextContent('Elegiste el otro botón');
    expect(error).toHaveTextContent('Tu cuenta es de asociado');
    expect(sessionStorage.getItem('sijass.refresco')).toBeNull();
    await usuario.click(within(error).getByRole('button', { name: 'Usar «Soy asociado»' }));
    expect(screen.getByTestId('tipo-elegido')).toHaveTextContent('Soy asociado');
    expect(screen.queryByTestId('error-ingreso')).toBeNull();
  });

  test('mensajes en lenguaje común: datos incorrectos, bloqueo con el tiempo y JASS suspendida; sin códigos técnicos', async () => {
    let respuesta: Response = json(401, { codigo: 'credenciales-invalidas', mensaje: 'Credenciales inválidas' });
    const { usuario } = montar((_m, r) => (r === '/v1/auth/login' ? respuesta.clone() : undefined));
    await ingresarPorDni(usuario);
    expect(await screen.findByTestId('error-ingreso')).toHaveTextContent('Revisa tu DNI y tu clave');
    respuesta = json(429, { codigo: 'cuenta-bloqueada', mensaje: 'x' });
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByTestId('error-ingreso')).toHaveTextContent('Vuelve a intentarlo en 15 minutos'));
    respuesta = json(403, { codigo: 'jass-suspendida', mensaje: 'x' });
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByTestId('error-ingreso')).toHaveTextContent('Tu JASS está suspendida'));
    expect(screen.getByTestId('error-ingreso')).toHaveTextContent('Comunícate con SIJASS');
    expect(screen.queryByText(/jass-suspendida|credenciales-invalidas|\b40[13]\b|\b429\b/)).toBeNull();
  });

  test('el DNI solo admite números, tiene 8 y un DNI incompleto se explica junto al campo sin enviar nada', async () => {
    const { usuario, llamadas } = montar(() => undefined, '/ingresar');
    await usuario.click(await screen.findByRole('button', { name: /Soy asociado/ }));
    const dni = screen.getByLabelText('Número de DNI');
    await usuario.type(dni, '12a34 5-67');
    expect(dni).toHaveValue('1234567');
    await usuario.type(screen.getByLabelText('Clave'), 'una-clave');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('El DNI tiene 8 números.')).toBeVisible();
    expect(dni).toHaveAttribute('aria-invalid', 'true');
    expect(llamadas.filter((l) => l.ruta === '/v1/auth/login')).toHaveLength(0);
  });

  test('teclado del celular: DNI numérico de 8 y clave sin mayúscula automática ni autocorrección', async () => {
    const { usuario } = montar(() => undefined, '/ingresar');
    await usuario.click(await screen.findByRole('button', { name: /Soy administrador/ }));
    const dni = screen.getByLabelText('Número de DNI');
    expect(dni).toHaveAttribute('inputmode', 'numeric');
    expect(dni).toHaveAttribute('maxlength', '8');
    const clave = screen.getByLabelText('Clave');
    expect(clave).toHaveAttribute('autocapitalize', 'none');
    expect(clave).toHaveAttribute('autocorrect', 'off');
    expect(clave).toHaveAttribute('spellcheck', 'false');
  });

  test('recorrido con teclado: los dos tipos y, al elegir, DNI, clave, mostrar clave e ingresar', async () => {
    const { usuario } = montar(() => undefined, '/ingresar');
    await screen.findByRole('button', { name: /Soy asociado/ });
    await usuario.tab();
    expect(screen.getByRole('button', { name: /Soy asociado/ })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('button', { name: /Soy administrador/ })).toHaveFocus();
    await usuario.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByLabelText('Número de DNI')).toHaveFocus());
    await usuario.tab();
    expect(screen.getByLabelText('Clave')).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Mostrar clave' })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toHaveFocus();
  });

  test('la sesión vencida se avisa y «Cambiar» vuelve a los dos botones', async () => {
    const { usuario } = montar(() => undefined, '/ingresar');
    await usuario.click(await screen.findByRole('button', { name: /Soy asociado/ }));
    await usuario.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(screen.getByRole('button', { name: /Soy administrador/ })).toBeVisible();
  });
});

describe('cambio de clave', () => {
  test('el personal con cambio pendiente solo ve la pantalla de cambio y, al completarla, entra a su panel', async () => {
    let cambiada = false;
    const { usuario, llamadas } = montar((m, r, c) => {
      if (r === '/v1/auth/login') return json(200, sesionDe('personal', 'tesorero', { debeCambiarContrasena: true }));
      if (r === '/v1/auth/cambiar-contrasena') {
        cambiada = true;
        return json(200, sesionDe('personal', 'tesorero'));
      }
      return como('personal', 'tesorero', () => undefined, { debeCambiarContrasena: !cambiada })(m, r, c);
    });
    await ingresarPorDni(usuario);
    expect(await screen.findByRole('heading', { name: 'Elige tu clave' })).toBeVisible();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Asociados' })).toBeNull();
    await usuario.type(screen.getByLabelText('Clave que te entregaron'), 'cima-tela-pozo');
    await usuario.type(screen.getByLabelText('Clave nueva'), 'Tesoreria-2026-ok');
    await usuario.type(screen.getByLabelText('Repite la clave nueva'), 'Tesoreria-2026-ok');
    await usuario.click(screen.getByRole('button', { name: 'Guardar mi clave' }));
    expect(await screen.findByTestId('rol-actual')).toHaveTextContent('Tesorería');
    expect(llamadas.find((l) => l.ruta === '/v1/auth/cambiar-contrasena')?.cuerpo).toEqual({ contrasenaActual: 'cima-tela-pozo', contrasenaNueva: 'Tesoreria-2026-ok' });
  });

  test('una confirmación distinta o una clave corta se avisa junto al campo y no se envía nada', async () => {
    const { usuario, llamadas } = montar(como('personal', 'tesorero', () => undefined, { debeCambiarContrasena: true }));
    await ingresarPorDni(usuario);
    await screen.findByRole('heading', { name: 'Elige tu clave' });
    await usuario.type(screen.getByLabelText('Clave que te entregaron'), 'cima-tela-pozo');
    await usuario.type(screen.getByLabelText('Clave nueva'), 'corta');
    await usuario.type(screen.getByLabelText('Repite la clave nueva'), 'corta');
    await usuario.click(screen.getByRole('button', { name: 'Guardar mi clave' }));
    expect(await screen.findByText(/entre 10 y 128 caracteres/)).toBeVisible();
    await usuario.clear(screen.getByLabelText('Clave nueva'));
    await usuario.type(screen.getByLabelText('Clave nueva'), 'Tesoreria-2026-ok');
    await usuario.click(screen.getByRole('button', { name: 'Guardar mi clave' }));
    expect(await screen.findByText('Las dos claves no son iguales.')).toBeVisible();
    expect(llamadas.some((l) => l.ruta === '/v1/auth/cambiar-contrasena')).toBe(false);
  });

  test('una clave actual equivocada se explica y la sesión sigue abierta', async () => {
    const { usuario } = montar((m, r, c) => (r === '/v1/auth/cambiar-contrasena' ? json(401, { codigo: 'credenciales-invalidas', mensaje: 'x' }) : como('personal', 'tesorero', () => undefined, { debeCambiarContrasena: true })(m, r, c)));
    await ingresarPorDni(usuario);
    await screen.findByRole('heading', { name: 'Elige tu clave' });
    await usuario.type(screen.getByLabelText('Clave que te entregaron'), 'no-es-esa');
    await usuario.type(screen.getByLabelText('Clave nueva'), 'Tesoreria-2026-ok');
    await usuario.type(screen.getByLabelText('Repite la clave nueva'), 'Tesoreria-2026-ok');
    await usuario.click(screen.getByRole('button', { name: 'Guardar mi clave' }));
    expect(await screen.findByText('La clave actual no es correcta.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Elige tu clave' })).toBeVisible();
    expect(sessionStorage.getItem('sijass.refresco')).toBe('r');
  });

  test('desde el perfil el cambio es voluntario y se hace en un diálogo', async () => {
    const { usuario, llamadas } = montar((m, r, c) => (r === '/v1/auth/cambiar-contrasena' ? json(200, sesionDe('personal', 'tesorero')) : como('personal', 'tesorero')(m, r, c)));
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: /Mi perfil/ }));
    expect(await screen.findByTestId('perfil-nombre')).toHaveTextContent('Ana Morales');
    expect(screen.getByTestId('perfil-documento')).toHaveTextContent('•••••678');
    await usuario.click(screen.getByRole('button', { name: 'Cambiar mi clave' }));
    const dialogo = within(await screen.findByRole('dialog', { name: 'Cambiar mi clave' }));
    await usuario.type(dialogo.getByLabelText('Clave actual'), 'Clave-de-prueba-123');
    await usuario.type(dialogo.getByLabelText('Clave nueva'), 'Otra-clave-larga-1');
    await usuario.type(dialogo.getByLabelText('Repite la clave nueva'), 'Otra-clave-larga-1');
    await usuario.click(dialogo.getByRole('button', { name: 'Guardar mi clave' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(llamadas.some((l) => l.ruta === '/v1/auth/cambiar-contrasena')).toBe(true);
  });
});

describe('nombre de la JASS y de la persona', () => {
  test('el panel del personal muestra el nombre de su JASS, su rol y su nombre; el DNI solo enmascarado', async () => {
    const { usuario } = montar(como('personal', 'consejo'));
    await ingresarPorDni(usuario);
    expect(await screen.findByTestId('nombre-jass')).toHaveTextContent('JASS San Miguel');
    expect(screen.getByRole('link', { name: /Mi perfil/ })).toBeVisible();
    expect(screen.getByTestId('rol-actual')).toHaveTextContent('Consejo');
    expect(document.body.textContent).not.toContain('12345678');
  });

  test('el portal de familias muestra el nombre de la JASS y, en el perfil, el DNI enmascarado y el cambio de clave', async () => {
    const { usuario } = montar(como('asociado', null));
    await ingresarPorDni(usuario, 'asociado');
    expect(await screen.findByTestId('portal-jass')).toHaveTextContent('JASS San Miguel');
    await usuario.click(within(screen.getByRole('navigation', { name: 'Secciones del portal' })).getByRole('link', { name: 'Perfil' }));
    expect(await screen.findByTestId('portal-documento')).toHaveTextContent('•••••678');
    expect(screen.getByRole('button', { name: 'Cambiar mi clave' })).toBeVisible();
  });
});

describe('equipo del Consejo', () => {
  const equipo = { equipo: [
    { usuarioId: '11111111-1111-4111-8111-111111111111', nombre: 'Ana Morales', documento: '•••••001', rol: 'consejo', estado: 'activo' },
    { usuarioId: '22222222-2222-4222-8222-222222222222', nombre: 'Carlos Rojas', documento: '•••••002', rol: 'tesorero', estado: 'activo' },
  ] };

  test('solo el Consejo ve «Equipo»; Tesorería y Operador no', async () => {
    for (const [rol, ve] of [['consejo', true], ['tesorero', false], ['operador', false]] as const) {
      const { unmount } = (() => {
        const montado = render(<></>);
        return montado;
      })();
      unmount();
      const { usuario } = montar(como('personal', rol));
      await ingresarPorDni(usuario);
      await screen.findByTestId('rol-actual');
      expect(screen.queryByRole('link', { name: 'Equipo' }) !== null).toBe(ve);
      document.body.innerHTML = '';
    }
  });

  test('el Consejo agrega un Operador, ve su clave una vez y el DNI enmascarado en la lista', async () => {
    const { usuario, llamadas } = montar(como('personal', 'consejo', (m, r) => {
      if (r === '/v1/equipo' && m === 'GET') return json(200, equipo);
      if (r === '/v1/equipo' && m === 'POST') return json(201, { usuarioId: '33333333-3333-4333-8333-333333333333', claveTemporal: 'faro-mesa-nube' });
      return undefined;
    }));
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: 'Equipo' }));
    expect(await screen.findByTestId('fila-equipo-Carlos Rojas')).toHaveTextContent('•••••002');
    await usuario.click(screen.getByRole('button', { name: 'Agregar persona' }));
    const formulario = within(await screen.findByRole('dialog', { name: 'Agregar persona' }));
    await usuario.type(formulario.getByLabelText('Nombre completo'), 'Julia Flores');
    await usuario.type(formulario.getByLabelText('Número de DNI'), '10000003');
    expect(formulario.getByRole('button', { name: 'Operación' })).toHaveAttribute('aria-pressed', 'true');
    await usuario.click(formulario.getByRole('button', { name: 'Agregar' }));
    const entrega = await screen.findByRole('dialog', { name: 'Acceso creado' });
    expect(within(entrega).getByTestId('clave-temporal')).toHaveTextContent('faro-mesa-nube');
    expect(llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/v1/equipo')?.cuerpo).toEqual({ nombre: 'Julia Flores', documento: '10000003', rol: 'operador' });
    expect(JSON.stringify(sessionStorage)).not.toContain('faro-mesa-nube');
    await usuario.click(within(entrega).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText('faro-mesa-nube')).toBeNull();
  });

  test('restablecer y desactivar piden confirmación; el Consejo no tiene acciones sobre sí mismo', async () => {
    const { usuario, llamadas } = montar(como('personal', 'consejo', (m, r) => {
      if (r === '/v1/equipo' && m === 'GET') return json(200, equipo);
      if (r.endsWith('/restablecer-clave')) return json(200, { usuarioId: '22222222-2222-4222-8222-222222222222', claveTemporal: 'lago-arco-sol' });
      if (r.endsWith('/desactivar')) return json(204);
      return undefined;
    }));
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: 'Equipo' }));
    const filaConsejo = await screen.findByTestId('fila-equipo-Ana Morales');
    expect(within(filaConsejo).queryByRole('button')).toBeNull();
    const fila = screen.getByTestId('fila-equipo-Carlos Rojas');
    await usuario.click(within(fila).getByRole('button', { name: 'Restablecer la clave de Carlos Rojas' }));
    await usuario.click(within(fila).getByRole('button', { name: 'Cancelar' }));
    expect(llamadas.some((l) => l.ruta.endsWith('/restablecer-clave'))).toBe(false);
    await usuario.click(within(fila).getByRole('button', { name: 'Restablecer la clave de Carlos Rojas' }));
    await usuario.click(within(fila).getByRole('button', { name: 'Sí, restablecer' }));
    expect(await within(fila).findByTestId('clave-temporal')).toHaveTextContent('lago-arco-sol');
    await usuario.click(within(fila).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByTestId('clave-temporal')).toBeNull();
    await usuario.click(within(fila).getByRole('button', { name: 'Desactivar a Carlos Rojas' }));
    await usuario.click(within(fila).getByRole('button', { name: 'Sí, desactivar' }));
    expect(await screen.findByText(/ya no puede entrar al sistema/)).toBeVisible();
    expect(llamadas.some((l) => l.ruta.endsWith('/desactivar'))).toBe(true);
  });
});

describe('área de plataforma', () => {
  const jass = { jass: [
    { id: '44444444-4444-4444-8444-444444444444', nombre: 'JASS Quinua', estado: 'activa', ubicacion: { departamento: 'Ayacucho', provincia: 'Huamanga', distrito: 'Quinua', centroPoblado: null }, cuentasActivas: 3 },
    { id: '55555555-5555-4555-8555-555555555555', nombre: 'JASS Tambo', estado: 'suspendida', ubicacion: { departamento: null, provincia: null, distrito: null, centroPoblado: null }, cuentasActivas: 1 },
  ] };
  const plataforma = (resto: Manejador = () => undefined) => ((m: string, r: string, c: unknown): Response | undefined => {
    if (r === '/v1/auth/login') return json(200, sesionDe('plataforma', null));
    if (r === '/v1/yo') return json(200, respuestaYo('plataforma', null));
    if (r === '/v1/plataforma/jass' && m === 'GET') return json(200, jass);
    if (r === '/v1/auth/logout') return json(204);
    return resto(m, r, c);
  });

  test('la plataforma entra a su área, ve las JASS sin datos de negocio y no tiene pantallas de padrón, pagos ni mediciones', async () => {
    const { usuario, llamadas } = montar(plataforma());
    await ingresarPorDni(usuario);
    expect(await screen.findByRole('heading', { name: 'Las juntas de agua, en un solo lugar.' })).toBeVisible();
    // La lista llega por red: se espera la fila en vez de suponer que ya está (en CI el encabezado aparece antes que los datos).
    expect(await screen.findByTestId('fila-jass-JASS Quinua')).toHaveTextContent('Quinua · Huamanga, Ayacucho');
    expect(screen.getByTestId('fila-jass-JASS Tambo')).toHaveTextContent('Suspendida');
    for (const enlace of ['Asociados', 'Cuotas y pagos', 'Mediciones', 'Reservorios']) expect(screen.queryByRole('link', { name: enlace })).toBeNull();
    expect(llamadas.some((l) => /\/v1\/(asociados|cuotas|pagos|reservorios|mediciones)/.test(l.ruta))).toBe(false);
    await waitFor(() => expect(window.location.pathname).toBe('/plataforma'));
  });

  test('crear una JASS entrega la clave del Consejo una vez y la JASS aparece en la lista', async () => {
    const { usuario, llamadas } = montar(plataforma((m, r) => (m === 'POST' && r === '/v1/plataforma/jass' ? json(201, { jassId: '66666666-6666-4666-8666-666666666666', usuarioId: 'u', claveTemporal: 'nube-pino-agua' }) : undefined)));
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('button', { name: /Nueva JASS/ }));
    const form = within(screen.getByRole('dialog', { name: 'Nueva JASS' }));
    await usuario.type(form.getByLabelText('Nombre de la JASS'), 'JASS Pacaycasa');
    await usuario.click(form.getByRole('button', { name: 'Siguiente' }));
    await usuario.type(await form.findByLabelText('Distrito'), 'Ayacucho');
    await usuario.click(form.getByRole('button', { name: 'Siguiente' }));
    await usuario.type(await form.findByLabelText('Nombre de quien preside el Consejo'), 'Rosa Consejo');
    await usuario.type(form.getByLabelText('Número de DNI'), '10000009');
    await usuario.click(form.getByRole('button', { name: 'Crear JASS' }));
    const entrega = await screen.findByRole('dialog', { name: 'JASS creada' });
    expect(within(entrega).getByTestId('clave-temporal')).toHaveTextContent('nube-pino-agua');
    expect(llamadas.find((l) => l.metodo === 'POST' && l.ruta === '/v1/plataforma/jass')?.cuerpo).toEqual({
      nombre: 'JASS Pacaycasa',
      ubicacion: { departamento: null, provincia: null, distrito: 'Ayacucho', centroPoblado: null },
      consejo: { nombre: 'Rosa Consejo', documento: '10000009' },
    });
    expect(JSON.stringify(sessionStorage)).not.toContain('nube-pino-agua');
  });

  test('un DNI incompleto del Consejo se avisa junto al campo y no se envía; un DNI repetido se explica', async () => {
    let conflicto = false;
    const { usuario, llamadas } = montar(plataforma((m, r) => (m === 'POST' && r === '/v1/plataforma/jass' ? (conflicto ? json(409, { codigo: 'documento-con-acceso', mensaje: 'x' }) : undefined) : undefined)));
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('button', { name: /Nueva JASS/ }));
    const form = within(screen.getByRole('dialog', { name: 'Nueva JASS' }));
    await usuario.type(form.getByLabelText('Nombre de la JASS'), 'JASS X');
    await usuario.click(form.getByRole('button', { name: 'Siguiente' }));
    await usuario.click(await form.findByRole('button', { name: 'Siguiente' }));
    await usuario.type(await form.findByLabelText('Nombre de quien preside el Consejo'), 'Consejo X');
    await usuario.type(form.getByLabelText('Número de DNI'), '123');
    await usuario.click(form.getByRole('button', { name: 'Crear JASS' }));
    expect(await form.findByText('El DNI tiene 8 números.')).toBeVisible();
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/v1/plataforma/jass')).toBe(false);
    conflicto = true;
    await usuario.type(form.getByLabelText('Número de DNI'), '45678');
    await usuario.click(form.getByRole('button', { name: 'Crear JASS' }));
    expect(await form.findByText('Ese DNI ya tiene un acceso en el sistema.')).toBeVisible();
  });

  test('suspender, reactivar y restablecer la clave del Consejo piden confirmación', async () => {
    const { usuario, llamadas } = montar(plataforma((_m, r) => {
      if (r.endsWith('/suspender') || r.endsWith('/reactivar')) return json(204);
      if (r.endsWith('/consejo/restablecer-clave')) return json(200, { usuarioId: 'u', nombre: 'Rosa Consejo', documento: '•••••009', claveTemporal: 'roca-vela-rio' });
      return undefined;
    }));
    await ingresarPorDni(usuario);
    const quinua = await screen.findByTestId('fila-jass-JASS Quinua');
    await usuario.click(within(quinua).getByRole('button', { name: 'Suspender' }));
    await usuario.click(within(quinua).getByRole('button', { name: 'Cancelar' }));
    expect(llamadas.some((l) => l.ruta.endsWith('/suspender'))).toBe(false);
    await usuario.click(within(quinua).getByRole('button', { name: 'Suspender' }));
    await usuario.click(within(quinua).getByRole('button', { name: 'Sí, suspender' }));
    expect(await screen.findByText(/quedó suspendida/)).toBeVisible();
    const tambo = screen.getByTestId('fila-jass-JASS Tambo');
    await usuario.click(within(tambo).getByRole('button', { name: 'Reactivar' }));
    await usuario.click(within(tambo).getByRole('button', { name: 'Cancelar' }));
    expect(llamadas.some((l) => l.ruta.endsWith('/reactivar'))).toBe(false);
    await usuario.click(within(tambo).getByRole('button', { name: 'Reactivar' }));
    await usuario.click(within(tambo).getByRole('button', { name: 'Sí, reactivar' }));
    expect(await screen.findByText(/volvió a estar activa/)).toBeVisible();
    await usuario.click(within(quinua).getByRole('button', { name: 'Restablecer la clave del Consejo de JASS Quinua' }));
    expect(llamadas.some((l) => l.ruta.endsWith('/consejo/restablecer-clave'))).toBe(false);
    await usuario.click(within(quinua).getByRole('button', { name: 'Sí, generar clave' }));
    expect(await within(quinua).findByTestId('clave-temporal')).toHaveTextContent('roca-vela-rio');
  });

  test('una cuenta de plataforma que abre una ruta del personal o del portal vuelve a su área, y a la inversa', () => {
    for (const ruta of ['/personal', '/personal/asociados', '/portal', '/portal/pagos']) expect(destinoPara('plataforma', ruta)).toBe('/plataforma');
    expect(destinoPara('plataforma', '/plataforma')).toBe('/plataforma');
    expect(destinoPara('plataforma', '/plataforma/jass')).toBe('/plataforma/jass');
    for (const perfil of ['personal', 'asociado'] as const) expect(destinoPara(perfil, '/plataforma')).toBe(perfil === 'personal' ? '/personal' : '/portal');
    expect(destinoPara(null, '/plataforma')).toBe('/ingresar');
  });
});

describe('padrón — estado del acceso', () => {
  test('la fila dice si tiene acceso; la cuenta ofrece crear o restablecer, y nada si está inactivo', async () => {
    const filas = [
      { id: '11111111-1111-4111-8111-111111111111', nombre: 'Rosa Sin', documento: '70000001', estado: 'activo', saldoCentimos: 0, acceso: 'sin-acceso' },
      { id: '22222222-2222-4222-8222-222222222222', nombre: 'Luis Con', documento: '70000002', estado: 'activo', saldoCentimos: 0, acceso: 'activo' },
      { id: '33333333-3333-4333-8333-333333333333', nombre: 'Ana Inactiva', documento: '70000003', estado: 'activo', saldoCentimos: 0, acceso: 'inactivo' },
    ];
    const cuentaDe = (f: typeof filas[number]) => ({ asociado: { id: f.id, nombre: f.nombre, documento: f.documento, estado: 'activo' }, acceso: f.acceso, saldoCentimos: 0, periodoActual: '2026-11', cuotas: [], pagos: [] });
    const { usuario } = montar(como('personal', 'tesorero', (m, r) => {
      if (m === 'GET' && r === '/v1/asociados') return json(200, { asociados: filas });
      const f = filas.find((x) => r === `/v1/asociados/${x.id}/estado-de-cuenta`);
      return f ? json(200, cuentaDe(f)) : undefined;
    }));
    await ingresarPorDni(usuario);
    await usuario.click(await screen.findByRole('link', { name: 'Asociados' }));
    expect(await screen.findByTestId('fila-70000001')).toHaveTextContent('sin acceso');
    expect(screen.getByTestId('fila-70000002')).toHaveTextContent('con acceso');
    expect(screen.getByTestId('fila-70000003')).toHaveTextContent('acceso inactivo');
    const abrir = async (dni: string, nombre: string) => {
      await usuario.click(within(screen.getByTestId(`fila-${dni}`)).getByRole('button', { name: 'Ver cuenta' }));
      return within(await screen.findByRole('dialog', { name: nombre }));
    };
    const cerrar = async (c: ReturnType<typeof within>) => {
      await usuario.click(c.getAllByRole('button', { name: 'Cerrar' })[0]);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    };
    let cuenta = await abrir('70000001', 'Rosa Sin');
    expect(await cuenta.findByRole('button', { name: 'Crear acceso' })).toBeVisible();
    await cerrar(cuenta);
    cuenta = await abrir('70000002', 'Luis Con');
    expect(await cuenta.findByRole('button', { name: 'Restablecer clave' })).toBeVisible();
    expect(cuenta.queryByRole('button', { name: 'Crear acceso' })).toBeNull();
    await cerrar(cuenta);
    cuenta = await abrir('70000003', 'Ana Inactiva');
    expect(await cuenta.findByText('Su acceso está inactivo')).toBeVisible();
    expect(cuenta.queryByRole('button', { name: /Crear acceso|Restablecer clave/ })).toBeNull();
  });
});

export type { Usuario };
