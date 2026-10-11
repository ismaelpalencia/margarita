# Roadmap V2 — Margarita

Plan de los siguientes sprints después de la V1, con el contexto actual: **instalación single-tenant, para producción real y uso personal de una empresa**. Nada de multi-tenant, billing ni SuperAdmin por ahora.

Cada sprint tiene un objetivo, el detalle técnico y cómo se verifica que quedó bien.

---

## Sprint 33 — Endurecimiento para producción

**Estado: completado.**

Objetivo: que la app aguante un fallo sin perder mensajes de clientes y que las credenciales y los accesos estén protegidos de verdad.

### Lo que se implementó

| Área | Qué se hizo |
| --- | --- |
| Cola de webhooks | El endpoint valida la firma, guarda el payload en `WebhookEvent` y responde `200` en milisegundos. Un worker procesa la cola con backoff exponencial (1s, 2s, 4s… máx. 5 min) y hasta `WEBHOOK_MAX_ATTEMPTS` intentos. Los eventos interrumpidos en `PROCESSING` vuelven a la cola a los 5 minutos. Si el payload no se puede guardar, se responde `500` para que Meta reintente. |
| Cifrado de credenciales | `accessToken` y `verifyToken` se guardan con AES-256-GCM (`ENCRYPTION_KEY`). El objeto que consume la vista ya no incluye los valores en claro. Las credenciales en texto plano se migran con el botón del panel o con `npm run db:encrypt-secrets`. |
| Rotación de credenciales | Pantalla nueva en `/admin/whatsapp` para editar número, IDs, versión de API y tokens sin tocar la base ni volver a correr el seed. |
| Bloqueo de login | Limite propio de 10 intentos por 15 minutos por IP, más bloqueo de cuenta (`LOGIN_LOCK_MINUTES`) tras `LOGIN_MAX_ATTEMPTS` fallos. Los intentos, los bloqueos y los accesos correctos quedan auditados. |
| CSRF y contraseñas | Toda petición que cambia estado debe traer un `Origin`/`Referer` que coincida con `APP_URL`. Política mínima de contraseñas al crear o editar agentes: 10 caracteres, letras y números, sin contraseñas obvias. |
| Retención y redacción | La bitácora se purga a los `LOG_RETENTION_DAYS` días y los eventos resueltos a los `WEBHOOK_EVENT_RETENTION_DAYS`. Antes de guardar, se redacta cualquier campo que parezca credencial. |
| Observabilidad | `/health` reporta base de datos, profundidad de la cola, antigüedad del pendiente más viejo, estado del worker y variables de seguridad faltantes. Devuelve `503` solo si la base está caída. Con `ALERT_WEBHOOK_URL` cada error de nivel `ERROR` dispara un aviso externo con enfriamiento. |
| Resiliencia | Los errores no manejados y las excepciones no capturadas se registran y se avisan sin tumbar el servicio, porque Express 4 no propaga los errores de los handlers asíncronos. Si a la base le faltan migraciones, `/health` lo reporta con una pista accionable en lugar de morir en un ciclo de reinicios. |
| Migraciones | `prisma/migrations` con la migración inicial y la del endurecimiento. |
| Tests y CI | 38 tests unitarios de las piezas críticas y workflow de GitHub Actions que corre validación de esquema, tipos, tests y build. |

### Verificación

Prueba de integración contra una base real: 22 de 22 comprobaciones en verde, incluyendo que el webhook responde en menos de 10 ms, que el worker guarda el mensaje, que el evento termina en `PROCESSED` y que el mensaje llega en vivo al navegador después de pasar por la cola.

### Variables nuevas

`ENCRYPTION_KEY`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `LOG_RETENTION_DAYS`, `WEBHOOK_EVENT_RETENTION_DAYS`, `WEBHOOK_QUEUE_ENABLED`, `WEBHOOK_WORKER_INTERVAL_MS`, `WEBHOOK_MAX_ATTEMPTS`, `ALERT_WEBHOOK_URL`, `ALERT_COOLDOWN_MINUTES`.

---

## Sprint 34 — Multimedia entrante (fotos, audio y documentos)

**Estado: pendiente.** Es el que más se nota en el día a día: hoy el agente ve `[Imagen]` en lugar de la foto.

### Cómo funciona la multimedia de Meta (y qué se puede y qué no)

Cuando un cliente manda una foto, el webhook **no** trae un enlace: trae un `mediaId`. Para ver el archivo hay que pedir `GET /{media-id}` con el access token, y Meta responde con una URL y sus metadatos. Esa URL:

- **Caduca en minutos**, no en horas. No es algo que se pueda "extender a 12 horas".
- **Exige el access token en la petición.** Un `<img src="...">` no puede mandar cabeceras, así que esa URL no se puede usar directamente en el navegador: hay que descargar los bytes del lado del servidor y reenviarlos.

Lo que **sí** es estable es el `mediaId`, que ya guardamos en `Message`. Meta conserva el archivo alrededor de 30 días, y dentro de ese plazo se puede pedir una URL nueva cuantas veces haga falta.

### Decisión: descarga bajo demanda con caché

En lugar de bajar cada archivo cuando llega el webhook (que además alarga el procesamiento y llena el disco de cosas que nadie va a ver), se resuelve cuando alguien abre la conversación:

1. El agente abre el hilo y el mensaje tiene `mediaId` sin archivo local.
2. El servidor pide la URL a Meta, descarga los bytes con el token y los guarda en el almacenamiento local.
3. A partir de ahí se sirven desde disco, instantáneo, y se les puede generar miniatura.
4. Si el archivo ya pasó su ventana de vida en Meta y nunca se descargó, el mensaje lo dice claro ("el archivo ya no está disponible") en vez de mostrar un error críptico.

Ventajas: no hay que configurar bucket alguno para empezar, solo se guarda lo que alguien miró, y el webhook sigue respondiendo en milisegundos.

### Paso 2: dónde viven los archivos

El disco de Railway es efímero, así que la caché necesita un **Volume** montado en `/data/media` (o, más adelante, un bucket S3/R2). El acceso queda detrás de `src/services/media-storage.service.ts` para que cambiar de Volume a bucket sea configuración y no reescritura.

Variables previstas: `MEDIA_STORAGE_DIR` (por defecto `/data/media`), `MEDIA_CACHE_DAYS` (cuánto se conserva lo cacheado sin uso) y, si algún día se usa bucket, `STORAGE_*`.

### Paso 3: servirlos al agente

Endpoint autenticado `/media/:messageId` que valida que el usuario pueda ver esa conversación (un agente, solo las asignadas a él) y reenvía los bytes. El token de Meta nunca llega al navegador y ningún archivo es público.

### Paso 4: interfaz

Miniaturas en el hilo, visor a pantalla completa, indicador de descarga y un límite de tamaño visible. Para audio, un reproductor simple; para PDF, un enlace de descarga.

### Modelo de datos

Campos nuevos en `Message`: `mediaPath` (ruta en la caché), `mediaSize`, `mediaFilename`, `mediaDownloadedAt` y `mediaDownloadError`. Así el hilo sabe en qué estado está cada archivo sin consultar a Meta en cada carga.

### Criterios de aceptación

- Un cliente manda una foto y el agente la ve en el hilo, en producción, sin recargar la página.
- La imagen se descarga una sola vez y sobrevive a un redeploy (queda en el Volume).
- Un archivo de más de 30 días que nadie abrió muestra un aviso claro, no un error.
- Ningún archivo es accesible sin sesión válida.
- Si la descarga desde Meta falla, el mensaje queda igual guardado y se puede reintentar desde el hilo.

---

## Sprint 35 — Envío con multimedia e interactivos

**Estado: pendiente.**

| Función | Detalle |
| --- | --- |
| Envío de imagen y documento | Dentro de la ventana de 24 horas, subiendo el archivo a `POST /{phone_number_id}/media` o enviando por link. |
| Plantillas con encabezado de imagen | Es lo que realmente usan las campañas con foto: el mensaje de plantilla lleva un `header` de tipo `IMAGE` con media ID o URL. |
| Botones y listas | Enviar mensajes interactivos dentro de las 24 horas y procesar la respuesta: hoy un botón entrante se guarda como `[Mensaje interactivo]` genérico, sin saber qué eligió el cliente. |
| Respuestas rápidas | Textos guardados que el agente inserta con un clic. Ahorra muchísimo tiempo en operación real. |

### Criterios de aceptación

- Un agente envía una foto y llega al WhatsApp del cliente.
- Una campaña con encabezado de imagen sale desde una plantilla aprobada.
- Cuando el cliente toca un botón, la conversación muestra qué opción eligió.

---

## Backlog posterior

Estas no bloquean nada y se priorizan según lo que pida la operación:

1. **Variables de plantilla en encabezado y botones** (el cuerpo ya se resuelve por contacto).
2. **Envío de campañas en cola** con control de velocidad: hoy es secuencial dentro de la petición HTTP. Depende de un runner de trabajos; la infraestructura de la cola de webhooks ya sirvió de ensayo.
3. **Programar campañas** por fecha y hora, pausar y cancelar.
4. **Límites de mensajes manuales**: `canSendManualMessages`, `manualMessageLimit` y `manualMessagesUsed` se configuran pero todavía no se aplican.
5. **Opt-in y BAJA/STOP**: campo de consentimiento en `Contact` y baja automática al detectar la palabra clave.
6. **Salud de la cuenta**: procesar `message_template_status_update` y `phone_number_quality_update`, y alertar cuando Meta rechace una plantilla o baje la calidad.
7. **Normalización de teléfonos** para números fuera de México.
8. **Reportes**: métricas por campaña y exportación a Excel.
9. **Escalado a varias réplicas**: adaptador de Redis para socket.io y para la cola.

## Lo que sigue fuera de alcance

Multi-tenant con SuperAdmin, billing, integración con CRM externo, IA o chatbot, y cualquier cosa que compita por tiempo antes de que la operación actual esté sólida.
