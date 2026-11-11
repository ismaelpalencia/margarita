# Margarita — Alcance real de la aplicación

**Estado:** foto del código al **2026-11-11**. Este documento es la referencia única del producto: describe lo que la app hace **hoy**, no lo que se planeó.

**Fuentes usadas para escribirlo:** `prisma/schema.prisma`, `src/routes/*.ts`, `src/controllers`, `src/services`, `src/jobs`, `landing/` + `scripts/build-landing.ts`, `.env.example`, la suite de pruebas y `margaritademo` (demo Go).

---

## 0. Qué es y qué no es

Margarita es una aplicación web para **operar la WhatsApp Business Cloud API de Meta**: campañas con plantillas aprobadas, bandeja de conversaciones, agentes, IA acotada, reportes y administración de la cuenta.

**Lo que sí es:**

- Un panel operativo de WhatsApp para uno o varios números de una misma WABA.
- Un motor de webhook firmado, cola con reintentos, idempotencia por `wamid` y estados reales de mensaje.
- Una bandeja con asignación, handoff de IA, notificaciones en vivo y reclamación de conversaciones sin dueño.
- Una capa de IA **acotada**: sugerencias o respuesta automática solo con base de conocimiento, confianza, límites y presupuesto.
- Un módulo de campañas con cola, pausa, reanudación, programación y reintento de fallidos.

**Lo que no es:**

- No es un CRM: no administra ventas, embudos, cotizaciones ni facturación.
- No crea plantillas en Meta; el cliente las crea y la app las sincroniza.
- No es un chatbot general: la IA no responde de todo ni negocia montos, plazos o condiciones.
- No es multi-inquilino: **una instalación por empresa** (single-tenant).

---

## 1. Despliegue, dominios y páginas

| Concepto | Valor actual |
| --- | --- |
| Empresas por instalación | 1 |
| Números por instalación | Los que tenga la WABA (uno o varios) |
| Roles | `ADMIN` y `AGENT` |
| Base de datos | PostgreSQL |
| Runtime | Node **22.23.4** LTS |
| Alojamiento probado | Railway |
| Archivos | Volume en `/data/media`; respaldos en `/data/backups`; Cloudflare R2 opcional (se activa con las cuatro `R2_*`) |
| Demo pública | Microservicio **Go** independiente en `demo.margaritaapp.org` (sin DB ni Meta) |

### Almacenamiento R2 (opcional)

- Se activa únicamente cuando existen `R2_ACCOUNT_ID`, `R2_BUCKET`,
  `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`. No hay un flag aparte.
- El Volume sigue siendo obligatorio: es la caché local y el respaldo antes de
  subir a R2. Si R2 se apaga, los respaldos nuevos quedan locales.
- Apagar R2 **no borra** el bucket ni sus archivos; solo deja de leerlos. Un
  adjunto que no esté en el Volume no se podrá abrir hasta reactivarlo.
- Reactivar no requiere migración: se vuelven a poner las cuatro variables,
  redeploy, **Admin → Sistema → Probar Cloudflare R2** y un respaldo manual.
- El bucket es privado y el token se limita a ese bucket. No se comparte entre
  instalaciones.

### Dominios

- **`margaritaapp.org`**: sitio de venta **estático** en `landing/`, generado con `npm run landing:build` y publicado aparte (Cloudflare Pages). Páginas: `/`, `/ia`, `/precios`, `/demo`, `/onboarding`, `/guia`, `/plantillas`, `/privacidad`, `/acceso`. **No existe `/cobranza`.** La ruta vieja `/propuesta` responde **301 a `/precios`**.
- **`<cliente>.margaritaapp.org`**: instalación del cliente. La raíz manda al inicio de sesión, no a la oferta.
- **`PRODUCT_DOMAIN` (legado):** varios dominios separados por coma. Solo aplica a instalaciones que **todavía sirven la oferta desde la app** (`src/views/pages/home/*`); con el landing actual en Cloudflare Pages (`landing/`) ya no hace falta. Sin la variable, la app sirve sus vistas públicas heredadas en su propia raíz.

### Landing y SEO

- Metadatos por página: `title`, `description`, `og:description`, `og:url` y
  `canonical` propios.
- `sitemap.xml` y `robots.txt` publicados; el sitemap **no** incluye
  `/propuesta` porque redirige.
- JSON-LD: Organization, WebSite, SoftwareApplication y FAQPage. La
  descripción de SoftwareApplication se toma de la página, no de un texto fijo.
- El mockup viejo `mockups/landing-2026/` tiene `noindex`; la página pública es
  `landing/`.

### Rutas de la aplicación

- Públicas: `/setup`, `/auth/login`, `/auth/login/2fa`, `/health`, `/webhooks/meta/whatsapp`, `/media/:id` (exige sesión). La ruta `/demo` y `/api/demo/*` son legacy de la app (solo con `DEMO_ENABLED=true`); la demo pública real vive en `demo.margaritaapp.org` (servicio Go aparte).
- Panel: `/admin/*`, `/agent/*`, `/account/*`.

### Demo pública (microservicio Go)

La demo de `margaritaapp.org/demo` **no corre en esta app**: es un servicio
independiente en **Go** (repo `margaritademo`) pensado para enseñar la IA sin
tocar datos reales.

| Aspecto | Implementación |
| --- | --- |
| Runtime | Go 1.22+ (biblioteca estándar; `net/http`) |
| Persistencia | Ninguna: sesiones y contadores en memoria; **una sola réplica** |
| Conocimiento | `kb.json` embebido con `//go:embed`; se actualiza con rebuild/deploy |
| Perfiles por cliente | `profiles/<slug>.json` embebidos y opcionalmente un Volume con `DEMO_PROFILES_DIR`; URL `/d/<slug>` |
| Meta / DB / login | No usa ninguno; no guarda PII |
| Endpoints | `POST /api/demo/session`, `POST /api/demo/chat`, `GET /api/demo/profile`, `GET /health`, `GET /d/<slug>` |
| Verticales | `comercio`, `servicios`, `generico` + capa `margarita` (precio, plan, plazos) |
| Límites | Sesión 30 min, 40 mensajes/sesión, 20 sesiones/IP/día, 30 chat/min/IP |
| CORS | `ALLOWED_ORIGINS` con comodines (`https://*.pages.dev`) |
| Zona horaria | `DEMO_TIMEZONE` (`America/Mexico_City`) con `time/tzdata` |
| Proxy | `DEMO_TRUST_PROXY=true` para `X-Forwarded-For` / `X-Real-IP` |
| Calidad | `go test ./...` y `go vet ./...` |

La demo **no** reemplaza la app: es un escaparate público. El landing la consume
por `DEMO_API_BASE` y no comparte sesión, base ni credenciales con la
instalación del cliente. Cada perfil tiene su propio conocimiento y sus
preguntas sugeridas; el landing muestra el nombre del negocio y la sesión queda
atada a ese perfil.

---

## 2. Plan y precios (comercial)

Los precios viven en `landing/` y en `scripts/build-landing.ts` (`PRICING`). **El panel no muestra precios.**

| Plan | Mensual | Respuestas de IA/mes |
| --- | --- | --- |
| Margarita IA | $1,299 MXN | 2,000 |

- **Un solo plan, todo incluido:** plataforma completa + IA (sugerencias y automático acotado) + onboarding (sesión de arranque de 2 h + guía publicada).
- **Sin instalación ni setup.**
- **Cancelación sin compromiso:** el cliente puede cancelar cuando quiera, sin penalización. El primer mes se paga si usa el servicio; no hay devolución de mensualidades prestadas.
- **Excedente:** **$150 MXN por cada 1,000 respuestas adicionales**, solo en el contrato del operador y en el panel; **no se publica en el landing**.
- **Todos los precios son más IVA.** El consumo de WhatsApp lo factura **Meta directamente al cliente**.
- **Clientes legacy:** conservan su precio y plan actuales; no se migran ni se les cambia la facturación.
- **Vistas legacy:** `src/views/pages/home/*` y los importes de `src/config/app.config.ts` quedan marcados como legacy; solo se sirven si una instalación usa `PRODUCT_DOMAIN`. La oferta oficial es `landing/`.

### Lo importante: los planes no están cableados en el código

La app **no tiene un campo `plan` ni bloquea el modo `AUTO` según el plan**. Los planes son una regla comercial. El control técnico real es:

1. El operador fija en Railway `AI_MAX_REPLIES_PER_DAY` y `AI_MAX_REPLIES_PER_THREAD` (y opcionalmente `AI_LIMITS_LOCKED`).
2. `AiSettingsService` recorta **siempre** el valor efectivo al techo (`min(valor, techo)`), tanto al leer como al guardar.
3. En **Admin → IA** esos campos aparecen en solo lectura con la leyenda *Definido por el operador desde Railway*; con `AI_LIMITS_HIDDEN=true` la tarjeta de límites se oculta por completo y el servidor conserva los valores vigentes aunque se poste el formulario a mano.

Así el cliente no puede subir su límite por encima de lo contratado aunque tenga acceso de administrador.

Las respuestas de IA incluidas en el plan se controlan con dos capas: `AI_MAX_REPLIES_PER_DAY` (techo diario) y `AI_MONTHLY_REPLIES_LIMIT` (tope mensual real, 2,000), contado sobre las respuestas automáticas enviadas en el mes en la tabla `AiUsageMonthly`. El excedente se revisa por el operador. Las sugerencias tienen su propio tope diario opcional (`AI_MAX_SUGGESTIONS_PER_DAY`) para acotar el costo de tokens.

---

## 3. Roles y permisos

| Rol | Alcance |
| --- | --- |
| `ADMIN` | Todo el workspace: configuración, equipo, números, plantillas, campañas, IA, reportes, respaldos, sesiones. |
| `AGENT` | Solo las conversaciones **asignadas a él** y las **sin asignar** (para reclamarlas). No ve las de otros agentes ni la configuración. |

Estados del agente: `AVAILABLE`, `BUSY`, `BREAK`, `OFFLINE`. No se pone disponible solo al entrar.

La restricción del agente se aplica **en la consulta a la base**, no solo en la vista.

---

## 4. Panel de administración (pantallas reales)

| Pantalla | Qué hace |
| --- | --- |
| **Dashboard** | KPIs de conversaciones abiertas/sin asignar/asignadas/en progreso, banner rojo si hay sin asignar, **tarjeta de handoffs de la IA** (asignado o sin asignar) y toast en vivo, últimos mensajes y errores. |
| **Conversaciones** | Bandeja de 3 columnas en escritorio (lista, hilo, panel de contacto/IA), 2 columnas en tablet y 1 en móvil con botón de regreso. Filtros por estado, asignación, no leídos y búsqueda. |
| **Contactos** | Alta, edición, búsqueda por nombre completo o teléfono completo, etiquetas, opt-in/opt-out, pausa. |
| **Etiquetas** | CRUD y asignación a contactos. |
| **Campañas** | Crear desde contactos o Excel/CSV, variables, cola por lotes, pausa/reanudación/cancelación, programación y reintento de fallidos. |
| **Plantillas** | Sincronización con Meta, estado real, botones, aviso si Meta la reclasifica como marketing. |
| **Respuestas rápidas** | Textos con `{nombre}` y `{telefono}`. |
| **Botones y listas** | Enviar hasta 3 botones o una lista de hasta 10 opciones dentro de la ventana de 24 h. General en todos los giros. |
| **Reglas de botones → resultado** | Mapean una respuesta interactiva a un resultado de gestión. Solo con el giro `COBRANZA` (legado). |
| **Equipo** | Crear admins/agentes, cambiar rol, activar/desactivar, restablecer contraseña, desbloquear, desactivar 2FA, permiso de envío manual y tope diario por agente. |
| **IA** | Modo, tono, idioma, umbral, límites, presupuesto, palabras de handoff, base de conocimiento **con botones de respuesta rápida**, editor de flujos, prueba sin conversación real, paquete inicial por vertical, **importación de negocio** y panel por hilo. |
| **Horarios** | Horario de atención y modo fuera de horario. |
| **Leads** | Captura por correo, estado, exportación CSV y webhook firmado. |
| **Reportes de servicio** | IA vs persona, primera respuesta (mediana/p90), resolución sin persona, top de preguntas sin cobertura, valoración. |
| **Reportes** | Reportes de gestión y resultados. **Solo giro `COBRANZA`** (legado). |
| **WhatsApp** | Cuenta, credenciales cifradas, números, calidad, prueba de conexión e **interruptores de IA y flujos por número**. |
| **Sistema** | Giro, listas interactivas, asignación/handoff, estado de R2, checklist de seguridad, versión y commit. |
| **Logs / Webhooks** | Bitácora filtrable y últimos 20 webhooks crudos. |
| **Respaldos** | Copias automáticas/manuales, descarga, verificación y purga. |
| **Sesiones** | Dispositivos/IP, revocación individual o masiva. |
| **Guía** | Guía rápida en el panel. |
| **Mi cuenta** | Contraseña, seguridad (2FA) y notificaciones (sonido/navegador). |

---

## 5. Panel de agente

- Solo ve sus conversaciones y las sin asignar.
- Cambia su estado (`AVAILABLE`, `BUSY`, `BREAK`, `OFFLINE`).
- Responde de cuatro formas: **nota interna** (no sale a WhatsApp), **texto libre** dentro de la ventana de 24 h, **archivos** (imagen/video/audio/documento) y **plantilla aprobada** cuando la ventana está cerrada.
- **Botones** (hasta 3) y **listas** dentro de la ventana.
- **Borrador de IA**: usar o descartar; el agente decide qué se envía. En modo automático puede pausar/reactivar la IA en ese hilo.
- **Respuestas rápidas** con nombre y teléfono.
- **No leídos**, filtros y cierre de conversación.
- Sesiones y cuenta.

---

## 6. Bandeja, tiempo real y notificaciones

### Layout

- **≥1280 px:** 3 columnas (lista 240 px | hilo | panel 340/320 px).
- **1024–1279 px:** 2 columnas (lista + hilo); el panel baja debajo.
- **<1024 px:** 1 columna con botón *← Bandeja*.

### Notificaciones

- Badges en el sidebar: **no leídos** (azul) y **sin asignar** (rojo). Los calcula el **servidor** y los emite por socket (`badges:update`), así dos pestañas no se desincronizan.
- Título de la pestaña con `(N)` cuando hay no leídos.
- Toast al llegar un mensaje; si llegan **5 o más del mismo hilo en 30 s**, se agrupan en uno solo.
- Campana en el topbar con historial de toasts (localStorage) y contador de no vistos que se limpia al abrir el panel.
- **Sonido** y **notificaciones del navegador** opcionales, apagados por defecto, en **Mi cuenta → Notificaciones**.
- Al abrir un hilo se marca leído (`conversation:read`) y se recalculan los contadores antes de renderizar.

### Handoff y fallback

Cuando la IA entrega una conversación (o llega un mensaje y hay que asignar), la cadena es:

1. Agente `AVAILABLE` con menos carga.
2. Si no hay, agente `BUSY` con menos carga.
3. Si no hay, administrador con **sesión activa** y menos carga (si `autoAssignToAdmin` está encendido).
4. Si no hay nadie, queda **sin asignar** y se avisa a los administradores.

- La decisión es una función pura (`pickAssignee`) con pruebas unitarias.
- El escalamiento corre cada minuto: si una conversación sigue sin asignar más de `handoffEscalationMinutes` (15 por defecto), se marca `handoffEscalatedAt` y se re-avisa a los administradores.
- Un agente o admin puede **reclamar** una conversación sin asignar con un clic.
- Eventos de auditoría: `HANDOFF_ASSIGNED_FALLBACK`, `HANDOFF_UNASSIGNED`, `HANDOFF_ESCALATED`, `HANDOFF_CLAIMED`, `AI_HANDOFF_NOTIFIED`.

---

## 7. IA (sugerencias y automático acotado)

### Interruptores

- **`AI_ENABLED`** (env): interruptor maestro de la instalación. Con `false`, la app funciona igual que sin IA.
- **`AiSettings.enabled` + `AiSettings.mode`** por workspace: `OFF`, `SUGGEST`, `AUTO`.
- **`AI_LIMITS_LOCKED`** y los techos `AI_MAX_REPLIES_PER_DAY` / `AI_MAX_REPLIES_PER_THREAD` (env) recortan los límites del workspace y los dejan en solo lectura.
- **`WhatsAppNumber.aiEnabled`**: interruptor por número. Si el número lo tiene apagado, no se generan sugerencias ni respuestas automáticas en sus hilos, aunque el workspace las tenga encendidas; los trabajos en cola se omiten con `NUMBER_AI_DISABLED`.

### Modos

- **SUGGEST:** cada mensaje entrante puede generar un borrador con confianza y motivo; el equipo lo usa o lo descarta. Nada se envía solo.
- **AUTO:** la IA responde sola **solo si se cumplen todas** estas condiciones:
  - la pregunta está cubierta por la base de conocimiento;
  - la confianza supera el umbral;
  - el modelo no marcó handoff;
  - el contacto no está dado de baja ni en pausa;
  - la ventana de 24 h está abierta;
  - la conversación no está cerrada ni pausada para la IA;
  - no respondió una persona;
  - quedan límites diarios, por hilo y presupuesto mensual.

Si falla una condición, entrega a una persona con el motivo. La pausa por hilo es manual o automática al responder una persona.

### Base de conocimiento, idiomas y paquete

- **Base de conocimiento**: única fuente de la que la IA puede responder. Preguntas y respuestas cifradas; palabras clave en claro para recuperación. Cada entrada puede llevar **hasta 3 botones** de respuesta rápida (título de 20); se envían en modo automático cuando la coincidencia es única.
- **Idiomas**: español siempre; inglés y portugués opt-in por workspace (`aiMultilangLanguages`). Se audita `AI_MULTILANG_REPLY`.
- **Paquete inicial por vertical** (comercio, servicios, genérico): carga flujos por palabra clave y 10–11 entradas de conocimiento. Idempotente; enciende `flowsEnabled`. No hay paquete de cobranza.
- **Panel por hilo**: modo, intención, confianza, motivo de handoff, respuestas automáticas, borradores aprobados y costo estimado.

### Flujos guiados (sin IA)

- **Admin → IA → Flujos guiados**: secuencia de pasos `message`,
  `question` (hasta 3 botones) y `end` (hasta 3 enlaces), con ramas por botón.
- Se ejecutan antes que los flujos de una sola respuesta y que la IA; una
  respuesta de botón avanza el paso y no se manda a la IA.
- No dependen de `AI_ENABLED`, del modo de IA ni de `flowsEnabled`: cada
  flujo guiado se apaga con su propio `isActive`.
- Cada número tiene `guidedFlowsEnabled`; si está apagado, no inicia ni avanza
  flujos guiados en ese número.
- El estado vive en `GuidedFlowRun` por conversación; al terminar queda
  `COMPLETED` y un nuevo trigger puede reiniciar el flujo.
- Sirven para calificar leads (pensión, crédito, seguros), explicar pasos y
  llevar a Calendly o a solicitar un documento. No usan IA ni inventan texto.
- El editor valida IDs, destinos, botones, datos y URLs antes de guardar.
- **Generador con IA:** se pega la estructura del flujo y la IA devuelve un
  borrador con `steps`, un resumen y una lista de `missing` (datos o
  integraciones que faltan). No se guarda nada hasta que el operador revisa en
  el constructor y pulsa Guardar.
- **Paso `input`:** captura edad, monto, meses u otro dato de texto/número y lo
  guarda en `GuidedFlowRun.data`.
- **Paso `file`:** pide una foto o documento (INE, talón, estado de cuenta) y
  guarda el mensaje recibido en `GuidedFlowRun.data`; el agente puede abrirlo
  desde el panel del hilo.
- **Panel del hilo:** muestra el flujo, su estado y los datos/archivos
  capturados. No procesa ni valida el contenido de los documentos.
- No calcula simulaciones ni integra instituciones: si el flujo las necesita,
  debe terminar en `handoff` y anotarlo en `missing`.

### Importación de negocio

- **Admin → IA → Importar negocio**: se pega o sube un documento de texto
  (máx. 30,000 caracteres) y, opcionalmente, instrucciones para la IA.
- La IA devuelve un JSON validado con negocio, base de conocimiento, flujos y
  palabras de handoff. Se revisa en una pantalla de vista previa antes de
  aplicar; el documento original no se guarda.
- Al aplicar se crean entradas y flujos nuevos con claves de idempotencia. Lo
  existente no se sobrescribe; los duplicados se omiten.
- Puede ajustar `systemPrompt`, `tone` y `handoffKeywords` del workspace.
- No activa el modo automático por sí sola: el operador sigue decidiendo modo,
  límites y si enciende los flujos.

### Flujos por palabra clave

- Un flujo es una respuesta automática por trigger (alternativas separadas por
  `|`), con texto, hasta 3 botones o una lista de hasta 10 opciones.
- Se editan en **Admin → IA → Paquete inicial**: trigger, respuesta, botones y
  activación por flujo. El paquete por vertical solo siembra flujos que no
  existan; no pisa los editados.
- `Workspace.flowsEnabled` es el interruptor maestro. Además,
  `WhatsAppNumber.flowsEnabled` permite apagarlos por número.
- El flujo corre **antes** que la IA. Si responde, la IA no se encola para ese
  mensaje; si falla, la IA sigue su curso.
- Los botones y listas de un flujo se envían como interactivos y sus respuestas
  entran por el mismo webhook.

### Proveedor y costos

- Proveedor compatible con OpenAI; por defecto **DeepSeek** (`AI_PROVIDER=deepseek`, `AI_MODEL=deepseek-chat`; también `deepseek-reasoner`).
- Variables: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_CONTEXT_MESSAGES`, `AI_MAX_KNOWLEDGE_ENTRIES`, `AI_DEBOUNCE_SECONDS`, `AI_WORKER_INTERVAL_MS`, `AI_MAX_ATTEMPTS`, `AI_MAX_TOKENS`, `AI_TEMPERATURE`, `AI_PRICE_INPUT_PER_MILLION`, `AI_PRICE_OUTPUT_PER_MILLION`.
- El costo es una **estimación** para presupuesto, no la factura del proveedor.

### Consumo mensual de IA

- **`AiUsageMonthly`** guarda, por workspace y mes, `replyCount` (respuestas automáticas enviadas) y `suggestCount` (borradores de sugerencia generados). El mes se calcula en la zona del workspace, no en UTC.
- **Límite del plan:** `AI_MONTHLY_REPLIES_LIMIT` (0 = sin tope; para el plan, 2,000). El excedente se estima con `AI_OVERAGE_PRICE_MXN` (150 MXN por 1,000) y se revisa en el panel; no se factura solo.
- **Hard cap de costo:** `AI_MONTHLY_BUDGET_CENTS` (centavos de USD de tokens). Con `AI_LIMITS_ENFORCE=true`, al alcanzarlo se apaga el modo automático y se entrega a una persona.
- **Sugerencias:** `AI_MONTHLY_SUGGESTIONS_LIMIT` es informativo; `AI_MAX_SUGGESTIONS_PER_DAY` es el que corta la generación.
- **Eventos:** `AI_USAGE_LIMIT_REACHED`, `AI_OVERAGE_STARTED` y `AI_HARD_CAP_REACHED` (uno por mes cada uno).
- **Panel:** Admin → IA muestra el consumo del mes; Admin → Sistema lo resume; Admin → Reportes de servicio → Consumo de IA trae los últimos 12 meses con exportación CSV (vista del operador, siempre completa aunque `AI_LIMITS_HIDDEN=true`).

---

## 8. Motor de WhatsApp

- **Webhook firmado** (`X-Hub-Signature-256`) obligatorio; payload sin firma válida se rechaza.
- **Cola con reintentos** y backoff; el endpoint responde en milisegundos.
- **Idempotencia por `wamid`**: los reintentos de Meta no duplican mensajes.
- **Estados reales**: `sent`, `delivered`, `read`, `failed` propagados al hilo y a campañas.
- **Contactos y conversaciones** se crean o reabren al recibir un mensaje.
- **Multimedia entrante**: imágenes se descargan al recibir; audio/video/documentos al abrirse. Si R2 está configurado, se copian al bucket.
- **Envío de archivos** dentro de la ventana de 24 h con límites de Meta (imagen 5 MB, video/audio 16 MB, documento 100 MB).
- **Varios números** de la misma WABA; el panel trabaja “desde” un número activo. La IA y los flujos se pueden apagar por número.
- **Ventana de 24 h**: fuera de ella solo plantillas aprobadas.
- **Borrado de mensajes**: ocultar (reversible) o borrar el hilo definitivamente escribiendo `BORRAR`.
- **Baja automática** por palabra clave (`STOP` por defecto; `OPT_OUT_KEYWORDS`).
- **Límites de envío manual** por agente (`canSendManualMessages`, `manualMessageLimit` o `WorkspaceSettings.maxManualMessages`).
- **Salud de la cuenta**: avisos de Meta sobre plantillas y calidad de números.
- **Escalamiento de handoff**: un job (`startHandoffEscalationJob`, `src/jobs/handoff-escalation.job.ts`, cada 60 s) revisa las conversaciones sin asignar y, si superan `handoffEscalationMinutes`, marca `handoffEscalatedAt` y re-avisa a los administradores.
- **Eventos procesados**: `messages`, `message_template_status_update`, `phone_number_quality_update`. Otros se ignoran.

---

## 9. Campañas y plantillas

- Crear campaña desde contactos o subiendo Excel/CSV, con variables (texto fijo, `{nombre}`, `{telefono}` o columnas del archivo).
- **Cola por lotes** con pausa entre mensajes; pausar, reanudar, cancelar y reintentar fallidos.
- **Programadas**: fecha y hora en la zona del workspace; el planificador las arranca.
- **Estado por destinatario** y avance en vivo.
- **Plantillas**: sincronizadas desde Meta; se avisa y se bloquea la campaña si Meta la reclasifica como **marketing**.
- Variables de plantilla: una en encabezado, las del cuerpo y una al final de la URL del botón.

---

## 10. Contactos, etiquetas y leads

- **Contactos**: alta/edición, búsqueda exacta por nombre completo o teléfono completo, etiquetas, consentimiento (opt-in), baja manual, pausa/desactivación.
- **Leads** (`leadsEnabled`): si un mensaje entrante trae un correo, se captura el lead de forma idempotente por conversación + correo. Estados `NUEVO`, `CONTACTADO`, `CONVERTIDO`, `DESCARTADO`. Exportación CSV. Webhook saliente firmado con HMAC (`x-margarita-signature`) e idempotencia por `lead.id`, con reintento. **Google Sheets no está implementado.**

---

## 11. Horarios y fuera de horario

- Flag `businessHoursEnabled` (apagado por defecto).
- Zona horaria, días, apertura y cierre.
- Modos fuera de horario: `TEXT_ONLY`, `AI_IF_COVERED`, `QUEUE_ONLY`.
- Un mensaje fuera de horario **no se asigna** a un agente; responde el mensaje configurado (o la IA si cubre) y queda para la mañana. Se audita `OFF_HOURS_REPLY_SENT` / `OFF_HOURS_QUEUED`.

---

## 12. Reportes y métricas

- **Reportes de servicio** (todos los giros): conversaciones atendidas por IA vs persona, primera respuesta (mediana y p90), resolución sin persona, top 10 de preguntas sin cobertura y valoración 👍/👎 si el workspace la activa.
- **Tramo del mes por número**: mensajes de servicio de los 1,000 gratis, plantillas de utilidad/marketing y costo **estimado**. No es la factura de Meta.
- **Reportes de gestión** (solo `COBRANZA`, legado): resultados, promesas, cumplimiento, lista del día, llamadas y tendencias.

---

## 13. Módulo legado de cobranza

- Solo existe para instalaciones con `Workspace.profile = COBRANZA`.
- **No se ofrece** a instalaciones nuevas: el alta solo permite `COMERCIO`, `SERVICIOS` o `GENERICO` (por defecto `GENERICO`).
- Apagarlo **no borra** datos: solo oculta paneles, enlaces y reportes, y bloquea rutas directas.
- Las reglas de botones que escriben resultados **no se aplican** mientras el módulo está apagado.
- Evento de cambio: `WORKSPACE_PROFILE_CHANGED`.

---

## 14. Seguridad

| Área | Control |
| --- | --- |
| Cifrado en reposo | AES-256-GCM con `ENCRYPTION_KEY`: teléfonos, nombres de contacto, notas, cuerpos de mensaje, nombres de archivo, payloads de Meta, variables de campaña, números de la WABA, correos de usuarios y bitácora. |
| Índices ciegos | `phoneHash`, `nameHash`, `emailHash` (HMAC-SHA256) para unicidad y búsqueda exacta. |
| Credenciales Meta | `accessToken` y `verifyToken` cifrados. |
| Sesiones | JWT en cookie `httpOnly`, `secure` en producción, `SameSite=Lax`; 7 días, inactividad 12 h, máximo 3 dispositivos; revocación individual/masiva. |
| Contraseñas | bcrypt 12 rondas; mínimo 10 con letras y números; cambio obligatorio tras reset. |
| 2FA | TOTP RFC 6238, secreto cifrado, activación por confirmación; un admin puede desactivarla. |
| Fuerza bruta | Bloqueo por intentos fallidos y límite por IP en login. |
| Autorización | `ADMIN` vs `AGENT` aplicada en la consulta. |
| CSRF | Origen del mismo dominio (`APP_URL`). |
| Validación | Zod en el panel; HMAC en webhook. |
| Rate limit | 300/15 min **por usuario** en el panel; 10 login por IP; 1,200/min webhook; tope de borde por IP (3,000). |
| Cabeceras | Helmet y CORS restringido; CSP desactivada. |
| Medios | Endpoint con sesión y validación de acceso; archivos fuera del servidor web. |
| Retención | Bitácora 90 días; eventos de webhook 30 días. |
| Respaldos | Copia completa cifrada, verificada, retención 7; subida a R2 si está configurado. |
| Health | `/health` mínimo sin `HEALTH_TOKEN`; detalle con token. |

### Lo que la seguridad NO cubre

1. La 2FA es opcional y no se puede obligar desde el panel.
2. El cifrado es de campos, no del disco.
3. No hay antivirus ni análisis de adjuntos.
4. Falta probar una restauración desde R2 en un entorno limpio.
5. La sesión no se ata a IP ni dispositivo.
6. No hay rotación automática de secretos ni de `ENCRYPTION_KEY`.
7. No hay pentest externo.
8. Sin WAF en el borde (DNS only).
9. El healthcheck puede estar verde aunque falte `ENCRYPTION_KEY` o el Volume no sea persistente.
10. `/setup` es público mientras la base está vacía.

---

## 15. Límites reales y matices

| Límite | Detalle |
| --- | --- |
| Una sola instancia | Tiempo real y cola funcionan en una instancia; varias requieren Redis. |
| Sin permisos por número | Todos los agentes ven todos los números. La IA y los flujos sí se pueden apagar por número; la visibilidad no. |
| No leídos por conversación | El contador es del hilo, no por persona; al abrirlo baja para todos. El servidor calcula el contador; sigue siendo del hilo, no por usuario. |
| Búsqueda exacta | Teléfono/nombre cifrados: solo coincidencia completa, no parcial. |
| Sin correo saliente | No hay “recuperar contraseña por correo”; se resuelve con otro admin o `npm run admin:reset-password`. |
| Archivos con caducidad | Meta conserva ~30 días; si nadie los abrió, ya no se recuperan. |
| Costo estimado | Las tarifas (`SERVICE_MESSAGE_RATE`, etc.) son referencia, no factura. |
| Opt-in registrado, no verificado | Se guarda fecha, canal y quién; la app no comprueba el consentimiento. |
| Baja por palabra clave | Solo detecta la palabra al inicio; otras formas se marcan a mano. |
| Plantillas | La redacción y la categoría son responsabilidad del cliente. |
| Sin recordatorios de llamadas | La cita se agenda; no hay aviso automático ni push. |
| Listas interactivas | **Implementadas** (`interactiveListsEnabled`), no pendientes. |
| IA automática | **Implementada y acotada**, no en piloto. |

---

## 16. Contradicciones históricas (resueltas aquí)

| Tema | El documento anterior decía | Realidad hoy |
| --- | --- | --- |
| Listas interactivas | “Pendiente” en la sección 8, pero implementadas en la sección 2 | Implementadas y apagadas por defecto (`interactiveListsEnabled`) |
| IA automática | “Piloto pendiente” | Implementada, acotada y con límites; se enciende por workspace |
| Pruebas | 302 unitarias / 82 integración | **364 unitarias** (57 archivos) y **107 de integración** (27 archivos; 105 pasan, 2 destructivas solo en CI) |
| Migraciones | 23 | **38** |
| Rate limit | “300 por IP” y “300 por usuario” en el mismo documento | 300/15 min **por usuario** + tope de borde por IP |
| Landing | Generada desde `src/views` | Fuente propia en `landing/*.ejs`, build `landing:build` |
| Precios | Repetidos en varios documentos | Fuente en `landing/` + `PRICING`; el panel no los muestra |
| Handoff | Solo “asignación al disponible con menos carga” | Cadena AVAILABLE → BUSY → admin → sin asignar, con escalamiento y reclamo |
| Notificaciones | No documentadas | Badges, toasts, título `(N)`, sonido/navegador opcionales y campana con historial |

---

## 17. Variables de entorno

### Núcleo

- `APP_NAME`, `APP_URL`, `PORT`, `NODE_ENV`, `TIMEZONE`, `DATABASE_URL`.
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_NAME`.
- `WORKSPACE_NAME`, `WORKSPACE_SLUG`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (solo para `db:seed`).
- `PRODUCT_DOMAIN` (dominios que sirven la oferta). **Legado:** solo para instalaciones que sirven la oferta desde `src/views/pages/home/*`; el landing nuevo vive en `landing/` (Cloudflare Pages).

### Meta

- `META_API_VERSION`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_BUSINESS_ACCOUNT_ID`, `META_VERIFY_TOKEN`, `META_PHONE_NUMBER`.
- `GRAPH_BASE_URL` (solo pruebas).

### Seguridad y sesiones

- `ENCRYPTION_KEY`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `LOG_RETENTION_DAYS`, `WEBHOOK_EVENT_RETENTION_DAYS`.
- `SESSION_IDLE_MINUTES`, `SESSION_MAX_ACTIVE`.
- `HEALTH_TOKEN`, `PANEL_RATE_LIMIT_MAX`, `EDGE_RATE_LIMIT_MAX`.

### Webhook y cola

- `WEBHOOK_QUEUE_ENABLED`, `WEBHOOK_WORKER_INTERVAL_MS`, `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_SCHEMA_PAUSE_MS`.
- `ALERT_WEBHOOK_URL`, `ALERT_COOLDOWN_MINUTES`.

### Archivos y respaldos

- `MEDIA_STORAGE_DIR`, `MEDIA_MAX_BYTES`.
- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (el endpoint se deriva de la cuenta).
- `BACKUP_ENABLED`, `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP`, `BACKUP_DIR`, `BACKUP_MAX_AGE_HOURS`.

### Campañas

- `CAMPAIGN_WORKER_INTERVAL_MS`, `CAMPAIGN_BATCH_SIZE`, `CAMPAIGN_SEND_INTERVAL_MS`.

### IA

- `AI_ENABLED`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`.
- `AI_MAX_CONTEXT_MESSAGES`, `AI_MAX_KNOWLEDGE_ENTRIES`, `AI_DEBOUNCE_SECONDS`, `AI_WORKER_INTERVAL_MS`, `AI_MAX_ATTEMPTS`, `AI_MAX_TOKENS`, `AI_TEMPERATURE`.
- `AI_PRICE_INPUT_PER_MILLION`, `AI_PRICE_OUTPUT_PER_MILLION`.
- **Techos del operador:** `AI_MAX_REPLIES_PER_DAY`, `AI_MAX_REPLIES_PER_THREAD`, `AI_MONTHLY_REPLIES_LIMIT`, `AI_MONTHLY_SUGGESTIONS_LIMIT`, `AI_MAX_SUGGESTIONS_PER_DAY`, `AI_MONTHLY_BUDGET_CENTS`, `AI_OVERAGE_PRICE_MXN`, `AI_LIMITS_LOCKED`, `AI_LIMITS_HIDDEN`, `AI_LIMITS_ENFORCE`.

### Demo y comercial

- `DEMO_ENABLED` (sin `true`, la ruta heredada `/demo` de la app responde 404).
- **Demo Go (servicio aparte):** `PORT`, `ALLOWED_ORIGINS`, `DEMO_SESSION_TTL_MIN`, `DEMO_MAX_MESSAGES`, `DEMO_MAX_SESSIONS_PER_IP`, `DEMO_RATE_LIMIT_PER_MIN`, `DEMO_TIMEZONE`, `DEMO_TRUST_PROXY`, `DEMO_PROFILES_DIR`, `DEMO_LANDING_URL`.
- **Landing:** `META_PIXEL_ID` (build), `SUPPORT_WHATSAPP_TEXT` (build).
- `SUPPORT_WHATSAPP`, `SUPPORT_WHATSAPP_DISPLAY`, `SUPPORT_EMAIL`.
- `SERVICE_MESSAGE_RATE`, `UTILITY_TEMPLATE_RATE`, `MARKETING_TEMPLATE_RATE` (solo estimación).

---

## 18. Estado de calidad

| Aspecto | Estado |
| --- | --- |
| Tipos | `npx tsc --noEmit` limpio |
| Unitarias | **364** en 57 archivos |
| Integración | **107** en 27 archivos (105 pasan, 2 destructivas solo en CI) |
| Migraciones | **38** versionadas en `prisma/migrations` |
| CI | GitHub Actions: esquema, tipos, pruebas y build |
| Linter/formateador | No hay |
| Pruebas de interfaz | No hay automatizadas |

---

## 19. Checklist de salida a producción

1. Node **22.23.4** y `package-lock.json` actuales.
2. Railway con `NODE_ENV=production`, `JWT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `META_APP_SECRET`, `MEDIA_STORAGE_DIR=/data/media`, `BACKUP_DIR=/data/backups`.
3. Volume montado en `/data`; con `HEALTH_TOKEN`, `checks.mediaStoragePersistent` y `checks.encryptionKeyConfigured` en `true`.
4. Migraciones al día (`[migraciones] Listo`).
5. Si la base está vacía, el operador completa `/setup` antes de publicar el dominio; después crea un segundo admin y activa 2FA.
6. Plan único: fijar `AI_MONTHLY_REPLIES_LIMIT=2000`, `AI_MAX_REPLIES_PER_DAY=67`, `AI_MAX_REPLIES_PER_THREAD=5`, `AI_MONTHLY_BUDGET_CENTS=2800` (≈$28 USD) y `AI_LIMITS_HIDDEN=true` si el operador gestiona el plan conversacionalmente. `AI_LIMITS_ENFORCE=false` por defecto.
7. Si se publica la demo, desplegar el servicio Go (`margaritademo`) en `demo.margaritaapp.org` con `ALLOWED_ORIGINS`, `DEMO_TIMEZONE` y una sola réplica; el `DEMO_ENABLED` de la app solo aplica a la ruta legacy.
8. Si la oferta vive en Cloudflare, el landing se despliega aparte (`landing/`) y `PRODUCT_DOMAIN` ya no es necesario (es legado).
9. Los logs de Railway no se comparten ni se commitean.
10. Si R2 está activo, **Admin → Sistema → Probar Cloudflare R2** debe pasar y
    el bucket debe ser privado. Si se apagó, no borres el bucket: los adjuntos
    remotos no se leen hasta reactivarlo.

---

## 20. Qué no prometer

- CRM, embudos, cotizaciones o facturación.
- IA que responde cualquier cosa o que negocia precios/plazos.
- Creación automática de plantillas en Meta.
- Multi-inquilino o varios clientes en una instalación.
- Recordatorios automáticos de llamadas.
- Permisos por número.
- Búsqueda parcial por teléfono o nombre.
- Conciliación de pagos (en cobranza legacy).
- Antivirus de adjuntos.
- Facturación de Meta incluida en la mensualidad.

---

## 21. Ficha comercial para videos y anuncios

Estos son los datos que **sí** se pueden decir en un video, anuncio o guion:

| Dato | Valor |
| --- | --- |
| Producto | Margarita IA: WhatsApp con IA acotada + panel de atención |
| Precio | **$1,299 MXN/mes + IVA** |
| Incluye | Plataforma completa, IA, onboarding (2 h + guía) y **2,000 respuestas de IA/mes** |
| Instalación / setup | **Sin costo** |
| Plazo | Mes a mes; **sin plazo forzoso** |
| Cancelación | Cuando quieras, sin penalización; el primer mes se paga si se usa |
| Consumo de WhatsApp | Lo cobra **Meta directamente** al cliente; no está incluido |
| Demo | `margaritaapp.org/demo` y `/d/<slug>` para demo por cliente |
| Soporte | WhatsApp **+52 1 55 6487 0481** · `contacto@margaritaapp.org` |

**No decir en videos ni anuncios:**

- Que la IA responde cualquier cosa o que “reemplaza a tu equipo”.
- Que es un CRM, un chatbot general o un sistema de cobranza para clientes nuevos.
- Citas con Google Calendar, facturación o cobranza automática: no están incluidas.
- Paquetes A/B, instalación de $4,900, mensualidad de $699 o promociones vencidas.
- “Gratis”, “ilimitado”, “garantizado” o “100% automático”.
- Que el consumo de WhatsApp está incluido en la mensualidad.

**Frase segura para cerrar:**

> “Margarita IA atiende, califica y deriva tu WhatsApp con IA acotada y control humano. $1,299 MXN al mes + IVA, con 2,000 respuestas de IA incluidas, sin instalación y con onboarding. La demo está en margaritaapp.org/demo.”

---

*Documento vivo. Si cambia el comportamiento, se actualiza este archivo primero y luego el resto.*
