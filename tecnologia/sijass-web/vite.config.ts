/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, `/v1` se reenvía a la API para que el navegador use un único origen.
const API = process.env.SIJASS_API ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  server: { port: 5173, proxy: { '/v1': API } },
  preview: { port: 4173, proxy: { '/v1': API } },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/pruebas/preparar.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'cobertura',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/pruebas/**', 'src/main.tsx', 'src/**/*.d.ts'],
    },
  },
});
