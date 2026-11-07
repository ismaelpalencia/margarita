# Margarita

Plataforma web para operar **WhatsApp Business Cloud API** de forma ordenada, segura y monitoreable.

Margarita permite enviar campañas con plantillas aprobadas, recibir respuestas, asignar conversaciones a agentes, seguir el ciclo real de cada mensaje (enviado, entregado, leído, fallido) y auditar todo lo que pasa con la cuenta de WhatsApp de la empresa.

No es un CRM, no es un chatbot y no administra ventas: es una herramienta especializada para operar el canal oficial de WhatsApp.

La página pública `margaritaapp.org/demo` corre en un **microservicio Go aparte** (`margaritademo`): sin base de datos, sin Meta y sin PII. Este repo sigue siendo el panel y el motor de WhatsApp; la demo solo lo muestra.

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
- Varios números por cuenta: agregar, editar, activar o desactivar números de la misma WABA, elegir el **número activo** en el encabezado y **apagar la IA, los flujos o los flujos guiados por número** (Admin → WhatsApp).
- Plantillas: sincronizar las aprobadas desde Meta y verlas con su estado real.
- Contactos: crear, editar, buscar, etiquetar y desactivar, con consentimiento (opt-in), bajas y filtro de "solo bajas".
- Teléfonos de México con 10 dígitos e internacionales con `+` y lada; el número se guarda normalizado para WhatsApp.
- Etiquetas: crear, editar y desactivar.
- Equipo: crear **administradores y agentes**, cambiar el rol, activar o desactivar y **restablecer contraseñas**. Nunca se puede dejar la instalación sin un administrador activo. Los agentes tienen permisos y **límite diario** de mensajes manuales aplicado de verdad, con el uso de hoy a la vista.
- Conversaciones: ver todas, abrir desde un contacto, responder, asignar, reasignar, cerrar y reabrir, con hilo estilo chat (burbujas, separadores de fecha, palomitas de estado reales y actualización en vivo), búsqueda por nombre completo o teléfono completo, filtros por estado, asignación y no leídos, y contador de pendientes por hilo y en el encabezado.
- Respuestas rápidas: textos guardados que se insertan con un clic (con `{nombre}` y `{telefono}` del contacto), editables en Admin → Respuestas.
- Botones y listas: enviar hasta 3 botones o una lista de 10 opciones dentro de la ventana de 24 horas, con sus respuestas interpretadas.
- IA de respuestas (sugerencias y automático acotado): con `AI_ENABLED=true` y una llave de DeepSeek (o cualquier API compatible con OpenAI), cada mensaje entrante puede generar una respuesta. En **sugerencias**, aparece como borrador en la bandeja con su confianza y su motivo; el equipo lo usa —se copia al compositor— o lo descarta, y nada se envía solo. En **automático acotado**, la IA responde sola únicamente cuando la pregunta está cubierta por la base de conocimiento, la confianza alcanza el mínimo, no hay baja ni pausa, la ventana de 24 horas está abierta, no intervino una persona y quedan límites y presupuesto; si duda, entrega el hilo a una persona. Admin → IA permite ajustar modo, tono, umbral, límites, presupuesto y base de conocimiento, y probar preguntas sin tocar un hilo real. Se puede pausar o reactivar la IA por conversación; responder a mano la pausa sola. Con `AI_ENABLED=false` la herramienta funciona igual que antes. La base de conocimiento admite **botones de respuesta rápida** (hasta 3) y los flujos se editan desde Admin → IA → Paquete inicial; ambos se pueden apagar por número. La IA y los flujos son independientes, y un flujo que responde evita el doble envío de la IA.
- **Importar negocio con IA**: pega o sube un documento de texto, la IA propone base de conocimiento, flujos y palabras de handoff; revisas la propuesta y la aplicas. No se guarda el documento original.
- **Flujos guiados**: secuencias deterministas de preguntas con botones, datos y ramas, sin IA. Sirven para calificar (por ejemplo, pensión IMSS), llevar a una cita o pedir un documento. Se ejecutan antes que la IA y no necesitan encender los flujos del paquete. Puedes armarlos en el constructor visual o pegar una estructura y pedir a la IA un borrador. Capturan datos y archivos, y el agente ve lo recibido en el panel del hilo.
- Bajas automáticas: si el cliente escribe `STOP`, el contacto queda dado de baja y deja de recibir mensajes y campañas; reactivarlo es una decisión explícita y queda auditada.
- Resultado de la gestión (cobranza): marca en qué quedó cada cliente —promesa de pago, pagado, convenio, incumplida, sin contestación, número inválido, no le interesa, volver a llamar— con monto, fecha compromiso y nota, desde el hilo, la ficha del contacto o en bloque desde la lista. Cada marcado deja historial con quién y cuándo. Este módulo se puede apagar por giro en **Sistema → Giro de la operación**: la bandeja, campañas y contactos siguen funcionando y los datos de cobranza no se borran.
- Reportes: gestiones del periodo por resultado, persona y día; promesas con lo vencido arriba, cumplimiento y prometido contra pagado; clientes sin contestación tras X intentos; y detalle exportable a CSV.
- Respaldos automáticos: cada 24 horas se guarda una copia completa de la base comprimida y cifrada, verificada al crearse, con 7 copias de retención; se puede crear una a mano, descargarla desde el panel y restaurarla con `npm run db:restore`.
- Borrado de mensajes: ocultar un mensaje sin destruirlo (restaurable desde el panel del admin) y, como admin, borrar todo el hilo escribiendo `BORRAR` para confirmar.
- Respaldos: descarga completa en JSON o exportación por entidad en CSV (contactos, conversaciones, mensajes, campañas, plantillas, usuarios y bitácora).
- Alta autoservicio: en una instalación nueva, `/setup` crea la empresa y el usuario administrador desde el navegador, y Admin → WhatsApp permite capturar las credenciales de Meta y el primer número sin usar la consola. El asistente se cierra solo al quedar configurada la instalación.
- Borrado total de la instalación: para cuando termina un contrato, elimina todos los datos y archivos escribiendo el identificador como confirmación, y deja constancia en la bitácora.
- Versión visible: `/health` y Admin → Sistema reportan la versión y el commit desplegado, útil cuando hay varias instalaciones.
- Campañas: crear seleccionando contactos o subiendo Excel/CSV con variables, enviar en cola (con pausa entre mensajes), pausar, reanudar, cancelar, ver errores y reintentar fallidos.
- Salud de la cuenta: los avisos de Meta sobre plantillas (aprobada, rechazada, pausada) y sobre la calidad de los números se procesan y quedan en la bitácora, con nivel de error cuando exigen atención.
- Logs: auditoría filtrable de webhook, Meta, campañas, **envíos de mensajes**, conversaciones y usuarios. Cada envío manual queda registrado como `MESSAGE_SENT` y cada fallo como `MESSAGE_FAILED`, con el motivo de Meta traducido al español.
- Estado del sistema: checklist de configuración (workspace, WhatsApp, plantillas, contactos, agentes).
- Guía del producto: qué hace la herramienta, el día en tres pasos, lo que no hace y los accesos a la guía de uso, la de plantillas y soporte.

### Panel de agente

- Solo ve las conversaciones asignadas a él.
- Estado operativo: `AVAILABLE`, `BUSY`, `BREAK`, `OFFLINE`. Al iniciar sesión no queda disponible automáticamente; debe activarse.
- Responde con cuatro modos: nota interna (marcada como tal en el hilo, no sale a WhatsApp), texto libre dentro de la ventana de 24 horas, archivos en la misma ventana, y plantilla aprobada cuando está cerrada.
- Respuestas rápidas de un clic y bandeja con búsqueda, filtros y contador de no leídos.
- Ve su tope diario de mensajes manuales y cuántos lleva usados.
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
- Cifrado en reposo de los datos personales: teléfonos, notas, contenido de los mensajes, payloads y eventos de Meta, variables de campaña y bitácora (AES-256-GCM), con índice ciego para el teléfono.
- Bitácora con retención automática y credenciales redactadas.
- Multimedia entrante: las fotos, el video, el audio y los documentos de los clientes se ven en el hilo. Las imágenes se descargan al recibirlas; el resto, cuando alguien lo abre.
- Envío de archivos: adjuntar imágenes, video, audio o documentos dentro de la ventana de 24 horas, con texto opcional.

---

## 2. Stack

| Capa | Tecnología |
| --- | --- |
| Runtime | Node.js 22.23.4 LTS (Prisma 7 requiere Node.js 20.19+, 22.12+ o 24+) |
| Lenguaje | TypeScript 5 (CommonJS, `strict`) |
| Servidor | Express 4 |
| Vistas | EJS renderizado en servidor |
| Estilos | Tailwind CSS 4 (CLI, compilado a `src/public/css/style.css`) |
| Tiempo real | Socket.IO 4 |
| Base de datos | PostgreSQL |
| ORM | Prisma 7.10.1 con `@prisma/adapter-pg` |
| Validación | Zod |
| Auth | JWT en cookie httpOnly + tabla `UserSession` revocable |
| Integración | WhatsApp Business Cloud API (Graph API) vía Axios |
| Demo pública | Go 1.22+ (biblioteca estándar, `//go:embed`), repo `margaritademo` en Railway |
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

### Demo pública (servicio aparte)

`margaritaapp.org/demo` no se sirve desde este repositorio. Es un microservicio
en **Go** (`github.com/ismaelpalencia/margaritademo`) con biblioteca estándar:

- `POST /api/demo/session` y `POST /api/demo/chat`; `GET /health`.
- `kb.json` embebido con `//go:embed` y matching por palabras clave; verticales
  `comercio`, `servicios`, `generico` + capa `margarita`.
- Sesiones y límites en memoria: 30 min, 40 mensajes, 20 sesiones/IP/día,
  30 chat/min/IP. **Una sola réplica.**
- Sin base de datos, sin Meta, sin login ni PII. CORS con `ALLOWED_ORIGINS`.
- Se despliega aparte en Railway y el landing lo consume por `DEMO_API_BASE`.

---

## 4. Requisitos

- Node.js 22.23.4 LTS (Prisma 7 requiere 20.19+, 22.12+ o 24+)
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

**El seed es obligatorio la primera vez.** Las migraciones crean las *tablas*, pero el seed crea los *datos*: el workspace, la configuración operativa, el usuario admin y la cuenta de WhatsApp. Sin él la tabla `User` está vacía y el login responde siempre "Credenciales incorrectas", porque el usuario no existe.

Las credenciales para entrar al panel salen de `ADMIN_EMAIL` y `ADMIN_PASSWORD`, no de las credenciales de PostgreSQL: son cosas distintas.

Ojo con volver a correrlo en producción: como es idempotente pero *actualiza*, reescribe la contraseña del admin con lo que diga `ADMIN_PASSWORD` y sobrescribe los datos de `WhatsAppAccount` (número, IDs y tokens). Úsalo una vez, o cuando quieras restablecer la contraseña del admin.

En Railway puedes ejecutarlo sin exponer la base, desde una terminal del servicio de la app:

```bash
node dist/tools/seed.js
```

---

## 6. Variables de entorno

Copia `.env.example` a `.env`. Ninguna de estas variables debe subirse al repositorio (`.env` está en `.gitignore`).

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `APP_NAME` | No | Nombre de la aplicación. Default `Margarita` |
| `APP_URL` | Producción con dominio propio | URL pública base **con esquema** (`https://dominio`). Se usa para CORS, socket.io, la validación CSRF y la URL del webhook. Con el dominio que da Railway puede quedar vacía; con dominio propio es obligatoria |
| `PORT` | No en Railway | Puerto HTTP. En local el default es `3000`; en Railway no la definas, porque el proveedor la inyecta |
| `NODE_ENV` | Sí | `development` o `production` (activa cookies `secure`) |
| `TIMEZONE` | No | Default `America/Mexico_City` |
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL |
| `JWT_SECRET` | Sí | Firma de los tokens. Genera con `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | No | Vida del token. Default `7d` |
| `COOKIE_NAME` | No | Nombre de la cookie de sesión. Default `margarita_token` |
| `ACTIVE_NUMBER_COOKIE_NAME` | No | Cookie donde se recuerda el número activo. Default `margarita_number` |
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
| `ENCRYPTION_KEY` | Sí | Llave del cifrado en reposo: tokens de Meta, teléfonos, mensajes, notas y bitácora (AES-256-GCM). Genera con `openssl rand -hex 32` |
| `LOGIN_MAX_ATTEMPTS` | No | Intentos fallidos antes de bloquear la cuenta. Default `5` |
| `LOGIN_LOCK_MINUTES` | No | Duración del bloqueo. Default `15` |
| `LOG_RETENTION_DAYS` | No | Días que se conserva la bitácora. Default `90` |
| `WEBHOOK_EVENT_RETENTION_DAYS` | No | Días que se conservan los eventos ya procesados. Default `30` |
| `WEBHOOK_QUEUE_ENABLED` | No | Procesa los webhooks por cola. Default `true` |
| `WEBHOOK_WORKER_INTERVAL_MS` | No | Cada cuánto revisa la cola el worker. Default `2000` |
| `WEBHOOK_MAX_ATTEMPTS` | No | Reintentos antes de marcar un evento como `FAILED`. Default `5` |
| `WEBHOOK_SCHEMA_PAUSE_MS` | No | Pausa del worker si detecta migraciones sin aplicar. Default `300000` (5 min) |
| `ALERT_WEBHOOK_URL` | No | Endpoint (Slack, Discord, Google Chat) que recibe avisos de error |
| `ALERT_COOLDOWN_MINUTES` | No | Enfriamiento entre avisos repetidos. Default `10` |
| `MEDIA_STORAGE_DIR` | Producción | Carpeta donde se guardan los archivos de los clientes. En Railway debe apuntar a un Volume. Default `uploads/media` |
| `R2_ACCOUNT_ID` | Opcional | Cuenta de Cloudflare R2. Si se define, respaldos y adjuntos se copian al bucket |
| `R2_BUCKET` | Opcional | Nombre del bucket (en esta instalación, `margarita-backup`). Debe ser privado |
| `R2_ACCESS_KEY_ID` | Opcional | Llave de API de R2 con permiso *Object Read & Write* sobre ese bucket |
| `R2_SECRET_ACCESS_KEY` | Opcional | Secreto de esa llave de R2 |
| `MEDIA_MAX_BYTES` | No | Tamaño máximo que se descarga de Meta. Default `26214400` (25 MB) |
| `GRAPH_BASE_URL` | Solo pruebas | Base de la Graph API; vacío usa `https://graph.facebook.com` |
| `OPT_OUT_KEYWORDS` | No | Palabras que dan de baja a un contacto al escribirlas (separadas por coma). Default `STOP` |
| `OUTCOME_NO_ANSWER_ATTEMPTS` | No | Intentos sin respuesta con los que un cliente entra a "sin contestación" en los reportes. Default `3` |
| `SESSION_IDLE_MINUTES` | No | Minutos de inactividad antes de cerrar la sesión sola. Default `720` (12 h) |
| `SESSION_MAX_ACTIVE` | No | Dispositivos con sesión abierta por usuario. Default `3` |
| `SUPPORT_WHATSAPP` | Comercial | Número de contacto (dígitos con lada país) que aparece en la página pública |
| `SUPPORT_EMAIL` | Comercial | Correo de contacto alterno |
| `AI_MONTHLY_REPLIES_LIMIT` | Comercial | Respuestas de IA incluidas al mes (`2000` en el plan único) |
| `AI_MONTHLY_SUGGESTIONS_LIMIT` | Comercial | Tope mensual informativo de sugerencias (0 = sin tope) |
| `AI_MONTHLY_BUDGET_CENTS` | Comercial | Hard cap de costo de tokens en centavos USD (`2800` ≈ $28 USD) |
| `AI_OVERAGE_PRICE_MXN` | Comercial | Precio del excedente para la estimación del panel (`150` por 1,000) |
| `AI_LIMITS_ENFORCE` | Comercial | Apaga el modo automático al llegar al hard cap. Default `false` |
| `AI_LIMITS_HIDDEN` | Comercial | Oculta la tarjeta de límites al cliente. Default `false` |
| `SUPPORT_WHATSAPP_DISPLAY` | Comercial | El número como se muestra en la página (`+52 1 55 6487 0481`) |
| `BACKUP_ENABLED` | No | Respaldo automático de la base. Default `true` |
| `BACKUP_INTERVAL_HOURS` | No | Cada cuánto se guarda una copia completa. Default `24` |
| `BACKUP_KEEP` | No | Copias que se conservan. Default `7` |
| `BACKUP_DIR` | Producción | Carpeta de las copias; debe estar en un Volume. Default `<MEDIA_STORAGE_DIR>/../backups` |
| `BACKUP_MAX_AGE_HOURS` | No | Edad a partir de la cual `/health` marca el respaldo como viejo. Default `36` |
| `CAMPAIGN_WORKER_INTERVAL_MS` | No | Cada cuánto revisa el worker de campañas. Default `5000` |
| `CAMPAIGN_BATCH_SIZE` | No | Destinatarios por vuelta del worker. Default `10` |
| `CAMPAIGN_SEND_INTERVAL_MS` | No | Pausa entre envíos, para no chocar con los límites de Meta. Default `700` |
| `AI_ENABLED` | No | Interruptor maestro de la IA. Default `false`: sin él, la app funciona igual que antes |
| `AI_PROVIDER` | No | `deepseek` (default), cualquier API compatible o `mock` para pruebas sin red |
| `AI_BASE_URL` | No | Base del proveedor. Default `https://api.deepseek.com` |
| `AI_API_KEY` | Para usar IA | Llave del proveedor. Sin ella no se generan borradores |
| `AI_MODEL` | No | Modelo. Default `deepseek-chat` |
| `AI_TIMEOUT_MS` | No | Tiempo máximo de una llamada al modelo. Default `20000` |
| `AI_DEBOUNCE_SECONDS` | No | Espera para agrupar mensajes seguidos antes de llamar al modelo. Default `4` |
| `AI_MAX_CONTEXT_MESSAGES` | No | Mensajes previos que se mandan como contexto. Default `12` |
| `AI_MAX_KNOWLEDGE_ENTRIES` | No | Entradas de conocimiento recuperadas por mensaje. Default `6` |
| `AI_WORKER_INTERVAL_MS` | No | Cada cuánto revisa la cola el worker de IA. Default `3000` |
| `AI_MAX_ATTEMPTS` | No | Reintentos de un borrador fallido. Default `2` |
| `AI_MAX_TOKENS` / `AI_TEMPERATURE` | No | Límite de salida y creatividad del modelo. Default `400` y `0.3` |

R2 es opcional: se activa solo con las cuatro variables `R2_*`. Si las quitas, la app vuelve a usar solo el Volume; el bucket no se borra, pero los adjuntos que no estén en el Volume dejan de abrirse hasta reactivarlo. No requiere migración. La guía de reconexión está en [`docs/cloudflare.md`](docs/cloudflare.md).

Sin `META_APP_SECRET` el webhook no valida el origen: en desarrollo solo registra un aviso, pero **en producción responde 401** y la app deja de recibir mensajes.

Sin `ENCRYPTION_KEY` la app funciona igual, pero **nada se cifra en la base**: los tokens de Meta, los teléfonos, los mensajes y la bitácora quedan en texto plano. El panel de sistema lo marca como pendiente.

### Cómo generar los secretos

```bash
npm run secrets:generate                    # los muestra en pantalla
npm run secrets:generate -- --write-env     # además agrega a .env los que falten
npm run secrets:generate -- --json          # salida para automatizar
```

Genera cuatro valores y explica para qué sirve cada uno:

| Clave | Para qué sirve |
| --- | --- |
| `ENCRYPTION_KEY` | Cifra con AES-256-GCM todo lo sensible guardado en la base: tokens de Meta, teléfonos de contacto, contenido de mensajes, notas y bitácora |
| `JWT_SECRET` | Firma las cookies de sesión del panel |
| `META_VERIFY_TOKEN` | Se pega también en Meta para verificar el webhook |
| `ADMIN_PASSWORD` | La usa el seed para crear tu usuario admin |

Con `--write-env` **nunca sobrescribe** lo que ya existe: solo agrega las claves que faltan, así que puedes correrlo sin miedo en un `.env` que ya está en uso.

### Qué hace `ENCRYPTION_KEY` (y qué no)

Cifra en la base, campo por campo, lo que puede hacer daño si alguien obtiene un volcado (un respaldo, una captura de la pestaña Data de Railway, una cadena de conexión filtrada):

| Dónde | Qué se cifra |
| --- | --- |
| `WhatsAppAccount` | `accessToken` y `verifyToken` |
| `Contact` | `phone`, `notes`, `customName`, `profileName` y `outcomeAmount` (teléfono y nombre se buscan por sus índices ciegos) |
| `Message` | `body`, `mediaFilename`, `metaPayload`, `metaResponse`, `replyTitle` |
| `CampaignRecipient` | `phone` y `variables` |
| `WhatsAppNumber` | `phoneNumber` |
| `Log` | `payload` |
| `WebhookEvent` | `payload` (el evento crudo que manda Meta) |
| `User` | `email` (el correo de acceso) y `twoFactorSecret` (la clave del segundo factor) |
| `ContactOutcome` | `note` y `amount` |

El cifrado y el descifrado son transparentes: los servicios y las vistas siguen trabajando con valores normales, así que nada del panel cambió.

Hay tres campos que no se pueden comparar por coincidencia parcial porque están cifrados y se buscan con un índice ciego (HMAC-SHA256 con esta misma llave): el **teléfono del contacto** (`Contact.phoneHash`), el **nombre del contacto** (`Contact.nameHash`) y el **correo de acceso del usuario** (`User.emailHash`). El índice conserva la unicidad y la búsqueda exacta. Por eso en Contactos hay que escribir el nombre completo o el número completo; el correo se resuelve solo (el inicio de sesión traduce el correo completo a su índice) y una consulta por partes falla con explicación.

**Lo que queda sin cifrar:** los adjuntos (en disco y en R2, donde la infraestructura cifra en reposo, no la app), los archivos de PostgreSQL y los nombres de los usuarios del equipo y de la empresa, que no son datos de los deudores. Los datos de los contactos —nombre, teléfono, mensajes, notas, montos y correo de acceso— ya van cifrados.

No tiene nada que ver con las contraseñas de los usuarios: esas se guardan con bcrypt, que es de una sola vía y no necesita llave.

**Debe ser estable.** Si la cambias o la pierdes, los datos cifrados dejan de poder leerse: la app no podrá hablar con Meta (tokens ilegibles), los teléfonos mostrarán basura y las conversaciones no se podrán leer. No hay forma de recuperarlos sin esta llave, así que guárdala en un gestor de contraseñas.

Si todavía no la tienes, la app funciona y guarda todo en texto plano; el panel lo muestra como pendiente en Admin → Sistema. Al configurarla, los datos que ya existían —incluidos los mensajes de la bitácora— se cifran de una vez con `npm run db:encrypt-data` (idempotente) o, para las credenciales de Meta, con el botón **Admin → WhatsApp → Cifrar credenciales existentes**.

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
| `npm run db:migrate-deploy` | Aplica las migraciones resolviendo solo el estado de la base (idempotente) |
| `npm test` | Corre los tests unitarios con el runner de Node |
| `npm run test:integration` | Levanta la app y corre las pruebas de integración contra una base real (crea y borra su propia empresa de prueba) |
| `npm run typecheck:all` | Verifica tipos incluyendo las pruebas de integración |
| `npm run db:encrypt-secrets` | Cifra las credenciales de Meta que siguen en texto plano |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:seed` | Carga datos iniciales |
| `npm run db:seed:dist` | Igual, pero con el código compilado (no necesita `tsx`) |
| `npm run secrets:generate` | Genera `ENCRYPTION_KEY`, `JWT_SECRET`, `META_VERIFY_TOKEN` y una contraseña para el admin |
| `npm run db:encrypt-data` | Cifra los datos que quedaron en claro antes del cifrado en reposo (idempotente) |
| `npm run db:encrypt-data:dist` | Lo mismo, con el código compilado: sirve dentro del contenedor, sin devDependencies |
| `npm run db:encrypt-secrets` | Cifra únicamente los tokens de Meta que quedaron en claro |
| `npm run db:backup` | Crea un respaldo de la base ahora mismo (útil antes de un cambio delicado) |
| `npm run db:restore` | Restaura un respaldo: `--file=<archivo.mgb>`, con `--dry-run` para validar y `--yes` para aplicarlo |
| `npm run admin:reset-password` | Restablece una contraseña desde el servidor: `--email=<correo> [--password=<nueva>]` |
| `npm run db:studio` | Abre Prisma Studio |

### Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request, en dos trabajos:

| Trabajo | Qué hace |
| --- | --- |
| **Tipos, tests y build** | Valida el esquema de Prisma, genera el cliente, verifica tipos, corre las pruebas unitarias y hace el build completo. No necesita base de datos. |
| **Integración** | Levanta un **PostgreSQL 16** como servicio, aplica las migraciones, verifica tipos (incluidas las pruebas), compila y corre la suite de integración contra esa base desechable. |

La suite de integración es la red que faltaba: prueba contra una base de verdad el webhook firmado de punta a punta (firma → cola → worker → mensaje guardado), el cifrado en reposo (escribe por la aplicación, mira la columna cruda), las campañas con variables y exclusiones, los resultados de gestión, las sesiones y los respaldos. Cada archivo crea su propia empresa de prueba y la borra al terminar, así que también se puede correr en local contra una base de desarrollo sin tocar los datos reales:

```bash
npm run build                 # el runner levanta dist/server.js
npm run test:integration      # con DATABASE_URL disponible
```

Dos pruebas necesitan una base **vacía** (el alta desde cero y la restauración de un respaldo) y solo corren con `INTEGRATION_DESTRUCTIVE=1`, que es lo que hace CI. En local se saltan a propósito.

No hace falta configurar ningún secreto en GitHub: los pasos que usan Prisma (`validate` y `generate`) no se conectan a una base de datos, y `prisma.config.ts` usa un `DATABASE_URL` de relleno cuando la variable no existe. Eso mismo es lo que permite que el build de Railway funcione antes de tener la base configurada.

El trabajo de integración sí necesita la base: se declara con `services:` y su `DATABASE_URL` apunta al contenedor de PostgreSQL.

---

## 8. Rutas de la aplicación

### Públicas

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/` | Landing pública en la instalación sin `PRODUCT_DOMAIN`; con dominio de producto, manda al acceso |
| GET | `/como-empezar` | Guía de inicio |
| GET | `/health` | Healthcheck (`200` con `status: healthy`) |
| GET | `/auth/login` | Formulario de acceso |
| GET/POST | `/setup` | Asistente de alta; solo funciona mientras no exista un workspace |
| POST | `/auth/login` | Autentica y emite la cookie de sesión |
| POST | `/auth/logout` | Cierra sesión y desactiva la sesión en base |
| GET | `/webhooks/meta/whatsapp` | Verificación del webhook de Meta |
| POST | `/webhooks/meta/whatsapp` | Recepción de mensajes y estados |
| GET | `/media/:messageId` | Archivo de un mensaje. Requiere sesión y acceso a la conversación; `?download=1` fuerza la descarga |

### Admin (`/admin`, requiere rol `ADMIN`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/admin/dashboard` | Resumen operativo |
| GET/POST | `/admin/users`, `/admin/users/new`, `/admin/users/:id/edit`, `/admin/users/:id/toggle-status` | Gestión de agentes |
| GET/POST | `/admin/contacts`, `/admin/contacts/new`, `/admin/contacts/:id/edit`, `/admin/contacts/:id/deactivate` | Gestión de contactos |
| POST | `/admin/contacts/:id/opt-out`, `/admin/contacts/:id/opt-in` | Marca la baja o reactiva el consentimiento de un contacto |
| POST | `/admin/users/:id/password` | Restablece la contraseña de un usuario (obliga a cambiarla al entrar) |
| GET/POST | `/account/password` | Cada persona cambia su propia contraseña (admin y agente) |
| POST | `/admin/contacts/:id/outcome`, `/admin/contacts/outcomes/bulk` | Registra el resultado de la gestión (individual o en bloque) |
| GET | `/admin/reports` | Reportes de gestión (gestiones, promesas, sin contestación y detalle) |
| GET | `/admin/reports/export` | Descarga el reporte actual en CSV |
| GET/POST | `/admin/sessions`, `/admin/sessions/revoke`, `/admin/sessions/revoke-others` | Sesiones activas de la empresa, cierre individual y masivo |
| GET/POST | `/admin/quick-replies`, `/admin/quick-replies/:id/edit`, `/admin/quick-replies/:id/active` | Respuestas rápidas |
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
| POST | `/admin/conversations/:id/messages/media` | Envía imagen, video, audio o documento (`multipart`: `file` + `caption`) |
| POST | `/admin/conversations/:id/messages/:messageId/delete` | Oculta un mensaje del chat |
| POST | `/admin/conversations/:id/messages/:messageId/restore` | Restaura un mensaje oculto |
| POST | `/admin/conversations/:id/purge` | Borra definitivamente todo el hilo (requiere escribir `BORRAR`) |
| POST | `/admin/conversations/:id/assign` | Asigna o reasigna agente |
| POST | `/admin/conversations/:id/close`, `/:id/reopen` | Cierra o reabre |
| GET | `/admin/campaigns` | Listado de campañas |
| GET | `/admin/campaigns/create` | Alta de campaña |
| POST | `/admin/campaigns` | Crea campaña desde contactos seleccionados |
| POST | `/admin/campaigns/excel` | Crea campaña desde Excel/CSV |
| GET | `/admin/campaigns/:id` | Detalle y destinatarios |
| POST | `/admin/campaigns/:id/send` | Envía la campaña |
| POST | `/admin/campaigns/:id/pause`, `/:id/resume`, `/:id/cancel` | Pausa, reanuda o cancela el envío |
| POST | `/admin/campaigns/:id/retry-failed` | Reintenta destinatarios fallidos |
| GET | `/admin/logs` | Auditoría |
| GET | `/admin/backup` | Respaldos y exportaciones |
| GET | `/admin/backup/download` | Descarga respaldo (`?format=json` o `?format=csv&entity=messages`) |
| POST | `/admin/backup/snapshot` | Crea una copia de la base ahora mismo |
| GET | `/admin/backup/snapshot/:archivo` | Descarga una copia (archivo cifrado) |
| POST | `/admin/backup/snapshot/:archivo/verify` | Verifica que la copia se puede leer y descifrar |
| POST | `/admin/backup/purge` | Elimina todos los datos de la instalación (requiere el identificador) |
| GET | `/admin/system` | Checklist de configuración |
| GET | `/admin/guia` | Guía del producto para el equipo del cliente |

### Agente (`/agent`, requiere rol `AGENT`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/agent/dashboard` | Resumen del agente |
| POST | `/agent/status` | Cambia estado operativo |
| GET | `/agent/conversations` | Solo sus conversaciones asignadas |
| GET | `/agent/conversations/:id` | Detalle del hilo |
| POST | `/agent/conversations/:id/messages/local`, `/free-text`, `/template` | Respuesta en sus tres modos |
| POST | `/agent/conversations/:id/messages/media` | Envía un archivo dentro de la ventana de 24 horas |
| POST | `/agent/conversations/:id/close` | Cierra la conversación |

---

## 9. Modelo de datos

Definición completa en [`prisma/schema.prisma`](prisma/schema.prisma) y explicación funcional en [`base-datos.md`](base-datos.md).

| Entidad | Propósito |
| --- | --- |
| `Workspace` | La empresa dueña de la instalación (una por despliegue en V1) |
| `WorkspaceSettings` | Zona horaria y tope diario de mensajes manuales (lo único que la app aplica; ver `base-datos.md`) |
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
- Tipos de entrada soportados: texto, imagen, video, audio, documento e interactivos. De un interactivo se guardan el identificador y el texto de la opción elegida (botón de plantilla, `button_reply` o `list_reply`), y ese identificador puede disparar una regla que registre un resultado, pause la cuenta o dé de baja al contacto.

**Idempotencia.** Cada mensaje entrante se identifica por `wamid`; si Meta reintenta, no se duplica.

**Cola de procesamiento.** El endpoint ya no procesa el mensaje en línea: guarda el payload en la tabla `WebhookEvent` y responde `200` de inmediato (en la práctica, menos de 10 ms). Un worker en segundo plano lo procesa cada `WEBHOOK_WORKER_INTERVAL_MS` milisegundos con reintentos y backoff exponencial (1s, 2s, 4s… hasta 5 minutos) y `WEBHOOK_MAX_ATTEMPTS` intentos antes de marcarlo como `FAILED`.

Esto cambia dos cosas importantes. Primero, un error temporal (base de datos lenta, un bug en el procesamiento) ya no pierde el mensaje del cliente: se reintenta. Segundo, si el proceso se cae a mitad del trabajo, el evento queda en `PROCESSING` y se devuelve a la cola automáticamente a los 5 minutos.

Si la base no tiene aplicadas las migraciones, el worker lo detecta, registra **un solo** error con la instrucción exacta y se pausa `WEBHOOK_SCHEMA_PAUSE_MS` en lugar de consultar en bucle. Cuando la migración se aplica, se reactiva solo, sin reiniciar el servicio.

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
- **Verificación en dos pasos (TOTP)**: opcional por cuenta y se activa desde **Mi cuenta → Seguridad** con cualquier app de autenticación (Google Authenticator, Authy, Microsoft Authenticator, 1Password, Bitwarden o la app **Contraseñas** de Apple): es el estándar, así que funciona igual en todas. La pantalla de activación muestra un código QR para escanear y la clave a mano como respaldo. Está implementada con `node:crypto` (RFC 6238), sin dependencias nuevas. El secreto se guarda cifrado y la activación no se completa hasta confirmar un código. La contraseña correcta ya no abre sesión por sí sola: devuelve un desafío firmado de 5 minutos y los códigos fallidos cuentan como intentos fallidos (bloquean la cuenta igual que una contraseña mal escrita). Si alguien pierde el teléfono, un administrador puede desactivarla desde Equipo, con constancia en la bitácora.
- **Autorización**: `authMiddleware` en todas las rutas privadas y `requireRole` separando `ADMIN` de `AGENT`. Un agente solo puede ver y responder sus conversaciones asignadas; esa restricción se aplica también en la consulta a base de datos.
- **Contraseñas**: hash con bcrypt (12 rondas). Política mínima de 10 caracteres con letras y números, y lista negra de contraseñas obvias al crear o editar agentes.
- **Bloqueo por fuerza bruta**: el login tiene su propio límite (10 peticiones por 15 minutos por IP) y, a nivel de cuenta, se bloquea `LOGIN_LOCK_MINUTES` minutos tras `LOGIN_MAX_ATTEMPTS` intentos fallidos. Cada intento fallido, cada bloqueo y cada acceso correcto quedan en la bitácora.
- **Protección CSRF**: toda petición que cambia estado debe traer un `Origin` (o `Referer`) que coincida con `APP_URL`. Un formulario alojado en otro sitio recibe `403`. Las peticiones sin `Origin` (curl, healthchecks, webhooks de Meta) se permiten porque no son navegadores.
- **`APP_URL` tolerante**: el valor se normaliza al arrancar, así que un dominio pegado sin `https://` (como lo muestra Railway) funciona igual y deja un aviso en los logs en lugar de desactivar la validación de origen en silencio. `/health` expone `publicUrl` para comprobar desde fuera qué URL cree tener la app.
- **Alta con mínima configuración**: si `APP_URL` no está definida se usa el dominio público de Railway (con dominio propio hay que fijarla); mientras la instalación no tenga empresa ni admin, la raíz y la pantalla de login llevan al asistente `/setup`; y `railway.json` deja el build, las migraciones, el arranque y el healthcheck listos para la plantilla.
- **Cifrado en reposo**: con AES-256-GCM y `ENCRYPTION_KEY` se cifran los tokens de Meta, el teléfono y las notas de cada contacto, el contenido y los payloads de cada mensaje, las variables de campaña, los números de la WABA, el correo de acceso de cada usuario y el mensaje y payload de la bitácora. El descifrado es transparente al leer, así que el panel no cambia. Los datos guardados antes de habilitar el cifrado se siguen leyendo y se migran con `npm run db:encrypt-data` (o `db:encrypt-secrets` solo para los tokens); el correo y su índice se completan solos al arrancar el servicio. Teléfono y correo se comparan por su índice ciego (`phoneHash`, `emailHash`), con la misma llave.
- **Firma de webhook**: HMAC-SHA256 con comparación en tiempo constante.
- **Validación**: todos los cuerpos de entrada pasan por esquemas Zod.
- **Cabeceras**: Helmet habilitado.
- **CORS**: restringido a `APP_URL`, con credenciales.
- **Rate limiting**: 300 peticiones cada 15 minutos por IP en el panel; 10 en el login; 1200 por minuto en el webhook. El healthcheck está exento.
- **Proxy**: `trust proxy` activo, porque la app corre detrás de un proxy en producción.
- **Secretos**: los tokens se muestran enmascarados y el objeto que consume la vista no incluye el valor en claro. Además, la bitácora redacta cualquier campo que parezca credencial (`token`, `secret`, `password`, `authorization`) antes de guardarlo.
- **Retención**: la bitácora se purga a los `LOG_RETENTION_DAYS` días y los eventos de webhook ya resueltos a los `WEBHOOK_EVENT_RETENTION_DAYS`, para acotar el crecimiento y la exposición de datos personales.
- **Monitoreo**: `/health` reporta base de datos, profundidad de la cola, evento pendiente más antiguo, estado del worker y si falta alguna variable de seguridad. En producción, sin `HEALTH_TOKEN`, solo publica `{ok, status, timestamp}`; el detalle exige `?token=`. Devuelve `503` si la base está caída o si la cola no se puede leer (por ejemplo, migraciones sin aplicar). También expone `webhook.received`, `webhook.enqueued`, `webhook.rejected` y `lastRejectionReason`: así se distingue "Meta no envía nada" de "Meta envía y lo estamos rechazando" sin entrar al panel.
- **Resiliencia**: los rechazos de handlers Express llegan al manejador HTTP y devuelven 500. Un rechazo o una excepción que quede sin manejar se registra y alerta; después el proceso termina para que el supervisor lo reinicie en un estado limpio. `/health` reporta problemas operativos como migraciones sin aplicar con una pista accionable.
- **Alertas**: si defines `ALERT_WEBHOOK_URL`, cada log de nivel `ERROR` dispara un aviso externo con enfriamiento configurable.

---

## 13. Despliegue

La guía completa paso a paso está en [`docs/deploy-railway.md`](docs/deploy-railway.md). Resumen:

| Concepto | Valor |
| --- | --- |
| Build command | **Déjalo vacío** en el panel: viene en `nixpacks.toml` (`npm install --include=dev` + `npm run build`). Si pones otro `npm ci` ahí, corre dos veces y falla con `EBUSY` al borrar `node_modules` |
| Start command | `npm start` |
| Healthcheck | `/health` |
| Puerto | **No definas `PORT`**: Railway la inyecta y la app escucha ahí |
| Node | 22.23.4 LTS (Prisma 7 no instala en Node 18) |
| Variables clave | `DATABASE_URL` (referencia al plugin de Postgres), `NODE_ENV=production`, `JWT_SECRET`, `ENCRYPTION_KEY` y `META_APP_SECRET`. `APP_URL` va vacía con dominio de Railway y es obligatoria con dominio propio |

Los cinco tropiezos más comunes: que el build use **Node 18** y Prisma 7 se niegue a instalar (se resuelve con `NIXPACKS_NODE_VERSION=22.23.4` en el servicio; el repo ya la declara en `engines`, `.nvmrc` y `nixpacks.toml`), dejar un **Build Command** en el servicio que duplique la instalación (`EBUSY` al borrar `node_modules`), dejar `APP_URL` apuntando a localhost (rompe CORS y el socket), olvidar `META_APP_SECRET` (el webhook responde 401 en producción) y olvidar `ENCRYPTION_KEY` (nada se cifra en la base).

El proyecto usa migraciones versionadas. Lo más simple es dejar que Railway las aplique dentro del contenedor, sin exponer la base ni copiar credenciales: `railway.json` ya trae el Pre-deploy Command `node dist/tools/deploy-migrations.js`. Ese script detecta el estado de la base y resuelve los tres casos (base nueva, base existente sin historial y base ya baselinada) de forma idempotente; no lo dupliques en el panel.

Si prefieres hacerlo a mano desde tu máquina, el orden para una base que venía funcionando con `db push` es marcar la migración inicial como aplicada y luego desplegar la nueva:

```bash
npx prisma migrate resolve --applied 20261009000000_init
npx prisma migrate deploy
```

En una base nueva, `npx prisma migrate deploy` crea todo desde cero. Hoy Railway ya no publica `DATABASE_PUBLIC_URL`: para conectar desde tu máquina usa la pestaña **Connect** del servicio de Postgres o habilita el TCP Proxy. El detalle está en [docs/deploy-railway.md](docs/deploy-railway.md).

El modelo es **single-tenant por despliegue**: un cliente, un proyecto, una base de datos, un workspace. Todos los clientes usan el mismo repositorio y se diferencian solo por variables de entorno, dominio y cuenta de WhatsApp.

### Demo pública

La demo es **otro servicio de Railway** con su propio repo (`margaritademo`),
imagen Go y dominio `demo.margaritaapp.org`. No comparte base, variables de Meta
ni sesión con la app. Se configura con `ALLOWED_ORIGINS`, `DEMO_TIMEZONE`,
`DEMO_TRUST_PROXY` y los límites `DEMO_*`. Al ser sesiones en memoria, debe
correr con **una sola réplica**.

---

## 14. Estado del proyecto y pendientes

Estado actual: la V1 está completa y funcional para producción. `npx tsc --noEmit` pasa limpio, hay **364 pruebas unitarias en 57 archivos** y una **suite de integración** contra PostgreSQL (esta última corre en CI con una base desechable), y los flujos críticos están verificados de punta a punta contra una base de datos real: firma del webhook, encolado, procesamiento por el worker, guardado del mensaje, emisión en vivo por socket, CSRF, bloqueo de login, verificación en dos pasos (desafío sin sesión, código válido y rescate por administrador), cifrado en reposo de todos los campos sensibles —incluidos nombres y correos— (con la misma lectura antes y después de cifrar), baja automática por `STOP`, límites diarios de mensajes manuales, respuestas rápidas, no leídos, exclusión de contactos dados de baja en campañas, resultados de gestión con reportes de cobranza, control de sesiones, varios administradores con recuperación de contraseñas, **restauración de un respaldo probada borrando datos a propósito** y **alta de una instalación vacía recorriendo el asistente como un cliente nuevo**.

Lo que se cerró en el sprint de endurecimiento:

- Firma `X-Hub-Signature-256` obligatoria en el webhook.
- Cola de webhooks con reintentos, backoff y recuperación de eventos interrumpidos.
- Exclusión del webhook del rate limit global, con límite propio.
- Actualizaciones en vivo en las bandejas con socket.io.
- Credenciales de Meta cifradas con AES-256-GCM y editables desde el panel.
- Cifrado en reposo de teléfonos, **nombres**, notas, mensajes, payloads, variables de campaña, correos y bitácora, con índices ciegos para buscar por teléfono, nombre completo o correo sin guardarlos en claro.
- Campañas programadas por fecha y hora, con el planificador arrancándolas solo.
- Respuestas de botón (y de lista) interpretadas, con reglas que registran un resultado, pausan la cuenta o dan de baja.
- Envío de botones dentro de la ventana de 24 horas (hasta 3) y plantillas con variables de encabezado, cuerpo y URL del botón.
- Contador del tramo de mensajes gratis por número, con alerta al 80% y costo estimado.
- Opt-in formal con fecha, canal y autor.
- Respaldos y adjuntos copiados a Cloudflare R2 además del Volume local.
- Baja automática por palabra clave (`OPT_OUT_KEYWORDS`, por defecto `STOP`), con bloqueo de envíos y reactivación auditada.
- Límite diario de mensajes manuales aplicado, calculado sobre los envíos reales (las notas internas no cuentan).
- Respuestas rápidas, contador de no leídos y filtros y búsqueda en la bandeja.
- Resultados de gestión (promesas, pagos, incumplidas, sin contestación) con historial, marcado en bloque y reportes exportables.
- Bloqueo de cuenta por intentos fallidos y límite propio en el login.
- Verificación en dos pasos (TOTP) opcional por cuenta, con el secreto cifrado y desactivación auditada desde el panel de Equipo.
- Protección CSRF por origen y política mínima de contraseñas.
- Retención automática de bitácora y eventos, con redacción de credenciales.
- `/health` con estado real de base, cola y worker, y alertas externas opcionales.
- Migraciones versionadas, tests unitarios y CI en GitHub Actions.

Pendientes conocidos, en orden de impacto:

1. **Baja con otras palabras**: solo se detecta la palabra clave al inicio del mensaje; el resto se marca a mano desde la ficha del contacto.
2. **No leídos por persona**: el contador es del hilo, no de cada usuario.
3. **Restauración desde R2**: los respaldos se suben cifrados al bucket, pero restaurar directamente desde R2 en un entorno limpio todavía se hace a mano.
4. **Escalado**: socket.io funciona con una sola réplica. Con varias instancias hace falta el adaptador de Redis.
5. **Permisos por número**: todos los agentes ven todos los números; la IA y los flujos sí se pueden apagar por número, pero la visibilidad no está restringida.

El límite vigente, con su explicación, está en [`docs/alcance-produccion.md`](docs/alcance-produccion.md). El panel muestra la guía del producto en `/admin/guia`.

---

## 15. Documentación adicional

| Documento | Contenido |
| --- | --- |
| [`MArgarita.md`](MArgarita.md) | Especificación original del producto: alcance, roles y reglas de diseño (histórico) |
| [`base-datos.md`](base-datos.md) | Diseño de la base de datos entidad por entidad |
| [`docs/deploy-railway.md`](docs/deploy-railway.md) | Guía de despliegue en Railway |
| [`docs/plantilla-railway.md`](docs/plantilla-railway.md) | Publicar la plantilla para dar de alta clientes en minutos |
| [`docs/roadmap-v2.md`](docs/roadmap-v2.md) | Histórico de sprints: qué se hizo, cómo se verificó y qué se sabía en cada uno |
| [`docs/marca.md`](docs/marca.md) | El símbolo, la paleta y el tono: cómo se ve Margarita y cómo se regenera |
| [`docs/propuesta-comercial.md`](docs/propuesta-comercial.md) | Plantilla de propuesta: alcance, precios, qué no incluye y tiempos |
| [`docs/facturacion.md`](docs/facturacion.md) | Reglas de cobro y facturación: paquetes A/B, mensualidad, piloto de 30 días, fechas de la promoción y qué decirle al cliente |
| [`docs/dolores-y-posts.md`](docs/dolores-y-posts.md) | Material para vender: el dolor del bloqueo, los otros siete dolores, mitos, posts listos y lo que no se debe prometer |
| [`landing/`](landing/README.md) | La página de venta como sitio estático, para subir aparte (`npm run landing:build`) |
| [`docs/dominios.md`](docs/dominios.md) | Cómo conectar el dominio de una operación, dónde vive la landing y qué comprobar después |
| [`docs/plan-interactivos.md`](docs/plan-interactivos.md) | Cómo entrar en dos sprints a la evolución de botones e interacciones: alcance, bloqueante de Meta, decisiones y mapa técnico |
| [`nuevo_roadmap.md`](nuevo_roadmap.md) | Documento de trabajo original de botones, plantillas interactivas, tramo y llamadas (histórico) |
| [`docs/alcance-produccion.md`](docs/alcance-produccion.md) | Alcance actual, límites, seguridad, demo Go y responsabilidades para uso en producción |
| [`docs/marca-colores.md`](docs/marca-colores.md) | Paleta real de la app/landing y prompt para diseños publicitarios |
| [`docs/venta/propuesta-workana.md`](docs/venta/propuesta-workana.md) | Propuestas para proyectos de IA + WhatsApp en Workana |
| [`margaritademo`](https://github.com/ismaelpalencia/margaritademo) | Repositorio del microservicio Go de la demo pública |
| [`docs/multinumero.md`](docs/multinumero.md) | Diseño del multinúmero: modelo, migración, uso y pendientes |
| [`docs/aviso-privacidad.md`](docs/aviso-privacidad.md) | Aviso de privacidad para revisar y publicar (la versión pública vive en `/aviso-de-privacidad`) |
| [`docs/modelo-comercial.md`](docs/modelo-comercial.md) | Runbook de alta por cliente, actualización de instalaciones, cierre de contrato y paquete legal |
| [`docs/guia-meta.md`](docs/guia-meta.md) | Guía de conexión con Meta para el cliente (versión publicada en `/como-empezar`) |
| [`docs/reportes-cobranza.md`](docs/reportes-cobranza.md) | Diseño del módulo de resultados de gestión y reportes de cobranza |
| [`docs/ia-respuestas.md`](docs/ia-respuestas.md) | IA de respuestas: sugerencias y automático acotado implementados, operación con DeepSeek, límites y handoff |
| [`docs/demanda-workana.md`](docs/demanda-workana.md) | Qué pide el mercado en Workana, qué cubre Margarita y cómo volverlo una oferta vendible |
| [`docs/decision-runtime.md`](docs/decision-runtime.md) | Por qué se mantiene Node y cuándo se justificaría extraer un servicio en Go |
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
- **Auditoría**: cualquier acción relevante (webhook, campaña, asignación, auth y **envíos de mensajes**) se registra con `LogService.create` indicando nivel, módulo y acción.
- **Errores de Meta**: `src/utils/meta-error.ts` extrae el error de cualquiera de las formas en que llega (respuesta de un envío rechazado, `errors` del webhook de estado o el estado más reciente guardado) y traduce los códigos frecuentes. Se usa en la bitácora y para mostrar el motivo en la conversación.
- **Vistas**: EJS con Tailwind. Si agregas clases nuevas en EJS o en JavaScript de cliente, vuelve a correr `npm run css:build` para que entren al CSS compilado.

Antes de subir cambios:

```bash
npx tsc --noEmit    # tipos
npm run build       # build completo
```

### Assets de marca

Todas las vistas cargan los íconos desde `src/views/partials/brand-head.ejs`, que se incluye dentro del `<head>`. Si agregas una vista nueva, inclúyelo para que herede favicon, manifest y `theme-color`.

| Archivo | Uso |
| --- | --- |
| `src/public/brand/img/margarita-wordmark-512.png` | Símbolo + nombre, en encabezados y landing |
| `src/public/brand/img/margarita-icon-64.png` | Sello de mirada (círculo con la flor y dos ojos) en las barras de navegación |
| `src/public/brand/img/margarita-icon-128.png` | Ícono en el login y en bloques destacados |
| `src/public/brand/img/margarita-icon-256.png` | Versión grande para fondos oscuros |
| `src/public/brand/img/margarita-mark-*.png` y `.svg` | La flor sola, en un color, para fondos claros u oscuros |
| `src/public/favicon.ico` y `favicon-*.png` | Pestaña del navegador |
| `src/public/apple-touch-icon.png`, `android-chrome-*.png` | App instalada (PWA) |
| `src/public/site.webmanifest` | Metadatos de la app instalada |

El símbolo (una margarita plana, con mirada mínima de dos ojos) tiene ocho
variantes; la de la aplicación es `mirada-circulo` (sello circular verde
profundo, flor blanca y centro amarillo) y se eligen con
`python3 scripts/generate-brand.py --variant=flor`. Todo está explicado en
[`docs/marca.md`](docs/marca.md), con la hoja comparativa en
`marketing/logo-opciones.png` (`scripts/generate-logo-options.py`).
No hay originales que "optimizar":
**todo se dibuja con código**, así que no existen versiones sueltas que se
queden atrás. Si cambias el dibujo, se cambia en el script y se regenera:

```bash
python3 -m pip install Pillow     # solo la primera vez
python3 scripts/generate-brand.py
```

El script dibuja a 4x y reduce, así que los bordes quedan suaves, y deja cada
archivo en pocos kilobytes.

Para mandar la promoción por WhatsApp hay un segundo script, que usa el mismo
dibujo y los mismos precios de la página pública:

```bash
python3 scripts/generate-promo.py --whatsapp=5215512345678 --email=hola@ejemplo.mx
```

Deja la imagen cuadrada y la vertical en `marketing/`.
