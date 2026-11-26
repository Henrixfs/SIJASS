import { fileURLToPath } from 'node:url';

// Las consultas de registros de shadcn 4.23 resuelven components.json usando process.cwd().
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
process.argv = [process.execPath, fileURLToPath(new URL('./node_modules/shadcn/dist/index.js', import.meta.url)), 'mcp'];
await import('./node_modules/shadcn/dist/index.js');
