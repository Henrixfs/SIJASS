# SIJASS Premium 2026

## Context

El handoff relaciona las páginas 02–13 de Penpot con los contratos. El frontend ya resuelve permisos en Personal, conserva la sesión en App y utiliza tablas financieras con etiquetas compactas. El catálogo de reservorios trae identificador y nombre. El historial aporta lecturas manuales y unidades.

## Goals / Non-Goals

Hacer reconocibles la cuenca, la cuenta y el cuaderno de campo como ámbitos de SIJASS. Mantener el tema operativo claro que documenta el handoff y reservar el azul profundo para navegación y superficies destacadas. Un segundo tema requeriría revisar cada estado financiero en ambos esquemas.

## Decisions

| Elemento | Decisión |
|---|---|
| Identidad | Ilustración editorial de una cuenca andina en el ingreso. Símbolo de agua e iconos lineales Lucide de trazo consistente junto a nombres accesibles. |
| Tipografía | Mantener Manrope e Inter Tight locales. Título fluido, interlineado compacto, texto de 16 px, numerales tabulares para comparar importes. |
| Tokens | Marino para orientación, turquesa oscuro para acción, neutros de papel y borde gris verdoso. Éxito, advertencia, información y error conservan etiqueta textual. Ritmo 4/8/12/16/24/32 y 48 px. Borde fino, radios según el tamaño, sombra concentrada en superficies flotantes. |
| Jerarquía | El ingreso combina ilustración y formulario. En el panel, una entrada principal según rol precede al directorio secundario. El perfil muestra capacidades, el padrón distingue alta y filtros, la cuenta presenta primero el saldo. |
| Movimiento | CSS para aparición escalonada, menú, hoja inferior y controles (160/280 ms). Motion para transición de valores reales. Reducir movimiento elimina los recorridos y conserva el valor accesible. |
| Operaciones | Comparar lecturas vigentes en la misma unidad mediante gráfico con tabla de respaldo. Tratar la cuenca como ilustración. La capacidad, el llenado y la potabilidad requieren fuentes específicas. |
| Adaptación | A 320–390 px compactar marca y navegación, presentar saldos y pagos como fichas, y abrir diálogos desde el borde inferior. A 768–1024 px respetar el área de tabla y a 1440–1920 px limitar la longitud de lectura. |
| Herramientas | Mantener Vite sin migración a Tailwind. Compartir el servidor shadcn con el registro Magic UI. Evaluar skills como herramientas de autoría, separadas del paquete distribuido. |
| Validación | Usar Vitest en jsdom, lint, build, tamaño bruto y gzip, capturas y métricas de Chrome. Distinguir demo, pruebas de componente y módulos pendientes de sesión. |

## Risks / Trade-offs

- Cambios locales en el frontend → aplicar ediciones incrementales y preservar manejadores, nombres accesibles, foco y rutas.
- Peso de la ilustración → codificar WebP y servir tamaño compacto en móvil.
- Evidencia privada → inspeccionar sesiones autorizadas en lectura, omitir datos identificativos en capturas.
- Diferencias con frames no accesibles → indicar el origen de cada comparación en el informe.

## Migration Plan

Publicación habitual del cliente estático con recursos versionados por Vite. La versión previa del cliente sigue siendo compatible con la misma API. El archivo del cambio queda sujeto a revisión final.
