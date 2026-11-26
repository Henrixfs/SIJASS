import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Con varias suites a la vez el primer render de una pantalla diferida puede pasar de 1 s: se da más margen.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
