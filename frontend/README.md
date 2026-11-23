# Margarita Angular panel

This Angular application is the panel UI served under `/panel`. Express keeps the session cookie, authorization, workspace/number scoping and business services as the source of truth; the Angular screens call the authenticated JSON routes and never query Prisma directly.

## Development

Install the frontend lockfile with `npm --prefix frontend ci`. Start Express with `npm run dev` and Angular with `npm run frontend:dev` in separate terminals. The Angular proxy sends authenticated requests to Express on port 3000. Set `APP_URL=http://localhost:4200` for local form submissions through the proxy.

The panel routes live in `src/app/app.routes.ts` and cover the admin and agent areas: dashboard, conversations (list and detail), contacts, campaigns, tags, quick replies, replies, templates, hours, guide, users, sessions, WhatsApp, backups, system, service metrics, logs, leads, AI (knowledge, package, flows, import and guided flows), reports and account settings.

## Backend contract

- The JSON convention is `req.accepts("json") && !req.accepts("html")`. Angular fetches send `Accept: application/json`.
- HTML visits to the main `/admin/...` and `/agent/...` URLs redirect to the equivalent `/panel/...` route. Explicit `/legacy` conversation and dashboard routes still render older EJS panel screens; public/home, login fallback and setup controllers also have active EJS renders. EJS is therefore still an application runtime dependency, although Angular is the normal authenticated panel.
- Writes either return JSON (`{ ok: true }`, `{ error }`) or redirect back to `/panel/...`, so a form that cannot be handled as JSON still lands in Angular.
- `/panel/shell` returns the active number, available numbers and the unread/unassigned counters used by the sidebar.

## Build and serving

Run `npm run frontend:build` to write optimized assets to `src/public/angular/`. Express serves those bundles and protects `/panel` routes with the existing authentication and role middleware. The full `npm run build` runs this frontend build before copying public assets to `dist/public/`.

Use standalone components, typed API response models, accessible labels, and responsive styles. Preserve role checks, workspace and active-number scoping, CSRF behavior for writes, and the current Spanish product language when adding modules.

## Verification

Run `npm --prefix frontend test -- --watch=false` for Angular unit tests. The
CI runs these together with the backend tests, type checks, and full build.
Database-backed integration coverage also checks that authenticated admin and
agent URLs serve the Angular shell and that agent sessions cannot open admin
routes.
