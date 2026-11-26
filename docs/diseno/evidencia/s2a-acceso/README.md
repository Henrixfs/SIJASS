# Evidencia de adaptación de `s2a-acceso-dni-multi-jass`

Capturas y medidas del ingreso por DNI, el cambio obligatorio de clave y la entrega de la clave temporal, tomadas con Chrome (Playwright) el 2026-11-25 a **320, 360, 390, 768 y 1440 px**. La API está **simulada** en estas pruebas (las rutas `/v1/*` se interceptan); lo que se mide es la interfaz construida, no el servidor. El recorrido contra la API y PostgreSQL reales está en las [pruebas E2E](../../../../tecnologia/e2e/pruebas/flujo-acceso.spec.ts).

| Archivos | Pantalla |
|---|---|
| `ingreso-1-elegir-*`, `ingreso-2-datos-*`, `ingreso-3-error-*` | Ingreso: dos botones, DNI y clave, error del DNI |
| `cambio-1-primer-ingreso-*`, `cambio-2-error-*` | «Elige tu clave» del primer ingreso y su error |
| `equipo-1-lista-*`, `entrega-clave-*` | Equipo del Consejo y cuadro con la clave de tres palabras |
| [`medidas.json`](medidas.json) | Medidas por pantalla y ancho |

## Qué se comprobó en cada ancho (pasa o la prueba falla)

- **Sin desbordamiento horizontal** (`scrollWidth <= clientWidth`) en cada paso.
- **Objetivos táctiles:** todo botón, enlace, campo o selector de las tres pantallas mide **al menos 44 × 44 px**; los dos botones de tipo de acceso, al menos 56 px en su lado menor.
- **Contraste del texto** (WCAG, contra el fondo opaco más cercano): mínimo 4,5:1 en títulos, etiquetas, ayudas, errores, botones y la clave; en `medidas.json` está cada razón. El valor más bajo medido es 5,70:1 en el ingreso, 6,04:1 en el cambio de clave y 12,44:1 en la entrega de la clave.
- **Teclado:** `Tab` llega a «Soy asociado» y «Soy administrador»; `Enter` elige y el foco pasa al campo del DNI; el orden es DNI → clave → «Mostrar clave» → «Ingresar». En el cambio de clave el orden es el de la pantalla y un error deja el foco en el primer campo con problema. En el cuadro de la clave el foco **no sale** a la página de atrás y `Escape` lo cierra, con la clave ya fuera de la página.
- **La clave temporal** se muestra en letra de al menos 24 px, el cuadro cabe en el ancho del dispositivo y la clave no queda en el DOM tras cerrarlo.

## Lo que **no** demuestra

No hay prueba con personas reales ni con lectores de pantalla o dispositivos físicos; el zoom del 200 % y los navegadores distintos de Chrome no se midieron. La conformidad WCAG 2.2 AA completa requiere esa revisión (PT23 sigue pendiente).

## Reproducir

```bash
cd tecnologia/e2e
npm run construir                                  # compila la API y la interfaz
GUARDAR_EVIDENCIA=1 npx playwright test -c playwright.responsive.config.ts
```

Sin `GUARDAR_EVIDENCIA=1` las mismas comprobaciones se ejecutan sin escribir capturas.
