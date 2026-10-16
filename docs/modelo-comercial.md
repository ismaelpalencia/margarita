# Vender Margarita: despliegue gestionado por cliente

Cómo se entrega la herramienta a un cliente, qué se le pide, qué se queda del lado del proveedor y qué falta para que sea autoservicio.

## Posicionamiento (actualizado 2026-10-15)

**Margarita se vende como herramienta de cobranza por WhatsApp.**

La estrategia cambió: en lugar de competir como "panel general de WhatsApp"
(donde hay decenas de herramientas más grandes), se ataca el nicho de
**cobranza**, donde el valor es concreto y medible: promesas de pago,
cumplimiento, intentos sin respuesta y reportes que el jefe de cobranza lleva a
la junta.

Lo que se vende es **un paquete y un extra**:

1. **La instalación** (pago único, **incluye el primer mes**): el panel
   operativo con el módulo de cobranza, funcionando en producción, con
   usuarios ilimitados. La página pública (`/`) muestra el precio de la
   promoción (`INSTALL_PRICE_PROMO`), el de lista (`INSTALL_PRICE`) y la
   vigencia (`INSTALL_PROMO_LABEL`).
2. **La mensualidad** (`INSTALL_MONTHLY_PRICE`), del segundo mes en adelante:
   mes con mes, sin plazos forzosos. Si el cliente deja de pagar, se acaba:
   se lleva su respaldo y se borra todo a petición.
3. **El servicio de conexión con Meta** (pago único, opcional): el trámite que
   todo el mundo subestima y que casi nadie quiere hacer. Detalle en
   [`guia-meta.md`](guia-meta.md); su precio es `SETUP_SERVICE_PRICE`
   ($1,500.00 MXN por omisión) y, si se contrata junto con la instalación, el
   paquete completo cuesta `SETUP_BUNDLE_PRICE` ($2,500.00 MXN).

**Lo que paga el cliente a Meta, no a nosotros:** el consumo de WhatsApp
(conversaciones y plantillas). Se dice en la página pública, en la propuesta y
en el contrato: nuestra factura es solo por la herramienta y los servicios.

**Para cobrar:** [`facturacion.md`](facturacion.md) junta los precios vigentes,
el mínimo de tres meses por contrato, las fechas de la promoción, el ciclo de
cobro mes a mes y las frases que ya funcionan con los clientes.

**Para mandar propuestas** ya está: la página pública explica qué hace la
herramienta, la guía de Meta explica el trámite (y ofrece hacerlo nosotros) y
[`propuesta-comercial.md`](propuesta-comercial.md) es la plantilla lista para
llenar. Ver "Cómo mandar una propuesta" más abajo.

Para acompañarla por WhatsApp, la imagen del volante se genera con
`python3 scripts/generate-promo.py --whatsapp=… --email=…` y queda en
`marketing/` (cuadrada para el chat y vertical para estados). Toma los mismos
precios que la página pública, así que no se pueden contradecir.

## El modelo

**Una instalación por cliente**: su proyecto en Railway, su base de datos, su dominio, su cuenta de WhatsApp. El proveedor (tú) despliega; el cliente opera y es dueño de su número, de su método de pago en Meta y de sus datos.

Ventaja principal: si un cliente envía mensajes sin consentimiento y Meta degrada su número, **no arrastra al resto**. Cada instalación tiene su propia reputación.

Este modelo **no necesita multi-tenant, licenciamiento ni panel de superadmin**. Se cobra por contrato y se factura a mano. Para los primeros clientes es suficiente.

## Runbook de alta

Tiempo estimado: **30 a 45 minutos** de trabajo del proveedor, más lo que tarde el cliente con Meta.

> **Camino rápido (recomendado para clientes nuevos):** con la **plantilla de Railway** publicada una vez, el alta baja a minutos y sin configurar variables a mano. El paso a paso para publicarla está en [`plantilla-railway.md`](plantilla-railway.md). El runbook de abajo sigue siendo el camino manual (y el que se usa para la propia instalación).

### 1. El cliente prepara su parte en Meta

Es lo que más tarda y no se puede saltar. El cliente necesita:

1. Una cuenta de **Meta Business** con su negocio verificado.
2. Una **app de Meta** con el producto WhatsApp agregado.
3. Una **WABA** (cuenta de WhatsApp Business) con al menos un número registrado.
4. Un **usuario del sistema** con permiso sobre la WABA y su **token permanente**.
5. El **App Secret** de la app (para la firma del webhook).
6. Un **método de pago** en Meta, y la verificación del negocio para salir del nivel mínimo de mensajería.

Del resultado de este paso salen cuatro datos que se usarán en la instalación:
`Business Account ID`, `Phone Number ID`, `Access token` y `App Secret`.

Conviene entregarle al cliente esta lista por escrito: es donde se atora todo el mundo.

### 2. El proveedor despliega

1. **Nuevo proyecto en Railway** apuntando al repositorio de Margarita.
2. Agregar el **plugin de PostgreSQL**.
3. Crear el **Volume** en `/data`.
4. Copiar las variables de entorno (la lista está en [`deploy-railway.md`](deploy-railway.md)). Las que no pueden faltar: `DATABASE_URL`, `APP_URL` con el dominio final, `JWT_SECRET`, `ENCRYPTION_KEY`, `META_APP_SECRET`, `NODE_ENV=production` y `MEDIA_STORAGE_DIR=/data/media`.
5. Configurar el **Pre-deploy Command**: `node dist/tools/deploy-migrations.js`.
6. Generar el **dominio** y volver a `APP_URL` si cambió.

### 3. El cliente configura su instalación desde el navegador

Ya no hace falta consola ni seed para un despliegue nuevo:

1. Abrir el dominio. Si la instalación está vacía, la app lleva al **asistente de alta** (`/setup`).
2. Crear la empresa y el usuario administrador (nombre, identificador, correo y contraseña).
3. Entrar y, en **Admin → WhatsApp**, capturar el `Business Account ID`, el access token y el verify token.
4. Registrar el **primer número** con su `Phone Number ID` y probar la conexión.
5. En Meta, configurar el webhook con la dirección que muestra el panel y el mismo verify token, y suscribir el campo `messages`.
6. Sincronizar plantillas.

El asistente **se cierra solo**: en cuanto existe un workspace, `/setup` deja de estar disponible y redirige al login.

### 4. Entrega

- Dar de alta al cliente como usuario de su panel y entregarle su acceso.
- Confirmarle por escrito la dirección de su **aviso de privacidad** (`/aviso-de-privacidad`), que él debe personalizar.
- Dejar claro quién da soporte y por qué canal.

## Actualizar instalaciones

Cada cliente es un despliegue distinto, así que una versión nueva se promueve, no se empuja:

1. Cada instalación se despliega desde un **tag** del repositorio (`v1.1.0`), no desde `main`. Así un cambio a medio hacer no llega a un cliente por accidente.
2. Al publicar: crear el tag, y en cada instalación actualizar el commit desplegado y redesplegar.
3. El Pre-deploy aplica las migraciones de esa versión.
4. Verificar en `/health` que la versión y el commit correspondan, y que el estado sea `healthy`.
5. Registro simple en una hoja: cliente, versión, fecha, quién actualizó.

La versión y el commit se ven en **Admin → Sistema** y en `/health`, así que saber "a quién le falta" no depende de la memoria.

## Cerrar un contrato

Cuando termina la relación:

1. **Exportar** todo desde Admin → Respaldos (JSON completo + los CSV que hagan falta).
2. **Eliminar los datos** desde Admin → Respaldos → *Eliminar todos los datos de la instalación*, escribiendo el identificador para confirmar.

Ese borrado elimina mensajes, conversaciones, contactos, campañas, plantillas, usuarios, sesiones, credenciales de Meta y los archivos del disco. Queda una constancia en la bitácora global (sin workspace) de que el borrado ocurrió, y la instalación vuelve a quedar lista para otro cliente.

Después: detener o borrar el proyecto de Railway, y revocar el acceso del proveedor si lo tenías.

## Paquete legal

Antes del primer cliente conviene tener, revisado por un abogado:

| Documento | Para qué |
| --- | --- |
| **Contrato de prestación de servicios** | Alcance, vigencia, precio, qué pasa si no se renueva |
| **Acuerdo de tratamiento de datos** | El cliente es responsable de los datos; el proveedor es encargado cuando da soporte |
| **Aviso de privacidad del cliente** | Se parte de [`aviso-privacidad.md`](aviso-privacidad.md) y el cliente lo personaliza |
| **SLA realista** | Una sola instancia, sin alta disponibilidad: no prometas 99.9% |
| **Política de respaldos** | Cada cuánto se descarga un respaldo y quién lo guarda |

Un punto que hay que decir en voz alta: **en cuanto das soporte, tienes acceso a datos personales de los clientes del cliente**. Eso te convierte en encargado del tratamiento, con obligaciones de confidencialidad, acceso controlado y borrado. Es la razón por la que el borrado total y el registro de accesos existen.

## Cómo mandar una propuesta

1. **Demostración** (30 min): se muestra la herramienta con datos de ejemplo y se
   pregunta cómo trabajan hoy la cobranza (cuántas personas, cuántos casos al
   mes, de dónde salen los teléfonos).
2. **Requisitos**: se revisa que el cliente tenga (o quiera crear) cuenta de Meta
   Business con método de pago y un número dedicado. Si no, se incluye el
   servicio de conexión en la propuesta.
3. **Propuesta**: se llena [`propuesta-comercial.md`](propuesta-comercial.md) y se
   manda. Se adjunta o se comparte [`guia-meta.md`](guia-meta.md) para que su
   área de sistemas vea en qué se está metiendo.
4. **Cierre**: anticipo del servicio de conexión y alta (ver el runbook de abajo).
5. **Piloto**: 1–3 contactos, una plantilla y una semana de uso antes de
   comprometer volumen.

## Paquetes sugeridos

| Paquete | Para quién | Incluye |
| --- | --- | --- |
| **Esencial** | Quien solo necesita enviar y atender WhatsApp | Bandeja, varios números, campañas con plantillas, bajas (STOP), respuestas rápidas, consentimiento, bitácora y respaldos |
| **Cobranza** | Equipos de cobranza (el paquete que se empuja) | Todo lo de Esencial + resultado de gestión con montos y fechas compromiso, promesas vencidas automáticas, intentos sin contestación, lista de trabajo del día y reportes con exportación |
| **Equipo** | Varios cobradores o agentes | Todo lo de Cobranza + usuarios por rol, límite diario de mensajes por persona, contador de no leídos y control de sesiones |

El **servicio de conexión con Meta** se cobra aparte en todos los paquetes (o se
incluye como gancho en contratos anuales).

## Qué falta para venderlo en serie

Lo que todavía no está listo, en orden de impacto:

1. **Automatizar el alta de la WABA con Embedded Signup** (ser Tech Provider de Meta). Elimina el paso más difícil para el cliente, pero cambia el rol del proveedor y agrega obligaciones formales.
2. **Panel de control de instalaciones**, si algún día hay muchos clientes: versiones, estado, renovaciones. Hoy se cubre con una hoja de cálculo.
3. **Sacar el respaldo del servidor**: la copia automática ya existe y se puede descargar, pero nadie la mueve a un lugar externo. Para el cliente conviene ofrecerlo como parte del servicio (o activar los respaldos del proveedor).

Lo que ya se cerró (2026-10-15):

- **Módulo de cobranza**: resultado de gestión con historial, promesas con monto y fecha compromiso (cifrados), promesa vencida automática, intentos sin contestación calculados, marcado en bloque y reportes con exportación. Además, control de sesiones (cierre por inactividad, tope de dispositivos y revocación) y landing y guía de Meta orientadas a cobranza.
- **Respaldos automáticos con restauración probada**: copia completa de la base cada 24 h, cifrada, verificada al crearse y con retención; se crea y descarga desde el panel y se restaura con un comando. Se probó restaurando datos borrados a propósito.
- **Varios administradores y recuperación de contraseñas**: el cliente puede tener más de un admin (con la regla de nunca quedarse sin ninguno activo), restablecer contraseñas desde el panel con cambio obligatorio al entrar, cambiar la propia desde «Mi cuenta», y recuperar el acceso por consola si nadie puede entrar.
- **Alta en minutos**: `railway.json` deja build, migraciones, arranque y healthcheck configurados; la app toma `APP_URL` del dominio de Railway y la raíz manda al asistente `/setup` mientras la instalación no esté configurada. Publicar la plantilla toma 15 minutos una sola vez (ver [`plantilla-railway.md`](plantilla-railway.md)).

- **Cifrado en reposo.** Teléfonos, notas, contenido de los mensajes, payloads de Meta, eventos de webhook, variables de campaña, números de la WABA, correos de acceso y bitácora se guardan cifrados con AES-256-GCM (`ENCRYPTION_KEY`); teléfono y correo se buscan por índice ciego. Conviene decir con precisión qué queda fuera, porque un área de sistemas lo va a preguntar: el disco (archivos de PostgreSQL y adjuntos) no está cifrado, y **los nombres de contacto siguen en claro** porque la búsqueda por texto del panel depende de ellos. En una instalación que ya traía datos en claro, se cifran con `npm run db:encrypt-data`.
- **Baja automática (STOP) y límites diarios.** Si un cliente escribe `STOP`, el sistema lo da de baja al instante y deja de escribirle, incluso en campañas; reactivarlo es una decisión explícita que queda auditada. El consentimiento (opt-in) se registra por contacto y las campañas avisan cuántos destinatarios no lo tienen. Los mensajes manuales por agente tienen tope diario aplicado de verdad.
