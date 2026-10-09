# Margarita

Plataforma web para operar **WhatsApp Business Cloud API** de forma ordenada, segura y monitoreable.

Margarita permite enviar campañas con plantillas aprobadas, recibir respuestas, asignar conversaciones a agentes, seguir el ciclo real de cada mensaje (enviado, entregado, leído, fallido) y auditar todo lo que pasa con la cuenta de WhatsApp de la empresa.

No es un CRM, no es un chatbot y no administra ventas: es una herramienta especializada para operar el canal oficial de WhatsApp.

---

## Tabla de contenido

1. [Funcionalidades](#1-funcionalidades)
2. [Stack](#2-stack)
3. [Arquitectura](#3-arquitectura)
4. [Requisitos](#4-requisitos)
5. [Instalación local](#5-instalación-local)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Scripts y CI](#7-scripts-y-ci)
8. [Rutas de la aplicación](#8-rutas-de-la-aplicación)
9. [Modelo de datos](#9-modelo-de-datos)
10. [Webhook de Meta](#10-webhook-de-meta)
11. [Tiempo real (socket.io)](#11-tiempo-real-socketio)
12. [Seguridad](#12-seguridad)
13. [Despliegue](#13-despliegue)
14. [Estado del proyecto y pendientes](#14-estado-del-proyecto-y-pendientes)
15. [Documentación adicional](#15-documentación-adicional)
16. [Convenciones de código](#16-convenciones-de-código)

---

## 1. Funcionalidades

### Panel de administrador

- Dashboard con conversaciones abiertas, mensajes recientes y estado de la operación.
- Cuenta de WhatsApp: ver número, calidad, `phoneNumberId` y probar conexión contra Meta.
- Plantillas: sincronizar las aprobadas desde Meta y verlas con su estado real.
- Contactos: crear, editar, buscar, etiquetar y desactivar.
- Etiquetas: crear, editar y desactivar.
- Agentes: crear, editar, activar o desactivar, con permisos y límite de mensajes manuales.
- Conversaciones: ver todas, abrir desde un contacto, responder, asignar, reasignar, cerrar y reabrir.
- Campañas: crear seleccionando contactos o subiendo Excel/CSV, enviar, ver errores y reintentar fallidos.
- Logs: auditoría filtrable de webhook, Meta, campañas, conversaciones y usuarios.
- Estado del sistema: checklist de configuración (workspace, WhatsApp, plantillas, contactos, agentes).
- Roadmap: qué está dentro de V1 y qué se posterga a V2.

### Panel de agente

- Solo ve las conversaciones asignadas a él.
- Estado operativo: `AVAILABLE`, `BUSY`, `BREAK`, `OFFLINE`. Al iniciar sesión no queda disponible automáticamente; debe activarse.
- Responde con tres modos: mensaje local (nota interna, no sale a WhatsApp), texto libre dentro de la ventana de 24 horas, y plantilla aprobada cuando la ventana está cerrada.
- Cierra conversaciones cuando terminan.

### Motor de WhatsApp (lo que corre por debajo)

- Ingesta de mensajes entrantes por webhook, con deduplicación por `wamid`.
- Normalización de teléfonos mexicanos al formato de WhatsApp.
- Ventana de 24 horas validada en servidor antes de permitir texto libre.
- Envío real a la Graph API (`/{phone_number_id}/messages`) con guardado de `wamid` y respuesta de Meta.
- Actualización de estados por webhook, propagada a mensajes y destinatarios de campaña.
- Asignación automática de conversaciones nuevas al agente disponible con menos carga (`LEAST_BUSY`).
- Historial de asignaciones (`AssignmentHistory`) para saber quién movió qué y por qué.
- Actualizaciones en vivo en el navegador vía socket.io.
- Cola de webhooks con reintentos y backoff: un fallo temporal ya no pierde mensajes.
- Credenciales de Meta cifradas en la base de datos.
- Bitácora con retención automática y credenciales redactadas.

---

## 2. Stack

| Capa | Tecnología |
| --- | --- |
| Runtime | Node.js 22 (Prisma 7 requiere 20.19 o superior) |
| Lenguaje | TypeScript 5 (CommonJS, `strict`) |
| Servidor | Express 4 |
| Vistas | EJS renderizado en servidor |
| Estilos | Tailwind CSS 4 (CLI, compilado a `src/public/css/style.css`) |
| Tiempo real | Socket.IO 4 |
| Base de datos | PostgreSQL |
| ORM | Prisma 7 con `@prisma/adapter-pg` |
| Validación | Zod |
| Auth | JWT en cookie httpOnly + tabla `UserSession` revocable |
| Integración | WhatsApp Business Cloud API (Graph API) vía Axios |
| Archivos | Multer (Excel/CSV hasta 5 MB) + ExcelJS para parseo |
| Logs | Pino a stdout y auditoría persistida en la tabla `Log` |

Sin frameworks de frontend: el HTML es EJS y el único JavaScript de cliente es `src/public/js/live.js`.

---

## 3. Arquitectura

```text
src/
├── app.ts                  # Express: middlewares, estáticos, montaje de rutas
├── server.ts               # HTTP server + arranque de socket.io
├── config/                 # env, logger, cliente Prisma
├── controllers/            # capa HTTP: lee request, responde o renderiza
├── routes/                 # definición de endpoints por área
├── services/               # reglas de negocio y acceso a datos
├── sockets/                # autenticación del socket y emisión por workspace
├── middlewares/            # auth, roles, upload
├── validations/            # esquemas Zod
├── utils/                  # teléfono, plantillas, fechas, JWT, firma de webhook
├── types/                  # tipos de auth, webhook de Meta y de Express
├── views/                  # plantillas EJS (admin, agent, auth, home)
└── public/                 # CSS compilado, imágenes y JS de cliente
```

El patrón es siempre el mismo: la ruta llama a un controlador, el controlador valida con Zod y delega en un servicio estático que habla con Prisma o con Meta.

### Flujo de un mensaje entrante

```text
Cliente de WhatsApp
        ↓
Meta → POST /webhooks/meta/whatsapp
        ↓
Firma X-Hub-Signature-256 verificada
        ↓
MetaWebhookHandlerService
        ↓
upsert de Contact + creación/reapertura de Conversation
        ↓
Message guardado (deduplicado por wamid)
        ↓
asignación automática al agente con menos carga
        ↓
emitToWorkspace → los navegadores abiertos lo ven al instante
```

### Flujo de un mensaje saliente

```text
Agente o Admin
        ↓
MessageService (valida ventana de 24h o plantilla aprobada)
        ↓
Message guardado como SENDING
        ↓
POST a la Graph API de Meta
        ↓
Message actualizado con wamid y status SENT (o FAILED con el error de Meta)
        ↓
webhook de status → DELIVERED / READ / FAILED
```

---

## 4. Requisitos

- Node.js 22 (mínimo 20.19 por Prisma 7)
- npm
- PostgreSQL 14 o superior
- Una app de Meta con WhatsApp Business Cloud API: `App Secret`, token de acceso, `Phone Number ID`, `Business Account ID` y número de teléfono
- Para recibir webhooks en local: `ngrok` o Cloudflare Tunnel (Meta exige HTTPS)

---

## 5. Instalación local

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env
# edita .env: DATABASE_URL, JWT_SECRET, WORKSPACE_*, ADMIN_* y META_*

# 3. Crear el esquema en la base
npm run db:push

# 4. Datos iniciales (workspace, admin, settings y cuenta de WhatsApp)
npm run db:seed

# 5. CSS
npm run css:build

# 6. Servidor en modo desarrollo
npm run dev
```

La app queda en `http://localhost:3000`. Entra a `/auth/login` con el `ADMIN_EMAIL` y `ADMIN_PASSWORD` que pusiste en `.env`.

En desarrollo necesitas dos terminales: una con `npm run dev` (servidor) y otra con `npm run css` (Tailwind en modo watch). Si solo vas a arrancar, `npm run css:build` genera el CSS una vez.

### Conectarlo a WhatsApp en local

1. Levanta un túnel: `ngrok http 3000`.
2. En Meta, configura el webhook con `https://<tu-túnel>/webhooks/meta/whatsapp` y el mismo valor de `META_VERIFY_TOKEN`.
3. Suscribe el campo `messages`.
4. Copia el `META_APP_SECRET` a tu `.env` para que la firma se valide.
5. Manda un mensaje al número de negocio y revisa `/admin/conversations`.

### Nota sobre el seed

El seed **falla a propósito** si falta cualquiera de estas variables: `WORKSPACE_NAME`, `WORKSPACE_SLUG`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_BUSINESS_ACCOUNT_ID`, `META_VERIFY_TOKEN` y `META_PHONE_NUMBER`. Es una validación, no un error de la herramienta.

Es idempotente: volver a correrlo actualiza el workspace, el admin y la cuenta de WhatsApp en lugar de duplicarlos.

---

## 6. Variables de entorno

Copia `.env.example` a `.env`. Ninguna de estas variables debe subirse al repositorio (`.env` está en `.gitignore`).

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `APP_NAME` | No | Nombre de la aplicación. Default `Margarita` |
| `APP_URL` | Sí | URL pública base. Se usa para CORS, socket.io y la URL del webhook |
| `PORT` | Sí | Puerto HTTP. Default `3000` |
| `NODE_ENV` | Sí | `development` o `production` (activa cookies `secure`) |
| `TIMEZONE` | No | Default `America/Mexico_City` |
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL |
| `JWT_SECRET` | Sí | Firma de los tokens. Genera con `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | No | Vida del token. Default `7d` |
| `COOKIE_NAME` | No | Nombre de la cookie de sesión. Default `margarita_token` |
| `WORKSPACE_NAME` | Seed | Nombre de la empresa |
| `WORKSPACE_SLUG` | Seed | Identificador único del workspace |
| `ADMIN_NAME` | Seed | Nombre del administrador |
| `ADMIN_EMAIL` | Seed | Correo de acceso del administrador |
| `ADMIN_PASSWORD` | Seed | Contraseña del administrador |
| `META_API_VERSION` | Sí | Versión de la Graph API. Default `v23.0` |
| `META_APP_SECRET` | Producción | Valida la firma `X-Hub-Signature-256` del webhook |
| `META_ACCESS_TOKEN` | Sí | Token de acceso de la app de Meta |
| `META_PHONE_NUMBER_ID` | Sí | ID del número remitente |
| `META_BUSINESS_ACCOUNT_ID` | Sí | ID de la WhatsApp Business Account |
| `META_VERIFY_TOKEN` | Sí | Cadena que tú eliges para verificar el webhook |
| `META_PHONE_NUMBER` | Sí | Número visible del negocio |
| `ENCRYPTION_KEY` | Sí | Cifra los tokens de Meta en la base (AES-256-GCM). Genera con `openssl rand -hex 32` |
| `LOGIN_MAX_ATTEMPTS` | No | Intentos fallidos antes de bloquear la cuenta. Default `5` |
| `LOGIN_LOCK_MINUTES` | No | Duración del bloqueo. Default `15` |
| `LOG_RETENTION_DAYS` | No | Días que se conserva la bitácora. Default `90` |
| `WEBHOOK_EVENT_RETENTION_DAYS` | No | Días que se conservan los eventos ya procesados. Default `30` |
| `WEBHOOK_QUEUE_ENABLED` | No | Procesa los webhooks por cola. Default `true` |
| `WEBHOOK_WORKER_INTERVAL_MS` | No | Cada cuánto revisa la cola el worker. Default `2000` |
| `WEBHOOK_MAX_ATTEMPTS` | No | Reintentos antes de marcar un evento como `FAILED`. Default `5` |
| `ALERT_WEBHOOK_URL` | No | Endpoint (Slack, Discord, Google Chat) que recibe avisos de error |
| `ALERT_COOLDOWN_MINUTES` | No | Enfriamiento entre avisos repetidos. Default `10` |

Sin `META_APP_SECRET` el webhook no valida el origen: en desarrollo solo registra un aviso, pero **en producción responde 401** y la app deja de recibir mensajes.

Sin `ENCRYPTION_KEY` la app funciona igual, pero las credenciales de Meta quedan en texto plano y el panel de sistema lo marca como pendiente.

---

## 7. Scripts y CI

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor en modo watch con `tsx` |
| `npm run build` | `prisma generate` + Tailwind + `tsc` + copia de assets a `dist/` |
| `npm start` | Ejecuta `node dist/server.js` (requiere build previo) |
| `npm run css` | Tailwind en modo watch |
| `npm run css:build` | Compila y minifica el CSS |
| `npm run copy:assets` | Copia `views` y `public` a `dist/` |
| `npm run db:push` | Aplica el esquema a la base sin migraciones |
| `npm run db:migrate` | Crea y aplica una migración de desarrollo |
| `npm test` | Corre los tests unitarios con el runner de Node |
| `npm run db:encrypt-secrets` | Cifra las credenciales de Meta que siguen en texto plano |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:seed` | Carga datos iniciales |
| `npm run db:studio` | Abre Prisma Studio |

### Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request: valida el esquema de Prisma, genera el cliente, verifica tipos, corre los tests y hace el build completo.

El workflow define un `DATABASE_URL` de relleno porque `prisma.config.ts` exige la variable para cargar la configuración, y GitHub arranca sin `.env` ni secretos. Ninguno de esos pasos se conecta a una base de datos, así que el valor nunca se usa: **no hace falta configurar secretos en GitHub**.

Si algún día agregas tests que sí necesiten base de datos, el workflow tendría que levantar un servicio de PostgreSQL con `services:` y apuntar `DATABASE_URL` a él.

---

## 8. Rutas de la aplicación

### Públicas

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/` | Landing pública |
| GET | `/como-empezar` | Guía de inicio |
| GET | `/health` | Healthcheck (`200` con `status: healthy`) |
| GET | `/auth/login` | Formulario de acceso |
| POST | `/auth/login` | Autentica y emite la cookie de sesión |
| POST | `/auth/logout` | Cierra sesión y desactiva la sesión en base |
| GET | `/webhooks/meta/whatsapp` | Verificación del webhook de Meta |
| POST | `/webhooks/meta/whatsapp` | Recepción de mensajes y estados |

### Admin (`/admin`, requiere rol `ADMIN`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/admin/dashboard` | Resumen operativo |
| GET/POST | `/admin/users`, `/admin/users/new`, `/admin/users/:id/edit`, `/admin/users/:id/toggle-status` | Gestión de agentes |
| GET/POST | `/admin/contacts`, `/admin/contacts/new`, `/admin/contacts/:id/edit`, `/admin/contacts/:id/deactivate` | Gestión de contactos |
| GET/POST | `/admin/tags`, `/admin/tags/new`, `/admin/tags/:id/edit`, `/admin/tags/:id/deactivate` | Gestión de etiquetas |
| GET | `/admin/whatsapp` | Detalle de la cuenta conectada |
| POST | `/admin/whatsapp/test-connection` | Prueba la conexión contra Meta |
| POST | `/admin/whatsapp/credentials` | Actualiza número, IDs y tokens (se guardan cifrados) |
| POST | `/admin/whatsapp/encrypt-secrets` | Cifra las credenciales que siguen en texto plano |
| GET | `/admin/templates` | Plantillas sincronizadas |
| POST | `/admin/templates/sync` | Sincroniza plantillas desde Meta |
| GET | `/admin/conversations` | Todas las conversaciones |
| POST | `/admin/conversations/from-contact/:contactId` | Abre o reabre una conversación |
| GET | `/admin/conversations/:id` | Detalle e hilo de mensajes |
| POST | `/admin/conversations/:id/messages/local` | Nota interna (no se envía a WhatsApp) |
| POST | `/admin/conversations/:id/messages/free-text` | Texto libre dentro de la ventana de 24h |
| POST | `/admin/conversations/:id/messages/template` | Envío con plantilla aprobada |
| POST | `/admin/conversations/:id/assign` | Asigna o reasigna agente |
| POST | `/admin/conversations/:id/close`, `/:id/reopen` | Cierra o reabre |
| GET | `/admin/campaigns` | Listado de campañas |
| GET | `/admin/campaigns/create` | Alta de campaña |
| POST | `/admin/campaigns` | Crea campaña desde contactos seleccionados |
| POST | `/admin/campaigns/excel` | Crea campaña desde Excel/CSV |
| GET | `/admin/campaigns/:id` | Detalle y destinatarios |
| POST | `/admin/campaigns/:id/send` | Envía la campaña |
| POST | `/admin/campaigns/:id/retry-failed` | Reintenta destinatarios fallidos |
| GET | `/admin/logs` | Auditoría |
| GET | `/admin/system` | Checklist de configuración |
| GET | `/admin/roadmap` | Alcance V1 vs V2 |

### Agente (`/agent`, requiere rol `AGENT`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/agent/dashboard` | Resumen del agente |
| POST | `/agent/status` | Cambia estado operativo |
| GET | `/agent/conversations` | Solo sus conversaciones asignadas |
| GET | `/agent/conversations/:id` | Detalle del hilo |
| POST | `/agent/conversations/:id/messages/local`, `/free-text`, `/template` | Respuesta en sus tres modos |
| POST | `/agent/conversations/:id/close` | Cierra la conversación |

---

## 9. Modelo de datos

Definición completa en [`prisma/schema.prisma`](prisma/schema.prisma) y explicación funcional en [`base-datos.md`](base-datos.md).

| Entidad | Propósito |
| --- | --- |
| `Workspace` | La empresa dueña de la instalación (una por despliegue en V1) |
| `WorkspaceSettings` | Zona horaria, horario, modo de asignación, límites y mensaje fuera de horario |
| `User` | Admin y agentes, con rol, estado operativo y límites de mensajes |
| `UserSession` | Sesiones revocables asociadas a cada JWT |
| `WhatsAppAccount` | Credenciales y estado de la cuenta de WhatsApp Cloud API |
| `Contact` | Personas con las que se puede conversar (único por teléfono) |
| `Tag` / `ContactTag` | Etiquetas y su relación con contactos |
| `Template` | Plantillas de Meta con estado, categoría y componentes |
| `Conversation` | Hilo por contacto, con estado general, operativo y origen |
| `Message` | Mensajes entrantes y salientes con `wamid`, estado y payload de Meta |
| `AssignmentHistory` | Rastro de cada asignación: quién, a quién y por qué |
| `Campaign` / `CampaignRecipient` | Campañas y su avance por destinatario |
| `Log` | Auditoría por nivel y módulo: sistema, auth, webhook, Meta, campañas, etc. |

---

## 10. Webhook de Meta

Endpoints: `GET` y `POST /webhooks/meta/whatsapp`.

**Verificación (`GET`).** Meta envía `hub.mode`, `hub.verify_token` y `hub.challenge`. La app compara el token con el `verifyToken` guardado en `WhatsAppAccount` y responde con el challenge si coincide.

**Recepción (`POST`).** Antes de procesar nada, se valida la cabecera `X-Hub-Signature-256` con HMAC-SHA256 sobre el cuerpo crudo, usando `META_APP_SECRET` (`src/utils/webhook-signature.ts`). Una firma inválida se responde con `401` y queda en el log como `WEBHOOK_SIGNATURE_INVALID`.

**Qué procesa.**

- `messages`: se resuelve la cuenta por `phone_number_id`, se hace upsert del contacto, se crea o reabre la conversación, se guarda el mensaje (deduplicado por `wamid`) y se asigna agente si no tiene.
- `statuses`: se actualizan `sent`, `delivered`, `read` y `failed` tanto en el mensaje como en el destinatario de campaña, incluyendo el código y mensaje de error de Meta.
- Tipos de entrada soportados: texto, imagen, video, audio, documento e interactivos (estos últimos se guardan de forma genérica).

**Idempotencia.** Cada mensaje entrante se identifica por `wamid`; si Meta reintenta, no se duplica.

**Cola de procesamiento.** El endpoint ya no procesa el mensaje en línea: guarda el payload en la tabla `WebhookEvent` y responde `200` de inmediato (en la práctica, menos de 10 ms). Un worker en segundo plano lo procesa cada `WEBHOOK_WORKER_INTERVAL_MS` milisegundos con reintentos y backoff exponencial (1s, 2s, 4s… hasta 5 minutos) y `WEBHOOK_MAX_ATTEMPTS` intentos antes de marcarlo como `FAILED`.

Esto cambia dos cosas importantes. Primero, un error temporal (base de datos lenta, un bug en el procesamiento) ya no pierde el mensaje del cliente: se reintenta. Segundo, si el proceso se cae a mitad del trabajo, el evento queda en `PROCESSING` y se devuelve a la cola automáticamente a los 5 minutos.

Si el payload no se puede guardar (por ejemplo, la base está caída), el endpoint responde `500` a propósito para que Meta lo reintente: en ese caso perderlo sí sería perder el mensaje.

**Respuesta.** `200` cuando el evento quedó encolado. En el modo directo (`WEBHOOK_QUEUE_ENABLED=false`) procesa en línea y también responde `200` ante error, para no provocar reintentos infinitos durante la depuración local.

**Rate limiting.** El webhook está excluido del límite global y tiene el suyo (1200 peticiones por minuto) porque Meta entrega en ráfagas.

---

## 11. Tiempo real (socket.io)

La bandeja se actualiza sin recargar. La conexión se autentica con la misma cookie de sesión del panel: `src/sockets/index.ts` valida el JWT contra `UserSession` (sesión activa, no vencida, usuario activo y workspace activo) y mete al cliente en la sala `workspace:<id>`.

| Evento | Cuándo se emite | Qué hace el cliente |
| --- | --- | --- |
| `conversation:message` | Mensaje entrante por webhook o saliente desde el panel | Inserta la burbuja si la conversación está abierta; si no, muestra un aviso con enlace |
| `message:status` | Cambio de estado reportado por Meta | Actualiza el texto del estado en el mensaje correspondiente |
| `conversation:assigned` | Asignación manual o automática | Recarga el detalle de la conversación |
| `campaign:progress` | Durante el envío de una campaña | Disponible para reportar avance |

El cliente vive en `src/public/js/live.js` y se activa con atributos en `<body>` (`data-live-page`, `data-conversation-id`, `data-live-base`). Si el socket se reconecta, la conversación se rehidrata para no dejar huecos en el hilo.

---

## 12. Seguridad

- **Autenticación**: JWT en cookie `httpOnly`, con registro en `UserSession` para poder revocar sesiones. La cookie usa `secure` en producción y `sameSite=lax`.
- **Autorización**: `authMiddleware` en todas las rutas privadas y `requireRole` separando `ADMIN` de `AGENT`. Un agente solo puede ver y responder sus conversaciones asignadas; esa restricción se aplica también en la consulta a base de datos.
- **Contraseñas**: hash con bcrypt (12 rondas). Política mínima de 10 caracteres con letras y números, y lista negra de contraseñas obvias al crear o editar agentes.
- **Bloqueo por fuerza bruta**: el login tiene su propio límite (10 peticiones por 15 minutos por IP) y, a nivel de cuenta, se bloquea `LOGIN_LOCK_MINUTES` minutos tras `LOGIN_MAX_ATTEMPTS` intentos fallidos. Cada intento fallido, cada bloqueo y cada acceso correcto quedan en la bitácora.
- **Protección CSRF**: toda petición que cambia estado debe traer un `Origin` (o `Referer`) que coincida con `APP_URL`. Un formulario alojado en otro sitio recibe `403`. Las peticiones sin `Origin` (curl, healthchecks, webhooks de Meta) se permiten porque no son navegadores.
- **Cifrado de credenciales**: los tokens de Meta se guardan con AES-256-GCM usando `ENCRYPTION_KEY`. Los valores guardados antes de habilitar el cifrado se siguen leyendo y se pueden migrar con el botón del panel o con `npm run db:encrypt-secrets`.
- **Firma de webhook**: HMAC-SHA256 con comparación en tiempo constante.
- **Validación**: todos los cuerpos de entrada pasan por esquemas Zod.
- **Cabeceras**: Helmet habilitado.
- **CORS**: restringido a `APP_URL`, con credenciales.
- **Rate limiting**: 300 peticiones cada 15 minutos por IP en el panel; 10 en el login; 1200 por minuto en el webhook. El healthcheck está exento.
- **Proxy**: `trust proxy` activo, porque la app corre detrás de un proxy en producción.
- **Secretos**: los tokens se muestran enmascarados y el objeto que consume la vista no incluye el valor en claro. Además, la bitácora redacta cualquier campo que parezca credencial (`token`, `secret`, `password`, `authorization`) antes de guardarlo.
- **Retención**: la bitácora se purga a los `LOG_RETENTION_DAYS` días y los eventos de webhook ya resueltos a los `WEBHOOK_EVENT_RETENTION_DAYS`, para acotar el crecimiento y la exposición de datos personales.
- **Monitoreo**: `/health` reporta base de datos, profundidad de la cola, evento pendiente más antiguo, estado del worker y si falta alguna variable de seguridad. Devuelve `503` solo si la base está caída.
- **Alertas**: si defines `ALERT_WEBHOOK_URL`, cada log de nivel `ERROR` dispara un aviso externo con enfriamiento configurable.

---

## 13. Despliegue

La guía completa paso a paso está en [`docs/deploy-railway.md`](docs/deploy-railway.md). Resumen:

| Concepto | Valor |
| --- | --- |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Healthcheck | `/health` |
| Puerto | `3000` |
| Variables clave | `DATABASE_URL` (referencia al plugin de Postgres), `APP_URL` con el dominio público HTTPS, `NODE_ENV=production`, `JWT_SECRET` y las `META_*` |

Los cuatro tropiezos más comunes: dejar `APP_URL` apuntando a localhost (rompe CORS y el socket), no incluir las devDependencies en el build cuando `NODE_ENV=production`, olvidar `META_APP_SECRET` (el webhook responde 401 en producción) y olvidar `ENCRYPTION_KEY` (las credenciales quedan sin cifrar).

El proyecto ya usa migraciones versionadas. En una base que venía funcionando con `db push`, el orden es marcar la migración inicial como aplicada y luego desplegar la nueva:

```bash
npx prisma migrate resolve --applied 20261009000000_init
npx prisma migrate deploy
```

En una base nueva, `npx prisma migrate deploy` crea todo desde cero. El detalle está en [docs/deploy-railway.md](docs/deploy-railway.md).

El modelo es **single-tenant por despliegue**: un cliente, un proyecto, una base de datos, un workspace. Todos los clientes usan el mismo repositorio y se diferencian solo por variables de entorno, dominio y cuenta de WhatsApp.

---

## 14. Estado del proyecto y pendientes

Estado actual: la V1 está completa y funcional para producción. `npx tsc --noEmit` pasa limpio, hay 38 tests unitarios en verde y el flujo crítico está verificado de punta a punta contra una base de datos real: firma del webhook, encolado, procesamiento por el worker, guardado del mensaje, emisión en vivo por socket, CSRF, bloqueo de login y cifrado de credenciales (22 comprobaciones de integración).

Lo que se cerró en el sprint de endurecimiento:

- Firma `X-Hub-Signature-256` obligatoria en el webhook.
- Cola de webhooks con reintentos, backoff y recuperación de eventos interrumpidos.
- Exclusión del webhook del rate limit global, con límite propio.
- Actualizaciones en vivo en las bandejas con socket.io.
- Credenciales de Meta cifradas con AES-256-GCM y editables desde el panel.
- Bloqueo de cuenta por intentos fallidos y límite propio en el login.
- Protección CSRF por origen y política mínima de contraseñas.
- Retención automática de bitácora y eventos, con redacción de credenciales.
- `/health` con estado real de base, cola y worker, y alertas externas opcionales.
- Migraciones versionadas, tests unitarios y CI en GitHub Actions.

Pendientes conocidos, en orden de impacto:

1. **Campañas con variables**: hoy solo aceptan plantillas sin variables; el envío con variables por contacto está en V2.
2. **Envío de campañas en cola**: el envío es secuencial dentro de la petición HTTP, sin control de velocidad. Con listas grandes conviene pasarlo a un job con throttling.
3. **Multimedia entrante**: se guarda el `mediaId`, pero todavía no hay visor ni descarga de imágenes, audio y documentos.
4. **Límites de mensajes manuales**: `canSendManualMessages`, `manualMessageLimit` y `manualMessagesUsed` se configuran en la interfaz, pero aún no se validan ni se incrementan al enviar.
5. **Normalización de teléfonos**: el normalizador asume México con prefijo `521`. Conviene contrastarlo contra el formato que Meta acepta hoy y, si el negocio crece fuera del país, generalizarlo.
6. **Respuestas de botones e interactivos**: se registran de forma genérica, sin interpretar la opción elegida, y todavía no se pueden enviar botones ni listas.
7. **Opt-in y manejo de BAJA/STOP**: no hay campo de consentimiento en `Contact` ni forma de honrar una baja de manera automática.
8. **Salud de la cuenta**: solo se procesa el campo `messages` del webhook; faltan `message_template_status_update` y `phone_number_quality_update` para enterarse de plantillas rechazadas o caídas de calidad.
9. **Programación de campañas**: no se pueden agendar por fecha y hora, pausar ni cancelar.
10. **Escalado**: socket.io funciona con una sola réplica. Con varias instancias hace falta el adaptador de Redis.

Las funcionalidades descartadas a propósito de V1 están documentadas en [`MArgarita.md`](MArgarita.md) y visibles en `/admin/roadmap`.

---

## 15. Documentación adicional

| Documento | Contenido |
| --- | --- |
| [`MArgarita.md`](MArgarita.md) | Documento de producto: alcance, roles, reglas de negocio y roadmap V1/V2 |
| [`base-datos.md`](base-datos.md) | Diseño de la base de datos entidad por entidad |
| [`docs/deploy-railway.md`](docs/deploy-railway.md) | Guía de despliegue en Railway |
| [`docs/roadmap-v2.md`](docs/roadmap-v2.md) | Plan detallado de los siguientes sprints: multimedia, interactivos y campañas |
| [`prisma/schema.prisma`](prisma/schema.prisma) | Esquema real de la base de datos |

`Reglas_margarita.md` es una copia idéntica de `MArgarita.md`.

---

## 16. Convenciones de código

- **Idioma**: nombres de código en inglés, pero mensajes de interfaz, errores, logs y comentarios en español.
- **Capas**: controlador delgado (lee request, delega, responde o redirige), servicio estático con la lógica de negocio, Prisma como única puerta a la base.
- **Validación**: todo lo que entra por el cuerpo de una petición pasa por un esquema Zod en `src/validations/`.
- **Errores**: los servicios lanzan `Error` con mensaje en español; el controlador decide si redirige con `?error=` o responde JSON.
- **Fechas**: siempre con la zona horaria de la aplicación (`src/utils/date.ts`), nunca con la del servidor.
- **JSON de Prisma**: se normaliza con `toPrismaJson` antes de guardar payloads de Meta.
- **Auditoría**: cualquier acción relevante (webhook, campaña, asignación, auth) se registra con `LogService.create` indicando nivel, módulo y acción.
- **Vistas**: EJS con Tailwind. Si agregas clases nuevas en EJS o en JavaScript de cliente, vuelve a correr `npm run css:build` para que entren al CSS compilado.

Antes de subir cambios:

```bash
npx tsc --noEmit    # tipos
npm run build       # build completo
```
