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

## Baseline — Panel, notificaciones y handoff (2026-11-04)

- **Rama:** `feat/panel-notifications-redesign` (creada desde `main`).
- **Commit base:** `5d49eba` (incluye los 9 batches + landing final).
- **Fecha:** 2026-11-04.
- **Comandos de verificación:**
  - `npx tsc --noEmit` → OK.
  - `npm test` → 335 pass, 0 fail.
  - `npm run test:integration` → 97 pass, 2 skipped, 0 fail.
- `alcance-produccion.md` revisado: default `GENERICO`, 3 planes, features de los 9 batches, cobranza como legado y checklist con flags; **vigente**, sin cambios en A.0.

---

## Batch A — Notificaciones en tiempo real y fallback de handoff

**Estado:** completado (en pro). **Migración:** sí, aditiva: 20261104200000_notifications_handoff (ADD COLUMN notifySoundEnabled/notifyBrowserEnabled en User, handoffEscalationMinutes/autoAssignToAdmin en Workspace, handoffEscalatedAt en Conversation).

### Archivos tocados

- Esquema/migración: prisma/schema.prisma, prisma/migrations/20261104200000_notifications_handoff/migration.sql.
- Decisión pura: src/utils/assignment.ts (pickAssignee) + assignment.test.ts.
- Asignación: src/services/assignment.service.ts (cadena AVAILABLE → BUSY → admin → sin asignar), src/services/conversation.service.ts (claim, countUnassigned, markAsRead emite lectura, agente ve «sin asignar»).
- Badges servidor: src/services/badge.service.ts, src/sockets/index.ts (emitToUsers).
- Escalamiento: src/jobs/handoff-escalation.job.ts + registro en src/jobs/index.ts.
- Notificación de handoff: src/services/ai/auto-reply.service.ts (conversation:handoff + AI_HANDOFF_NOTIFIED).
- Mensaje entrante: src/services/meta-webhook-handler.service.ts (broadcast de badges).
- Cliente: src/public/js/live.js (badges, título, sonido, notificaciones de navegador, throttle, handoff, escalamiento).
- UI: src/views/partials/admin-nav.ejs y agent-nav.ejs (badge «Sin asignar» + prefs), páginas de dashboard (banner), src/views/pages/admin/system/index.ejs (tarjeta de asignación + contador), src/views/pages/account/notifications.ejs (nueva), enlace en security.ejs, botones «Reclamar» en las bandejas, controladores y rutas de claim/notificaciones/handoff.
- Pruebas: src/utils/assignment.test.ts, tests/integration/handoff.integration.test.ts.

### Eventos nuevos de auditoría

- HANDOFF_ASSIGNED_FALLBACK (con step), HANDOFF_UNASSIGNED, HANDOFF_ESCALATED, HANDOFF_CLAIMED, AI_HANDOFF_NOTIFIED.

### Pruebas

- 6 unitarias de pickAssignee (4 ramas + deshabilitado + empate).
- 5 de integración: BUSY con menos carga, admin con sesión, sin nadie + reclamar, escalamiento tras minutos, y el flujo existente sigue verde.

### Comandos

- npx tsc --noEmit → OK.
- npm test → 341 pass.
- npm run test:integration → 101 pass, 2 skipped.

### Decisiones

- Los badges se calculan en el servidor (badges:update por usuario) para que dos pestañas no se desincronicen.
- «Admin en línea» = administrador con sesión activa (UserSession isActive y no vencida).
- El sonido y las notificaciones del navegador están apagadas por defecto por usuario; los toasts in-app y las badges siempre activos.
- El escalamiento usa Conversation.handoffEscalatedAt para no repetir, con un job cada minuto.

---

## Batch B — Rediseño visual del panel (shell + tokens)

**Estado:** parcial (shell + tokens + componentes; el rediseño pantalla por pantalla queda pendiente). **Migración:** no.

### Archivos tocados

- src/assets/css/tokens.css (mismos valores que landing/assets/css/tokens.css), base.css (tipografía 13px, Inter, fondos, foco), components.css (.btn/.card/.badge/.chip/.input/.table/.toast/.empty/.skeleton), shell.css (topbar + sidebar).
- src/assets/css/input.css: importa components.css, shell.css y la fuente Inter.
- src/views/partials/admin-nav.ejs y agent-nav.ejs: reescritos como sidebar (240px) + topbar (56px), conservando enlaces, badges (data-unread-badge / data-badge="unassigned"), selector de número, tema, fuera de horario, cierre de sesión y el script de preferencias.
- src/public/js/live.js: setBadge sincroniza la clase is-empty.

### Decisiones / desviaciones

- Tokens: se copiaron los valores del landing (fuente única) en src/assets/css/tokens.css porque la canalización de CSS del panel compila desde src/assets/css; no se importa el archivo del landing directamente.
- Iconos: se conserva el conjunto existente (emoji/SVG) sin introducir Lucide, para no mezclar y no añadir dependencia de CDN.
- Modo oscuro: ya existía (Fase previa); no se añadió ni se eliminó.
- El buscador del topbar es funcional y redirige a la bandeja con ?search=.

### Pendiente (siguiente iteración)

- Bandeja de 3 columnas (lista | hilo | panel) en escritorio.
- KPI cards y lista de Dashboard con las nuevas tarjetas.
- Rediseño fino de Contactos, Agentes, Campañas/Plantillas, IA → Panel por hilo, Reportes, Sistema.
- Estados vacíos y skeletons en bandeja/Dashboard.
- Campana de notificaciones con historial de toasts.

### Comandos

- npx tsc --noEmit → OK.
- npm test → 341 pass.
- npm run test:integration → 101 pass, 2 skipped.

---

## Batch B (continuación) — Pantallas y campana

- Dashboard admin/agente: KPIs con .card/.badge y botones de estado con .btn.
- Bandeja admin y agente: lista tipo correo (.inbox-row) con avatar, no leídos en negrita, chips (estado, Handoff, Sin asignar, BAJA), contador por fila (data-row-unread) y acciones Reclamar/Abrir; empty state.
- Conversaciones index/show admin y agente: usan el shell (admin-nav/agent-nav) en lugar de cabeceras propias.
- Campana de notificaciones en el topbar con historial de toasts en localStorage (margarita:toasts) y panel desplegable; live.js guarda cada toast y emite margarita:toast.
- CSS: .inbox-row, .panel-bell__panel.

### Pendiente / bloqueado

- Bandeja de 3 columnas real (lista | hilo | panel): requiere pasar la lista de conversaciones al controlador del show, que Batch B prohíbe tocar. Queda como follow-up si se autoriza un cambio mínimo de controlador.
- Contactos/Etiquetas/Plantillas siguen con cabecera propia (sin shell).
- Rediseño fino de Reportes/Sistema/IA panel y skeletons.

### Gates

- npx tsc --noEmit → OK; npm test → 341 pass; npm run test:integration → 101 pass, 2 skipped.

---

## Batch B — Bandeja de 3 columnas (cierre)

- Controladores show (admin/agente): pasan `conversations` (misma consulta del index) al render; único cambio de controlador autorizado.
- show.ejs: grid de 3 columnas en xl (`240px | 1fr | 340/320px`), 2 columnas en lg (lista + hilo, panel debajo) y 1 columna con botón «← Bandeja» por debajo de lg.
- Rail izquierdo compacto con no leídos y conversación activa; CSS .inbox-rail__item.
- Gates: tsc OK, 341 unit, 101 integration.

---

## Ajustes post-Batch B

- Contraste: los enlaces sin clase mantienen el color de marca; los botones con `text-white`/utilidades ya no heredan el azul (base.css usa `a:not([class])`).
- Ocultar menú izquierdo: botón ⇤ en el topbar (escritorio), estado en localStorage (`margarita:sidebar-hidden`); en móvil sigue el ☰.
- No leídos: al abrir un hilo los controladores show recalculan `unreadTotal`/`unassignedCount` antes de renderizar (el middleware los calculaba antes de `markAsRead`). La campana marca los toasts como vistos (`margarita:toastsSeenAt`) y deja de mostrar el 1.
- Límites de IA controlados por el operador: `AI_MAX_REPLIES_PER_DAY`, `AI_MAX_REPLIES_PER_THREAD` y `AI_LIMITS_LOCKED` recortan el valor efectivo en `AiSettingsService` (get/save) y la pantalla los muestra en solo lectura. Documentado en `.env.example`.
- Shell aplicado a Contactos/Etiquetas/Plantillas y formularios de alta/edición.
- Skeleton de la lista de bandeja al enviar filtros.

### Gates

- tsc OK, 341 unit, 101 integration.

---

## Documentación — alcance real

- `docs/alcance-produccion.md` consolidado con el alcance verificado contra el código (modelos, rutas, servicios, flags, env y pruebas).
- Resuelve las contradicciones de `alcance-produccion.md` (listas, IA automática, conteos de pruebas/migraciones, rate limit, landing, handoff, notificaciones).
- No se editó `alcance-produccion.md`; el nuevo documento lo declara superseded.

---

## Fix — horas en la zona del workspace

- Las vistas usaban `toLocaleString`/`toLocaleTimeString` sin zona: en Railway (UTC) un mensaje de las 08:46 en México se veía a las 02:46.
- Nuevos helpers `formatDateTimeIn`, `formatTimeIn`, `formatDateIn`, `formatDayLabelIn` en `src/utils/date.ts`; `workspaceProfileMiddleware` los expone con la zona de `WorkspaceSettings.timezone` (fallback `America/Mexico_City`).
- Reemplazados todos los `toLocale*` de fechas en vistas (burbujas, bandeja, bitácora, webhooks, plantillas, bloqueos, resultados y compromisos).
- El hilo pasa `data-live-timezone` y `live.js` formatea con la zona del workspace.
- Pruebas nuevas: 08:46 en México y fecha de madrugada UTC.

### Gates

- tsc OK, 343 unit, 101 integración.

---

## Doc consolidation

- Se copió el documento nuevo sobre `docs/alcance-produccion.md` (reemplazo total) y se eliminó el archivo temporal.
- Se actualizó la única referencia interna (`bitacora-batches.md`).
- Ediciones aplicadas en `docs/alcance-produccion.md`:
  1. Sección 4: «Botones y listas» dividido en dos filas (envío general y reglas solo COBRANZA).
  2. Sección 1: `PRODUCT_DOMAIN` marcado como legado (solo instalaciones que sirven la oferta desde `src/views/pages/home/*`); también marcado en la sección 17 y en el checklist.
  3. Sección 15: el contador de no leídos lo calcula el servidor y sigue siendo por hilo, no por usuario.
  4. Sección 8: bullet de escalamiento de handoff con el job real.
  5. Sección 2: aclaración de que 1,500/4,000 son aproximación vía `AI_MAX_REPLIES_PER_DAY` y no hay contador mensual en la base.
- Ajustes de coherencia tras la consolidación: encabezado sin autoreferencia y sección 16 renombrada a «Contradicciones históricas».

### Evidencia de repositorio

- (b) `PRODUCT_DOMAIN`: `src/config/app.config.ts` lo lee y `src/controllers/home.controller.ts` solo sirve `pages/home/*` cuando `servesLanding(hostname)`; el landing nuevo está en `landing/` (build `landing:build`, deploy en Cloudflare).
- (d) Escalamiento: `src/jobs/handoff-escalation.job.ts` define `INTERVAL_MS = 60 * 1000`, `runHandoffEscalation()` y `startHandoffEscalationJob()`; se registra en `src/jobs/index.ts`.

---

## Control del plan desde Railway

- `AI_MAX_MONTHLY_BUDGET_CENTS`: techo del presupuesto mensual de IA (sugerencias y automático).
- `AI_LIMITS_HIDDEN=true`: oculta la tarjeta de límites al cliente; el servidor conserva los valores vigentes aunque se poste el formulario.
- `AI_LIMITS_LOCKED=true`: deja los tres límites en solo lectura (día, hilo, presupuesto) con su valor actual.
- `AI_LIMITS_LOCKED` ahora se usa de verdad; antes solo estaba definido en `appConfig`.
- `AiSettingsService` recorta día/hilo/presupuesto al techo y, si está bloqueado u oculto, preserva lo existente.
- Documentado en `.env.example` y en `docs/alcance-produccion.md`.

### Gates

- tsc OK, 343 unit, 101 integración.

---

## Tope mensual real y tope de sugerencias

- `AI_MONTHLY_REPLIES_LIMIT`: tope mensual de respuestas automáticas (1,500 / 4,000 del plan). Se cuenta sobre mensajes `AUTOMATIC` con `aiSuggestionId` desde el inicio del mes en la zona del workspace; `decideAutoReply` corta con `MONTHLY_LIMIT`.
- `AI_MAX_SUGGESTIONS_PER_DAY`: tope diario de sugerencias generadas; `SuggestionService.generateForJob` corta con `SUGGESTION_LIMIT` antes de llamar al modelo.
- La pantalla Admin → IA muestra «Respuestas de IA este mes: X de N» y «Sugerencias hoy: X de N» (se oculta con `AI_LIMITS_HIDDEN`).
- Sin migración: los contadores se derivan de `Message` y `AiSuggestion`.
- Pruebas nuevas: tope mensual corta y sin tope sigue.

### Gates

- tsc OK, 345 unit, 101 integración.

---

## Baseline — Plan único y consumo mensual de IA (2026-11-05)

- Rama `feat/single-plan-and-ai-usage` desde `main` (`8ba228e`).
- `npx tsc --noEmit` OK; `npm test` 345 pass; `npm run test:integration` 101 pass, 2 skipped.
- Puntos localizados: `AI_AUTO_REPLY_SENT` en `src/services/message.service.ts` (send success, con guardia `aiSuggestionId`); creación de borradores en `src/services/ai/suggestion.service.ts`; zona horaria en `SendPolicyService.timezoneFor` (`WorkspaceSettings.timezone`).

---

## Fase 1 — Contador mensual de IA

- Migración aditiva `20261105120000_ai_usage_monthly`: CREATE TABLE AiUsageMonthly + unique/index + FK. Sin drops.
- `src/services/aiUsage.service.ts`: incrementAutoReply / incrementSuggest, getCurrentMonthUsage, getMonthlyReport, shouldHardCap; mes en zona del workspace con Intl.
- Wiring: `message.service` incrementa tras AI_AUTO_REPLY_SENT (guardia aiSuggestionId evita doble conteo); `suggestion.service` incrementa borradores SUGGEST y aplica hard cap (modo OFF + handoff).
- Panel: bloque en Admin → IA, tarjeta en Admin → Sistema y vista Admin → Reportes de servicio → Consumo de IA con CSV.
- Env: AI_MONTHLY_REPLIES_LIMIT, AI_MONTHLY_SUGGESTIONS_LIMIT, AI_MONTHLY_BUDGET_CENTS, AI_OVERAGE_PRICE_MXN, AI_LIMITS_ENFORCE (AI_LIMITS_HIDDEN ya existía).
- Eventos: AI_USAGE_LIMIT_REACHED, AI_OVERAGE_STARTED, AI_HARD_CAP_REACHED (uno por mes).
- Tests: 2 unitarios de frontera de mes + 4 de integración (conteo, reporte, excedente único, hard cap).

### Gates

- tsc OK, 347 unit, 105 integración (107 total, 2 skipped).

---

## Fase 2 — Plan único Margarita IA

- Landing: `PRICING` pasa a un solo plan ($1,299, 2,000 respuestas, garantía 30 días, overage solo referencia). `precios.ejs` reescrito (una tarjeta + Todo lo que incluye, sin tabla comparativa, sin instalación, sin piloto). `index.ejs`, `ia.ejs`, `onboarding.ejs`, `guia.ejs`, `plantillas.ejs`, `demo.ejs`, `_footer.ejs` actualizados. HTML regenerado.
- Metas y PAGES de `scripts/build-landing.ts` actualizados; `docs/guia-uso.md` ajustado (guía publicada).
- Docs: alcance (precio único, clientes legacy, vistas legacy, checklist), facturación, propuesta, contrato, modelo, plan-interactivos, guía Meta, plantilla Railway, kit comercial, demanda Workana y README.
- Legacy: `app.config` marcado como legacy y con precios nuevos; `.env.example` sin AI_ESSENTIAL/AI_SUPPORT/INSTALL, con vars del plan.
- Grep landing prohibidos: 0. `1,299` y `2,000` presentes. Docs: solo quedan menciones de "instalación" como despliegue/tenant.

### Gates

- landing:build OK; tsc OK; 347 unit; 105 integración (107 total, 2 skipped).

---

## Ajuste — Cancelación sin compromiso y nuevo WhatsApp

- Se retiró la garantía de devolución de la mensualidad. Nuevo texto: cancelación cuando quiera, sin penalización; el primer mes se paga si se usa el servicio.
- Landing: index (hero/FAQ), precios (tarjeta/FAQ), onboarding (día 30) y guía publicada. `PRICING.guaranteeDays` eliminado.
- Docs: alcance, contrato (sección 4), facturación, propuesta, modelo comercial, guía de uso y kit comercial.
- WhatsApp de soporte: 55 5933 7514 (wa.me/525559337514) en la landing, docs y panel de plantillas.
- Landing regenerado.

### Gates

- tsc OK, unit OK, landing:build OK; sin teléfono viejo ni textos de reembolso en landing/*.html.

---

## Ajuste — WhatsApp de soporte +1

- Número corregido a +1 (555) 933-7514 → wa.me/15559337514.
- Actualizados appConfig (default), panel de plantillas, landing regenerada, contrato, guía, aviso de privacidad y README.

---

## Fix — botones de flujo y límite de Meta

- Meta rechazaba el interactivo del flujo «Bienvenida» con 131009 porque «Hablar con una persona» (22) y «Pasar con una persona» (21) pasan del máximo de 20.
- Seeds corregidos a «Hablar con asesor» / «Pasar con asesor».
- `sendFlowReply` sanea los títulos con `fitFlowButtonTitle` antes de armar el payload: corrige también los flujos ya guardados en la base.
- Prueba nueva para el ajuste de títulos.

---

## Flujos editables y activables

- Admin → IA → Paquete inicial ahora lista los flujos del workspace con estado y acciones.
- Toggle global de `flowsEnabled` y toggle por flujo (`isActive`).
- Editor de flujo: trigger, respuesta, hasta 3 botones (título máx. 20, IDs únicos) y opción de quitarlos.
- Rutas nuevas: POST /admin/ai/flows/toggle, POST /admin/ai/flows/:id/toggle, GET/POST /admin/ai/flows/:id.
- Auditoría: FLOWS_ENABLED_CHANGED, FLOW_ACTIVATED/DEACTIVATED, FLOW_UPDATED.
- Con flujo disparado no se encola IA; si el flujo falla, la IA sigue (por eso el texto adicional).

---

## Atención de handoffs en el dashboard

- Dashboard admin: tarjeta «Atención: entregas de la IA» con contacto, motivo, asignado (o «Sin asignar»), hora y enlace.
- Toast en vivo en el dashboard para `conversation:handoff` y `conversation:unassigned`, con nombre del asignado.
- `conversation:handoff` ahora incluye `assignedUserName`.
- La asignación sigue la cadena AVAILABLE → BUSY → admin → sin asignar; un agente OFFLINE no recibe.

---

## Listas editables en flujos

- El editor de flujos ahora edita listas: texto del botón, título de sección y hasta 10 filas (título 24, descripción 72).
- Se puede quitar la lista para responder solo texto.
- Si `interactiveListsEnabled` está apagado, el flujo de lista se envía como texto (no se llama a Meta con lista).
- Validaciones de longitud/IDs y auditoría FLOW_UPDATED.

---

## WhatsApp +52 y Pixel de Meta

- Número actualizado a +52 1 55 6487 0481 (wa.me/5215564870481) en app, landing, panel y docs.
- Los enlaces de WhatsApp del landing llevan mensaje precargado (`SUPPORT_WHATSAPP_TEXT`).
- Pixel de Meta opcional por `META_PIXEL_ID` en el build del landing: PageView, ViewContent (/precios, /demo) y Contact (clic wa.me).
- Sin ID el pixel no se renderiza.

---
