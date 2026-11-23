# Margarita: alcance de producción

**Revisión del código: 23 de noviembre de 2026.** Este documento describe el comportamiento y los límites del producto en el repositorio. La configuración de cada entorno (Railway, Meta, dominios, variables y volúmenes) debe comprobarse en ese entorno; no se deduce solo del código.

## 1. Propósito y modelo de despliegue

Margarita opera WhatsApp Business Cloud API para una empresa por instalación. Administra conversaciones, agentes, contactos, campañas, plantillas sincronizadas desde Meta, automatizaciones opcionales y tareas operativas. Usa PostgreSQL y puede desplegarse en Railway.

No es un CRM de ventas, no crea ni aprueba plantillas de Meta, no garantiza consentimiento del contacto y no constituye una plataforma multiempresa dentro de una misma instalación. Meta factura sus cargos de mensajería por separado.

El sitio de producto (`landing/`) y la demo Go (`margaritademo`) son proyectos/servicios independientes. No confundirlos con el panel conectado a las credenciales y base de datos de la instalación.

## 2. Interfaz y arquitectura web

El panel autenticado de uso normal está en `/panel/admin/*` y `/panel/agent/*`, construido con Angular en `frontend/`. Express sirve el shell compilado y provee las rutas JSON, autenticación, autorización por rol, reglas de negocio e integración con Meta.

**La aplicación aún contiene vistas EJS activas.** Se usan en el asistente de configuración, ciertas páginas públicas y de acceso, y rutas explícitas de compatibilidad de conversaciones y dashboard (`/legacy`). Algunas rutas de compatibilidad también devuelven JSON cuando las consume Angular. Las vistas listadas en `src/views/legacy-unused/` están archivadas y no tienen llamadas de renderizado. Tailwind/CSS conserva la compilación necesaria para las vistas EJS activas.

Por eso, el estado correcto es: **Angular es el frontend operativo principal; EJS no se ha retirado por completo.** Eliminar EJS exigiría sustituir y verificar las rutas públicas, el login/configuración y las vistas legacy, además de quitar el motor y su pipeline de estilos.

## 3. Roles y permisos

| Rol | Alcance |
| --- | --- |
| `ADMIN` | Configuración del espacio de trabajo, números, contactos, equipo, campañas, reportes y conversaciones. |
| `AGENT` | Conversaciones asignadas y sin asignar según las reglas de la bandeja; sin configuración administrativa. |

El acceso se valida en el servidor. La aplicación mantiene sesiones revocables, límites de sesión y segundo factor configurable. Los agentes tienen estados operativos (disponible, ocupado, descanso o desconectado); el inicio de sesión no los declara disponibles automáticamente.

## 4. Funciones de operación

### Conversaciones

- Recepción de mensajes por webhook firmado, deduplicación por identificador de Meta y actualización de estados de entrega.
- Asignación, reclamación, cierre y reapertura; historial y notificaciones en tiempo real.
- Total de mensajes sin leer reflejado en el título de la pestaña y sonidos opcionales configurables por usuario.
- Respuestas manuales, notas internas, plantillas cuando corresponda, respuestas rápidas, botones/listas compatibles y medios.
- Las respuestas rápidas pueden guardar texto, hasta 3 botones o listas de hasta 10 opciones. Se validan con los mismos límites de WhatsApp; las listas requieren estar habilitadas en la configuración del espacio.
- Ventana de 24 horas aplicada en el servidor para texto libre.
- Reacciones y acciones de leído/escribiendo cuando existe un mensaje entrante compatible.
- Bloqueo de contacto en WhatsApp desde la conversación y desde la lista administrativa del número. La conversación muestra si el contacto está bloqueado y permite desbloquearlo.
- Opt-out interno independiente del bloqueo de WhatsApp. Un contacto dado de baja no debe incluirse en envíos de campaña.

El indicador de bloqueo local se actualiza después de que Meta acepta la operación solicitada desde Margarita. Una modificación hecha directamente en Meta puede dejarlo desactualizado hasta que el equipo sincronice o vuelva a gestionar ese contacto desde la lista de bloqueados. El bloqueo de WhatsApp es específico del número empresarial que se utiliza.

### Contactos y campañas

Contactos, etiquetas, consentimiento declarado y bajas; campañas a partir de contactos o archivos, con variables, programación, cola, pausa y reintento de fallidos. La aplicación registra el estado reportado por Meta; no promete entrega cuando el proveedor rechaza un destinatario o una plantilla.

### IA y flujos

La IA puede operar como sugerencias o como respuesta automática acotada cuando el operador la habilita y configura proveedor, límites, presupuesto y base de conocimiento. Puede entregar el hilo al equipo. Flujos guiados deterministas son una función separada. La IA no debe describirse como un agente que responde cualquier consulta ni que toma decisiones comerciales fuera de las reglas configuradas.

### WhatsApp y operación administrativa

La sección WhatsApp administra credenciales cifradas y números, sincroniza plantillas y ofrece operaciones de perfil empresarial, salud y usuarios bloqueados, además de medios. Los datos de calidad/estado reflejan lo que devuelve Meta y pueden cambiar fuera del ciclo de despliegue de Margarita.

Hay bitácora, respaldos, sesiones, reportes y herramientas de administración. Las métricas de costos de WhatsApp son estimaciones si se habilitan tarifas configurables; la facturación oficial corresponde a Meta.

## 5. Datos y seguridad

- PostgreSQL mediante Prisma; cambios de esquema deben incluir una migración versionada.
- Campos sensibles (por ejemplo, teléfonos y contenido de mensajes) se cifran en reposo; algunos campos buscables usan índice ciego para coincidencia exacta.
- Secretos de Meta y credenciales de la aplicación deben vivir en el gestor de variables del entorno y nunca en el repositorio.
- La firma del webhook se valida antes de procesar eventos.
- Los archivos se autorizan mediante sesión y relación con mensajes del espacio de trabajo. El almacenamiento local de medios y respaldos requiere un volumen persistente en producción; R2 puede configurarse como almacenamiento adicional.
- Los respaldos cifrados no sustituyen una prueba periódica de restauración.

La seguridad operativa depende también de la configuración de Railway, permisos de Meta, rotación y resguardo de claves, HTTPS y controles de acceso al volumen. Un endpoint `/health` exitoso por sí solo no demuestra que todos esos controles estén correctamente configurados.

## 6. Límites conocidos

- El estado de lectura es por conversación, no por miembro del equipo.
- La búsqueda de datos cifrados es exacta en campos con índice ciego; no implica búsqueda de texto parcial.
- La asignación y visibilidad no son permisos configurables por cada número de WhatsApp.
- Los adjuntos alojados por Meta pueden dejar de estar disponibles pasado su periodo de retención; la descarga local depende de que el archivo aún pueda recuperarse.
- Las grabaciones enviadas como audio convencional no son necesariamente burbujas de nota de voz PTT.
- Opt-in registra información declarada por el equipo; la aplicación no verifica por sí misma la base legal del consentimiento.
- Un teléfono, token, calidad, nombre o estado comercial dependen de Meta y pueden cambiar sin cambios en el código.
- EJS continúa como dependencia y motor activo para las rutas detalladas arriba; no afirmar que fue eliminado.

## 7. Configuración de producción

Partir de `.env.example` y revisar, como mínimo:

- `DATABASE_URL`, `APP_URL`, `NODE_ENV`, `PORT`, `TIMEZONE`.
- `JWT_SECRET`, `ENCRYPTION_KEY`, nombre y duración de cookie.
- Credenciales y configuración del webhook de Meta (`META_*`, `META_API_VERSION`).
- `MEDIA_STORAGE_DIR`, `BACKUP_DIR`, retención de copias y volumen persistente.
- Límites de sesión, intentos de login, rate limiting y token opcional de healthcheck.
- Variables de proveedor y límites de IA solo si se habilita esa función.
- Configuración R2 solo si las cuatro credenciales/campos R2 requeridos están presentes.

No copiar valores secretos a tickets, commits, capturas o documentación. Los nombres exactos y defaults vigentes están en `src/config/app.config.ts` y `.env.example`.

### Publicación

1. Crear una rama y revisar el diff; incluir migraciones para cambios de base de datos.
2. Ejecutar build, verificación de tipos y las suites relevantes con una base de pruebas desechable.
3. Desplegar en un entorno de prueba y comprobar login, webhook, envío/recepción, volumen y logs.
4. Integrar a la rama de producción según el flujo del repositorio y confirmar el commit/despliegue en Railway.
5. Revisar `/health`, el panel, estado de Meta y tareas de fondo tras el despliegue.

La configuración concreta de Railway puede cambiar. Confirmar dominio, volumen, variables y despliegue desde Railway al momento de cada publicación, en vez de tratar valores históricos de este documento como garantía.

## 8. Comandos de verificación

```sh
npm test
npx tsc --noEmit
npm run build
npm run test:integration
```

`npm run test:integration` requiere PostgreSQL de pruebas y secretos de prueba; no debe apuntarse a la base de producción. El build ejecuta la generación de Prisma, compilación de CSS, Angular y TypeScript. CI puede ejecutar comprobaciones adicionales de migraciones.

## 9. Referencias para mantener este documento

- Variables y valores por defecto: `.env.example` y `src/config/app.config.ts`.
- Endpoints y autorización: `src/routes/` y `src/controllers/`.
- Reglas y llamadas a Meta: `src/services/`.
- Esquema e historial de cambios: `prisma/schema.prisma` y `prisma/migrations/`.
- Interfaz Angular: `frontend/src/app/`.
- Vistas EJS activas y archivadas: `src/views/` y `src/views/legacy-unused/`.
