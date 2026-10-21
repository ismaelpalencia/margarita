# Repository Guidelines

## Project Structure

Margarita is a TypeScript/Express application for operating WhatsApp Business Cloud API. Application code lives in `src/`, organized by responsibility (`controllers/`, `services/`, `routes/`, `middlewares/`, `jobs/`, `views/`, and `validations/`). Prisma schema, seed data, and versioned migrations are in `prisma/`. Unit tests sit beside source files as `*.test.ts`; integration tests and their runner are in `tests/integration/`. Static app assets are in `src/assets/` and `src/public/`. The separate sales landing page is in `landing/`; product and operational documentation is in `docs/`.

## Build, Test, and Development

Use Node.js `22.12.0` (see `.nvmrc`) and install dependencies with `npm ci`.

- `npm run dev` starts the TypeScript server with reload.
- `npm test` runs unit tests using Node's test runner and `tsx`.
- `npm run test:integration` runs database-backed integration tests; configure a disposable PostgreSQL database and required secrets first.
- `npx tsc --noEmit` checks application types; `npm run typecheck:all` includes test types.
- `npm run build` generates the Prisma client, compiles CSS and TypeScript, and copies assets.
- `npm run css:build` rebuilds minified Tailwind CSS after changing view or client-side classes.
- `npm run landing:build` builds the static landing page.

## Code Style

Follow the existing TypeScript style: strict typing, two-space indentation, semicolons, and descriptive English identifiers. Keep controllers thin; place business logic in services, database access through Prisma, and request validation in `src/validations/` with Zod. User-facing text, logs, and comments are generally Spanish. Use the shared application date utilities for timezone-sensitive dates, and audit significant operational actions through the existing logging service.

## Testing

Name unit tests `*.test.ts` alongside the module they cover. Add integration coverage under `tests/integration/` for behavior requiring PostgreSQL or full request flows. Run `npm test` and `npx tsc --noEmit` for focused changes; run `npm run test:integration` when database behavior changes. CI also validates Prisma, migration safety, and the full build.

## Commits and Pull Requests

Recent history uses concise, often Spanish, imperative-style subjects, commonly prefixed by an area (for example, `marca: ...`, `usuarios: ...`, `reportes: ...`). Keep changes focused and follow that pattern. Pull requests should explain user-visible and operational impact, list verification commands and results, link related issues when available, and include screenshots for UI changes. Call out schema or migration changes and update relevant documentation.

## Security and Configuration

Start from `.env.example`; never commit credentials, real customer data, or production backups. Treat encryption, authentication, webhook verification, and migration changes as security-sensitive, and test them with disposable data.
