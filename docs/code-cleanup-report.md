# Inventario de código para limpieza

**Fecha:** 25 de noviembre de 2026. Inventario estático previo a cualquier eliminación; no ejecuta la app ni se basa solo en que un archivo no aparezca en Angular. Las eliminaciones se limitan a candidatos con rutas/imports comprobados. No se tocan migraciones, tests, assets generados Angular ni código cuyo uso pueda ser dinámico.

| Archivo | Referencias comprobadas | Decisión | Motivo |
| --- | --- | --- | --- |
| `src/views/legacy-unused/` (36 archivos, incluido README) | Sin referencias de ejecución en `src/controllers`, `src/routes`, `frontend/src` ni includes activos. Revisión de `res.render` cubre las vistas activas; el único include relacionado hallado es `src/views/pages/admin/contacts/edit.ejs` → `src/views/partials/outcome-panel.ejs`, fuera de la carpeta candidata. README propio las declaraba archivadas. | Eliminado | Cero referencias runtime identificadas y no son legales/operativas; inventario creado antes de retirar las vistas. |
| `src/views/pages/**` restante | Referencias explícitas en `res.render` de controladores (home/setup/auth/admin/agente/demo) | Conservar | Vistas EJS activas; EJS sigue en uso junto con Angular. |
| `src/routes/*.routes.ts` | Montaje explícito desde `src/routes/index.routes.ts` y routers admin/agente | Conservar | Rutas activas; no se encontró router huérfano. |
| Páginas/componentes `frontend/src/app/*` | `frontend/src/app/app.routes.ts`, incluyendo `loadComponent` dinámico para conversación, campañas, IA, flujos y reportes | Conservar | La carga puede ser dinámica; el registro de rutas es la referencia válida. No se eliminó ningún componente. |
| `scripts/check-migrations.mjs` | Invocación documentada como `node scripts/check-migrations.mjs`; no tiene alias npm | Conservar | Herramienta CLI manual, no archivo muerto. Se corrigió una instrucción que indicaba un alias npm inexistente. |
| Scripts `scripts/generate-*`, `export-brand-assets.py`, `build-propuesta-pdf.py`, `build-presentacion.mjs` | Algunos son invocados directamente en `docs/marca.md` o tienen instrucciones CLI; no se detecta que todos estén bajo `package.json` | Conservar | Los scripts CLI no necesitan estar en `package.json`; falta una revisión de uso externo/histórico para retirar cualquiera. |
| `scripts/build-landing.ts`, `scripts/copy-assets.mjs`, `scripts/seed-demo.ts`, `scripts/encrypt-secrets.ts` | Entradas en `package.json` | Conservar | Comandos activos. |
| `src/public/brand/img/*` y `landing/assets/img/*` | 15 archivos con hashes idénticos entre ambos árboles; `scripts/build-landing.ts` copia los assets de marca para el sitio estático independiente | Conservar | Duplicación intencional entre despliegue de app y landing, no redundancia eliminable. |
| CSS en `src/public/`, `frontend/src/` y `landing/assets/css/` | Usos desde vistas EJS, plantillas Angular embebidas, clases dinámicas y entradas de build | Conservar | No se confirmó una regla/selector sin uso con análisis capaz de cubrir templates y clases dinámicas. |
| Funciones auxiliares/servicios | Imports, callbacks, inyección Angular, rutas y carga dinámica | Conservar | No se confirmó función sin llamadas con evidencia suficiente para borrarla. |
| `src/public/angular/`, migraciones y tests | Artefactos generados/operativos y suites de verificación | Conservar | Exclusión explícita del alcance de limpieza. |

## Cambio efectuado

Se eliminó únicamente `src/views/legacy-unused/` después de comprobar que no hay referencias runtime fuera de la propia carpeta. Las vistas activas `src/views/pages/` permanecen. No se eliminó ningún documento, migración, test, componente Angular, asset duplicado intencional ni script CLI.

## Límites de la búsqueda

La búsqueda estática no demuestra usos externos no versionados, referencias por nombre construido en runtime ni dependencias operativas documentadas fuera del repositorio. Por ello esos candidatos se conservaron. Los builds y tests del bloque se ejecutan después de esta limpieza para detectar referencias de compilación/regresión.
