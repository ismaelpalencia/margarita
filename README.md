# Margarita

Margarita es una aplicación web para operar WhatsApp Business Cloud API: recibir y responder mensajes, atender conversaciones con un equipo, enviar campañas con plantillas aprobadas y administrar la operación desde un panel Angular.

La aplicación no es un CRM, no crea plantillas de Meta y no es un chatbot de propósito general. La IA opcional trabaja con conocimiento configurado, controles de confianza y límites operativos.

## Producto hoy

- Bandejas para administradores y agentes, asignación, estados de lectura, mensajes en vivo, reacciones, indicador de escritura y bloqueo de contactos en WhatsApp.
- Aviso de mensajes sin leer en el título del navegador y preferencias individuales para elegir sonidos de notificación.
- Respuestas rápidas de texto, botones (hasta 3) y listas (hasta 10 opciones), con configuración compartida y contenido cifrado.
- Contactos, etiquetas, notas internas, bajas, plantillas, respuestas rápidas, campañas y archivos multimedia.
- Conexión de uno o varios números de WhatsApp, salud del número y ajustes del perfil empresarial.
- Automatización opcional con IA y flujos, con límites y handoff a una persona.
- Reportes, bitácora, respaldos, sesiones y configuración del espacio de trabajo.

El estado “bloqueado” mostrado en una conversación refleja las acciones de bloqueo realizadas desde Margarita. Cambios hechos directamente en Meta pueden no reflejarse hasta sincronizar la lista de bloqueados desde Admin → WhatsApp.

## Interfaz y vistas

El panel autenticado de operación se sirve como aplicación Angular desde `/panel`. Angular usa rutas JSON de Express; Express mantiene autenticación, permisos y acceso a base de datos y Meta.

EJS todavía está en uso en esta aplicación. Renderiza páginas de inicio/configuración y algunas pantallas públicas y de acceso, además de rutas explícitas de compatibilidad (`/legacy`) para vistas anteriores del panel. Por tanto, Angular es el panel habitual, pero el repositorio aún no es “solo Angular”. Las plantillas archivadas en `src/views/legacy-unused/` no se renderizan.

La página comercial y la demo pública no son el panel: el landing se mantiene en `landing/` y la demo interactiva puede desplegarse como servicio Go independiente.

## Tecnología y estructura

- Node.js (versión indicada en `.nvmrc`), TypeScript estricto, Express y Prisma.
- Angular en `frontend/`; sus archivos compilados se sirven desde `src/public/angular/`.
- PostgreSQL como base de datos, Socket.IO para actualizaciones en vivo y Meta Graph API para WhatsApp.
- Controladores HTTP en `src/controllers/`, reglas y persistencia en `src/services/`, rutas en `src/routes/`, esquema y migraciones en `prisma/`.
- Pruebas unitarias junto al código y pruebas de integración en `tests/integration/`.

## Requisitos

- Node.js de la versión indicada en `.nvmrc` y npm.
- PostgreSQL disponible para la aplicación.
- Credenciales de una app de Meta con WhatsApp Business Cloud API para usar la integración real.

## Desarrollo local

```sh
npm ci
cp .env.example .env
```

Configura en `.env` como mínimo la conexión de PostgreSQL, secretos de sesión y cifrado. Para una instalación vacía, inicia la app y completa `/setup`.

```sh
npm run dev
```

Para compilar servidor, estilos y frontend Angular:

```sh
npm run build
```

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor TypeScript con recarga |
| `npm run frontend:build` | Compilar Angular |
| `npm run css:build` | Compilar estilos de vistas EJS |
| `npm test` | Pruebas unitarias del servidor |
| `npm run test:integration` | Pruebas de integración; requiere base de datos desechable y configuración |
| `npx tsc --noEmit` | Verificación de tipos del servidor |
| `npm run build` | Cliente Prisma, CSS, Angular, TypeScript y copia de recursos |
| `npm run landing:build` | Generar el landing estático |

## Operación y seguridad

- Copia `.env.example` para conocer las variables disponibles. No guardes credenciales, datos reales ni respaldos en Git.
- La aplicación cifra campos sensibles en reposo. Mantén `ENCRYPTION_KEY` estable y respaldada; cambiarla sin un plan de rotación puede dejar datos cifrados inaccesibles.
- Verifica el webhook de Meta, configura HTTPS y ejecuta migraciones antes de publicar cambios que alteren el esquema.
- En Railway, los archivos y respaldos deben quedar en un volumen persistente. Revisa `/health` y los logs del despliegue.
- Para producción, sigue [el alcance y guía operativa](docs/alcance-produccion.md).

## Documentación

- [Alcance de producción](docs/alcance-produccion.md)
- [Documentación del frontend Angular](frontend/README.md)
- [Variables de entorno](.env.example)
- [Esquema y migraciones](prisma/schema.prisma)
