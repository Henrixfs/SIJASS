# Tasks

Las rutas son relativas a `tecnologia/siJASS-clean-architecture/` salvo que se indique otra cosa. Rama `feat/s1c-reservorios-mediciones`, sobre `feat/s1b-acceso-cuotas-pagos`. Las pruebas de integración usan PostgreSQL 16 en Docker (`SIJASS_PG_PUERTO`).

## 1. Esquema y permisos

- [x] 1.1 Migración `0003_reservorios-unicos.sql` (D5). Verificar: `npm run migrar`, `npm run migrar:revertir` y `npm run migrar` con código 0; una prueba por SQL directo rechaza nombre repetido (también cambiando mayúsculas) en una JASS, lo admite en otra, y rechaza nombre vacío o de más de 80 caracteres.
- [x] 1.2 Permisos `reservorios.leer`, `reservorios.crear`, `mediciones.registrar` y `mediciones.leer` (D2). Verificar con la matriz perfil/rol × permiso de `acceso.test.ts` ampliada: solo los roles de la spec los tienen y el asociado ninguno.

## 2. Aplicación y persistencia

- [x] 2.1 Repositorio de reservorios en el módulo de acceso (memoria y PostgreSQL) y casos `CrearReservorio` y `ListarReservorios` con auditoría de alta (D1). Verificar con la batería compartida memoria/PostgreSQL: alta, nombre repetido (`409`), validación, listado ordenado y aislado por JASS, evento `reservorio.creado` y reversión si falla la auditoría.
- [x] 2.2 Casos `RegistrarMedicionAutorizada` y `ConsultarHistorial` (D3). Verificar con pruebas de integración sobre PostgreSQL: registro, reintento, conflicto, rechazos del dominio, campos no permitidos, reservorio ajeno o inexistente (mismo error), historial ordenado y limitado a 200.

## 3. API

- [x] 3.1 Controladores y mapeo de resultados (D4). Verificar por HTTP cada escenario de las specs `reservorios-jass` y `mediciones-en-linea` (`200/201/403/409/422`).
- [x] 3.2 Matriz de aislamiento ampliada (D7): cada cuenta (consejo, tesorero y operador de A; operador y consejo de B; asociado) × cada ruta nueva × cada recurso (reservorio de A y de B, inexistente). Verificar que solo las combinaciones permitidas devuelven datos, que todo lo demás es `401/403` con el mismo cuerpo, que cada `403` deja un evento `acceso.denegado` sin datos de la medición, y que las escrituras denegadas no cambian ninguna tabla.

## 4. Interfaz

- [x] 4.1 Pantalla *Mediciones* y pestañas por rol (D6). Verificar con pruebas de interfaz: pestañas por rol, formulario solo para el operador, conversión de valor (coma/punto) y de hora de Lima a UTC con desplazamiento, `Idempotency-Key` estable en reintentos y distinta si cambia el contenido, aviso de no dictamen, y ausencia de cualquier control de dosis o de estimación por imagen.

## 5. E2E

- [x] 5.1 Flujo en navegador: el operador elige un reservorio, registra una lectura y la ve en el historial; el consejo, en otro navegador, la ve sin formulario; el consejo de otra JASS no ve reservorios ni mediciones. Verificar `npx playwright test` en tres ejecuciones consecutivas.

## 6. Documentación con evidencia

- [x] 6.1 Actualizar `plan-pruebas.md` (PT13 para mediciones y reservorios), `matriz-cumplimiento.md`, roadmap y READMEs, separando evidencia local de evidencia de CI. No pasar ningún criterio a *Implementado*. Verificar `node scripts/verificar-docs.mjs` con código 0.

## 7. Integración final

- [x] 7.1 `openspec validate s1c-reservorios-mediciones --strict` con código 0.
- [x] 7.2 En una copia limpia del commit final: `npm ci`, lint, build, `npm test`, `npm run test:integration`, interfaz y E2E.
- [x] 7.3 Subir la rama, abrir el PR contra `feat/s1b-acceso-cuotas-pagos` y anotar la URL del CI con todos los jobs en verde.

## Workflow follow-up

- Fusionar y archivar con `/opsx:archive s1c-reservorios-mediciones`.
- Planificar `s1d-asistente-tecnico`.

## Evidencia de GitHub Actions (aparte de la local)

- Rama `feat/s1c-reservorios-mediciones`, commit `6cb320a`: [PR #10](https://github.com/Henrixfs/SIJASS/pull/10) (base `feat/s1b-acceso-cuotas-pagos`).
- Ejecución del pull request [44640749517](https://github.com/Henrixfs/SIJASS/actions/runs/44640749517) y del push [44640740906](https://github.com/Henrixfs/SIJASS/actions/runs/44640740906): los seis jobs en verde.
- **Fallos intermitentes encontrados y corregidos.** La primera ejecución del push ([44639926627](https://github.com/Henrixfs/SIJASS/actions/runs/44639926627)) falló en `Prototipo (Node 26)` y en `Interfaz y E2E (navegador)`. Causas, ambas defectos de las pruebas y no del producto: (1) una prueba de `s1b` creaba dos promesas rechazadas antes de esperarlas, lo que Node.js 26 trata como rechazo no atendido (corregido en `cabdbe2`); (2) el E2E contaba la pestaña *Mediciones* sin esperar a que apareciera (corregido en `6cb320a`). Tras las correcciones, los jobs pasaron en las dos ejecuciones.
