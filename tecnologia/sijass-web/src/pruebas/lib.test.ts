import { describe, expect, test } from 'vitest';
import { formatearSoles, parsearSoles } from '../lib/dinero';
import { destinoPara, inicioDe } from '../lib/rutas';
import { nuevoUuid } from '../lib/uuid';

describe('formatearSoles', () => {
  test.each([
    [0, 'S/ 0.00'],
    [5, 'S/ 0.05'],
    [1500, 'S/ 15.00'],
    [1050, 'S/ 10.50'],
    [123456789, 'S/ 1,234,567.89'],
    [-750, '-S/ 7.50'],
  ])('%i céntimos → %s', (centimos, esperado) => {
    expect(formatearSoles(centimos)).toBe(esperado);
  });
});

describe('parsearSoles', () => {
  test.each([
    ['15', 1500],
    ['15.5', 1550],
    ['15,50', 1550],
    ['0.05', 5],
    ['  7.25 ', 725],
    ['0,5', 50],
    ['1234567.89', 123456789],
    ['10000000.00', 1000000000],
  ])('«%s» → %i céntimos', (texto, esperado) => {
    expect(parsearSoles(texto)).toBe(esperado);
  });

  test.each(['', 'abc', '0', '0.00', '-5', '1.234', '1,2,3', '12345678', '10000000.01', '1e3', '15 soles', 'S/ 15', '.5', '5.'])('«%s» no es un monto válido', (texto) => {
    expect(parsearSoles(texto)).toBeNull();
  });

  test('no pierde precisión con decimales binarios (19.99, 0.07, 1.15)', () => {
    expect(parsearSoles('19.99')).toBe(1999);
    expect(parsearSoles('0.07')).toBe(7);
    expect(parsearSoles('1.15')).toBe(115);
  });
});

describe('guardia de pantallas por perfil', () => {
  test('sin sesión todo va al ingreso', () => {
    for (const r of ['/', '/personal', '/portal', '/personal/asociados/x', '/ingresar']) expect(destinoPara(null, r)).toBe('/ingresar');
  });
  test('el asociado solo ve el portal: cualquier ruta del personal lo redirige', () => {
    expect(destinoPara('asociado', '/portal')).toBe('/portal');
    for (const r of ['/', '/personal', '/personal/asociados/abc', '/ingresar', '/otra']) expect(destinoPara('asociado', r)).toBe('/portal');
  });
  test('el personal ve sus pantallas y no el portal', () => {
    expect(destinoPara('personal', '/personal')).toBe('/personal');
    expect(destinoPara('personal', '/personal/asociados/abc')).toBe('/personal/asociados/abc');
    for (const r of ['/', '/portal', '/ingresar', '/personalx', '/otra']) expect(destinoPara('personal', r)).toBe('/personal');
  });
  test('un prefijo parecido no cuela (`/portalx`)', () => {
    expect(destinoPara('asociado', '/portalx')).toBe('/portal');
  });
  test('inicio de cada perfil', () => {
    expect(inicioDe('personal')).toBe('/personal');
    expect(inicioDe('asociado')).toBe('/portal');
  });
});

describe('nuevoUuid', () => {
  test('genera UUID v4 distintos', () => {
    const a = nuevoUuid();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(nuevoUuid()).not.toBe(a);
  });
});
