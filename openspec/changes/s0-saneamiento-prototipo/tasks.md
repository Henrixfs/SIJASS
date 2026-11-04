# Tasks

## 1. Instalación reproducible y compilación (DT01, DT02)

- [x] 1.1 En `tecnologia/siJASS-clean-architecture/`, añadir `@types/node@^20` como devDependency y `"engines": {"node": ">=20"}` a `package.json`; verificar que `npm install` termina sin errores.
- [x] 1.2 Generar y versionar `package-lock.json`; verificar en una copia limpia (sin `node_modules/` ni `dist/`) que `npm ci` termina con código 0 y no modifica el lockfile (`git diff --exit-code package-lock.json`).
- [x] 1.3 Verificar que `npm test` en la copia limpia compila sin `TS2307` y que pasan las 5 pruebas existentes (`# pass 5`, `# fail 0`).
- [x] 1.4 Verificar el escenario negativo: añadir temporalmente una dependencia solo en `package.json` y comprobar que `npm ci` falla; revertir el cambio temporal.

## 2. Lint (parte de DT07)

- [x] 2.1 Añadir devDependencies `eslint` (9.x) y `typescript-eslint`, crear `eslint.config.mjs` (flat config, reglas `recommended`, alcance `src/**/*.ts`, ignora `dist/`) y el script `"lint": "eslint src"`; verificar que `npm run lint` se ejecuta y reporta resultados.
- [x] 2.2 Resolver los hallazgos de lint sobre `src/` sin cambiar comportamiento (corregir o, solo si es inevitable, desactivar una regla puntual con comentario que cite la Etapa 1); verificar que `npm run lint` termina con código 0 y que `npm test` sigue pasando 5/5.
- [x] 2.3 Verificar el escenario negativo: introducir temporalmente una variable sin usar en `src/` y comprobar que `npm run lint` falla con archivo y línea; revertir.

## 3. Verificación documental

- [x] 3.1 Crear `scripts/verificar-docs.mjs` (Node, sin dependencias): valida enlaces relativos en `*.md` (excluye `node_modules`, `.git`, `openspec/`, `.claude/`, `.agents/`; ignora URLs absolutas y anclas), `RFnn` contra `docs/01-analisis-de-sistema/03-requisitos-funcionales.md`, `PTnn` contra `docs/05-trazabilidad-y-validacion/plan-pruebas.md` y `DTnn` contra la tabla del roadmap, más `HUnn` (`02-historias-del-usuario.md`), `RNFnn` (`04-atributos-de-calidad.md`) y `ADR-nnn` (`07-decisiones-arquitectonicas.md`), y que la rúbrica y la matriz de `docs/07-evaluacion-final/` contengan `C01`–`C16` exactamente una vez; sale con código 1 e informa archivo y destino/identificador. Verificar que `node scripts/verificar-docs.mjs` termina con código 0 e imprime el total de enlaces revisados (antes de crear `docs/07-evaluacion-final/` eran 50).
- [x] 3.2 Probar el script con casos negativos temporales (enlace roto, `RF99`, `PT99`, `DT99`, `HU99`, `RNF99`, `ADR-099`, `C17` en un `.md`, y la eliminación de la fila C07 de la matriz) y verificar que cada uno produce código 1 con mensaje que identifica archivo y origen del problema; revertir los casos.
- [x] 3.3 Añadir un script `docs:check` en un `package.json` raíz o documentar el comando en el README del repositorio; verificar que el comando documentado se ejecuta tal como está escrito.

## 4. CI (DT07)

- [x] 4.1 Crear `.github/workflows/ci.yml` con disparadores `push` y `pull_request` y el job `prototipo` (matriz Node 20 y 22, `actions/checkout@v4`, `actions/setup-node@v4` con caché npm, pasos `npm ci`, `npm run lint`, `npm run build`, `npm test` con `working-directory` del prototipo); verificar con `actionlint` o revisión de sintaxis YAML (`node -e` con parser YAML o `yq`) y que los comandos del job pasan localmente en secuencia.
- [x] 4.2 Añadir el job `documentacion` (Node 22, `node scripts/verificar-docs.mjs`) al mismo workflow; verificar que los dos jobs son independientes (sin `needs`) y que el comando pasa localmente.
- [x] 4.3 Subir la rama, abrir el pull request contra `main` y verificar que ambos jobs (`prototipo` en Node 20 y 22, y `documentacion`) terminan en verde; anotar la URL de la ejecución como evidencia.

## 5. Alineación documental con evidencia

- [x] 5.1 Actualizar `tecnologia/siJASS-clean-architecture/README.md`: comandos de ejecución (`npm ci`, `npm run lint`, `npm test`), resultado verificado con fecha y versiones de Node, y tabla de limitaciones con DT01, DT02 y DT07 como resueltas por `s0-saneamiento-prototipo` y DT03–DT06 abiertas para la Etapa 1; verificar con `node scripts/verificar-docs.mjs`.
- [x] 5.2 Actualizar `docs/00-alcance-y-roadmap.md` (§1 situación, §5 fila de la Etapa 0, §6 filas DT01/DT02/DT07) solo con la URL de CI en verde de la tarea 4.3 como evidencia; mantener DT03–DT06 abiertas; verificar que `node scripts/verificar-docs.mjs` sigue en 0 y que ningún documento afirma estados sin evidencia.
- [x] 5.3 Actualizar en `docs/07-evaluacion-final/matriz-cumplimiento.md` las filas C04, C05, C12 y C14 (y la sección 3) con enlaces a la ejecución de CI y a `package-lock.json`, y en `docs/05-trazabilidad-y-validacion/plan-pruebas.md` la fila PT21 y la sección 1 (resultado de `npm ci`/build); mantener como pendiente la integración (C05), el CD (C12) y el esquema de base de datos (C14); verificar con `node scripts/verificar-docs.mjs` y que ningún criterio figure como *Implementado*.
- [x] 5.4 Revisar `README.md` raíz, `docs/05-trazabilidad-y-validacion/matriz-trazabilidad.md` y `docs/05-trazabilidad-y-validacion/plan-pruebas.md` en busca de menciones a «sin CI», «no compila» o DT01/DT02/DT07 y alinearlas; verificar con `grep` que no quedan afirmaciones contradictorias.

## 6. Integración final

- [x] 6.1 En una copia limpia del commit final, ejecutar `npm ci && npm run lint && npm test` y `node scripts/verificar-docs.mjs`; verificar que todo termina con código 0 y que el CI del PR coincide.
- [x] 6.2 Confirmar que la configuración de OpenSpec (`openspec/`, `.claude/`, `.agents/`) y la rúbrica y matriz quedan confirmadas en commits del PR (hoy figuran sin versionar); verificar con `git status` sin archivos sin seguimiento relevantes.
- [x] 6.3 Ejecutar `openspec validate s0-saneamiento-prototipo --strict`; verificar que no reporta errores.

## Workflow follow-up

- Archivar el cambio (`/opsx:archive`) tras la revisión del pull request.
- Planificar la Etapa 1 (`DT03`–`DT06`) como un cambio nuevo.
