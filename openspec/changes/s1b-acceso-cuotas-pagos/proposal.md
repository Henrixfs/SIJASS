# Proposal

## Why

La Etapa 1 quedó a medias: el dominio de medición existe, pero no hay identidad, padrón, cuotas ni pagos, y nada es utilizable desde un navegador. El primer flujo de valor para una JASS es el cobro de cuotas: el personal registra un pago y el asociado ve su saldo actualizado. Este cambio construye ese flujo de extremo a extremo (PostgreSQL, API, interfaz web) y fija las bases de acceso (perfiles, aislamiento entre JASS y entre cuentas) que reutilizarán `s1c` (mediciones en la interfaz) y `s1d` (asistente).

Aporta a los criterios **C01–C02** (requisitos RF01, RF03, RF04, RF05 llevados a especificaciones verificables), **C04** (tercer cambio SDD), **C05** (pruebas unitarias, de contrato, de integración y de aislamiento), **C06** (primera prueba E2E en navegador), **C07** (primera interfaz) y **C14** (migraciones de usuarios, pagos y auditoría).

## What Changes

- **Acceso por perfiles (RF01, ADR-008).** Dos perfiles: *personal* de la JASS (con rol `consejo`, `tesorero` u `operador`) y *asociado*. Inicio de sesión con contraseña derivada con `scrypt`, token de acceso JWT de corta duración, sesión renovable con token de refresco almacenado solo como hash, limitación de intentos fallidos y autorización en el servidor por membresía activa y permiso en cada solicitud.
- **Padrón, cuotas y pagos (RF03–RF05, ADR-013).** Asociados con baja lógica; generación de cuotas por periodo; pagos en línea con comprobante, `Idempotency-Key` y reversa compensatoria; saldo = cuotas exigibles − pagos no revertidos. Importes enteros en céntimos de sol.
- **Portal del asociado.** El asociado consulta únicamente su propio saldo, cuotas y pagos; la identidad del asociado sale de su sesión, nunca de la ruta.
- **Auditoría mínima (diseño interno §7).** `evento_auditoria` de solo inserción, escrita en la misma transacción que cada cambio sensible y para accesos denegados.
- **Interfaz web** React + TypeScript + Vite para ambos perfiles (alta de asociados, generación de cuotas, registro y reversa de pagos; saldo del asociado).
- **API** NestJS bajo `/v1`, con el dominio y los casos de uso sin dependencias del framework.
- **Documentación.** Se corrige el alcance: el roadmap §4.2, la matriz de actores y el diseño interno consideraban el acceso del asociado como *futuro*; este cambio lo trae al MVP por decisión del 2026-11-19, limitado a consulta de lo propio. El administrador (`consejo`) también puede registrar y reversar pagos.

Fuera de alcance: pagos sin conexión, pasarelas de pago, notificaciones (RF12), recuperación de contraseña por correo, usuarios con varias JASS, correcciones de mediciones (RF08) y cualquier cambio en el dominio de medición.

## Capabilities

### New Capabilities
- `acceso-por-perfiles`: autenticación, sesiones, perfiles, roles y autorización por JASS y por cuenta.
- `cuotas-y-pagos`: asociados, cuotas, pagos idempotentes, reversas y saldo.
- `portal-asociado`: consulta del asociado a su propia información.
- `auditoria-eventos`: bitácora de solo inserción de eventos sensibles.

### Modified Capabilities
<!-- Ninguna: el dominio de medición no cambia en este cambio. -->

## Impact

- **Código:** `tecnologia/siJASS-clean-architecture/` (dominio, aplicación, adaptadores PostgreSQL y memoria, API NestJS, migración `0002`); nuevo paquete `tecnologia/sijass-web/` (interfaz).
- **Dependencias nuevas:** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs` (API); `react`, `react-dom`, `vite`, `@vitejs/plugin-react` (interfaz); `@playwright/test` (E2E, solo desarrollo).
- **CI:** nuevo job para la interfaz y la prueba E2E; el job `integracion` ejecuta además las migraciones nuevas.
- **Documentación:** roadmap, actores, diseño interno, plan de pruebas y matriz de cumplimiento.
- **Riesgos:** (1) NestJS añade complejidad frente al prototipo; se acota dejando dominio y aplicación libres del framework. (2) La contraseña inicial de las cuentas de asociado la fija el personal; no hay recuperación por correo (decisión abierta). (3) Una membresía activa por usuario limita casos reales de varias JASS (decisión abierta del roadmap §7).
