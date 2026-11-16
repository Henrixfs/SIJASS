// Falla con código 1 y un mensaje claro si falta DATABASE_URL (design.md D10).
// Las pruebas de integración nunca se omiten en silencio: sin base, el CI se pondría en
// verde sin haber probado nada.
const url = process.env.DATABASE_URL;

if (url === undefined || url.trim() === '') {
  console.error(
    [
      'Falta DATABASE_URL: las pruebas de integración exigen un PostgreSQL migrado.',
      '  1. docker compose up -d --wait',
      '  2. export DATABASE_URL=postgres://sijass:sijass@127.0.0.1:5432/sijass   (PowerShell: $env:DATABASE_URL = "...")',
      '  3. npm run migrar',
      'Si el puerto 5432 está ocupado, usa SIJASS_PG_PUERTO=5433 y cambia el puerto en la URL.',
    ].join('\n'),
  );
  process.exit(1);
}
