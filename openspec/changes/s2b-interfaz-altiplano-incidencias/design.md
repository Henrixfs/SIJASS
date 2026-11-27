# Design

## Context

La interfaz es React 19 con Vite, sin enrutador externo, con estilos en CSS propio (`estilos.css`, `premium.css` y uno por pantalla) y pruebas con Vitest y Playwright que buscan por rol, etiqueta y `data-testid`. La maqueta aprobada está en `docs/diseno/propuesta-altiplano`.

## Goals / Non-Goals

**Goals:** llevar el aspecto de la maqueta a la interfaz real sin cambiar sus flujos ni su accesibilidad, y dar pantallas a las incidencias.

**Non-Goals:** rediseñar cada formulario del padrón, la plataforma o las mediciones más allá del nuevo sistema visual; guardar el avatar elegido; notificaciones; modo sin conexión.

## Decisions

1. **Réplica de la maqueta, pantalla por pantalla.** Una primera versión solo puso una capa visual encima de las pantallas antiguas; el usuario la rechazó porque no se parecía al video de la maqueta v3 y pidió hacerla «tal cual». Por eso cada pantalla (ingreso, panel por rol, padrón, cuotas, El agua, reportes, asistente, equipo, plataforma y el portal en forma de celular) usa ahora el mismo marcado y las mismas clases que la maqueta. Su CSS se porta con un script a `src/v3/maqueta.css` con el prefijo `.v3`; los ajustes del sistema real (flujo de página en vez de lienzo fijo, anchos de 320 a 1440 px, controles de 44 px, contraste) van en `src/v3/sistema.css`. Las hojas antiguas quedan en la capa `@layer antiguo` y con `:not(.v3 *)`, así no se filtran dentro de la interfaz nueva; siguen sirviendo a las pantallas que la maqueta no tiene (cambio de clave).
2. **Agua del ingreso en WebGL con salida segura.** Un sombreador deforma solo los píxeles turquesa bajo el horizonte de la foto. Sin WebGL, sin la foto o con «reducir movimiento» queda la foto quieta. El bucle se detiene al ocultar la pestaña o al salir del ingreso.
3. **Menú por puntero.** Con un puntero fino el riel mide 84 px y se abre a 260 px tras 80 ms sobre él; se cierra 220 ms después de salir. Se abre también con el foco del teclado y se puede fijar. Se despliega sobre el contenido con `clip-path`, sin mover la página. En pantallas táctiles o estrechas se conserva el botón «Menú».
4. **Avatares por identificador.** 16 dibujos propios en SVG; cada persona recibe uno según su identificador. No se infiere nada del nombre. El servidor todavía no guarda una elección.
5. **Incidencias sobre la API de `s1f`.** El reporte usa una `Idempotency-Key` generada en el navegador; la foto se envía después con `If-Match` de la revisión recibida. La ficha manda siempre la revisión que mostró y, ante `409`, recarga y lo explica sin borrar lo escrito. Solo el Consejo elige responsable, porque la lista del equipo (`/v1/equipo`) es suya; para los demás la ficha muestra si hay responsable.
6. **Presupuesto de movimiento.** Transiciones de interfaz de 300 ms o menos con `transform`, `opacity` o `clip-path`; los bucles (olas, agua) se pausan fuera de pantalla y desaparecen con «reducir movimiento».

7. **Cifras de la caja armadas en el navegador.** El resumen, el padrón (gotas por mes), cuotas y pagos usan el padrón y el estado de cuenta de cada asociado (`/v1/asociados/{id}/estado-de-cuenta`, de 6 en 6). No se inventa nada: si un estado de cuenta falla, la pantalla dice que las cifras son parciales. Un endpoint de resumen en el servidor queda para cuando el padrón crezca.
8. **Cajones en lugar de formularios fijos.** Cobrar, generar cuotas, revertir (con motivo obligatorio), registrar asociado, la cuenta del asociado, nueva lectura, nuevo reservorio, agregar persona y nueva JASS se abren en un cajón lateral (`<dialog>` modal: atrapa el foco y deja inerte el resto). La cuenta conserva su dirección (`/personal/asociados/{id}`). La clave temporal se muestra dentro del cajón o de la tarjeta, una sola vez, con copiar e imprimir. Restablecer claves, dar de baja, desactivar y suspender piden confirmación; reactivar una JASS es inmediato, como en la maqueta.
9. **«El agua» reúne reservorios y lecturas.** Las rutas anteriores (`reservorios`, `mediciones`, `campo`) llevan a «El agua». El inicio de cada rol es su resumen: «Resumen» (Consejo), «Mi caja» (Tesorería) y «Mi jornada» (Operación).
10. **Avatar elegido en el portal.** La familia elige su avatar en «Mi perfil» y se recuerda en su celular (`localStorage`, solo una preferencia); el personal sigue viendo el avatar asignado por identificador hasta que el servidor guarde la elección. Para el equipo, el avatar sale del rol y del orden dentro del rol.

## Risks / Trade-offs

- [Fotos pesadas en teléfonos modestos] → versiones WebP de 1600 px o menos.
- [WebGL en equipos viejos] → detección y foto estática.
- [Avatar asignado que no representa a la persona] → la familia elige el suyo en su celular; guardarlo en el servidor queda para un cambio con backend.
- [Muchas consultas de estado de cuenta en una JASS grande] → de 6 en 6 y con aviso de cifras parciales; un resumen en el servidor resolverá el costo.

## Migration Plan

Solo interfaz; se publica con la API del PR #16. Para la demo local hay que ejecutar `npm run migrar` sobre su base antes de usar Reportes.
