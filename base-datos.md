# Margarita — Diseño de Base de Datos

## Versión

**Margarita V1**

## Estado

**Modelo conceptual congelado para MVP**

---

# 1. Enfoque general

Margarita V1 usará una base de datos PostgreSQL administrada mediante Prisma.

El modelo de base de datos está diseñado para una arquitectura **single-tenant por despliegue**.

Esto significa:

```text
1 cliente = 1 proyecto Railway = 1 base de datos = 1 Workspace
```

Aunque en V1 solo existirá un Workspace por instalación, se conserva la entidad `Workspace` para mantener orden interno y preparar una posible evolución futura hacia un modelo multiempresa.

---

# 2. Principios de diseño

La base de datos de Margarita sigue estos principios:

1. Conservar historial operativo.
2. Evitar eliminaciones físicas innecesarias.
3. Registrar eventos importantes.
4. Rastrear mensajes mediante `wamid`.
5. Separar contactos, conversaciones y mensajes.
6. Separar configuración operativa de datos principales.
7. Permitir monitoreo de campañas y errores.
8. Mantener trazabilidad de asignaciones.
9. Preparar el sistema para Railway y despliegues independientes.
10. Evitar dependencias de horario local del servidor.

---

# 3. Entidades principales

Margarita V1 tendrá las siguientes entidades principales:

```text
Workspace
WorkspaceSettings
User
UserSession
WhatsAppAccount
Contact
Tag
ContactTag
Template
Conversation
Message
AssignmentHistory
Campaign
CampaignRecipient
Log
```

---

# 4. Diagrama general conceptual

```text
Workspace
│
├── WorkspaceSettings
├── WhatsAppAccount
├── User
│   └── UserSession
│
├── Contact
│   └── ContactTag
│
├── Tag
│
├── Template
│
├── Conversation
│   ├── Message
│   └── AssignmentHistory
│
├── Campaign
│   └── CampaignRecipient
│
└── Log
```

---

# 5. Workspace

## Descripción

Representa la empresa que usa una instalación de Margarita.

En V1 solo existirá un Workspace por despliegue.

## Campos

```text
id
name
slug
status
createdAt
updatedAt
```

## Campos detallados

| Campo       | Tipo lógico | Descripción                  |
| ----------- | ----------- | ---------------------------- |
| `id`        | String      | Identificador único          |
| `name`      | String      | Nombre visible de la empresa |
| `slug`      | String      | Identificador amigable       |
| `status`    | Enum        | Estado del Workspace         |
| `createdAt` | DateTime    | Fecha de creación            |
| `updatedAt` | DateTime    | Fecha de actualización       |

## Estados posibles

```text
ACTIVE
SUSPENDED
```

## Relaciones

Un Workspace tiene:

```text
1 WorkspaceSettings
1 WhatsAppAccount
Muchos Users
Muchos Contacts
Muchos Tags
Muchos Templates
Muchas Conversations
Muchas Campaigns
Muchos Logs
```

---

# 6. WorkspaceSettings

## Descripción

Guarda la configuración operativa de la empresa.

Se separa de `Workspace` para evitar que la tabla principal crezca demasiado y para mantener clara la diferencia entre identidad de empresa y configuración de operación.

## Campos

```text
id
workspaceId
timezone
language
autoAssign
assignmentMode
businessHoursStart
businessHoursEnd
outOfHoursMessage
maxManualMessages
maxActiveConversations
reopenedConversationMode
createdAt
updatedAt
```

## Campos detallados

| Campo                      | Tipo lógico | Descripción                                             |
| -------------------------- | ----------- | ------------------------------------------------------- |
| `id`                       | String      | Identificador único                                     |
| `workspaceId`              | String      | Relación con Workspace                                  |
| `timezone`                 | String      | Zona horaria de la empresa                              |
| `language`                 | String      | Idioma de la interfaz                                   |
| `autoAssign`               | Boolean     | Activa o desactiva asignación automática                |
| `assignmentMode`           | Enum        | Modo de asignación                                      |
| `businessHoursStart`       | String      | Hora de inicio laboral                                  |
| `businessHoursEnd`         | String      | Hora de fin laboral                                     |
| `outOfHoursMessage`        | String      | Respuesta automática si no hay agentes                  |
| `maxManualMessages`        | Int         | Límite global de mensajes manuales por agente           |
| `maxActiveConversations`   | Int         | Máximo recomendado de conversaciones activas por agente |
| `reopenedConversationMode` | Enum        | Qué hacer cuando un cliente vuelve                      |
| `createdAt`                | DateTime    | Fecha de creación                                       |
| `updatedAt`                | DateTime    | Fecha de actualización                                  |

## assignmentMode

```text
MANUAL
LEAST_BUSY
ROUND_ROBIN
```

En V1 funcional se implementarán principalmente:

```text
MANUAL
LEAST_BUSY
```

`ROUND_ROBIN` puede quedar preparado para futuro.

## reopenedConversationMode

```text
ADMIN_INBOX
LAST_AGENT
AUTO_ASSIGN
```

En V1 se usará por defecto:

```text
ADMIN_INBOX
```

Esto significa que si un cliente vuelve después de cerrar la conversación, la conversación llega primero al Admin.

---

# 7. User

## Descripción

Representa a los usuarios internos de la empresa.

En V1 existen dos roles:

```text
ADMIN
AGENT
```

## Campos

```text
id
workspaceId
name
email
password
role
status
isActive
canSendManualMessages
manualMessageLimit
manualMessagesUsed
lastLoginAt
createdAt
updatedAt
```

## Campos detallados

| Campo                   | Tipo lógico     | Descripción                               |
| ----------------------- | --------------- | ----------------------------------------- |
| `id`                    | String          | Identificador único                       |
| `workspaceId`           | String          | Relación con Workspace                    |
| `name`                  | String          | Nombre del usuario                        |
| `email`                 | String          | Correo de acceso                          |
| `password`              | String          | Hash de contraseña                        |
| `role`                  | Enum            | Rol del usuario                           |
| `status`                | Enum            | Estado operativo                          |
| `isActive`              | Boolean         | Define si puede acceder                   |
| `canSendManualMessages` | Boolean         | Permiso simple para envío manual          |
| `manualMessageLimit`    | Int / Null      | Límite personalizado de mensajes manuales |
| `manualMessagesUsed`    | Int             | Mensajes manuales usados                  |
| `lastLoginAt`           | DateTime / Null | Último inicio de sesión                   |
| `createdAt`             | DateTime        | Fecha de creación                         |
| `updatedAt`             | DateTime        | Fecha de actualización                    |

## Roles

```text
ADMIN
AGENT
```

## Estados operativos

```text
AVAILABLE
BUSY
BREAK
OFFLINE
```

## Reglas importantes

Solo puede existir un usuario `ADMIN` por instalación.

Los agentes inician sesión en estado `OFFLINE`.

Solo agentes `AVAILABLE` reciben asignaciones automáticas.

---

# 8. UserSession

## Descripción

Registra sesiones activas o históricas de usuarios.

Margarita usará JWT en cookie HttpOnly, pero también guardará sesiones en base de datos para poder invalidarlas.

## Campos

```text
id
userId
tokenId
ip
userAgent
isActive
expiresAt
lastSeenAt
createdAt
```

## Campos detallados

| Campo        | Tipo lógico     | Descripción                      |
| ------------ | --------------- | -------------------------------- |
| `id`         | String          | Identificador único              |
| `userId`     | String          | Usuario relacionado              |
| `tokenId`    | String          | Identificador único del token    |
| `ip`         | String / Null   | IP de inicio de sesión           |
| `userAgent`  | String / Null   | Navegador/dispositivo            |
| `isActive`   | Boolean         | Indica si la sesión sigue activa |
| `expiresAt`  | DateTime        | Fecha de expiración              |
| `lastSeenAt` | DateTime / Null | Última actividad detectada       |
| `createdAt`  | DateTime        | Fecha de creación                |

## Uso

Permite:

* Cerrar sesión.
* Invalidar tokens.
* Saber última actividad.
* Apoyar monitoreo de agentes.

---

# 9. WhatsAppAccount

## Descripción

Representa la cuenta de WhatsApp Business Cloud API conectada a la instalación.

En V1 habrá una sola cuenta por Workspace.

## Campos

```text
id
workspaceId
displayName
phoneNumber
phoneNumberId
businessAccountId
accessToken
verifyToken
apiVersion
status
qualityRating
createdAt
updatedAt
```

## Campos detallados

| Campo               | Tipo lógico   | Descripción                  |
| ------------------- | ------------- | ---------------------------- |
| `id`                | String        | Identificador único          |
| `workspaceId`       | String        | Relación con Workspace       |
| `displayName`       | String / Null | Nombre visible de la cuenta  |
| `phoneNumber`       | String        | Número de WhatsApp conectado |
| `phoneNumberId`     | String        | ID del número en Meta        |
| `businessAccountId` | String        | ID de la cuenta de negocio   |
| `accessToken`       | String        | Token de acceso de Meta      |
| `verifyToken`       | String        | Token para verificar webhook |
| `apiVersion`        | String        | Versión de Graph API         |
| `status`            | String / Enum | Estado operativo             |
| `qualityRating`     | String / Enum | Calidad del número           |
| `createdAt`         | DateTime      | Fecha de creación            |
| `updatedAt`         | DateTime      | Fecha de actualización       |

## Reglas importantes

El `accessToken` no se muestra completo en la interfaz.

En V1 los datos críticos de Meta se cargan desde variables de entorno mediante seed.

---

# 10. Contact

## Descripción

Representa un número/contacto con el que la empresa se comunica por WhatsApp.

No representa un cliente de CRM.

## Campos

```text
id
workspaceId
profileName
customName
phone
notes
isActive
lastSeenAt
createdAt
updatedAt
```

## Campos detallados

| Campo         | Tipo lógico     | Descripción                |
| ------------- | --------------- | -------------------------- |
| `id`          | String          | Identificador único        |
| `workspaceId` | String          | Relación con Workspace     |
| `profileName` | String / Null   | Nombre recibido desde Meta |
| `customName`  | String / Null   | Nombre definido por Admin  |
| `phone`       | String          | Teléfono normalizado       |
| `notes`       | String / Null   | Notas simples              |
| `isActive`    | Boolean         | Baja lógica                |
| `lastSeenAt`  | DateTime / Null | Última actividad           |
| `createdAt`   | DateTime        | Fecha de creación          |
| `updatedAt`   | DateTime        | Fecha de actualización     |

## Reglas importantes

El teléfono se normaliza a:

```text
521XXXXXXXXXX
```

No se eliminan contactos físicamente.

Si se elimina un contacto, se marca `isActive = false`.

El nombre visible usa prioridad:

```text
customName
profileName
phone
```

---

# 11. Tag

## Descripción

Representa una etiqueta para organizar contactos.

## Campos

```text
id
workspaceId
name
color
isActive
createdAt
updatedAt
```

## Campos detallados

| Campo         | Tipo lógico   | Descripción            |
| ------------- | ------------- | ---------------------- |
| `id`          | String        | Identificador único    |
| `workspaceId` | String        | Relación con Workspace |
| `name`        | String        | Nombre de la etiqueta  |
| `color`       | String / Null | Color visual           |
| `isActive`    | Boolean       | Baja lógica            |
| `createdAt`   | DateTime      | Fecha de creación      |
| `updatedAt`   | DateTime      | Fecha de actualización |

## Reglas importantes

No puede haber dos etiquetas activas con el mismo nombre dentro del mismo Workspace.

Eliminar una etiqueta no elimina contactos.

---

# 12. ContactTag

## Descripción

Tabla intermedia para relación muchos a muchos entre contactos y etiquetas.

## Campos

```text
contactId
tagId
createdAt
```

## Relaciones

```text
Contact N:N Tag
```

Un contacto puede tener muchas etiquetas.

Una etiqueta puede pertenecer a muchos contactos.

---

# 13. Template

## Descripción

Representa una plantilla sincronizada desde Meta.

Margarita V1 no crea plantillas; solo las sincroniza y usa.

## Campos

```text
id
workspaceId
metaTemplateId
name
language
category
status
components
lastSyncedAt
createdAt
updatedAt
```

## Campos detallados

| Campo            | Tipo lógico     | Descripción              |
| ---------------- | --------------- | ------------------------ |
| `id`             | String          | Identificador único      |
| `workspaceId`    | String          | Relación con Workspace   |
| `metaTemplateId` | String / Null   | ID de plantilla en Meta  |
| `name`           | String          | Nombre de plantilla      |
| `language`       | String          | Idioma                   |
| `category`       | String / Null   | Categoría                |
| `status`         | String          | Estado en Meta           |
| `components`     | Json / Null     | Componentes de plantilla |
| `lastSyncedAt`   | DateTime / Null | Última sincronización    |
| `createdAt`      | DateTime        | Fecha de creación        |
| `updatedAt`      | DateTime        | Fecha de actualización   |

## Reglas importantes

Solo se pueden enviar plantillas con estado:

```text
APPROVED
```

---

# 14. Conversation

## Descripción

Agrupa mensajes de un contacto.

En V1 se reutiliza la conversación del contacto en lugar de crear múltiples hilos separados.

## Campos

```text
id
workspaceId
contactId
assignedUserId
status
operationalStatus
source
lastMessageAt
lastIncomingMessageAt
closedAt
createdAt
updatedAt
```

## Campos detallados

| Campo                   | Tipo lógico     | Descripción               |
| ----------------------- | --------------- | ------------------------- |
| `id`                    | String          | Identificador único       |
| `workspaceId`           | String          | Relación con Workspace    |
| `contactId`             | String          | Contacto relacionado      |
| `assignedUserId`        | String / Null   | Agente asignado           |
| `status`                | Enum            | Estado general            |
| `operationalStatus`     | Enum            | Estado operativo          |
| `source`                | Enum            | Origen de la conversación |
| `lastMessageAt`         | DateTime / Null | Último mensaje            |
| `lastIncomingMessageAt` | DateTime / Null | Último mensaje entrante   |
| `closedAt`              | DateTime / Null | Fecha de cierre           |
| `createdAt`             | DateTime        | Fecha de creación         |
| `updatedAt`             | DateTime        | Fecha de actualización    |

## status

```text
OPEN
CLOSED
ARCHIVED
```

## operationalStatus

```text
UNASSIGNED
ASSIGNED
IN_PROGRESS
RESOLVED
```

## source

```text
CAMPAIGN
MANUAL
INBOUND
AUTOMATIC
```

## Reglas importantes

Si el cliente vuelve después de cierre, la conversación se reabre y queda sin asignar para revisión del Admin.

---

# 15. Message

## Descripción

Representa un mensaje entrante o saliente.

Es una de las tablas más importantes del sistema.

## Campos

```text
id
workspaceId
conversationId
sentByUserId
campaignId
campaignRecipientId
wamid
direction
type
status
source
body
mediaId
mimeType
metaPayload
metaResponse
createdAt
updatedAt
```

## Campos detallados

| Campo                 | Tipo lógico   | Descripción                         |
| --------------------- | ------------- | ----------------------------------- |
| `id`                  | String        | Identificador único                 |
| `workspaceId`         | String        | Relación con Workspace              |
| `conversationId`      | String        | Conversación relacionada            |
| `sentByUserId`        | String / Null | Usuario que envió, si aplica        |
| `campaignId`          | String / Null | Campaña relacionada                 |
| `campaignRecipientId` | String / Null | Destinatario de campaña relacionado |
| `wamid`               | String / Null | ID de mensaje de WhatsApp           |
| `direction`           | Enum          | IN u OUT                            |
| `type`                | Enum          | Tipo de mensaje                     |
| `status`              | Enum          | Estado del mensaje                  |
| `source`              | Enum          | Origen                              |
| `body`                | String / Null | Texto del mensaje                   |
| `mediaId`             | String / Null | ID de media en Meta                 |
| `mimeType`            | String / Null | Tipo MIME                           |
| `metaPayload`         | Json / Null   | Payload recibido de Meta            |
| `metaResponse`        | Json / Null   | Respuesta de Meta al enviar         |
| `createdAt`           | DateTime      | Fecha de creación                   |
| `updatedAt`           | DateTime      | Fecha de actualización              |

## direction

```text
IN
OUT
```

## type

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

## status

```text
CREATED
SENDING
SENT
DELIVERED
READ
FAILED
```

## source

```text
MANUAL
CAMPAIGN
AUTOMATIC
WEBHOOK
```

## Reglas importantes

El `wamid` permite rastrear estados reales.

Un mensaje aceptado por Meta no se considera entregado hasta recibir webhook de estado.

---

# 16. AssignmentHistory

## Descripción

Registra asignaciones y reasignaciones de conversaciones.

## Campos

```text
id
conversationId
fromUserId
toUserId
assignedById
reason
createdAt
```

## Campos detallados

| Campo            | Tipo lógico   | Descripción                 |
| ---------------- | ------------- | --------------------------- |
| `id`             | String        | Identificador único         |
| `conversationId` | String        | Conversación relacionada    |
| `fromUserId`     | String / Null | Usuario anterior            |
| `toUserId`       | String / Null | Usuario nuevo               |
| `assignedById`   | String        | Usuario que hizo asignación |
| `reason`         | String / Null | Motivo opcional             |
| `createdAt`      | DateTime      | Fecha de asignación         |

## Reglas importantes

Toda asignación o reasignación debe guardarse.

---

# 17. Campaign

## Descripción

Representa una campaña masiva enviada desde Excel usando una plantilla aprobada.

## Campos

```text
id
workspaceId
createdById
templateId
name
status
totalRecipients
validRecipients
invalidRecipients
duplicateRecipients
startedAt
finishedAt
createdAt
updatedAt
```

## Campos detallados

| Campo                 | Tipo lógico     | Descripción               |
| --------------------- | --------------- | ------------------------- |
| `id`                  | String          | Identificador único       |
| `workspaceId`         | String          | Relación con Workspace    |
| `createdById`         | String          | Admin que creó la campaña |
| `templateId`          | String          | Plantilla usada           |
| `name`                | String          | Nombre de campaña         |
| `status`              | Enum            | Estado de campaña         |
| `totalRecipients`     | Int             | Total de registros        |
| `validRecipients`     | Int             | Registros válidos         |
| `invalidRecipients`   | Int             | Registros inválidos       |
| `duplicateRecipients` | Int             | Registros duplicados      |
| `startedAt`           | DateTime / Null | Inicio de envío           |
| `finishedAt`          | DateTime / Null | Fin de envío              |
| `createdAt`           | DateTime        | Fecha de creación         |
| `updatedAt`           | DateTime        | Fecha de actualización    |

## status

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

# 18. CampaignRecipient

## Descripción

Representa a cada destinatario de una campaña.

Cada destinatario tiene estado independiente.

## Campos

```text
id
campaignId
contactId
messageId
phone
status
errorCode
errorMessage
variables
createdAt
updatedAt
```

## Campos detallados

| Campo          | Tipo lógico   | Descripción                   |
| -------------- | ------------- | ----------------------------- |
| `id`           | String        | Identificador único           |
| `campaignId`   | String        | Campaña relacionada           |
| `contactId`    | String / Null | Contacto relacionado          |
| `messageId`    | String / Null | Mensaje generado              |
| `phone`        | String        | Teléfono normalizado          |
| `status`       | Enum          | Estado del destinatario       |
| `errorCode`    | String / Null | Código de error               |
| `errorMessage` | String / Null | Mensaje de error              |
| `variables`    | Json / Null   | Variables usadas en plantilla |
| `createdAt`    | DateTime      | Fecha de creación             |
| `updatedAt`    | DateTime      | Fecha de actualización        |

## status

```text
PENDING
SENDING
SENT
DELIVERED
READ
FAILED
SKIPPED
```

## Reglas importantes

El estado `DELIVERED`, `READ` o `FAILED` debe actualizarse con webhooks cuando aplique.

---

# 19. Log

## Descripción

Registra eventos operativos importantes.

Sirve para monitoreo, diagnóstico y auditoría básica.

## Campos

```text
id
workspaceId
level
module
action
message
payload
createdAt
```

## Campos detallados

| Campo         | Tipo lógico   | Descripción                 |
| ------------- | ------------- | --------------------------- |
| `id`          | String        | Identificador único         |
| `workspaceId` | String / Null | Workspace relacionado       |
| `level`       | Enum          | Nivel del log               |
| `module`      | Enum/String   | Módulo que genera el evento |
| `action`      | String        | Acción ocurrida             |
| `message`     | String        | Mensaje legible             |
| `payload`     | Json / Null   | Datos técnicos              |
| `createdAt`   | DateTime      | Fecha de creación           |

## level

```text
INFO
WARN
ERROR
DEBUG
```

## module

```text
SYSTEM
AUTH
USER
CONTACT
TAG
CAMPAIGN
CONVERSATION
MESSAGE
WEBHOOK
META
WHATSAPP_ACCOUNT
```

---

# 20. Relaciones principales

## Workspace

```text
Workspace 1 — 1 WorkspaceSettings
Workspace 1 — 1 WhatsAppAccount
Workspace 1 — N User
Workspace 1 — N Contact
Workspace 1 — N Tag
Workspace 1 — N Template
Workspace 1 — N Conversation
Workspace 1 — N Campaign
Workspace 1 — N Log
```

## User

```text
User 1 — N UserSession
User 1 — N Message como sentByUser
User 1 — N Campaign como createdBy
User 1 — N Conversation como assignedUser
User 1 — N AssignmentHistory como assignedBy
```

## Contact

```text
Contact 1 — N Conversation
Contact N — N Tag mediante ContactTag
Contact 1 — N CampaignRecipient
```

## Conversation

```text
Conversation 1 — N Message
Conversation 1 — N AssignmentHistory
```

## Campaign

```text
Campaign 1 — N CampaignRecipient
Campaign 1 — N Message
Campaign N — 1 Template
Campaign N — 1 User createdBy
```

## Message

```text
Message N — 1 Conversation
Message N — 1 Workspace
Message N — 0/1 User
Message N — 0/1 Campaign
Message N — 0/1 CampaignRecipient
```

---

# 21. Índices y restricciones recomendadas

## Workspace

```text
slug único
```

## User

```text
email único
workspaceId index
role index
status index
```

## Contact

```text
workspaceId + phone único
workspaceId index
isActive index
```

## Tag

```text
workspaceId + name único para etiquetas activas
workspaceId index
```

## Template

```text
workspaceId + name + language único
status index
```

## Conversation

```text
workspaceId index
contactId index
assignedUserId index
status index
operationalStatus index
lastMessageAt index
```

## Message

```text
wamid único cuando exista
conversationId index
workspaceId index
status index
direction index
createdAt index
```

## Campaign

```text
workspaceId index
status index
createdById index
createdAt index
```

## CampaignRecipient

```text
campaignId index
contactId index
messageId index
status index
phone index
```

## Log

```text
workspaceId index
level index
module index
createdAt index
```

---

# 22. Eliminación lógica

En Margarita V1 se usará eliminación lógica para:

```text
Contact
Tag
User
```

Esto evita pérdida de historial.

Campos usados:

```text
isActive = false
```

No se eliminarán físicamente registros importantes que tengan relación con mensajes, campañas o conversaciones.

---

# 23. Fechas y zona horaria

PostgreSQL guardará fechas como `DateTime`.

La aplicación mostrará fechas usando la zona horaria configurada:

```text
America/Mexico_City
```

La zona horaria se obtiene desde:

```text
WorkspaceSettings.timezone
```

o desde variable de entorno como valor por defecto.

---

# 24. Decisiones aplazadas para V2

Quedan fuera del diseño obligatorio V1:

* SuperAdmin central.
* Multiempresa en una sola base de datos.
* Cifrado de accessToken.
* Permisos personalizados complejos.
* Múltiples cuentas de WhatsApp por Workspace.
* Soporte internacional avanzado.
* Auditoría avanzada.
* Reintentos automáticos.
* Health Status avanzado.
* Integración con Railway API.

---

# 25. Conclusión

El modelo de base de datos de Margarita V1 está diseñado para sostener una operación real de WhatsApp Business Cloud API bajo un esquema simple:

```text
Una empresa
Un número de WhatsApp
Un Admin
Varios agentes
Contactos
Etiquetas
Conversaciones
Campañas
Mensajes
Monitoreo
```

Este diseño permite construir un MVP funcional sin sobrecomplicar el sistema, pero dejando una base suficientemente ordenada para evolucionar hacia una versión SaaS más avanzada en el futuro.

