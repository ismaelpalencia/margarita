# Margarita — Documento de Producto

## Versión

**Margarita V1**

## Estado

**Alcance congelado para MVP**

---

# 1. ¿Qué es Margarita?

Margarita es una plataforma web operativa para empresas que utilizan **WhatsApp Business Cloud API** como canal principal de comunicación.

Su objetivo es permitir que una empresa pueda enviar mensajes, recibir respuestas, operar campañas, organizar contactos, asignar conversaciones a agentes y monitorear el estado real de los mensajes enviados mediante la API oficial de Meta.

Margarita no es un CRM.

Margarita no es un chatbot.

Margarita no es un sistema de ventas.

Margarita no administra embudos comerciales, oportunidades, cotizaciones ni procesos de venta.

Margarita es una herramienta especializada para operar WhatsApp Business Cloud API de forma ordenada, segura y monitoreable.

---

# 2. Origen del proyecto

Margarita nace de un problema real: el bloqueo de números normales de WhatsApp al realizar envíos repetitivos o masivos.

En operaciones como cobranza, atención o seguimiento, muchas empresas utilizan WhatsApp como canal principal para contactar clientes. Sin embargo, usar números personales o números normales para enviar mensajes en volumen puede provocar bloqueos, restricciones o pérdida del canal de comunicación.

La API oficial de WhatsApp Business Cloud API resuelve parte de ese problema al permitir operar mediante una vía autorizada por Meta. Sin embargo, también introduce nuevos retos:

* Los mensajes pueden ser aceptados por Meta, pero no necesariamente entregados al cliente.
* Meta puede aplicar restricciones temporales por calidad, comportamiento, salud de la cuenta o problemas de pago.
* Es necesario utilizar plantillas aprobadas para iniciar conversaciones.
* Es difícil monitorear el ciclo real de cada mensaje sin una herramienta propia.
* Las respuestas de campañas pueden llegar en volumen y necesitan ser atendidas por varios agentes.
* Se requiere control operativo para saber quién atiende cada conversación.

Margarita nace para resolver estos problemas operativos.

Su propósito no es solamente enviar mensajes, sino permitir que una empresa entienda qué está ocurriendo con su operación de WhatsApp Business.

---

# 3. Problema que resuelve

Margarita resuelve el problema de operar una cuenta de WhatsApp Business Cloud API de forma profesional sin depender constantemente de procesos manuales o conocimientos técnicos.

Los principales problemas que resuelve son:

* Enviar campañas usando plantillas aprobadas por Meta.
* Validar números antes de enviar mensajes.
* Normalizar teléfonos mexicanos al formato correcto.
* Recibir respuestas de clientes.
* Asignar conversaciones a agentes disponibles.
* Permitir que el administrador supervise toda la operación.
* Registrar estados reales de mensajes mediante `wamid`.
* Detectar errores de Meta.
* Monitorear mensajes enviados, entregados, leídos o fallidos.
* Evitar que agentes envíen mensajes manuales sin autorización.
* Controlar límites de mensajes manuales por costo operativo.
* Mantener historial de conversaciones.

---

# 4. Qué sí hace Margarita V1

Margarita V1 permitirá:

* Iniciar sesión como administrador o agente.
* Crear y administrar agentes.
* Activar o desactivar agentes.
* Cambiar estado operativo de agentes.
* Crear, editar, buscar y desactivar contactos.
* Crear, editar y desactivar etiquetas.
* Asignar etiquetas a contactos.
* Conectar una cuenta de WhatsApp Business Cloud API por instalación.
* Sincronizar plantillas aprobadas desde Meta.
* Enviar mensajes manuales usando plantillas cuando la conversación esté cerrada.
* Enviar texto libre solamente cuando la ventana de conversación esté abierta.
* Enviar campañas desde archivo Excel usando plantillas aprobadas.
* Validar teléfonos antes de enviar campañas.
* Detectar registros duplicados, inválidos o incompletos en Excel.
* Registrar mensajes salientes con su `wamid`.
* Recibir webhooks de mensajes y estados.
* Actualizar estados de mensajes: enviado, entregado, leído o fallido.
* Crear conversaciones a partir de mensajes entrantes.
* Asignar conversaciones de forma manual o inteligente.
* Mostrar conversaciones asignadas a agentes.
* Permitir que el administrador vea todas las conversaciones.
* Permitir que el administrador tome o reasigne conversaciones.
* Enviar respuesta automática cuando no haya agentes disponibles.
* Mostrar monitoreo básico de mensajes, campañas, errores y eventos de Meta.
* Usar Socket.IO para eventos en tiempo real.
* Desplegar una instalación independiente por cliente en Railway.

---

# 5. Qué no hará Margarita V1

Margarita V1 no hará:

* No será un CRM.
* No administrará ventas.
* No tendrá embudos comerciales.
* No tendrá cotizaciones.
* No tendrá facturación.
* No tendrá pagos integrados.
* No tendrá panel SuperAdmin central.
* No tendrá múltiples empresas dentro de una misma instalación.
* No tendrá múltiples cuentas de WhatsApp por empresa.
* No creará plantillas dentro de Meta.
* No cifrará tokens de Meta en V1.
* No tendrá permisos personalizados complejos por agente.
* No descargará archivos multimedia automáticamente.
* No tendrá IA o chatbot en V1.
* No hará reintentos automáticos de campañas.
* No tendrá integración automática con Railway API.
* No soportará teléfonos internacionales fuera de México en V1.

Estas funciones podrán evaluarse para versiones futuras.

---

# 6. Modelo de despliegue

Margarita V1 será una aplicación **single-tenant por despliegue**.

Esto significa:

```text
1 cliente = 1 proyecto Railway = 1 base de datos = 1 Workspace
```

Cada cliente tendrá su propia instalación independiente de Margarita.

Ejemplo:

```text
Cliente A
↓
Proyecto Railway A
↓
Base de datos A
↓
Workspace A
```

```text
Cliente B
↓
Proyecto Railway B
↓
Base de datos B
↓
Workspace B
```

Todas las instalaciones usarán el mismo repositorio de código.

No se creará un repositorio por cliente.

La diferencia entre clientes estará en:

* Variables de entorno.
* Base de datos.
* Dominio.
* Cuenta de WhatsApp Business.
* Usuarios internos.
* Configuración operativa.

---

# 7. Roles de usuario

Margarita V1 tendrá dos roles principales:

```text
ADMIN
AGENT
```

No existirá `SUPER_ADMIN` dentro de la aplicación V1.

El dueño de Margarita administrará clientes desde Railway, terminal, base de datos o herramientas externas.

---

## 7.1 Admin

El Admin es el responsable operativo de la empresa.

Solo existirá **un Admin por instalación**.

El Admin puede:

* Ver dashboard general.
* Ver número de WhatsApp conectado.
* Ver estado de cuenta y calidad.
* Ver todos los agentes.
* Ver agentes disponibles.
* Crear agentes.
* Activar o desactivar agentes.
* Ver todas las conversaciones.
* Tomar conversaciones.
* Responder conversaciones.
* Asignar conversaciones.
* Reasignar conversaciones.
* Cerrar conversaciones.
* Crear contactos.
* Editar contactos.
* Desactivar contactos.
* Crear etiquetas.
* Editar etiquetas.
* Desactivar etiquetas.
* Asignar etiquetas a contactos.
* Sincronizar plantillas.
* Crear campañas.
* Subir archivos Excel.
* Validar campañas.
* Enviar campañas.
* Ver errores de campañas.
* Reintentar envíos fallidos manualmente.
* Ver monitoreo.
* Cambiar configuración operativa.

---

## 7.2 Agente

El Agente atiende conversaciones asignadas.

El Agente puede:

* Iniciar sesión.
* Cambiar su estado operativo.
* Ver su dashboard.
* Ver conversaciones asignadas.
* Responder conversaciones asignadas.
* Cerrar conversaciones asignadas.
* Enviar mensajes manuales solo si el Admin lo permite.
* Ver su consumo de mensajes manuales.
* Recibir conversaciones asignadas automáticamente si está disponible.

El Agente no puede:

* Crear campañas.
* Subir Excel.
* Ver monitoreo global.
* Crear usuarios.
* Cambiar configuración.
* Ver conversaciones de otros agentes.
* Crear o editar la cuenta de WhatsApp.
* Editar datos críticos de Meta.

---

# 8. Estados operativos de agentes

Los agentes podrán tener los siguientes estados:

```text
AVAILABLE
BUSY
BREAK
OFFLINE
```

Solo los agentes en estado `AVAILABLE` pueden recibir nuevas conversaciones mediante asignación automática.

Un agente en `BUSY`, `BREAK` u `OFFLINE` puede conservar sus conversaciones ya asignadas, pero no recibirá nuevas asignaciones automáticas.

Al iniciar sesión, un agente no queda disponible automáticamente.

Debe presionar manualmente la acción:

```text
Ponerme disponible
```

Esto evita que el sistema le asigne conversaciones antes de estar listo para trabajar.

---

# 9. Workspace

Aunque Margarita V1 tendrá una sola empresa por instalación, seguirá existiendo el concepto de `Workspace`.

El Workspace representa la empresa que usa esa instalación de Margarita.

Ejemplo:

```text
Workspace: Ferretería López
```

En V1 solo existirá un Workspace por despliegue.

Esta decisión mantiene el sistema ordenado y prepara el camino para una posible versión SaaS multiempresa en el futuro.

---

# 10. Configuración operativa

Cada Workspace tendrá configuración propia.

La configuración incluirá:

* Zona horaria.
* Idioma.
* Asignación automática activada o desactivada.
* Modo de asignación.
* Horario laboral.
* Mensaje automático cuando no haya agentes disponibles.
* Límite global de mensajes manuales por agente.
* Máximo de conversaciones activas por agente.
* Comportamiento cuando un cliente vuelve después de cerrar conversación.

La zona horaria por defecto será:

```text
America/Mexico_City
```

Margarita no dependerá de la zona horaria del servidor.

---

# 11. Contactos

Los contactos representan personas o números con los que la empresa puede comunicarse por WhatsApp.

Los contactos no son clientes de CRM.

Un contacto tendrá:

* Nombre reportado por Meta.
* Nombre personalizado.
* Teléfono normalizado.
* Notas simples.
* Etiquetas.
* Estado activo o inactivo.
* Última actividad.

---

## 11.1 Nombre de Meta y nombre personalizado

Cuando Meta envía un mensaje entrante, puede incluir el nombre del perfil de WhatsApp.

Ese nombre se guardará como:

```text
profileName
```

El Admin podrá asignar un nombre propio:

```text
customName
```

La interfaz mostrará:

```text
customName si existe
si no, profileName
si no, teléfono
```

El nombre enviado por Meta no se edita manualmente.

---

## 11.2 Normalización de teléfonos

Margarita V1 normalizará teléfonos mexicanos al formato:

```text
521XXXXXXXXXX
```

Ejemplos:

```text
55 1234 5678 → 5215512345678
+52 55 1234 5678 → 5215512345678
52 55 1234 5678 → 5215512345678
5215512345678 → 5215512345678
```

Margarita V1 no soportará normalización internacional avanzada.

---

## 11.3 Eliminación de contactos

Los contactos no se eliminarán físicamente en V1.

Si el Admin elimina un contacto, se marcará como inactivo:

```text
isActive = false
```

Esto permite conservar historial de conversaciones y mensajes.

---

# 12. Etiquetas

Las etiquetas sirven para organizar contactos y segmentar campañas.

Ejemplos:

```text
Cobranza
VIP
Promoción
Pendiente
Cliente actual
```

Una etiqueta puede pertenecer a muchos contactos.

Un contacto puede tener varias etiquetas.

Eliminar una etiqueta no elimina contactos.

En V1, una etiqueta eliminada se marcará como inactiva.

---

# 13. Cuenta de WhatsApp

Cada instalación de Margarita V1 tendrá una sola cuenta de WhatsApp Business Cloud API.

Los datos críticos de Meta se configurarán inicialmente mediante variables de entorno y seed.

La cuenta tendrá:

* Nombre visible.
* Número telefónico.
* Phone Number ID.
* Business Account ID.
* Access Token.
* Verify Token.
* Versión de API.
* Estado.
* Calidad.

El `accessToken` no se mostrará completo en la interfaz.

En V1, los datos críticos de Meta no se editarán desde pantalla.

---

# 14. Plantillas

Margarita V1 no creará plantillas dentro de Meta.

Las plantillas deben crearse y aprobarse desde Meta Business Suite.

Margarita solo permitirá:

* Sincronizar plantillas desde Meta.
* Mostrar plantillas disponibles.
* Enviar plantillas aprobadas.
* Usar plantillas en campañas.
* Usar plantillas para iniciar conversaciones manuales.

Solo podrán enviarse plantillas con estado:

```text
APPROVED
```

Las plantillas podrán tener variables simples.

Ejemplo:

```text
Hola {{1}}, tu fecha límite es {{2}}.
```

Margarita V1 mostrará campos simples para capturar esas variables.

---

# 15. Envío manual

Margarita distingue dos casos:

```text
1. Iniciar conversación
2. Responder conversación abierta
```

---

## 15.1 Iniciar conversación

Si no existe una ventana de conversación abierta, Margarita solo permitirá enviar una plantilla aprobada.

No se permitirá texto libre para iniciar conversación.

---

## 15.2 Responder conversación abierta

Si el cliente escribió en las últimas 24 horas, Margarita considera que la ventana está abierta.

En ese caso se permite enviar texto libre.

La fecha clave será:

```text
lastIncomingMessageAt
```

---

## 15.3 Agentes con permiso de envío manual

Un agente solo podrá enviar mensajes manuales si tiene:

```text
canSendManualMessages = true
```

Además, deberá tener mensajes disponibles según su límite:

```text
manualMessagesUsed < manualMessageLimit
```

Los mensajes manuales enviados por agentes consumen contador.

---

## 15.4 Respuestas a mensajes iniciados por agentes

Si un agente inicia conversación con plantilla manual, la conversación queda asignada a ese agente.

Cuando el cliente responda, la respuesta caerá en la conversación ya asignada al agente que inició el contacto.

---

# 16. Webhook

Margarita usará dos endpoints principales para Meta:

```text
GET /webhook
POST /webhook
```

---

## 16.1 GET /webhook

Sirve para verificar el webhook con Meta.

Meta enviará:

```text
hub.mode
hub.verify_token
hub.challenge
```

Margarita comparará el `verify_token` con el token guardado para la cuenta de WhatsApp.

Si coincide, responderá el `challenge`.

---

## 16.2 POST /webhook

Sirve para recibir eventos de Meta.

Margarita recibirá:

* Mensajes entrantes.
* Estados de mensajes.
* Errores.
* Eventos desconocidos.

El webhook debe ser tolerante a errores.

Si Meta manda un payload inesperado, Margarita no debe tirar el servidor.

---

## 16.3 Idempotencia

Meta puede enviar el mismo webhook más de una vez.

Margarita debe procesar webhooks de forma idempotente.

Esto significa:

* No duplicar mensajes con el mismo `wamid`.
* No duplicar eventos críticos.
* Actualizar estados existentes cuando corresponda.

---

## 16.4 Multimedia

Cuando llegue una imagen, audio, video o documento, Margarita no descargará el archivo automáticamente.

Solo guardará referencias como:

* `mediaId`
* `mimeType`
* `type`

El usuario podrá abrir o descargar el archivo bajo demanda.

---

# 17. Conversaciones

Una conversación agrupa los mensajes de un contacto.

En V1, Margarita reutilizará la conversación del contacto en lugar de crear múltiples hilos históricos separados.

Una conversación tendrá:

* Contacto.
* Agente asignado.
* Estado general.
* Estado operativo.
* Origen.
* Último mensaje.
* Último mensaje entrante.
* Fecha de cierre.

---

## 17.1 Estado general

```text
OPEN
CLOSED
ARCHIVED
```

---

## 17.2 Estado operativo

```text
UNASSIGNED
ASSIGNED
IN_PROGRESS
RESOLVED
```

---

## 17.3 Origen

```text
CAMPAIGN
MANUAL
INBOUND
AUTOMATIC
```

---

## 17.4 Cliente que vuelve después de cierre

Si un cliente vuelve a escribir después de que la conversación fue cerrada:

* La conversación se reabre.
* Queda sin agente asignado.
* Llega primero al Admin.
* El Admin revisa historial.
* El Admin decide a quién asignarla.

En V1 no se asigna automáticamente al último agente.

---

# 18. Asignación de conversaciones

Margarita V1 tendrá dos modos principales:

```text
MANUAL
LEAST_BUSY
```

`ROUND_ROBIN` puede quedar preparado para futuro, pero no será obligatorio en el primer MVP.

---

## 18.1 Asignación manual

En modo manual, Margarita no asigna conversaciones automáticamente.

Las conversaciones nuevas quedan como:

```text
UNASSIGNED
```

El Admin las revisa y asigna a un agente.

---

## 18.2 Asignación inteligente

En modo `LEAST_BUSY`, Margarita busca agentes:

```text
role = AGENT
isActive = true
status = AVAILABLE
```

Después cuenta las conversaciones activas de cada agente y asigna la nueva conversación al agente con menor carga.

---

## 18.3 Sin agentes disponibles

Si no hay agentes disponibles:

* Se guarda el mensaje.
* La conversación queda sin asignar.
* Se envía respuesta automática.
* Se notifica al Admin.
* Se guarda log.

El texto de respuesta automática viene de `WorkspaceSettings`.

---

## 18.4 Reasignación

El Admin puede reasignar una conversación de un agente a otro.

Toda reasignación se guarda en historial de asignación.

---

# 19. Campañas con Excel

Las campañas son uno de los módulos principales de Margarita.

Una campaña permite enviar mensajes masivos usando:

```text
Excel + plantilla aprobada de Meta
```

---

## 19.1 Flujo de campaña

El flujo será:

```text
1. Admin crea campaña.
2. Selecciona plantilla aprobada.
3. Sube archivo Excel.
4. Margarita valida el archivo.
5. Margarita muestra resumen.
6. Admin confirma envío.
7. Margarita envía a destinatarios válidos.
8. Margarita guarda wamid por mensaje.
9. Meta manda estados por webhook.
10. Margarita actualiza resultados.
```

---

## 19.2 Formato Excel V1

El Excel debe contener al menos:

```text
telefono
```

Columnas opcionales:

```text
nombre
variable_1
variable_2
variable_3
```

---

## 19.3 Validación

Antes de enviar, Margarita debe detectar:

* Teléfonos vacíos.
* Teléfonos inválidos.
* Números duplicados.
* Números no mexicanos.
* Variables faltantes.
* Plantilla no aprobada.

Margarita nunca enviará una campaña sin validar el Excel completo.

---

## 19.4 Contactos en campañas

Si el número ya existe como contacto, se reutiliza.

Si no existe, se crea automáticamente.

Si el Excel trae nombre y el contacto no tiene `customName`, se puede guardar como nombre personalizado.

No se sobrescriben nombres personalizados existentes.

---

## 19.5 Estados de campaña

Una campaña puede estar en:

```text
DRAFT
VALIDATING
READY
RUNNING
PAUSED
FINISHED
FAILED
CANCELLED
```

---

## 19.6 Estados por destinatario

Cada destinatario puede estar en:

```text
PENDING
SENDING
SENT
DELIVERED
READ
FAILED
SKIPPED
```

---

## 19.7 Errores y reintentos

Si Meta responde error, Margarita guarda:

* Código de error.
* Mensaje de error.
* Payload.
* Destinatario.
* Campaña relacionada.

Los reintentos en V1 serán manuales.

El Admin podrá revisar errores y reenviar manualmente a destinatarios fallidos.

---

## 19.8 Reinicio durante campaña

Si Railway reinicia durante una campaña, Margarita no debe perder el progreso.

Para V1, si la app detecta una campaña `RUNNING` al iniciar, la marcará como:

```text
PAUSED
```

El Admin podrá reanudarla manualmente.

---

# 20. Mensajes

Todo mensaje tendrá:

* Conversación.
* Dirección.
* Tipo.
* Estado.
* Origen.
* `wamid`.
* Texto.
* Referencia multimedia si aplica.
* Payload de Meta.
* Usuario que lo envió si aplica.
* Fecha de creación.

---

## 20.1 Dirección

```text
IN
OUT
```

---

## 20.2 Tipo

```text
TEXT
TEMPLATE
IMAGE
VIDEO
AUDIO
DOCUMENT
INTERACTIVE
UNKNOWN
```

---

## 20.3 Estado

```text
CREATED
SENDING
SENT
DELIVERED
READ
FAILED
```

---

## 20.4 Origen

```text
MANUAL
CAMPAIGN
AUTOMATIC
WEBHOOK
```

---

## 20.5 `wamid`

El `wamid` es el identificador principal para rastrear mensajes enviados y estados reportados por Meta.

Un `200 OK` de Meta no significa que el mensaje fue entregado.

Solo significa que Meta aceptó la solicitud.

La entrega real se confirma después mediante webhooks.

---

# 21. Monitoreo

El monitoreo es uno de los módulos más importantes de Margarita.

Existe porque el problema real no es solo enviar mensajes, sino saber qué ocurrió después.

El Admin debe poder ver:

* Mensajes enviados.
* Mensajes entregados.
* Mensajes leídos.
* Mensajes fallidos.
* Errores de Meta.
* Eventos recientes.
* Campañas con errores.
* Estado de cuenta.
* Calidad del número.
* Prueba de conexión con Meta.

---

## 21.1 Logs

Todo evento operativo importante debe guardarse en una tabla de logs.

Ejemplos:

```text
AUTH LOGIN_SUCCESS
AUTH LOGIN_FAILED
CAMPAIGN STARTED
CAMPAIGN FAILED
META MESSAGE_ACCEPTED
META MESSAGE_FAILED
WEBHOOK RECEIVED
WEBHOOK_DUPLICATE
CONVERSATION_ASSIGNED
CONVERSATION_CLOSED
```

---

## 21.2 Health avanzado

La consulta avanzada de Health Status, límites de cuenta o detalles profundos de calidad queda para V2.

En V1 es indispensable:

* Guardar errores de Meta.
* Mostrar fallos.
* Mostrar estados de mensajes.
* Probar conexión con Meta.
* Mostrar campañas con errores.

---

# 22. Socket.IO

Margarita usará Socket.IO para actualizar información en tiempo real.

Eventos principales:

```text
agent:status_changed
conversation:new_message
conversation:assigned
message:status_updated
campaign:updated
```

---

## 22.1 Rooms

Socket.IO usará rooms:

```text
workspace:<workspaceId>
user:<userId>
admin:<workspaceId>
```

Esto permite enviar eventos solo a quienes deben recibirlos.

---

# 23. Seguridad

Margarita V1 usará:

* Helmet.
* CORS.
* Rate limit.
* JWT.
* Cookie HttpOnly.
* bcrypt.
* Zod para validaciones.
* Variables de entorno.
* Protección de rutas.
* Middleware de roles.
* No mostrar tokens completos.
* No procesar formularios sin validación.

---

## 23.1 Login

El login tendrá protección con rate limit.

Las contraseñas se guardarán con bcrypt.

El JWT se guardará en cookie HttpOnly.

La sesión se validará contra `UserSession`.

---

## 23.2 Rutas protegidas

Toda ruta interna pasará por middleware de autenticación.

Las rutas sensibles pasarán por middleware de rol.

Ejemplos:

```text
/campaigns → ADMIN
/users → ADMIN
/monitor → ADMIN
/agent/dashboard → AGENT
```

---

## 23.3 Webhook

El webhook no usa JWT porque viene de Meta.

Debe validar estructura, verificar token en `GET /webhook`, registrar payload y no romper si llega un evento desconocido.

---

# 24. Railway

Cada cliente tendrá su propio proyecto Railway.

El flujo de instalación será:

```text
1. Crear proyecto Railway.
2. Conectar el repositorio de Margarita.
3. Agregar PostgreSQL.
4. Configurar variables de entorno.
5. Ejecutar migraciones.
6. Ejecutar seed.
7. Probar login Admin.
8. Configurar webhook en Meta.
9. Probar envío.
```

---

## 24.1 Suspensión de cliente

En V1 la suspensión puede hacerse de dos maneras:

```text
1. Pausar el servicio desde Railway.
2. Cambiar Workspace.status = SUSPENDED.
```

Si el Workspace está suspendido, la aplicación bloquea acceso operativo.

---

# 25. Backlog V2

Funciones candidatas para V2:

* Panel SuperAdmin central.
* Multiempresa en una sola instalación.
* Cifrado de accessToken.
* Permisos personalizados por agente.
* Integración con Railway API.
* Health Status avanzado de Meta.
* Reintentos automáticos.
* Soporte internacional de teléfonos.
* Múltiples cuentas de WhatsApp por empresa.
* Panel financiero o pagos.
* IA o chatbot.
* Frontend separado con React/Vue.
* Constructor visual de plantillas.
* Reportes avanzados.
* Exportación de logs y campañas.
* Auditoría avanzada.
* Roles adicionales.
* Automatizaciones más complejas.

---

# 26. Definición final de Margarita V1

Margarita V1 será una aplicación operativa, ligera y especializada para una empresa que usa WhatsApp Business Cloud API.

Su valor principal será:

```text
Enviar campañas,
recibir respuestas,
asignar conversaciones,
controlar agentes
y monitorear qué ocurre realmente con los mensajes.
```

La V1 prioriza:

* Simplicidad.
* Operación real.
* Monitoreo.
* Control del Admin.
* Seguridad básica.
* Despliegue rápido por cliente.
* Claridad de responsabilidades.

Margarita V1 queda definida como:

```text
Una plataforma single-tenant para operar WhatsApp Business Cloud API,
con campañas por Excel, conversaciones asignables, agentes controlados
y monitoreo de estados mediante wamid.
```

