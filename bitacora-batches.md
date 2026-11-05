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
