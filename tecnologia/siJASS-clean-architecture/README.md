# Prototipo TypeScript de dominio — SIJASS

**Estado:** prototipo. Demostración académica mínima de Clean Architecture e inversión de dependencias. **No** es una aplicación SIJASS operable y su modelo de datos corresponde al diseño anterior basado en estimación por IA.

## Estructura

```text
tecnologia/siJASS-clean-architecture/
├── package.json                      # Scripts build y test; dependencia de desarrollo: typescript
├── tsconfig.json                     # ES2022, NodeNext, strict; compila src/ en dist/
└── src/
    ├── dominio/medicion.ts           # Interfaz Medicion y función crearMedicion (validaciones)
    ├── dominio/puertos.ts            # Puertos RepositorioMediciones y RepositorioOperaciones
    ├── aplicacion/registrar-medicion.ts  # RegistrarMedicionCasoUso
    ├── infraestructura/memoria.ts    # Adaptadores MedicionesMemoria y OperacionesMemoria
    └── pruebas/dominio.test.ts       # Cinco pruebas unitarias con node:test
```

## Qué demuestra

- Separación en capas `dominio`, `aplicacion` e `infraestructura`.
- Un caso de uso que depende de un puerto (`RepositorioMediciones`) y no de su implementación.
- Validaciones de dominio: identificadores requeridos, cloro finito no negativo, confianza en [0, 1] y fecha válida.
- Registro de UUID de operación con respuesta `accepted` o `duplicate` en memoria.

## Ejecución

Desde esta carpeta, con Node.js 20 o superior:

```bash
npm install
```

```bash
npm test
```

**Resultado verificado el 2026-10-28** (Node.js 22.22.0, npm 10.9.4, copia limpia): la compilación **falla** con `TS2307: Cannot find module 'node:test'` porque `package.json` no declara `@types/node`. Al añadir `@types/node` localmente, sin versionar el cambio, las cinco pruebas pasan. La corrección se deja como deuda técnica (DT01) para un cambio de código posterior.

## Limitaciones

| Limitación | Deuda |
|---|---|
| No declara `@types/node`; no compila en instalación limpia | DT01 |
| No existe `package-lock.json`; no puede usarse `npm ci` | DT02 |
| `Medicion` usa `cloroMgL`, `confianza`, `confirmada` y `modeloId` del diseño anterior | DT03 |
| `Medicion` no incluye `jassId`, método, unidad, autor ni revisiones | DT04 |
| `OperacionesMemoria` guarda UUID en un `Set` separado de las mediciones y sin hash de contenido: no demuestra idempotencia transaccional ni detección de conflictos | DT05 |
| `MedicionesMemoria.guardar` lanza un `Error` genérico ante identificadores repetidos, comportamiento no especificado por el puerto | DT06 |
| Sin CI ni lint | DT07 |

No implementa React, PWA, IndexedDB, NestJS, PostgreSQL, API HTTP, autorización, sincronización ni RAG. Las deudas se describen en el [alcance y hoja de ruta](../../docs/00-alcance-y-roadmap.md#6-deuda-técnica-conocida).

## Migración prevista

1. Corregir DT01 y DT02 e incorporar CI con build, pruebas y lint.
2. Rediseñar `Medicion` según el [diseño interno](../../docs/03-diseno-de-software/diseno-interno/diseno-interno-de-modulos.md): registro manual con JASS, método, unidad, autor y revisiones.
3. Añadir pruebas de fechas, unidades, correcciones y pertenencia a JASS (PT01–PT03, PT09, PT10).
4. Integrar la idempotencia y el efecto de negocio en una transacción PostgreSQL (PT04, PT11, PT12).
5. Diseñar el contrato OpenAPI y probar los escenarios entre JASS (PT13, PT25).

**No hacer:** añadir un predictor ONNX «de demostración» que devuelva concentraciones DPD sin dataset de referencia ni evaluación independiente.
