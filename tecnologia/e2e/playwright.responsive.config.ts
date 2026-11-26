import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const puerto = 4183;
const baseURL = `http://127.0.0.1:${puerto}`;

export default defineConfig({
  testDir: './responsive',
  outputDir: join(tmpdir(), 'sijass-web-responsive'),
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL, channel: process.env.CI ? undefined : 'chrome', locale: 'es-PE', timezoneId: 'America/Lima' },
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${puerto} --strictPort`,
    cwd: fileURLToPath(new URL('../sijass-web/', import.meta.url)),
    url: baseURL,
    reuseExistingServer: false,
  },
});
