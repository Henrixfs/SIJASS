# e2e — pruebas de extremo a extremo de SIJASS

Playwright sobre un navegador real: la API NestJS, PostgreSQL y la interfaz construida, servida por la propia API (un solo origen). Cubre el flujo «el tesorero registra un pago y el asociado, en otro navegador, ve su saldo actualizado», la reversa, la guardia de pantallas por perfil, el aislamiento entre JASS y el bloqueo de cuenta.

## Ejecución local

Requiere Node.js 22+, Docker y Google Chrome instalado (en local se usa `channel: 'chrome'`; en CI, con `CI=true`, el Chromium de Playwright).

```bash
# PostgreSQL desechable (SIJASS_PG_PUERTO si el 5432 está ocupado)
cd ../siJASS-clean-architecture && SIJASS_PG_PUERTO=5433 docker compose up -d --wait && cd ../e2e
npm ci
npm run construir                       # compila la API y la interfaz
ADMIN_DATABASE_URL=postgres://sijass:sijass@127.0.0.1:5433/sijass npm test
```

`preparar.ts` recrea la base `sijass_e2e`, la migra y siembra la JASS de demostración y una segunda JASS (las contraseñas son valores de prueba que viven solo en este código). Las pruebas son seriales y comparten ese estado.
