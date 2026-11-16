# Tasks

Las rutas son relativas a `tecnologia/siJASS-clean-architecture/` salvo que se indique otra cosa. Se trabaja en la rama `chore/retirar-node-20`, creada desde `main`.

## 1. Versiones declaradas (D2)

- [x] 1.1 En `package.json`, cambiar `engines.node` a `>=22` y `@types/node` a `^22`, y regenerar `package-lock.json` con `npm install`. Verificar:
  - `git diff package-lock.json` solo modifica `@types/node` y su dependencia `undici-types`; cualquier otro cambio de transitivas se trata como hallazgo y se corrige;
  - `npm ci` en una copia limpia termina con código 0 sin modificar `package.json` ni `package-lock.json`.
- [x] 1.2 Con los tipos de Node.js 22, ejecutar `npm run lint`, `npm run build` y `npm test`. Verificar que los tres terminan con código 0, que el build no emite errores de tipos y que `npm test` ejecuta las 73 pruebas unitarias (ninguna omitida).
- [x] 1.3 Ejecutar `npm run test:integration` contra PostgreSQL local (`docker compose up -d --wait`, `DATABASE_URL` con el puerto que corresponda, `npm run migrar`). Verificar que pasan las 52 pruebas, y apagar la base con `docker compose down -v`.

## 2. Matriz de CI (D1)

- [x] 2.1 En `.github/workflows/ci.yml`, cambiar la matriz del job `prototipo` de `[20, 22]` a `[22, 24, 26]`. Verificar:
  - el YAML se analiza sin errores y `jobs.prototipo.strategy.matrix.node` vale `[22, 24, 26]`;
  - `git diff .github/workflows/ci.yml` modifica únicamente esa línea; los jobs `documentacion` e `integracion` no cambian.

## 3. Documentación prospectiva (D3)

- [x] 3.1 Cambiar «Node.js 20 o superior» por «Node.js 22 o superior» en `README.md` (raíz) y en `tecnologia/siJASS-clean-architecture/README.md`, y actualizar en este último la fila de DT01 solo si afirma el rango vigente. No tocar las menciones fechadas de ejecuciones pasadas (D3). Verificar:
  - `grep -rn "Node.js 20 o superior" README.md tecnologia/siJASS-clean-architecture/README.md` no devuelve resultados;
  - las menciones históricas con «Node.js 20 y 22» siguen intactas;
  - `node scripts/verificar-docs.mjs` (desde la raíz) termina con código 0.

## 4. Verificación en CI (solo con autorización para subir la rama)

- [x] 4.1 Subir la rama `chore/retirar-node-20` y abrir el pull request contra `main`. Verificar:
  - terminan en verde `Prototipo (Node 22)`, `Prototipo (Node 24)`, `Prototipo (Node 26)`, `Documentación` e `Integración (PostgreSQL)`;
  - no existe ningún job `Prototipo (Node 20)`;
  - se anota la URL de la ejecución como evidencia.

  Si `Prototipo (Node 26)` falla, se detiene el trabajo, se informa la causa y se decide según *Risks* de `design.md`; no se oculta el fallo ni se marca la tarea.
  - Evidencia: [PR #7](https://github.com/Henrixfs/SIJASS/pull/7), commit `cf9973d`, ejecución [43920160971](https://github.com/Henrixfs/SIJASS/actions/runs/43920160971): `Prototipo (Node 22)`, `Prototipo (Node 24)`, `Prototipo (Node 26)` (v26.13.1), `Documentación` e `Integración (PostgreSQL)` en verde, cada `Prototipo` con 73 pruebas aprobadas y 0 omitidas; no existe ningún job de Node 20. El riesgo de Node.js 26 de `design.md` no se materializó.

## 5. Documentación con evidencia (solo tras 4.1)

- [x] 5.1 En `docs/07-evaluacion-final/matriz-cumplimiento.md`, actualizar las filas C12 y C14 con la matriz `[22, 24, 26]`, `engines >=22` y `@types/node ^22`, enlazando la ejecución de 4.1, y actualizar la versión y fecha del documento. No cambiar ningún estado a *Implementado*. Verificar:
  - `node scripts/verificar-docs.mjs` termina con código 0;
  - `grep -E "^\| C[0-9]{2} \|" docs/07-evaluacion-final/matriz-cumplimiento.md | grep "| Implementado"` no devuelve resultados.
- [x] 5.2 Subir el commit documental al mismo pull request. Verificar que los jobs vuelven a terminar en verde y anotar la URL.
  - Evidencia: commit `95dcd7d` en el [PR #7](https://github.com/Henrixfs/SIJASS/pull/7), ejecución [43920695704](https://github.com/Henrixfs/SIJASS/actions/runs/43920695704): `Prototipo` (Node 22, 24 y 26), `Documentación` e `Integración (PostgreSQL)` en verde.

## 6. Integración final

- [x] 6.1 Ejecutar `openspec validate retirar-node-20 --strict`. Verificar que termina con código 0 y sin avisos.
- [x] 6.2 En una copia limpia del commit final, ejecutar `npm ci`, `npm run lint`, `npm test` y, desde la raíz, `node scripts/verificar-docs.mjs`. Verificar que todo termina con código 0 y que los resultados coinciden con el CI de 5.2.

## Workflow follow-up

- Fusionar el pull request y archivar el cambio con `/opsx:archive retirar-node-20`; su delta modifica dos requisitos existentes de `prototype-quality-gate`.
- Planificar `s1b` (usuarios, membresías y auditoría), cuyo diseño debe resolver cómo auditar los rechazos sin contradecir «un rechazo no deja rastro».
- Renombrar la fila de la Etapa 1 del roadmap y la línea del README del prototipo que aún hablan de un único `s1b-pagos-membresias-auditoria` (ahora `s1b`, `s1c` y `s1d`).
