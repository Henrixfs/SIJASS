# C4 — Nivel 4: código

Este nivel distingue el **código existente** (prototipo) del **diseño objetivo** para el MVP.

## 1. Código existente — prototipo

**Estado:** prototipo. Ubicación: [`tecnologia/siJASS-clean-architecture/src`](../../tecnologia/siJASS-clean-architecture/README.md).

```mermaid
classDiagram
  class Medicion {
    <<interface>>
    +id: string
    +reservorioId: string
    +cloroMgL: number
    +confianza: number
    +confirmada: boolean
    +modeloId: string
    +registradaEn: string
  }
  class crearMedicion {
    <<function>>
    +crearMedicion(input) Medicion
  }
  class RepositorioMediciones {
    <<interface>>
    +guardar(medicion) Promise~void~
    +buscar(id) Promise~Medicion~
  }
  class RepositorioOperaciones {
    <<interface>>
    +registrar(uuid) Promise~accepted o duplicate~
  }
  class RegistrarMedicionCasoUso {
    +ejecutar(input) Promise~Medicion~
  }
  class MedicionesMemoria
  class OperacionesMemoria
  RegistrarMedicionCasoUso --> RepositorioMediciones
  RegistrarMedicionCasoUso --> crearMedicion
  crearMedicion --> Medicion
  MedicionesMemoria ..|> RepositorioMediciones
  OperacionesMemoria ..|> RepositorioOperaciones
```

| Archivo | Contenido |
|---|---|
| `src/dominio/medicion.ts` | Interfaz `Medicion` y función `crearMedicion` que valida identificadores, cloro finito no negativo, confianza en [0, 1] y fecha |
| `src/dominio/puertos.ts` | Puertos `RepositorioMediciones` y `RepositorioOperaciones` |
| `src/aplicacion/registrar-medicion.ts` | `RegistrarMedicionCasoUso`: valida y persiste |
| `src/infraestructura/memoria.ts` | `MedicionesMemoria` (`Map`) y `OperacionesMemoria` (`Set` de UUID con validación de formato) |
| `src/pruebas/dominio.test.ts` | Cinco pruebas unitarias con `node:test` |

**Limitaciones:** el modelo corresponde a la hipótesis anterior de estimación por IA (`confianza`, `modeloId`, `confirmada`); no incluye JASS, método, autor ni revisiones; la idempotencia no es transaccional ni compara contenido; no existen API, persistencia real, autorización ni sincronización. El proyecto no compila en una instalación limpia por falta de `@types/node` (DT01).

## 2. Diseño objetivo del MVP

**Estado:** diseño propuesto; no es código escrito.

```mermaid
classDiagram
  class Medicion {
    +id: UUID
    +jassId: UUID
    +reservorioId: UUID
    +metodo: CodigoMetodo
    +valor: decimal
    +unidad: mg/L
    +tomadaEn: DateTime
    +registradoPor: UUID
    +estado: vigente o anulada
    +revision: int
    +corregir(valor, motivo, actor, revisionBase) RevisionMedicion
    +anular(motivo, actor)
  }
  class RevisionMedicion {
    +revision: int
    +valorAnterior: decimal
    +valorNuevo: decimal
    +motivo: string
    +actorId: UUID
    +realizadaEn: DateTime
  }
  class RegistrarMedicion {
    +ejecutar(comando, actor) Resultado
  }
  class SincronizarOperacion {
    +ejecutar(operacion, actor) ResultadoSync
  }
  class RepositorioMediciones {
    <<interface>>
    +guardar(medicion)
    +buscar(id, jassId)
    +listar(jassId, filtros)
  }
  class RepositorioOperaciones {
    <<interface>>
    +reservar(jassId, operationId, hash) Reserva
    +registrarResultado(jassId, operationId, resultado)
  }
  class PoliticaValidacionMedicion {
    <<interface>>
    +validar(comando) ResultadoValidacion
  }
  class Auditoria {
    <<interface>>
    +registrar(evento)
  }
  class UnidadDeTrabajo {
    <<interface>>
    +ejecutar(trabajo)
  }
  Medicion "1" *-- "0..*" RevisionMedicion
  RegistrarMedicion --> Medicion
  RegistrarMedicion --> RepositorioMediciones
  RegistrarMedicion --> PoliticaValidacionMedicion
  RegistrarMedicion --> Auditoria
  SincronizarOperacion --> UnidadDeTrabajo
  SincronizarOperacion --> RepositorioOperaciones
  SincronizarOperacion --> RegistrarMedicion
```

## 3. Migración del prototipo al diseño objetivo

1. Validar el contrato objetivo con operadores y la JASS piloto.
2. Corregir la deuda de compilación (DT01, DT02) e incorporar CI.
3. Escribir primero las pruebas de validación, autorización y corrección (PT01, PT02, PT09, PT10).
4. Sustituir los campos heredados mediante un cambio explícito y documentado, sin renombrados silenciosos.
5. Implementar los repositorios PostgreSQL, la unidad de trabajo y la idempotencia transaccional (PT04, PT11, PT12).
6. Aplicar pruebas de contrato y de seguridad antes de habilitar la captura sin conexión.
