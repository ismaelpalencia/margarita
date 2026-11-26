# Margarita

Margarita es una aplicación web para que un negocio opere WhatsApp Business Cloud API con un equipo. El panel operativo principal está construido en Angular; Express/TypeScript aplica autenticación, permisos, reglas de negocio e integración con Meta. Cada instalación se configura para un negocio (single-tenant por instalación).

## Qué problema resuelve

Centraliza conversaciones que antes se atendían desde teléfonos o cuentas individuales: permite asignarlas, conservar contexto, responder con plantillas y revisar la actividad del equipo. Automatizaciones e IA pueden apoyar procesos repetitivos, pero no sustituyen las decisiones del negocio ni al equipo humano.

## Funciones actuales

- Bandeja compartida, asignación, historial, notas internas, etiquetas y acciones masivas.
- Contactos, consentimiento declarado, bajas y bloqueos operativos.
- Mensajes de texto y medios, plantillas aprobadas por Meta, respuestas rápidas, botones y listas.
- Campañas con plantillas, cola, pausa y reintentos sujetos a las reglas de Meta.
- Paneles de administración y agente, equipo, sesiones, reportes, bitácora y respaldos.
- Selector de número con contadores de mensajes sin leer por número; los avisos en pantalla y push identifican el número que recibió el mensaje.
- Flujos guiados y módulos de IA configurables: conocimiento, sugerencias y respuestas automáticas con límites/handoff según configuración.
- Llamadas entrantes y salientes de WhatsApp cuando se configura el Call Service, Meta Calling y Cloudflare TURN. El audio viaja por WebRTC/SRTP entre navegador y Meta; TURN solo retransmite cuando hace falta.

Las llamadas requieren que la PWA esté abierta, el agente disponible y la conversación accesible. No hay grabación ni transcripción.

## Funciones en desarrollo y límites

- **RAG:** no hay recuperación con embeddings/documentos implementada en esta versión. La referencia comercial de Pro está en desarrollo y no debe venderse como capacidad disponible hasta que se habilite y valide.
- Las llamadas dependen de configuración externa, permisos Meta, micrófono, conectividad y servicio Calls. No se contestan con la PWA cerrada; no se graban ni transcriben.
- Meta factura por separado mensajes y llamadas. Cloudflare TURN e IA pueden generar cargos por uso; no se promete consumo ilimitado.
- Margarita no es un CRM/ERP, pasarela de pagos, servicio de reservas ni herramienta de envío sin consentimiento. No crea ni aprueba las plantillas de Meta.
- Roles aplican al espacio/instalación; no prometas una matriz configurable de permisos por número si no está implementada.
- Las preferencias de sonido y avisos del navegador son generales por usuario. Los avisos siguen llegando para todos los números que le corresponden; el selector los distingue por número y contador, pero todavía no permite silenciar cada número por separado.

## Arquitectura

```text
WhatsApp del cliente ↔ Meta Cloud API ↔ Express / Prisma ↔ PostgreSQL
                                          ↕ Socket.IO
                                  Panel Angular (frontend/)

Navegador ↔ WSS/WebRTC ↔ services/calls ↔ Meta Calling API
                                  ↕
                           Cloudflare TURN
```

- **Panel operativo:** Angular 21 en `frontend/`, servido por Express bajo `/panel`.
- **Servidor:** Node.js, TypeScript y Express en `src/`; sesiones, permisos, validación, negocio y APIs.
- **Persistencia:** PostgreSQL con Prisma y migraciones en `prisma/`.
- **Llamadas:** servicio Node independiente en `services/calls/`; mantiene señalización/estado efímero y no escribe directamente en tablas cifradas.
- **Vistas EJS:** EJS sigue activo para el asistente `/setup`, algunas páginas públicas/acceso y compatibilidad. Las plantillas EJS retiradas sin referencias se eliminaron tras revisión; las vistas activas restantes no se consideran código muerto por no aparecer en Angular.
- **Landing:** sitio estático separado en `landing/`, generado desde EJS y fuentes compartidas.

Una instalación corresponde a un negocio; no se presenta como SaaS multi-tenant administrado centralmente.

## Requisitos

- Node.js indicado en `.nvmrc` y npm compatible con el lockfile.
- PostgreSQL accesible desde la aplicación.
- Para integrar WhatsApp: cuenta Meta Business/WABA, número, app, credenciales y webhook HTTPS.
- Para llamadas: `services/calls` desplegado con HTTPS/WSS, configuración Calling de Meta, permisos del usuario y Cloudflare TURN.

## Instalación local

```bash
npm ci
cp .env.example .env
```

Configura como mínimo `DATABASE_URL`, los secretos de autenticación/cifrado y `APP_URL`. Para Meta, completa la configuración requerida en `.env.example`. Prepara PostgreSQL de desarrollo y aplica el flujo de migraciones documentado antes de iniciar.

```bash
npm run dev
```

El asistente inicial está en `/setup`. No uses credenciales, datos, tokens ni respaldos de producción en desarrollo.

## Variables de entorno

- La lista y comentarios vigentes están en [`.env.example`](.env.example) y `src/config/app.config.ts`.
- Las variables opcionales de IA, medios, push y almacenamiento deben configurarse solo si se habilitan esas capacidades.
- Las variables de Calls para Margarita y para el servicio independiente se describen en [`services/calls/README.md`](services/calls/README.md). `CLOUDFLARE_TURN_API_TOKEN` solo vive en el servidor Calls; no se expone al navegador.
- No guardes valores de secretos en documentación, capturas, issues ni commits.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Express en desarrollo |
| `npm test` | Pruebas unitarias del servidor |
| `npx tsc --noEmit` | Verificación de tipos del servidor |
| `npm run build` | Prisma, CSS, Angular, servidor y copia de recursos |
| `npm --prefix frontend test -- --watch=false` | Pruebas Angular |
| `npm run landing:build` | Genera el sitio estático en `landing/` |
| `npm run test:integration` | Pruebas con PostgreSQL desechable y secretos de prueba |

## Pruebas

Para cambios de servidor ejecuta pruebas unitarias y typecheck; para Angular, build y tests del frontend; para landing/documentación, `npm run landing:build`. Las pruebas de integración deben usar una base desechable. El comando `npm run build` incluye compilación de Prisma, CSS y Angular; verifica su efecto en archivos generados antes de preparar el commit.

## Despliegue

El servicio principal se configura para Railway mediante `railway.json`; revisa variables, healthcheck, predeploy de migraciones y volumen persistente antes de cada publicación. `services/calls/` tiene Dockerfile y despliegue independiente. `landing/` se publica por separado como sitio estático; véase [`landing/README.md`](landing/README.md). Este repositorio no implica que un entorno concreto esté desplegado o correctamente configurado.

## Seguridad

- Usa HTTPS y valida la firma del webhook de Meta.
- Conserva `ENCRYPTION_KEY` y secretos fuera de Git; limita acceso al volumen, base y cuenta de Meta.
- Revisa migraciones, permisos y restauración de backups antes de publicar.
- Mantén separadas las credenciales de Margarita y Calls. No registres tokens, SDP, claves TURN ni contenido sensible.
- Configura consentimiento, exclusiones y bajas antes de cualquier campaña.

## Configuración por negocio

Usa el [checklist de alta por negocio](docs/configuracion-por-negocio.md) para Meta, llamadas, IA, operación, infraestructura y asuntos legales. Cada instalación debe tener responsables y evidencia de sus bloqueantes.

## Precios

Los planes, límites y costos externos aprobados se mantienen en [`docs/precios.md`](docs/precios.md). Meta cobra aparte mensajes/llamadas; TURN e IA pueden generar consumo adicional. No ofrezcas RAG, grabación, transcripción, 24/7 o consumo ilimitado como funciones disponibles.

## Documentación

El índice y estado de la documentación están en [`docs/README.md`](docs/README.md). Referencias principales:

- [`docs/alcance-produccion.md`](docs/alcance-produccion.md): estado funcional, arquitectura, límites y operación.
- [`docs/configuracion-por-negocio.md`](docs/configuracion-por-negocio.md): checklist de alta.
- [`docs/precios.md`](docs/precios.md): fuente de verdad comercial.
- [`services/calls/README.md`](services/calls/README.md): arquitectura y configuración de llamadas.
- [`frontend/README.md`](frontend/README.md): aplicación Angular.

## Límites conocidos

La disponibilidad depende de Meta y de la infraestructura/configuración de cada instalación. El estado reportado por Meta no garantiza entrega al usuario final. La búsqueda de algunos datos cifrados es exacta, no parcial. La recepción entrante usa una sesión global del panel para agentes y administradores autorizados; Web Push es un aviso complementario y no garantiza atender con la PWA cerrada. No hay RAG, grabación ni transcripción en esta versión. La política de privacidad, conservación y facturación debe acordarse con cada negocio.
