# Vender Margarita: despliegue gestionado por cliente

Cómo se entrega la herramienta a un cliente, qué se le pide, qué se queda del lado del proveedor y qué falta para que sea autoservicio.

## El modelo

**Una instalación por cliente**: su proyecto en Railway, su base de datos, su dominio, su cuenta de WhatsApp. El proveedor (tú) despliega; el cliente opera y es dueño de su número, de su método de pago en Meta y de sus datos.

Ventaja principal: si un cliente envía mensajes sin consentimiento y Meta degrada su número, **no arrastra al resto**. Cada instalación tiene su propia reputación.

Este modelo **no necesita multi-tenant, licenciamiento ni panel de superadmin**. Se cobra por contrato y se factura a mano. Para los primeros clientes es suficiente.

## Runbook de alta

Tiempo estimado: **30 a 45 minutos** de trabajo del proveedor, más lo que tarde el cliente con Meta.

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

## Qué falta para venderlo en serie

Lo que todavía no está listo, en orden de impacto:

1. **Cifrado de la base en reposo.** Un volcado expone conversaciones y teléfonos. Es lo primero que va a preguntar un cliente con área de sistemas.
2. **Plantilla de Railway** ("Deploy on Railway" apuntando a un repo plantilla) para que el alta sea de minutos y no de media hora.
3. **Automatizar el alta de la WABA con Embedded Signup** (ser Tech Provider de Meta). Elimina el paso más difícil para el cliente, pero cambia el rol del proveedor y agrega obligaciones formales.
4. **Panel de control de instalaciones**, si algún día hay muchos clientes: versiones, estado, renovaciones. Hoy se cubre con una hoja de cálculo.
5. **Opt-in y baja automática (BAJA/STOP)**, que hoy es manual. Sin eso no conviene vender la herramienta a un cliente que envíe volumen.
