import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { App } from '../App';
import { ClienteApi } from '../api/cliente';
import { ingresarPorDni, respuestaYo } from './ayudas';

// Vite transforma los módulos diferidos al primer import. Esa preparación pertenece al setup de jsdom.
beforeAll(async () => {
  await Promise.all([import('../paginas/Personal'), import('../paginas/Asistente')]);
});

const json = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

const documentos = (corpus: 'ejemplo' | 'aprobado' = 'ejemplo') => ({
  corpus,
  nombre: 'Corpus',
  documentos: [{ id: 'd1', titulo: corpus === 'ejemplo' ? 'EJEMPLO — Guía DPD' : 'Guía DPD', version: '0.1-ejemplo', estado: corpus, paginas: 3 }],
});
const cita = { documentoId: 'd1', documento: 'EJEMPLO — Guía DPD', version: '0.1-ejemplo', pagina: 2, fragmento: 'Compare el color con la escala del comparador inmediatamente.' };

function montar(consulta: (pregunta: unknown) => Response, corpus: 'ejemplo' | 'aprobado' = 'ejemplo', rol = 'operador') {
  window.history.replaceState(null, '', '/');
  const llamadas: Array<{ ruta: string; cuerpo: unknown }> = [];
  const peticion = vi.fn(async (ruta: RequestInfo | URL, init?: RequestInit) => {
    const r = String(ruta);
    const cuerpo = init?.body ? JSON.parse(init.body as string) : undefined;
    llamadas.push({ ruta: r, cuerpo });
    if (r === '/v1/auth/login') return json(200, { tokenAcceso: 'a', tokenRefresco: 'r', perfil: 'personal', rol });
    if (r === '/v1/yo') return json(200, respuestaYo('personal', rol));
    if (r === '/v1/asistente/documentos') return json(200, documentos(corpus));
    if (r === '/v1/asistente/consultas') return consulta(cuerpo?.pregunta);
    if (r === '/v1/reservorios') return json(200, { reservorios: [] });
    if (r === '/v1/mediciones/catalogo') return json(200, { metodos: [], unidad: 'mg/L' });
    if (r === '/v1/asociados') return json(200, { asociados: [] });
    return json(404, {});
  });
  const usuario = userEvent.setup();
  render(<App api={new ClienteApi(peticion as unknown as typeof fetch)} />);
  return { usuario, llamadas };
}

async function abrirAsistente(usuario: ReturnType<typeof userEvent.setup>) {
  await ingresarPorDni(usuario);
  await usuario.click(await screen.findByRole('link', { name: 'Asistente' }));
  await screen.findByRole('heading', { name: 'Asistente técnico' });
}

describe('interfaz del asistente', () => {
  test('respuesta con citas: documento, versión y página, y el aviso permanente de corpus de ejemplo', async () => {
    const { usuario, llamadas } = montar(() => json(200, { estado: 'respondida', corpus: 'ejemplo', mensaje: 'Los documentos de este corpus son de EJEMPLO y no están aprobados', respuesta: 'x', citas: [cita] }));
    await abrirAsistente(usuario);
    expect(await screen.findByTestId('aviso-corpus-ejemplo')).toHaveTextContent('Documentos de EJEMPLO');
    await usuario.type(screen.getByLabelText('Su pregunta'), '¿Cómo se hace la lectura con el comparador DPD?');
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
    const citas = await screen.findByTestId('citas');
    expect(within(citas).getByText('EJEMPLO — Guía DPD')).toBeInTheDocument();
    expect(citas).toHaveTextContent('versión 0.1-ejemplo · página 2');
    expect(citas).toHaveTextContent('Compare el color con la escala del comparador inmediatamente.');
    expect(llamadas.find((l) => l.ruta === '/v1/asistente/consultas')!.cuerpo).toEqual({ pregunta: '¿Cómo se hace la lectura con el comparador DPD?' });
    expect(screen.getByTestId('respuesta')).toHaveAttribute('data-estado', 'respondida');
  });

  test('abstención: mensaje claro y ninguna cita', async () => {
    const { usuario } = montar(() => json(200, { estado: 'sin-evidencia', corpus: 'ejemplo', mensaje: 'No se encontró evidencia suficiente en los documentos disponibles.', citas: [] }));
    await abrirAsistente(usuario);
    await usuario.type(screen.getByLabelText('Su pregunta'), 'capital de Francia');
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByRole('heading', { name: 'Sin evidencia' })).toBeInTheDocument();
    expect(screen.getByTestId('mensaje-asistente')).toHaveTextContent('No se encontró evidencia');
    expect(screen.queryByTestId('citas')).not.toBeInTheDocument();
  });

  test('fuera de alcance: explica el protocolo validado y no muestra cantidades ni citas', async () => {
    const { usuario } = montar(() => json(200, { estado: 'fuera-de-alcance', corpus: 'ejemplo', mensaje: 'SIJASS no calcula dosis ni indica tratamientos del agua. Ese cálculo requiere un protocolo validado y casos de referencia revisados.', citas: [] }));
    await abrirAsistente(usuario);
    await usuario.type(screen.getByLabelText('Su pregunta'), '¿cuánto cloro agrego?');
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByRole('heading', { name: 'Fuera de alcance' })).toBeInTheDocument();
    expect(screen.getByTestId('mensaje-asistente')).toHaveTextContent('protocolo validado');
    expect(screen.queryByTestId('citas')).not.toBeInTheDocument();
  });

  test('un fragmento con HTML se muestra como texto, no se interpreta', async () => {
    const malicioso = '<img src=x onerror="document.title=\'hackeado\'"> <script>window.__xss = 1</script>';
    const { usuario } = montar(() => json(200, { estado: 'respondida', corpus: 'ejemplo', mensaje: 'm', respuesta: malicioso, citas: [{ ...cita, fragmento: malicioso, documento: '<b>EJEMPLO</b>' }] }));
    await abrirAsistente(usuario);
    await usuario.type(screen.getByLabelText('Su pregunta'), 'lectura');
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
    const citas = await screen.findByTestId('citas');
    expect(citas).toHaveTextContent('<img src=x onerror=');
    expect(citas).toHaveTextContent('<b>EJEMPLO</b>');
    expect(citas.querySelector('img, script, b')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    expect(document.title).not.toBe('hackeado');
  });

  test('con el corpus aprobado no aparece el aviso de ejemplo', async () => {
    const { usuario } = montar(() => json(200, { estado: 'sin-evidencia', corpus: 'aprobado', mensaje: 'No se encontró evidencia suficiente en los documentos disponibles.', citas: [] }), 'aprobado');
    await abrirAsistente(usuario);
    await screen.findByTestId('documentos');
    expect(screen.queryByTestId('aviso-corpus-ejemplo')).not.toBeInTheDocument();
  });

  test('si el servidor rechaza la consulta (422 o 403) se muestra el mensaje y no se queda una respuesta anterior', async () => {
    let n = 0;
    const { usuario } = montar(() => (n++ === 0 ? json(200, { estado: 'sin-evidencia', corpus: 'ejemplo', mensaje: 'No se encontró evidencia.', citas: [] }) : json(403, { codigo: 'acceso-denegado', mensaje: 'Acceso denegado' })));
    await abrirAsistente(usuario);
    await usuario.type(screen.getByLabelText('Su pregunta'), 'algo');
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
    await screen.findByTestId('respuesta');
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByTestId('aviso-error')).toHaveTextContent('Acceso denegado');
    expect(screen.queryByTestId('respuesta')).not.toBeInTheDocument();
  });

  test('lista los documentos disponibles con versión y páginas', async () => {
    const { usuario } = montar(() => json(200, {}));
    await abrirAsistente(usuario);
    const lista = await screen.findByTestId('documentos');
    expect(lista).toHaveTextContent('EJEMPLO — Guía DPD · versión 0.1-ejemplo · 3 páginas');
  });

  test('no hay ningún control de dosis, ni de carga de imágenes', async () => {
    const { usuario } = montar(() => json(200, {}));
    await abrirAsistente(usuario);
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/calcular dosis|dosis recomendada|dosis sugerida|subir foto|fotograf/i);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /dosis|calcular/i })).not.toBeInTheDocument();
  });

  test.each(['consejo', 'tesorero'])('el %s también ve la pestaña Asistente', async (rol) => {
    const { usuario } = montar(() => json(200, {}), 'ejemplo', rol);
    await abrirAsistente(usuario);
    expect(await screen.findByRole('form', { name: 'Consultar al asistente' })).toBeInTheDocument();
  });
});
