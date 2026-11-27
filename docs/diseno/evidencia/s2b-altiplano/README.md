# Evidencia de `s2b-interfaz-altiplano-incidencias` (2026-11-27, en local)

El usuario pidió que la interfaz real quedara **tal cual** el video de la maqueta v3 (`docs/diseno/propuesta-altiplano/video/recorrido.mp4`). Estas capturas son de la interfaz real servida por la API de la demo local (`http://localhost:3001`, base `sijass_demo` migrada hasta `0006`), con sus datos reales. Las fotos de fondo son referenciales: ver los [créditos](../../../../tecnologia/sijass-web/public/fotos/CREDITOS.md).

## Maqueta y sistema, lado a lado

- [Panel del personal](comparacion-panel.webp): ingreso, resumen del Consejo, menú abierto, asociados, cuenta, cuotas y pagos, El agua, reportes, equipo, Tesorería y Operación.
- [Portal y plataforma](comparacion-portal.webp): inicio del celular, reporte en tres pasos, mis reportes, perfil con avatar y panel de plataforma.

Diferencias que quedan, a propósito: los datos son los de la demo (por ejemplo, el registro de prueba «texto» del padrón), la tarjeta de ingreso es casi opaca para el contraste, los botones «Revertir» miden 44 px y la clave temporal va en letra de 24 px. Los paneles laterales del portal en la maqueta («Ver como» y «Así le llega a tu JASS») eran solo de la maqueta y no existen en el sistema.

## Capturas

| Captura | Qué muestra |
|---|---|
| ![Ingreso](01-ingreso.webp) | Ingreso a 1440 px con la laguna de Llanganuco y agua animada |
| ![DNI](02-ingreso-dni.webp) | Paso 2 del ingreso: DNI y clave |
| ![Resumen](10-consejo-resumen.webp) | Resumen del Consejo: saldo por cobrar, estanque, cobranza por mes, familias con saldo, reservorios y reportes |
| ![Menú](11-menu-abierto.webp) | Menú abierto al pasar el mouse |
| ![Asociados](12-asociados.webp) | Padrón con avatar, una gota por mes, estado y saldo |
| ![Cuenta](13-cuenta.webp) | Cuenta de un asociado en el cajón lateral |
| ![Cobrar](14-cobrar.webp) | Registrar pago: quién paga, cuota, importe y comprobante |
| ![Cuotas](15-cuotas.webp) | Cuotas y pagos: emitido, cobrado y pendiente como niveles de agua |
| ![El agua](16-agua.webp) | El agua del Consejo |
| ![Reportes](17-reportes.webp) | Bandeja y ficha a color de un reporte |
| ![Asistente](18-asistente.webp) | Asistente con citas de los documentos de ejemplo |
| ![Equipo](19-equipo.webp) | Equipo con avatar e insignia del rol |
| ![Tesorería](20-tesoreria.webp) | «Mi caja» de Tesorería |
| ![Operación](30-operacion.webp) | «Mi jornada» de Operación |
| ![Agua de Operación](31-operacion-agua.webp) | El agua de Operación con el gráfico de gotas |
| ![Portal](40-portal.webp) | Portal de la familia como celular |
| ![Reportar](41-reportar.webp) | ¿Qué está pasando? |
| ![Detalle](42-reportar-detalle.webp) | Cuéntanos un poco más |
| ![Mis reportes](43-mis-reportes.webp) | Avance e historial de los reportes |
| ![Perfil](44-portal-perfil.webp) | Perfil con la elección del avatar |
| ![Portal móvil](45-portal-movil.webp) | El portal a 390 px |
| ![Plataforma](50-plataforma.webp) | Panel de plataforma |
| ![Consejo móvil](60-consejo-movil.webp) | Resumen del Consejo a 390 px |
| ![Asociados móvil](62-asociados-movil.webp) | Padrón a 390 px |

## Comprobaciones (sobre la compilación final)

| Comprobación | Resultado |
|---|---|
| `npm run lint`, `tsc -b`, `npm test` y `npm run build` en `tecnologia/sijass-web/` | Código 0; 158 pruebas |
| `npx playwright test` en `tecnologia/e2e/` (API real y PostgreSQL) | 15 pruebas aprobadas |
| `npx playwright test -c playwright.responsive.config.ts` | 23 pruebas aprobadas (320 a 1440 px: sin desborde, controles de 44 px, contraste y teclado) |
| Recorrido con la API de la demo (todas las pantallas de las capturas) | Sin errores de consola y sin desborde a 390 px |

Es evidencia **local**: falta la ejecución en CI. No es una prueba con personas reales.
