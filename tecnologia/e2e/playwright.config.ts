import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * E2E con la API real (NestJS), PostgreSQL y la interfaz construida servida por la propia API
 * (un solo origen). Requiere haber ejecutado `npm run construir` y tener PostgreSQL migrable:
 *   ADMIN_DATABASE_URL  conexión con permiso para crear la base `sijass_e2e`.
 * En local usa el Chrome del sistema; en CI (`CI=true`) el Chromium que instala Playwright.
 */
const puerto = Number(process.env.E2E_PORT ?? 3100);
const dirApi = fileURLToPath(new URL('../siJASS-clean-architecture/', import.meta.url));
const dirWeb = fileURLToPath(new URL('../sijass-web/dist', import.meta.url));

export const BASE_URL = `http://127.0.0.1:${puerto}`;
export const NOMBRE_BASE = 'sijass_e2e';

const admin = process.env.ADMIN_DATABASE_URL ?? '';
const urlBase = admin ? new URL(admin) : null;
if (urlBase) urlBase.pathname = `/${NOMBRE_BASE}`;

export default defineConfig({
  testDir: './pruebas',
  globalSetup: './preparar.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  },
  webServer: {
    command: 'node dist/api/main.js',
    cwd: dirApi,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      JWT_SECRET: 'secreto-e2e-0123456789abcdef0123456789abcdef',
      DATABASE_URL: urlBase?.toString() ?? '',
      PORT: String(puerto),
      WEB_DIR: dirWeb,
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
    },
  },
});
