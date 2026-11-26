# SOLID y patrones de diseño en el código — SIJASS

**Estado:** prototipo verificado en local (2026-11-25). Este documento no repite la teoría de [principios de diseño](principios-de-diseno.md) ni de [patrones de diseño](patrones-de-diseno.md): señala **dónde está cada principio y cada patrón en el código que existe hoy**, para que se puedan comprobar en el repositorio. Lo que sigue siendo solo diseño se dice aparte (§4).

Raíz del código: [`tecnologia/siJASS-clean-architecture/src`](../../../tecnologia/siJASS-clean-architecture/src).

## 1. Capas (Clean Architecture)

| Capa | Carpeta | Regla de dependencia que se cumple |
|---|---|---|
| Dominio | [`dominio/`](../../../tecnologia/siJASS-clean-architecture/src/dominio) | No importa nada de NestJS, `pg`, Express ni del sistema de archivos. Define entidades, reglas y **puertos** |
| Aplicación | [`aplicacion/`](../../../tecnologia/siJASS-clean-architecture/src/aplicacion) | Casos de uso que dependen solo del dominio y de los puertos |
| Infraestructura | [`infraestructura/`](../../../tecnologia/siJASS-clean-architecture/src/infraestructura) | Adaptadores: memoria, PostgreSQL (`pg`), `scrypt`, tokens HS256, corpus en archivos |
| Interfaz (HTTP) | [`api/`](../../../tecnologia/siJASS-clean-architecture/src/api) | NestJS: controladores, guardia, filtro de errores, configuración y raíz de composición |

La dirección de las dependencias es siempre hacia dentro. Se puede comprobar: `dominio/` no contiene ningún `import` de `@nestjs`, `pg` ni `express`.

## 2. Principios SOLID

| Principio | Dónde se ve en el código | Cómo se comprueba |
|---|---|---|
| **S** — responsabilidad única | Un caso de uso por intención: [`RegistrarAsociado`, `ListarAsociados`, `ConsultarEstadoDeCuenta`…](../../../tecnologia/siJASS-clean-architecture/src/aplicacion/padron/padron.ts), [`RegistrarPago` y reversa](../../../tecnologia/siJASS-clean-architecture/src/aplicacion/padron/pagos.ts), [sesiones](../../../tecnologia/siJASS-clean-architecture/src/aplicacion/acceso/sesiones.ts), [equipo](../../../tecnologia/siJASS-clean-architecture/src/aplicacion/acceso/equipo.ts) y [plataforma](../../../tecnologia/siJASS-clean-architecture/src/aplicacion/acceso/plataforma.ts). La autorización ([`dominio/acceso.ts`](../../../tecnologia/siJASS-clean-architecture/src/dominio/acceso.ts)), la generación de claves ([`dominio/claves/`](../../../tecnologia/siJASS-clean-architecture/src/dominio/claves)) y la documentación de la API ([`api/documentacion.ts`](../../../tecnologia/siJASS-clean-architecture/src/api/documentacion.ts)) viven en módulos propios | Cada archivo tiene su suite en `src/pruebas/unitarias/` |
| **O** — abierto/cerrado | Añadir un adaptador (otra base, otro generador de claves, otro limitador de intentos) implica implementar un puerto, no tocar los casos de uso. `s2a` sustituyó el ingreso por correo por el ingreso por DNI y añadió el perfil de plataforma y el aislamiento por filas; en los casos de uso de pagos y mediciones el cambio se limitó a pasar el contexto de la transacción (`enJass`), sin tocar sus reglas | Las mismas baterías de contrato siguen pasando |
| **L** — sustitución de Liskov | El repositorio **en memoria** y el de **PostgreSQL** son intercambiables: las mismas baterías de [`pruebas/contrato/`](../../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato) (por ejemplo [`casos-padron.ts`](../../../tecnologia/siJASS-clean-architecture/src/pruebas/contrato/casos-padron.ts)) se ejecutan sobre ambos con el mismo resultado | `npm test` (memoria, Jest) y `npm run test:integration` (PostgreSQL) |
| **I** — segregación de interfaces | Puertos pequeños y separados en [`puertos-acceso.ts`](../../../tecnologia/siJASS-clean-architecture/src/dominio/puertos-acceso.ts) y [`puertos.ts`](../../../tecnologia/siJASS-clean-architecture/src/dominio/puertos.ts): `RepositorioAsociados`, `RepositorioCuotas`, `RepositorioPagos`, `RepositorioMembresias`, `RepositorioSesiones`, `RepositorioAuditoria`, `ServicioContrasenas`, `ServicioTokens`, `GeneradorClaves`, `LimitadorDeIntentos`, `Reloj`, `GeneradorIds`… Un caso de uso recibe solo lo que usa | Los dobles de prueba implementan un puerto a la vez |
| **D** — inversión de dependencias | Los casos de uso reciben sus dependencias por constructor (`DependenciasAcceso`) y nunca crean un adaptador. El único lugar que une puertos y adaptadores reales es la [raíz de composición](../../../tecnologia/siJASS-clean-architecture/src/api/composicion.ts); las pruebas componen con otros adaptadores ([`entorno-acceso.ts`](../../../tecnologia/siJASS-clean-architecture/src/pruebas/entorno-acceso.ts)) | Las 462 pruebas unitarias corren sin base de datos |

## 3. Patrones de diseño usados

| Patrón | Dónde | Para qué sirve aquí |
|---|---|---|
| **Repositorio** | `Repositorio*` en [`puertos-acceso.ts`](../../../tecnologia/siJASS-clean-architecture/src/dominio/puertos-acceso.ts); implementaciones en [`memoria-acceso.ts`](../../../tecnologia/siJASS-clean-architecture/src/infraestructura/memoria-acceso.ts) y [`acceso-postgres.ts`](../../../tecnologia/siJASS-clean-architecture/src/infraestructura/postgres/acceso-postgres.ts) | Oculta el SQL; el caso de uso pide «los pagos del asociado» |
| **Unidad de trabajo** | `UnidadDeTrabajoAcceso` / `UnidadDeTrabajo`; [PostgreSQL](../../../tecnologia/siJASS-clean-architecture/src/infraestructura/postgres/unidad-de-trabajo-acceso-postgres.ts) abre la transacción, fija la JASS y confirma o revierte | Todo lo de un caso de uso (por ejemplo un pago y su evento de auditoría) se guarda junto o no se guarda |
| **Puertos y adaptadores** (hexagonal) | Los puertos del dominio y los adaptadores de `infraestructura/` | Cambiar PostgreSQL por memoria, `scrypt` por otro algoritmo, o NestJS por otro marco sin tocar las reglas |
| **Inyección de dependencias / raíz de composición** | [`composicion.ts`](../../../tecnologia/siJASS-clean-architecture/src/api/composicion.ts) y [`casos.ts`](../../../tecnologia/siJASS-clean-architecture/src/aplicacion/casos.ts) | Un solo lugar decide qué adaptador se usa |
| **Comando / caso de uso** | Clases con un método `ejecutar` por intención | Cada operación es una unidad con nombre, probable y auditable |
| **Método de fábrica** | `crearMedicion` en [`dominio/medicion.ts`](../../../tecnologia/siJASS-clean-architecture/src/dominio/medicion.ts) | Una medición solo se construye válida: valida el valor, la unidad y la fecha antes de existir |
| **Receptor idempotente** | [`registrar-medicion.ts`](../../../tecnologia/siJASS-clean-architecture/src/aplicacion/registrar-medicion.ts) y pagos con `Idempotency-Key` | Un reintento no duplica: devuelve el resultado original; un contenido distinto con la misma clave es conflicto |
| **Guardia y filtro** (cadena de responsabilidad de NestJS) | [`guardia-y-filtro.ts`](../../../tecnologia/siJASS-clean-architecture/src/api/guardia-y-filtro.ts) | La guardia autentica y autoriza cada solicitud leyendo la membresía; el filtro traduce errores del dominio a respuestas sin filtrar detalles |
| **Tabla de políticas** (estrategia de autorización) | Permisos por perfil y rol en [`dominio/acceso.ts`](../../../tecnologia/siJASS-clean-architecture/src/dominio/acceso.ts) y `exigirPermiso` | Agregar un permiso es agregar una fila, no una cadena de `if` |
| **Decorador** | `DecoradorRepositoriosAcceso`: envuelve los repositorios de una transacción (usado en las pruebas para provocar fallos entre dos escrituras) | Probar la reversión completa sin modificar el código de producción |
| **Objeto de valor** | Documento (DNI), periodo `AAAA-MM`, importes en céntimos, claves de tres palabras | Reglas de formato en un solo lugar |

## 4. Lo que todavía es solo diseño

- **Eventos de dominio y *outbox*** (ADR-009 los admite si hace falta): no existen; la auditoría se escribe dentro de la misma transacción.
- **Módulos del monolito como paquetes aislados** (ADR-001): hoy la separación es por carpetas y por puertos, no por límites que el compilador haga cumplir.
- **Adaptadores de IA y de notificaciones** (ADR-007, ADR-012): el asistente usa un corpus de ejemplo y recuperación determinista, sin proveedor de modelo.

## 5. Cómo comprobarlo

```bash
cd tecnologia/siJASS-clean-architecture
grep -rn "@nestjs\|from 'pg'\|express" src/dominio src/aplicacion   # sin resultados: el núcleo no conoce el marco
npm run test:cobertura                                              # mismas pruebas sobre la memoria; reporte en cobertura/
npm run test:integration                                            # las mismas baterías de contrato sobre PostgreSQL
```
