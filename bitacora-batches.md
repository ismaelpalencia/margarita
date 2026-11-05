# Bitácora de batches — reposicionamiento WhatsApp general

## Baseline

- **Rama:** `feat/reposicionamiento-whatsapp-general` (creada desde `main`)
- **Commit base:** `8441cc9`
- **Fecha:** 2026-11-04
- **Comandos de verificación:**
  - `npx tsc --noEmit` → **OK** (exit 0)
  - `npm test` → **OK** (306 tests, 0 fallos)
  - `npm run test:integration` → **OK** (82 pasan, 2 omitidas)
- **Nota de entorno:** la base local `.env` (ignorada por git) apunta a PostgreSQL `margarita_fase_a_test`. Sin `DATABASE_URL`, cuatro archivos de pruebas unitarias fallaban al importar Prisma; con la base disponible quedan en verde. El fallo de baseline no era de código.

---

## Batch 1 — Default `GENERICO` + pivote del modelo de negocio

**Estado:** completado. **Commit:** `feat(batch-1): default GENERICO y reposicionamiento del producto` (ver `git log`).
**Migración:** sí, una y aditiva: `20261104130000_perfil_generico_default` (`ALTER COLUMN "profile" SET DEFAULT 'GENERICO'`; no reescribe filas).

### Archivos tocados

- Esquema/migración: `prisma/schema.prisma`, `prisma/migrations/20261104130000_perfil_generico_default/migration.sql`.
- Alta y gating: `src/utils/workspace-profile.ts` (nuevo `SETUP_PROFILES`), `src/controllers/setup.controller.ts`, `src/services/setup.service.ts`, `src/validations/setup.validation.ts`, `src/views/pages/setup/index.ejs`.
- Admin: `src/controllers/admin-system.controller.ts`, `src/views/pages/admin/system/index.ejs` (COBRANZA visible solo si la instalación ya lo usa).
- Landing: `src/views/pages/home/index.ejs` (reescrita), `ia.ejs`, `how-to-start.ejs`, `onboarding.ejs`, `propuesta.ejs`, `guia.ejs`, `plantillas.ejs`, `src/views/partials/brand-head.ejs`, `src/controllers/home.controller.ts`, `scripts/build-landing.ts`, `src/public/css/landing-2026.css` y la carpeta generada `landing/`.
- Docs: `docs/guia-uso.md` (reescrita sin el capítulo de cobranza), `docs/guia-plantillas.md` (plantilla de atención en lugar de la de cobranza), `docs/alcance-produccion.md` (perfil por defecto, oferta y cobranza como legado), `docs/catalogo-producto.md` (posición y pantallas legado).
- Pruebas: `src/utils/workspace-profile.test.ts` (nuevo caso de `SETUP_PROFILES`), `tests/integration/helpers.ts` (fixture del módulo legado pide `COBRANZA` explícitamente), `tests/integration/onboarding.integration.test.ts` (el alta sin giro queda `GENERICO`), `tests/integration/screens.integration.test.ts` (nuevo hero).

### Pruebas nuevas/ajustadas

- Unitaria: el alta no ofrece `COBRANZA` y arranca en `GENERICO`.
- Integración: el alta sin giro guarda `GENERICO`; las suites del módulo legado crean su workspace con `COBRANZA` explícito; el humo de portada espera el hero nuevo.

### Comandos y resultados

- `npx tsc --noEmit` → **OK**.
- `npm run typecheck:all` → **OK**.
- `npm test` → **307 pass, 0 fail**.
- `npm run test:integration` → **82 pass, 2 skipped, 0 fail**.
- `npm run landing:build` → **OK**.
- `grep` de `landing/` por `cobranza|deudor|deuda|promesa|recuperación|pago|monto|colección|cartera` → **sin coincidencias**; `landing/cobranza` **no existe**.
- Migración: única sentencia `ALTER COLUMN ... SET DEFAULT`; sin `DROP`, `DELETE`, `TRUNCATE` ni cambios de tipo.

### Diferencias con el prompt / notas del repo

- Los documentos viven en `docs/`, no en la raíz; se actualizaron ahí.
- La landing no es HTML escrito a mano: se genera con `npm run landing:build` desde `src/views/pages/home/*.ejs`, `src/content/guides.ts` y los `.md` de `docs/`. Por eso se editaron las fuentes y se regeneró `landing/`.
- El middleware conserva el respaldo `COBRANZA` **solo cuando falla la lectura del workspace** (base sin migración o error transitorio). Es una red de seguridad para instalaciones existentes; el valor por defecto de la columna y del alta ya es `GENERICO`.
- La biblioteca de ideas del panel (`src/content/template-library.ts`) todavía contiene ideas de cobranza y no se filtró por giro: no entraba en el alcance de Batch 1 y tocar el contenido del admin no era necesario para la aceptación. Se registra como brecha para Batch 9/revisión de producto.

---

## Batch 2 — Horarios de atención y mensaje fuera de horario

**Estado:** completado (en pro). **Migración:** sí, una y aditiva: `20261104140000_horarios_fuera_de_horario`.

### Archivos tocados

- Esquema/migración: `prisma/schema.prisma` (enum `OffHoursMode`, campos en `Workspace` y `Conversation.lastOffHoursReplyAt`), `prisma/migrations/20261104140000_horarios_fuera_de_horario/migration.sql`.
- Cifrado (registro mínimo, sin tocar llaves ni índices): `src/config/prisma-encryption.ts` (campo `Workspace.offHoursMessage` añadido a `ENCRYPTED_FIELDS` y a `WRITE_RULES`).
- Lógica pura TZ: `src/utils/business-hours.ts` (+ `business-hours.test.ts`), usa `Intl.DateTimeFormat` sin dependencias nuevas.
- Servicio: `src/services/off-hours.service.ts`, `src/services/message.service.ts` (`sendOffHoursReply`).
- Integración en el webhook: `src/services/meta-webhook-handler.service.ts` (sin asignación ni encolado de IA fuera de horario).
- Badge: `src/middlewares/workspace-profile.middleware.ts`, `src/views/partials/admin-nav.ejs`, `agent-nav.ejs`, `admin/conversations/show.ejs`, `agent/conversations/show.ejs`.
- UI: `src/controllers/admin-hours.controller.ts`, `src/validations/hours.validation.ts`, `src/routes/admin-hours.routes.ts`, `src/views/pages/admin/hours/index.ejs`, montaje en `src/routes/admin.routes.ts`.
- Docs: `docs/alcance-produccion.md`, `docs/catalogo-producto.md`, `docs/guia-uso.md`.
- Pruebas: `tests/integration/off-hours.integration.test.ts`.

### Pruebas nuevas

- 8 unitarias de `business-hours` (dentro/fuera, frontera exacta inicio/fin, cambio de día, DST América/New_York, tramo nocturno, día completo, sin horario).
- 4 de integración: TEXT_ONLY responde y no dispara IA (y el mensaje queda cifrado en la base); QUEUE_ONLY no responde ni asigna; AI_IF_COVERED sin cobertura entrega con motivo OFF_HOURS; AI_IF_COVERED con cobertura responde con IA (proveedor mock).

### Comandos y resultados

- `npx tsc --noEmit` → **OK**.
- `npm run typecheck:all` → **OK**.
- `npm test` → **315 pass, 0 fail**.
- `npm run test:integration` → **86 pass, 2 skipped, 0 fail**.
- Migración: solo `CREATE TYPE` y `ADD COLUMN`; sin DROP/DELETE/TRUNCATE ni cambios de tipo.

### Decisiones y notas (repo manda)

- El indicador por workspace es la columna `Workspace.businessHoursEnabled` (no una variable de entorno), como pide «flag per workspace».
- El intervalo es cerrado-abierto [start, end); `start === end` deja el día abierto; `start > end` cruza la medianoche.
- «Marcar para la cola de la mañana» se interpreta como **dejar el hilo sin asignar** (UNASSIGNED) y sin agente, más el evento `OFF_HOURS_QUEUED`; no se inventó una cola nueva. Fuera de horario nunca se asigna al agente con menos carga.
- `AI_IF_COVERED` reutiliza la política pura (`decideGeneration`) y los helpers de prompt/proveedor, sin encolar un `AiSuggestionJob` y sin tocar el motor de sugerencias/automático. Si la IA no está configurada o no cubre, cae al mensaje fuera de horario + `OFF_HOURS`.
- El envío fuera de horario va por `MessageService.sendOffHoursReply` (source AUTOMATIC); la idempotencia la da `Conversation.lastOffHoursReplyAt`, no `aiSuggestionId`.

---

## Batch 3 — Listas interactivas

**Estado:** completado (en flash). **Migración:** sí, aditiva: `20261104150000_listas_interactivas` (solo `ADD COLUMN interactiveListsEnabled`).

### Archivos tocados

- Esquema/migración: `prisma/schema.prisma`, `prisma/migrations/20261104150000_listas_interactivas/migration.sql`.
- Builder y payload: `src/utils/interactive-message.ts` (`buildInteractiveList`, `interactiveListPayload`, límites 10/24/72/20).
- Validación: `src/validations/interactive-message.validation.ts` (`sendInteractiveListSchema`, `listRowsFromInput`).
- Envío: `src/services/message.service.ts` (`sendInteractiveList`).
- Controladores/rutas: `src/controllers/admin-conversations.controller.ts`, `src/controllers/agent-conversations.controller.ts`, `src/routes/admin-conversations.routes.ts`, `src/routes/agent-conversations.routes.ts` (POST `/messages/interactive-list`).
- Flag y UI: `src/middlewares/workspace-profile.middleware.ts` (expone `interactiveListsEnabled`), `src/controllers/admin-system.controller.ts` + `src/routes/admin-system.routes.ts` + `src/views/pages/admin/system/index.ejs` (interruptor), `src/views/partials/conversation-tools.ejs` (editor + vista previa), `src/views/partials/admin-nav.ejs` y `src/views/pages/admin/replies/index.ejs` (renombre a «Botones y listas»).
- Alertas: `src/views/pages/admin/conversations/show.ejs`, `src/views/pages/agent/conversations/show.ejs`.
- Docs: `docs/alcance-produccion.md`, `docs/catalogo-producto.md`, `docs/guia-uso.md`.
- Pruebas: `src/utils/interactive-message.test.ts`, `tests/integration/interactive-lists.integration.test.ts`.

### Pruebas nuevas

- 5 unitarias del builder de listas (payload válido, 11 opciones rechazadas, título 24 / descripción 72 / botón 20, sin opciones o sin texto, id explícito).
- 3 de integración: envío válido por la misma ruta que los botones (Graph simulado); rechazo por más de 10 opciones sin crear ni mandar nada; una respuesta `list_reply` dispara la misma regla y registra el resultado.

### Comandos y resultados

- `npx tsc --noEmit` → **OK**.
- `npm run typecheck:all` → **OK**.
- `npm test` → **320 pass, 0 fail**.
- `npm run test:integration` → **89 pass, 2 skipped, 0 fail**.
- Migración: solo `ADD COLUMN`; sin DROP/DELETE/TRUNCATE ni cambios de tipo.

### Decisiones y notas

- El flag es `Workspace.interactiveListsEnabled` (apagado por defecto). El interruptor vive en **Admin → Sistema** porque `/admin/replies` sigue protegido por el módulo legado de cobranza; así cualquier giro puede encender listas sin cambiar el gating existente.
- `/admin/replies` conserva ruta y modelo; solo cambia la etiqueta visible a «Botones y listas».
- El «template builder» no existe en este repo: las plantillas se sincronizan desde Meta. El editor y la vista previa de listas se implementaron en el hilo (columna lateral), que es el único builder real. Se anota como brecha de nomenclatura.
- `list_reply` ya se interpretaba en el webhook; el batch añade la prueba de que dispara la regla y mantiene id en claro / texto cifrado (ya cubierto por la suite de interactivos).

---

## Batch 4 — Flujos precargados y base de conocimiento por vertical

**Estado:** completado (en pro). **Migración:** sí, aditiva: 20261104160000_flujos_precargados (CREATE TABLE Flow, ADD COLUMN flowsEnabled, ADD COLUMN sourceKey + índice único).

### Archivos tocados

- Esquema/migración: prisma/schema.prisma (modelo Flow, Workspace.flowsEnabled, KnowledgeEntry.sourceKey), prisma/migrations/20261104160000_flujos_precargados/migration.sql.
- Seeds: seeds/verticals/comercio.json, servicios.json, generico.json (5–6 flujos y 10–11 entradas de KB cada uno; sin paquete de cobranza).
- Util pura: src/utils/flow.ts (+ flow.test.ts).
- Servicio: src/services/flow.service.ts (cargador idempotente + motor de disparo), src/services/message.service.ts (sendFlowReply).
- Integración en el webhook: src/services/meta-webhook-handler.service.ts (el flujo responde antes que la IA y evita el doble envío).
- UI: src/controllers/admin-flow.controller.ts, src/routes/admin-ai.routes.ts, src/views/pages/admin/ai/package.ejs, enlace en src/views/pages/admin/ai/index.ejs.
- Docs: docs/alcance-produccion.md, docs/catalogo-producto.md, docs/guia-uso.md.
- Pruebas: tests/integration/flows.integration.test.ts.

### Pruebas nuevas

- 3 unitarias de flow (normalización, trigger separado por |, textos vacíos).
- 2 de integración: el cargador es idempotente (dos cargas no duplican) y no pisa una edición previa; un flujo cargado responde de punta a punta (respuesta automática + FLOW_TRIGGERED).

### Comandos y resultados

- npx tsc --noEmit → OK.
- npm run typecheck:all → OK.
- npm test → 323 pass, 0 fail.
- npm run test:integration → 91 pass, 2 skipped, 0 fail.
- Migración: solo CREATE TABLE / ADD COLUMN / CREATE INDEX / ADD CONSTRAINT; sin DROP/DELETE/TRUNCATE ni cambios de tipo.

### Decisiones y notas (repo manda)

- No existía modelo ni motor de flujos: se interpretó «flujo» como una sola respuesta automática por palabra clave (stateless), con botones o lista. La respuesta del cliente entra por el circuito de interactivos ya existente. No se construyó un motor multi-paso; se anota como límite.
- El disparo se hace por trigger normalizado (contiene, alternativas separadas por |). Coincidencia determinista, sin dependencias nuevas.
- El motor está detrás de Workspace.flowsEnabled (apagado por defecto); cargar un paquete lo enciende (opt-in explícito).
- La idempotencia de la KB usa KnowledgeEntry.sourceKey (clave derivada de la pregunta), porque question está cifrado y no se puede deduplicar por contenido en SQL.
- Los seeds se leen en runtime desde seeds/verticals/*.json (cwd del deploy). No se copian a dist porque Railway ejecuta desde la raíz del repo.

---

## Batch 5 — Captura de leads, exportación y webhook saliente

**Estado:** completado (en pro). **Migración:** sí, aditiva: 20261104170000_leads (CREATE TYPE LeadStatus, ADD COLUMN leadsEnabled/leadWebhookUrl/leadWebhookSecret, CREATE TABLE Lead + índices).

### Archivos tocados

- Esquema/migración: prisma/schema.prisma (enum LeadStatus, modelo Lead, campos en Workspace), prisma/migrations/20261104170000_leads/migration.sql.
- Cifrado (registro mínimo): src/config/prisma-encryption.ts (Lead.name/email + emailHash ciego; Workspace.leadWebhookUrl/leadWebhookSecret).
- Servicio: src/services/lead.service.ts (captura idempotente, firma HMAC-SHA256, reintento, export CSV), src/utils/lead.ts (+ test) para extraer el correo.
- Integración: src/services/meta-webhook-handler.service.ts (captura automática si el mensaje trae correo y leadsEnabled).
- UI: src/controllers/admin-leads.controller.ts, src/routes/admin-leads.routes.ts, src/views/pages/admin/leads/index.ejs, enlace en el nav.
- Docs: docs/alcance-produccion.md, docs/catalogo-producto.md, docs/guia-uso.md.
- Pruebas: tests/integration/leads.integration.test.ts.

### Pruebas nuevas

- 1 unitaria de extractEmail.
- 4 de integración: captura idempotente + cifrado + webhook firmado (verifica firma HMAC e idempotencia por lead.id); reintentar reenvía sin duplicar; sin URL no falla; el CSV solo trae los leads del workspace.

### Comandos y resultados

- npx tsc --noEmit → OK.
- npm run typecheck:all → OK.
- npm test → 324 pass, 0 fail.
- npm run test:integration → 95 pass, 2 skipped, 0 fail.
- Migración: solo CREATE TYPE / ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT; sin DROP/DELETE/TRUNCATE ni cambios de tipo.

### Decisiones y notas (repo manda)

- La captura se interpreta como: mensaje entrante que contiene un correo (con leadsEnabled) crea el lead; también hay alta manual. No se construyó un diálogo multi-paso para pedir datos.
- Idempotencia por conversación + correo vía índice ciego emailHash (índice único en (workspaceId, conversationId, emailHash)).
- El webhook saliente usa cabecera x-margarita-signature (HMAC-SHA256 sobre el cuerpo) e idempotencia x-idempotency-key = lead.id. El reintento es manual desde el panel; no hay worker en segundo plano (brecha documentada).
- Google Sheets: interfaz pendiente, sin implementar (el spec lo permite como stub documentado).

---

## Batch 6 — Demo pública /demo

**Estado:** completado (en pro). **Migración:** no (solo configuración en memoria + env DEMO_ENABLED).

### Archivos tocados

- Config: src/config/app.config.ts (demo.enabled), .env.example (DEMO_ENABLED).
- Servicio: src/services/demo.service.ts (sesiones en memoria, límite 30 mensajes/sesión y 3 sesiones/IP/día, caducidad, chat contra la KB del vertical sin tocar la base) + demo.service.test.ts.
- Rutas/controlador: src/controllers/demo.controller.ts, src/routes/demo.routes.ts, montaje en src/app.ts.
- Vista: src/views/pages/demo/index.ejs (simulador + panel con modo/intención/confianza/handoff/costo).
- Landing: enlace «Probar la demo» en src/views/pages/home/index.ejs (regenerada landing/).
- Pruebas: tests/integration/demo.integration.test.ts, DEMO_ENABLED=true en tests/integration/run.ts.
- Docs: docs/alcance-produccion.md, docs/catalogo-producto.md.

### Pruebas nuevas

- 4 unitarias de DemoService: límite de 3 sesiones por IP; respuesta con la KB del vertical; límite de 30 mensajes por sesión (31 → 429); sesión vencida → 410.
- 1 de integración: /demo responde 200 con DEMO_ENABLED; POST /api/demo/session y /api/demo/chat responden; las tablas reales (Contact/Conversation/Message/Lead) no cambian.

### Comandos y resultados

- npx tsc --noEmit → OK.
- npm run typecheck:all → OK.
- npm test → 328 pass, 0 fail.
- npm run test:integration → 96 pass, 2 skipped, 0 fail.
- npm run landing:build → OK; sin menciones de cobranza.

### Decisiones y notas (repo manda)

- /demo es una ruta de la app (necesita sesión + API en memoria), no una página del sitio estático; se sirve cuando DEMO_ENABLED=true y responde 404 si no. El enlace de la landing apunta a /demo (asume que la app sirve la demo en el dominio del producto).
- La demo reutiliza la política pura (decideGeneration) y el ranking de KB (rankKnowledgeEntries); sin llave de IA responde directo de la entrada más relevante de la KB del vertical.
- No hay migración ni tablas nuevas: el aislamiento se garantiza porque el servicio nunca importa ni usa Prisma.

---

## Batch 7 — Métricas de servicio

**Estado:** completado (en flash). **Migración:** sí, aditiva: 20261104180000_feedback (CREATE TYPE FeedbackValue, ADD COLUMN feedbackEnabled, CREATE TABLE ConversationFeedback).

### Archivos tocados

- Esquema/migración: prisma/schema.prisma (FeedbackValue, ConversationFeedback, Workspace.feedbackEnabled), prisma/migrations/20261104180000_feedback/migration.sql.
- Servicio: src/services/service-metrics.service.ts, src/utils/metrics.ts (+ test) para mediana/p90.
- UI: src/controllers/admin-service-metrics.controller.ts, ruta /admin/reports/service (antes del módulo legado) en src/routes/admin.routes.ts, src/views/pages/admin/service-metrics/index.ejs, enlace en el nav.
- Feedback: métodos recordFeedback en los controladores admin/agente, rutas /:id/feedback, formulario en src/views/partials/conversation-tools.ejs, flag en src/middlewares/workspace-profile.middleware.ts.
- Docs: docs/alcance-produccion.md, docs/catalogo-producto.md, docs/guia-uso.md.
- Pruebas: src/utils/metrics.test.ts, tests/integration/service-metrics.integration.test.ts.

### Pruebas nuevas

- 3 unitarias de percentil (vacío, mediana/p90, no muta).
- 1 de integración con dataset: IA vs persona por día, primera respuesta mediana/p90, resolución sin persona, top de preguntas sin cobertura, resolución por KB (aproximada) y feedback 👍.

### Comandos y resultados

- npx tsc --noEmit → OK.
- npm run typecheck:all → OK.
- npm test → 331 pass, 0 fail.
- npm run test:integration → 97 pass, 2 skipped, 0 fail.
- Migración: solo CREATE TYPE / ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT.

### Decisiones y notas (repo manda)

- Los reportes de gestión de cobranza siguen protegidos por el módulo legado; las métricas de servicio viven en /admin/reports/service, disponible para todos los giros.
- La resolución sin persona por entrada de KB es **aproximada**: el esquema no guarda qué entradas usó cada respuesta, así que se cruza la intención del modelo con las palabras clave de la entrada. Se documenta como límite; una medición exacta exigiría registrar las entradas usadas en el motor de IA (fuera de alcance).
- No se tocaron los reportes ni las exportaciones de cobranza.

---

## Batch 8 — Respuestas de IA multilingües

**Estado:** completado (en flash). **Migración:** sí, aditiva: 20261104190000_ai_multilang (ADD COLUMN aiMultilangLanguages TEXT[] DEFAULT vacío).

### Archivos tocados

- Esquema/migración: prisma/schema.prisma (Workspace.aiMultilangLanguages), prisma/migrations/20261104190000_ai_multilang/migration.sql.
- Util: src/utils/language.ts (detección es/en/pt y resolveReplyLanguage) + language.test.ts.
- IA: src/services/ai/prompt.ts (replyLanguage opcional), src/services/ai/suggestion.service.ts (detección + prompt + log AI_MULTILANG_REPLY), src/services/off-hours.service.ts (mismo idioma en la respuesta fuera de horario).
- UI: Admin → IA → Idiomas (src/controllers/admin-ai.controller.ts, src/routes/admin-ai.routes.ts, sección en src/views/pages/admin/ai/index.ejs).
- Docs: docs/alcance-produccion.md, docs/catalogo-producto.md.

### Pruebas nuevas

- 4 unitarias: detección es/en/pt, empate/texto vacío → español, resolveReplyLanguage respeta idiomas habilitados, y el prompt incluye “Escribe en inglés”.

### Comandos y resultados

- npx tsc --noEmit → OK.
- npm run typecheck:all → OK.
- npm test → 335 pass, 0 fail.
- npm run test:integration → 97 pass, 2 skipped, 0 fail.
- Migración: solo ADD COLUMN con default vacío.

### Decisiones y notas (repo manda)

- El flag es por workspace como arreglo aiMultilangLanguages (["en"], ["pt"] o ambos); vacío = solo español. No se agregó variable de entorno AI_MULTILANG porque el spec lo pide “en el workspace” y así se controla por instalación.
- La detección es heurística determinista (léxica + acentos), sin dependencias nuevas.
- No se tocó la i18n de la interfaz ni los textos de plantillas de Meta.
- Con proveedor mock la respuesta de prueba no cambia de idioma; la prueba verifica la instrucción del prompt y la resolución del idioma. La auditoría se escribe en el camino real de generación.

---

## Apéndice final — cierre del reposicionamiento

### Los 9 batches

```
feat(batch-9): docs, landing y release del reposicionamiento (este commit)
346d5ff feat(batch-8): respuestas de IA multilingues es/en/pt
1635177 feat(batch-7): metricas de servicio y valoracion al cierre
65d17ff feat(batch-6): demo publica /demo aislada de la base real
3d9f0dc feat(batch-5): captura de leads con exportacion y webhook firmado
8e1fdf4 feat(batch-4): flujos precargados y base de conocimiento por vertical
2069641 feat(batch-3): listas interactivas de hasta diez opciones
c83078d feat(batch-2): horarios de atencion y respuesta fuera de horario
880dbdb feat(batch-1): default GENERICO y reposicionamiento del producto
```

### Checklist final

- [x] `npx tsc --noEmit` limpio.
- [x] `npm test` limpio (335 pruebas).
- [x] `npm run test:integration` limpio (97 pasan, 2 omitidas).
- [x] `npm run landing:build` limpio; `/health` cubierto por la suite de integración.
- [x] Cero menciones de cobranza en `landing/`; no existe `landing/cobranza`.
- [x] Todas las migraciones son aditivas (CREATE TABLE / ADD COLUMN / CREATE TYPE / CREATE INDEX / ADD CONSTRAINT).
- [x] Cada feature nuevo detrás de flag por workspace o env, apagado por defecto.
- [x] Precios sin cambios (Paquete A/B, mensualidad, IA Esencial/Soporte).

### Brechas honestas

- La resolución sin persona por entrada de KB es aproximada por intención (el esquema no registra qué entradas usó cada respuesta).
- Los flujos son de un solo paso (trigger → respuesta); no hay motor multi-paso.
- El reintento del webhook de leads es manual (botón), sin worker en segundo plano.
- La integración con Google Sheets para leads quedó como interfaz pendiente.
- La demo `/demo` vive como ruta de la app (necesita sesión + API), no como página del sitio estático; requiere `DEMO_ENABLED=true`.
- El fixture de integración del módulo legado crea su workspace con `COBRANZA` explícito; el alta real de una instalación nueva queda en `GENERICO`.

---

## Batch L — Rebuild del landing público

**Estado:** completado. **Migración:** no. **Alcance:** solo `landing/`, `scripts/build-landing.ts`, la sección de precios de `docs/alcance-produccion.md` y esta bitácora.

### Qué se hizo

- Se reemplazó el sitio generado por un landing propio con plantillas EJS en `landing/` (`index`, `ia`, `precios`, `demo`, `onboarding`, `guia`, `plantillas`, `privacidad`, `acceso`) y parciales `_head`, `_header`, `_footer`.
- `scripts/build-landing.ts` ahora renderiza esas plantillas a HTML en la misma carpeta, copia marca/favicons y conserva plantillas, `assets/` y `README.md`. El comando sigue siendo `npm run landing:build` y la salida sigue siendo `landing/`.
- CSS propio con los tokens del panel: `landing/assets/css/tokens.css` y `site.css` (Inter/system, superficies blancas, brand `#2B6CB0`, tablas densas, sin frameworks).
- Se eliminaron del landing: `como-empezar.html`, `propuesta.html`, `aviso-de-privacidad.html`, `css/`, `js/`, `docs/` y `brand/`; `privacidad.html` reemplaza al aviso anterior.
- `docs/alcance-produccion.md`: solo se actualizó el bloque de precios y la fila «Cobro y contrato» a los 3 planes.

### Páginas y contenido

- `/`: hero «Automatiza WhatsApp con IA — atiende, califica y deriva», 6 beneficios, 3 pasos, 3 planes con precios y lista tachada, qué incluye cada plan, FAQ y CTA.
- `/ia`: IA acotada, panel por hilo (modo, intención, confianza, handoff, pausa, costo), límites y lo que no hace.
- `/precios`: 3 planes, comparación fila por fila, instalación A/B, upgrades, excedente, IVA/Meta y piloto.
- `/demo`: simulador con selector de vertical y panel; llama a `/api/demo/session` y `/api/demo/chat` de la app (`DEMO_API_BASE`).
- `/onboarding`: qué traer, plan de 7 días, responsabilidades y checklist.
- `/guia` y `/plantillas`: renderizan `docs/guia-uso.md` y `docs/guia-plantillas.md` sin apéndice de cobranza.
- `/privacidad`: aviso de privacidad propio del producto.
- `/acceso`: explica el inicio de sesión por subdominio.

### Gates

- `npm run landing:build` → OK.
- `grep -riE 'cobranza|deudor|promesa|recuperaci[oó]n|gesti[oó]n de cobro' landing/` → **0**.
- `grep -rE '699|999|1,299|3,900|2,900' landing/` → **18 coincidencias** (precios + `9999px`/`-999px` del CSS).
- `grep -riE '1,500|4,000' landing/` → **10 coincidencias**.
- `grep -ri 'cobranza' landing/` → **0**.
- Enlaces internos: **0 roto** (validador propio sobre los 9 HTML).
- Servidor local (Node con URLs limpias) y capturas con Chrome headless: home, precios, demo, IA, onboarding, guía, plantillas, privacidad y acceso responden 200; móvil 390×844 sin desbordamiento (`scrollWidth = 390`).

### Desviaciones y notas

- El pipeline original generaba `landing/` desde `src/views/pages/home/*.ejs`. El prompt pedía EJS en `landing/` y prohibía tocar `src/`; para cumplir ambas cosas se adaptó únicamente `scripts/build-landing.ts` (comando y carpeta de salida intactos).
- No existían `_headers`, `_redirects`, `wrangler.toml` ni `functions/`; no se añadieron.
- El demo del landing depende de una app publicada con `DEMO_ENABLED=true` y CORS/mismo origen. Por defecto apunta a `https://demo.margaritaapp.org`; se puede cambiar con `DEMO_API_BASE` / `DEMO_URL` al construir.
- `npx serve` no pudo usarse por permisos del caché de npm; la verificación local se hizo con un servidor Node equivalente (URLs limpias) y Chrome headless.

---
