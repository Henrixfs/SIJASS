# Tasks

## 1. Base visual

- [x] 1.1 Fotos WebP con créditos en `public/fotos` y sistema visual `altiplano.css` (tokens, botones, olas, tarjetas, reducir movimiento).
- [x] 1.2 Avatares SVG por identificador y su prueba (mismo identificador, mismo avatar).
- [x] 1.3 Ingreso con la laguna y agua WebGL con alternativa estática, sin cambiar campos ni mensajes.

## 2. Panel del personal

- [x] 2.1 Menú lateral por puntero y foco, fijable, con botón «Menú» en pantallas estrechas; prueba de apertura y cierre.
- [x] 2.2 Encabezado con foto en el resumen y avatares en asociados y equipo.

## 3. Incidencias

- [x] 3.1 Cliente de la API con envío binario para la foto.
- [x] 3.2 Portal: reporte en tres pasos, foto opcional y «Mis reportes» con avance e historial público; pruebas.
- [x] 3.3 Personal: bandeja y ficha con acciones por rol y manejo de `409`; pruebas.

## 4. Verificación

- [x] 4.1 `npm run lint`, `tsc -b`, `npm test` y `npm run build` de la interfaz.
- [x] 4.2 E2E con la API real: el asociado reporta y Operación atiende; suite completa sin regresiones.
- [x] 4.3 Capturas a 390 y 1440 px y revisión con «reducir movimiento».

## 5. Réplica fiel de la maqueta v3 (pedido del 2026-11-27)

- [x] 5.1 Portar el CSS de la maqueta a `src/v3/maqueta.css` (prefijo `.v3`) y aislar las hojas antiguas (`@layer antiguo` y `:not(.v3 *)`).
- [x] 5.2 Piezas de la maqueta en `src/v3/base.tsx` (avatares, olas, gotas por mes, estanque, columnas, héroe, banda, cajón, clave, tapa) y datos reales en `src/v3/datos.ts`.
- [x] 5.3 Panel: menú del riel, inicio por rol (Resumen, Mi caja, Mi jornada), Asociados, Cuotas y pagos, El agua, Reportes, Asistente, Equipo y Mi perfil con el aspecto de la maqueta y cajones para cada acción.
- [x] 5.4 Portal como celular (inicio, cuotas, pagos, perfil con avatar, mis reportes y el reporte en tres pasos), ingreso y plataforma como en la maqueta.
- [x] 5.5 Pruebas web adaptadas a las pantallas nuevas (`npm run lint`, `tsc -b`, `npm test`, `npm run build`).
- [x] 5.6 E2E con la API real y pruebas responsive de 320 a 1440 px.
- [x] 5.7 Capturas lado a lado con el video y evidencia.

## Evidencia

Ver [evidencia de s2b](../../../docs/diseno/evidencia/s2b-altiplano/README.md): 158 pruebas web, 15 E2E y 23 responsive en local sobre la compilación final (2026-11-27), y las hojas que comparan la maqueta con el sistema. Falta la ejecución en CI.

Decisiones tomadas al probar: con el menú cerrado cada enlace mide 52 px (lo visible), para que el clic de un lector de voz o de una prueba automática caiga en el enlace; al elegir una sección el menú se cierra; abrir y cerrar por el puntero solo vale en el riel de escritorio (en pantallas angostas lo abre «Menú»); y al ingresar la pantalla cambia de inmediato y la «oleada» solo acompaña (si esperaba, deshacía el primer toque de la persona).
