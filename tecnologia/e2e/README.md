# e2e — pruebas de extremo a extremo de SIJASS

Playwright sobre un navegador real: la API NestJS, PostgreSQL y la interfaz construida, servida por la propia API (un solo origen). Cubre el flujo «el tesorero registra un pago y el asociado, en otro navegador, ve su saldo actualizado», la reversa, la guardia de pantallas por perfil, el aislamiento entre JASS, el bloqueo de cuenta y, desde `s2a`, el ingreso por DNI: tipo de acceso equivocado, el Consejo que crea a Tesorería (que cambia su clave al primer ingreso), Tesorería que crea el acceso de una asociada, el restablecimiento tras un bloqueo y la plataforma que crea una JASS cuyo Consejo no ve datos de otra.

## Ejecución local

Requiere Node.js 22+, Docker y Google Chrome instalado (en local se usa `channel: 'chrome'`; en CI, con `CI=true`, el Chromium de Playwright).

```bash
# PostgreSQL desechable (SIJASS_PG_PUERTO si el 5432 está ocupado)
cd ../siJASS-clean-architecture && SIJASS_PG_PUERTO=5433 docker compose up -d --wait && cd ../e2e
npm ci
npm run construir                       # compila la API y la interfaz
ADMIN_DATABASE_URL=postgres://sijass:sijass@127.0.0.1:5433/sijass npm test
```

`preparar.ts` recrea la base `sijass_e2e`, la migra y siembra la cuenta de plataforma, la JASS de demostración y una segunda JASS creada con `crear-jass` (los DNI y la clave son valores de prueba que viven solo en [`datos.ts`](datos.ts)). Las pruebas son seriales y comparten ese estado; las de [`flujo-acceso.spec.ts`](pruebas/flujo-acceso.spec.ts) crean sus propias cuentas desde la interfaz. Los ayudantes de ingreso (elegir «Soy asociado» o «Soy administrador», DNI y clave) están en [`ayudas.ts`](ayudas.ts).

## Adaptación a pantallas (API simulada)

```bash
npx playwright test -c playwright.responsive.config.ts                       # solo comprueba
GUARDAR_EVIDENCIA=1 npx playwright test -c playwright.responsive.config.ts   # además guarda capturas y medidas en docs/diseno/evidencia/s2a-acceso
```

Sirve la interfaz construida (`vite preview`) con las rutas `/v1/*` interceptadas; mide desbordamiento, objetivos de 44 px, contraste y teclado a 320–1440 px. No sustituye al E2E real ni a una prueba con personas.
