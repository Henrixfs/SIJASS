import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { guardarPanelPlegado, leerPanelPlegado } from '../lib/panel';

describe('preferencia del panel lateral', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  test('sin nada guardado abre desplegado', () => {
    expect(leerPanelPlegado()).toBe(false);
  });

  test('guarda que está plegado y lo recuerda', () => {
    guardarPanelPlegado(true);
    expect(leerPanelPlegado()).toBe(true);
  });

  test('al desplegar vuelve a no guardar nada', () => {
    guardarPanelPlegado(true);
    guardarPanelPlegado(false);
    expect(leerPanelPlegado()).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });

  test('un valor ajeno o dañado se trata como desplegado', () => {
    window.localStorage.setItem('sijass.panel-plegado', 'sí');
    expect(leerPanelPlegado()).toBe(false);
  });

  test('sin almacenamiento no lanza y abre desplegado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(leerPanelPlegado()).toBe(false);
    expect(() => guardarPanelPlegado(true)).not.toThrow();
  });
});
