# Guía de operación: accesos, JASS y claves

**Estado:** prototipo verificado en local (2026-11-25), sin despliegue real. Describe cómo se opera el acceso por DNI que introduce `s2a-acceso-dni-multi-jass` ([propuesta](../../openspec/changes/s2a-acceso-dni-multi-jass/proposal.md)). Para el contenedor y lo que falta del despliegue, vea [despliegue y bloqueos](despliegue-y-bloqueos.md).

## 1. Cómo funciona, en una página

- **Todas las personas entran con su DNI** (8 números) y una clave. La pantalla de ingreso ofrece dos botones grandes: **«Soy asociado»** y **«Soy administrador»**. El botón es solo una pista: el servidor decide quién es la persona. Si elige el botón equivocado, la interfaz se lo explica y le ofrece el otro, sin dar sesión.
- **Las claves nuevas las genera el sistema**: tres palabras separadas por guiones, por ejemplo `cima-tela-pozo`. Se muestran **una sola vez** en pantalla (con botones para copiar o imprimir una tarjeta) y nunca se guardan ni se vuelven a mostrar. Mientras la clave sea la entregada, se acepta escrita en mayúsculas, con espacios o sin tildes.
- **Quién da de alta a quién:**

| Quién | Crea o restablece | Lo hace en |
|---|---|---|
| Equipo de plataforma | Las JASS y la clave de su Consejo; suspende y reactiva JASS | Pantalla `/plataforma` o línea de comandos |
| Consejo | Tesorería y Operadores de su JASS (alta, restablecer clave, desactivar) | Sección **Equipo** |
| Consejo y Tesorería | El acceso de cada asociado y su restablecimiento de clave | Sección **Asociados** |

- **Primer ingreso del personal:** Tesorería, Operadores, Consejo y plataforma deben cambiar la clave recibida por una propia (10 caracteres o más, por ejemplo una frase). Hasta entonces el servidor solo les deja cambiar la clave, ver quiénes son y salir. Las familias usan la clave entregada tal cual.
- **Cada JASS ve solo lo suyo**, y lo exige la base de datos (§5), no solo la aplicación. El equipo de plataforma administra JASS pero **no ve** padrón, cuotas, pagos ni mediciones.

## 2. Arranque de la plataforma (una vez por instalación)

Requiere la base migrada (`npm run migrar`) y la API compilada (`npm run build`). La clave inicial se lee del entorno para que no quede en el historial del terminal ni se imprima.

```bash
export DATABASE_URL=postgres://<usuario>:<clave>@<host>:5432/<base>
SIJASS_CLAVE_INICIAL='<clave temporal>' npm run crear-plataforma -- 12345678 "Nombre del responsable"
```

La cuenta de plataforma entra con «Soy administrador», su DNI y esa clave, y elige la suya al primer ingreso. Aparece en `/plataforma`.

## 3. Alta de una JASS

**Por la interfaz (lo habitual):** `/plataforma` → **Nueva JASS** → nombre de la JASS, ubicación (opcional) y el primer Consejo (nombre y DNI) → **Crear JASS**. Aparece el cuadro con la clave de tres palabras: se entrega en persona a esa persona, que la cambia al entrar. Una JASS no puede repetir nombre y ubicación, y un DNI solo puede tener un acceso en todo el sistema (se explica en la pantalla).

**Por la línea de comandos** (instalación inicial o recuperación):

```bash
SIJASS_CLAVE_INICIAL='<clave temporal>' npm run crear-jass -- "JASS San Miguel" 23456789 "Nombre del presidente"
```

**Equipo de la JASS:** el Consejo entra en **Equipo** → «Agregar persona» (nombre, DNI y rol: Tesorería u Operador) y entrega la clave que aparece. El Consejo no puede desactivar su propia cuenta (la clave del Consejo la restablece el equipo de plataforma).

## 4. Entrega y restablecimiento de claves

1. **Quién olvidó su clave o se bloqueó:** quien lo administra pulsa **Restablecer clave** en su fila (Equipo para Tesorería y Operadores, Asociados para familias, `/plataforma` para el Consejo). El sistema genera una clave nueva, **invalida la anterior, cierra sus sesiones y quita el bloqueo**.
2. **Entrega:** se muestra una sola vez. Entréguela en persona; si imprime la tarjeta, destrúyala después. Nunca por mensajes o llamadas.
3. **Tras 5 intentos fallidos** la cuenta se bloquea 15 minutos. Además, desde una misma dirección se admiten **50 intentos fallidos** en 15 minutos (los ingresos correctos no cuentan, así una red compartida no se bloquea por entrar bien).
4. **JASS suspendida:** sus cuentas no pueden iniciar ni renovar sesión («Tu JASS está suspendida»); los datos se conservan. Se reactiva desde `/plataforma` y vuelven a entrar con sus claves de siempre.
5. Todo queda en la bitácora de auditoría (quién, cuándo y sobre qué cuenta), **sin** claves ni contraseñas.

## 5. Base de datos: el rol `sijass_app`

La migración `0005_seguridad-por-filas` crea el rol `sijass_app` (sin inicio de sesión, sin `BYPASSRLS`) y activa la seguridad por filas en las tablas de negocio. La API se conecta con el usuario propietario de la base y, **en cada transacción**, ejecuta `SET LOCAL ROLE sijass_app` y fija la JASS de la solicitud. Consecuencias para quien opera:

- La cadena `DATABASE_URL` sigue siendo la del propietario (el mismo que migra). **No** use `sijass_app` en la conexión: no puede iniciar sesión.
- Una consulta de negocio sin JASS no devuelve filas. Para revisar datos a mano como propietario: `SET ROLE sijass_app; SELECT set_config('app.jass_id', '<id>', false);`.
- Los roles son del clúster: si ya existe `sijass_app` de otra base, se reutiliza.
- Detrás de un proxy HTTPS (perfil `https` del compose) defina `TRUST_PROXY=1` **y no publique el puerto 3000**; si no, el límite de intentos fallidos cuenta todas las visitas como una sola dirección.

## 6. Cuentas anteriores a `s2a`

La migración `0004` da a las cuentas de **asociados** el DNI y el nombre de su ficha cuando el documento tiene 8 dígitos y no se repite. Las cuentas de **personal** creadas con correo necesitan DNI y nombre:

```bash
npm run asignar-documento -- consejo@ejemplo.pe 23456789 "Nombre de la persona"
```

Después entran con su DNI y su contraseña de siempre; el correo queda como dato opcional.

## 7. Datos de demostración (solo desarrollo)

```bash
SIJASS_PERMITIR_DEMO=1 SIJASS_CLAVE_DEMO='<clave de prueba>' npm run sembrar-demo
```

Crea una cuenta de plataforma, la «JASS Demostración» con Consejo, Tesorería y dos Operadores (uno con cambio de clave pendiente) y tres asociados con cuenta (DNI `10000000`–`10000004` y `70000001`–`70000003`). Se niega a ejecutarse sin `SIJASS_PERMITIR_DEMO=1`. No lo use en producción.

## 8. Qué no hace todavía

- **No hay recuperación por cuenta propia** (correo, SMS o preguntas): restablece quien administra a esa persona, en persona. Es deliberado para quienes no usan correo.
- Solo el Consejo gestiona el equipo; no hay varias JASS por persona ni una persona con perfiles de dos JASS.
- La plataforma es una sola cuenta de equipo; no hay permisos por separado dentro de ella.
- Falta evaluar el ingreso con personas reales (PT23): las medidas de accesibilidad de esta guía son técnicas, no de uso.

## 9. Evidencia

Ejecutada en local el 2026-11-25: ver el [plan de pruebas](../05-trazabilidad-y-validacion/plan-pruebas.md#verificación-de-s2a-acceso-dni-multi-jass-2026-11-25-en-local) y las [capturas y medidas](../diseno/evidencia/s2a-acceso/README.md).
