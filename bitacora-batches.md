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
