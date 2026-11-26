# sijass-web — interfaz de SIJASS

Interfaz React + TypeScript + Vite del primer flujo de valor (`s1b-acceso-cuotas-pagos`): el **personal de la JASS** registra asociados, genera cuotas y registra y reversa pagos; el **asociado** ve su saldo, sus cuotas y sus pagos.

> Estado: **prototipo**. No es una PWA, no tiene diseño validado con usuarios y no está desplegada.

## Uso

Requiere Node.js 22 o superior y la API en marcha (`tecnologia/siJASS-clean-architecture`, `npm run api`).

```bash
npm ci
npm run dev        # http://localhost:5173, con /v1 reenviado a la API (SIJASS_API, por defecto http://127.0.0.1:3000)
npm run lint
npm test           # 56 pruebas (lib, cliente y pantallas)
npm run build      # genera dist/, que la API puede servir con WEB_DIR=<ruta a dist>
```

## Decisiones

- Los importes viajan como **céntimos enteros** y se muestran en soles (`Intl`, `es-PE`); lo que escribe la persona se convierte sin coma flotante.
- El token de acceso vive **solo en memoria**; el de refresco, en `sessionStorage` (por pestaña). Un `401` provoca una única renovación compartida.
- Cada intento de pago lleva una `Idempotency-Key`; un reintento del mismo envío la conserva y cualquier cambio de contenido genera otra.
- La guardia de pantallas por perfil es solo una comodidad: **la autorización real es siempre del servidor**.
- **El movimiento tiene presupuesto**: nada pasa de 300 ms, solo se animan `transform`, `opacity` y colores (más la columna del panel lateral, única excepción documentada) y «reducir movimiento» deja solo fundidos de 120 ms. Una prueba (`src/pruebas/movimiento.test.ts`) lo vigila sobre las hojas de estilo; el panel lateral del personal se pliega a una franja de iconos desde 1024 px y la elección se recuerda en el navegador.

## Limitaciones

- Sin recuperación autónoma de clave: la persona que administra restablece la clave (ver la [guía de operación](../../docs/08-despliegue/guia-operacion-acceso.md)). El ingreso es por DNI con los botones «Soy asociado» y «Soy administrador»; la clave entregada se muestra una sola vez y no se guarda en el navegador.
- Sin biblioteca de rutas, de estado ni de formularios; sin internacionalización más allá del español.
- `sessionStorage` expone el token de refresco a un posible XSS; se mitiga con la ausencia de HTML inyectado y no con una política de contenido todavía.
