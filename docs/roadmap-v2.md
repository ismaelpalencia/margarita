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

**Estado: completado.** El agente ya ve las fotos, el audio y los documentos que envían los clientes.

### Lo que se implementó

| Área | Qué se hizo |
| --- | --- |
| Almacenamiento | `src/services/media-storage.service.ts` guarda los archivos en `MEDIA_STORAGE_DIR` (un Volume en producción) con la ruta `workspace/mensaje.ext`, valida que nada se salga de la carpeta y limita el tamaño descargado. |
| Descarga | `src/services/media.service.ts` pide a Meta la dirección temporal del `mediaId`, descarga los bytes con el token y los guarda. Las **imágenes** se descargan al recibir el mensaje; el audio y los documentos, cuando alguien los abre. |
| Endpoint | `GET /media/:messageId` exige sesión y valida que el usuario pueda ver esa conversación. Responde en línea o como descarga (`?download=1`), con caché privada de un día. |
| Interfaz | Burbuja compartida (`partials/message-bubble.ejs`): imagen con visor a pantalla completa, video y audio con controles, documentos como tarjeta de descarga. También para los mensajes que llegan en vivo. |
| Errores | Si la descarga falla, el motivo queda en el mensaje y en la bitácora (`MEDIA_DOWNLOAD_FAILED`), y el hilo ofrece un enlace para reintentar. |

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

## Sprint 36 — Experiencia de conversación

**Estado: completado.**

| Área | Qué se hizo |
| --- | --- |
| Diseño del chat | Hilo con burbujas entrantes y salientes, separadores de fecha ("Hoy", "Ayer"), palomitas de estado reales (✓, ✓✓, ✓✓ azul para leído, ⚠ para fallo) y barra de composición al pie con la ventana de 24 horas visible. |
| Errores discretos | Un mensaje fallido ya no muestra un bloque rojo enorme: aparece una línea corta con "⚠ No se pudo entregar" y el motivo completo en el tooltip. El admin además tiene un enlace a Logs. |
| Borrado suave | Ocultar un mensaje del chat (agente o admin) sin destruirlo. El admin los ve con "Ver eliminados" y puede restaurarlos. Todo auditado. |
| Borrado total | El admin puede vaciar una conversación escribiendo `BORRAR` para confirmar. Se registra en la bitácora con el número de mensajes eliminados. |
| Respaldos | Página `/admin/backup` con descarga completa en JSON y exportaciones CSV por entidad, con BOM para Excel. Excluye credenciales y contraseñas. |

---

## Sprint 40 — Listo para entregar a un cliente

**Estado: completado.**

| Área | Qué se hizo |
| --- | --- |
| Alta sin consola | `/setup` crea la empresa y el administrador en un despliegue vacío, y Admin → WhatsApp permite configurar la cuenta de Meta y el primer número. El asistente se cierra solo cuando existe un workspace. |
| Cierre de contrato | Borrado total de la instalación escribiendo su identificador: elimina datos, credenciales y archivos, y deja constancia en la bitácora global. |
| Versión visible | `/health` y Admin → Sistema reportan versión y commit, para saber qué corre cada instalación desplegada. |
| Documentación | Runbook de alta por cliente, actualización de instalaciones, cierre y paquete legal en [`modelo-comercial.md`](modelo-comercial.md). |

---

## Sprint 39 — Salud de la cuenta y campañas en cola

**Estado: completado.**

| Área | Qué se hizo |
| --- | --- |
| Avisos de plantillas | Se procesa `message_template_status_update`: la plantilla cambia de estado en el panel y el aviso queda en la bitácora con su motivo. Los casos que exigen atención (rechazada, pausada, deshabilitada, marcada) se registran como advertencia. |
| Calidad de los números | Se procesa `phone_number_quality_update`: el número queda marcado o vuelve a la normalidad, se guarda su nivel de mensajería y el aviso sale como error para que dispare la alerta externa si está configurada. |
| Campañas en cola | El inicio solo marca la campaña como en curso y responde en milisegundos; un worker envía por lotes con una pausa entre mensajes, así que una lista grande ya no depende de la petición HTTP. |
| Control del envío | Pausar, reanudar y cancelar. Al pausar se conservan los pendientes; al cancelar quedan como omitidos. La pausa surte efecto en cuanto llega, con cuando mucho un mensaje ya en vuelo. |
| Avance en vivo | La pantalla de la campaña recibe el avance por socket y actualiza los contadores sin recargar. |

---

## Sprint 38 — Multinúmero (varios números de la misma WABA)

**Estado: completado.** El detalle está en [`multinumero.md`](multinumero.md).

| Área | Qué se hizo |
| --- | --- |
| Modelo | La cuenta guarda las credenciales de la WABA y cada número su identidad, calidad y estado. La conversación pasa a ser única por `(número, contacto)`. |
| Migración | Conserva los datos: el número existente se copia como el primero y las conversaciones y campañas se reasignan a él. |
| Número activo | Selector en el encabezado, guardado en cookie. Toda la bandeja, las conversaciones nuevas y las campañas trabajan desde ese número. |
| Pantalla de números | Alta, edición, activación, prueba de conexión y calidad por número en Admin → WhatsApp. |
| Envío | Cada mensaje sale del número de su conversación; las campañas, del número con el que se crearon. |

**Pendiente de este bloque:** asignar números a agentes (tabla `UserNumber`), repartir campañas entre números y métricas por número.

---

## Sprint 37 — Envío de archivos

**Estado: completado.**

| Área | Qué se hizo |
| --- | --- |
| Subida | `uploadMediaToMeta` sube el archivo a Meta con `multipart/form-data` y devuelve el `media id` con el que se envía. |
| Tipos | Imágenes (JPG/PNG), video (MP4/3GPP), audio (MP3/OGG/AMR/AAC/MP4) y documentos (PDF, Word, Excel, PowerPoint, texto), con los límites de Meta por tipo validados antes de subir. |
| Interfaz | Botón "Adjuntar imagen o documento" en el compositor, con texto opcional (el audio no lo admite), visible solo dentro de la ventana de 24 horas. |
| Trazabilidad | El archivo queda también en el almacenamiento local, así que aparece en el hilo aunque Meta falle, y el envío se audita como `MESSAGE_SENT` o `MESSAGE_FAILED`. |
| Limpieza | El temporal de la subida se borra siempre, incluso cuando el envío se rechaza antes de subir. |

---

## Sprint 41 — Cifrado de los datos personales en reposo

**Estado: completado.** Se hizo antes de vender instalaciones a terceros: si un cliente contrata el uso, un volcado de su base no debe exponer su operación.

| Área | Qué se hizo |
| --- | --- |
| Mecanismo | Extensión de Prisma (`$allOperations`) que cifra al escribir y descifra al leer, sin tocar los servicios ni las vistas. AES-256-GCM con `ENCRYPTION_KEY`, la misma llave que ya cifraba las credenciales de Meta. |
| Campos | `Contact.phone`, `Contact.notes`, `Message.body`, `Message.mediaFilename`, `Message.metaPayload`, `Message.metaResponse`, `CampaignRecipient.phone`, `CampaignRecipient.variables`, `WhatsAppNumber.phoneNumber`, `Log.payload` y `WebhookEvent.payload` (el evento crudo de Meta), además de los tokens de Meta que ya estaban cubiertos. Los objetos se guardan como texto cifrado con el prefijo `encj:v1:`. |
| Búsqueda por teléfono | `Contact.phoneHash`: índice ciego (HMAC-SHA256) que conserva la unicidad y la búsqueda exacta sin guardar el número en claro. La búsqueda por coincidencia parcial del teléfono ya no existe y la pantalla de Contactos lo explica. |
| Migración sin cortar el servicio | La columna `phoneHash` se agrega con un marcador temporal (`legacy:<id>`) y la aplicación recalcula el índice real al arrancar, antes de atender webhooks. Los textos sin cifrar anteriores se leen tal cual, así que no hubo ventana de datos rotos. |
| Cifrado del histórico | `npm run db:encrypt-data` cifra lo que quedó en claro (teléfonos, mensajes, bitácora, destinatarios, números y credenciales). Es idempotente y paginado. |
| Verificación en el panel | Admin → Sistema ahora muestra una tarjeta de **Cifrado en reposo** con los registros que quedaron en claro, y WhatsApp reporta si las credenciales están cifradas leyendo la columna cruda (antes lo comprobaba sobre el valor ya descifrado, así que siempre decía que no). |

### Verificación

- 17 pruebas unitarias nuevas de cifrado, índice ciego, traducción de búsquedas y descifrado de resultados anidados.
- Contra una base real: la migración conservó los contactos existentes, el arranque recalculó los índices, el alta de contactos y el webhook guardaron todo cifrado, y la lectura de contactos, mensajes, bitácora, destinatarios y números devolvió exactamente los mismos valores antes y después de cifrar.
- Webhook firmado contra un contacto existente: no se duplicó y el mensaje entrante quedó cifrado en la base.

**Límites de este sprint:** los nombres de contacto y los correos quedan en claro (la búsqueda por texto y el login dependen de ellos), los adjuntos en disco no se cifran y el cifrado es de campos, no del archivo de PostgreSQL.

---

## Sprint 42 — Bajas, límites diarios, respuestas rápidas y no leídos

**Estado: completado.** Cierra los cuatro pendientes operativos que quedaban antes de vender instalaciones: cumplimiento de bajas, control de mensajes manuales y el día a día de la bandeja.

| Área | Qué se hizo |
| --- | --- |
| Baja automática (STOP) | El webhook revisa el primer palabra del mensaje entrante contra `OPT_OUT_KEYWORDS` (por defecto `STOP`). Si coincide, el contacto queda dado de baja, se registra en la bitácora con nivel de advertencia y el evento en vivo recarga el hilo para mostrar el aviso. |
| Bloqueo real de envíos | Un contacto dado de baja no recibe nada: ni respuestas manuales (texto, plantilla, archivo) ni campañas. Las campañas lo excluyen al crearse y, si la baja llega después, el worker marca al destinatario como `SKIPPED` con el motivo. |
| Consentimiento | `Contact.optInAt` / `optOutAt` / `optOutSource`. La ficha del contacto permite registrar el opt-in, marcar la baja a mano y reactivar (queda auditado). La ficha de campaña avisa cuántos destinatarios no tienen consentimiento registrado, sin bloquear: la responsabilidad legal es del operador. |
| Límites manuales | `canSendManualMessages` y `manualMessageLimit` (por día, hora local de la empresa) se validan al enviar, con el mensaje del motivo tal cual. El uso se calcula contando mensajes enviados, no un acumulado, por lo que se reinicia solo; se ve en Admin → Agentes y en el panel del agente. Se eliminó `User.manualMessagesUsed`. |
| Notas internas | `Message.isInternalNote`: se marcan al crearse, se pintan distinto en el hilo y no cuentan para el tope diario. La migración marcó las notas que ya existían. |
| Respuestas rápidas | Modelo `QuickReply` con CRUD en Admin → Respuestas, texto cifrado, `{nombre}` y `{telefono}` resueltos en el navegador, y un selector de un clic en el compositor del admin y del agente. |
| No leídos | `Conversation.unreadCount`, que suma con cada mensaje entrante y se limpia al abrir el hilo. El encabezado muestra el total del número activo y la bandeja marca cada hilo con pendientes, en vivo. |
| Búsqueda y filtros en la bandeja | Búsqueda por nombre (parcial) o teléfono (exacta, por índice ciego), filtros por estado y por asignación, y "solo sin leer". |
| Defensa del cifrado | La extensión ahora falla con una explicación si una consulta intenta filtrar por un campo cifrado (`body`, `payload`, `variables`…), en lugar de devolver cero filas en silencio. |

### Verificación

- 10 pruebas unitarias nuevas de palabras de baja (acentos, signos, "STOP por favor", frases donde la palabra no encabeza) y de la defensa contra filtros imposibles.
- 31 comprobaciones contra una base real: webhook con STOP → baja, bitácora y no leído; hilo con aviso, sin compositor y con envío bloqueado; campaña con puros bajas rechazada y campaña mixta con 1 excluido; reactivación con consentimiento; agente sin permiso bloqueado; uso diario contando solo envíos reales y bloqueo al llegar al tope; pantallas del agente y del admin.

---

## Sprint 43 — Reportes de gestión y cobranza

**Estado: completado.** El diseño está en [`reportes-cobranza.md`](reportes-cobranza.md).

| Área | Qué se hizo |
| --- | --- |
| Resultado de gestión | Modelo `ContactOutcome` (historial, de solo agregar) más el estado vigente denormalizado en `Contact`: tipo, monto, fecha compromiso, fecha de pago y quién lo marcó. |
| Catálogo | `PROMISE`, `PAID`, `CONVENIO`, `PROMISE_BROKEN`, `NO_ANSWER`, `WRONG_NUMBER`, `NOT_INTERESTED`, `CALLBACK`, `OTHER`. |
| Promesa incumplida | **No se guarda sola.** Una promesa o convenio con fecha pasada se muestra como vencida (con los días de atraso) porque se deduce de `outcomeDueAt`; `PROMISE_BROKEN` es la confirmación de una persona. Si el cliente paga después, marcar pagado la resuelve sin deshacer nada. |
| Intentos | Calculados con los mensajes: salientes que no fallaron y no son notas internas, posteriores al último mensaje del cliente. Una respuesta reinicia el contador. Umbral en `OUTCOME_NO_ANSWER_ATTEMPTS` (3 por defecto). |
| Marcado | Desde el hilo (admin y agente), desde la ficha del contacto y **en bloque** desde la lista, con monto, fecha compromiso, fecha de pago y nota. Todo auditado. |
| Filtros en Contactos | Resultado, promesas vencidas, sin resultado, intentos mínimos y "nunca respondió", además de los que ya existían. |
| Reportes | Cuatro vistas en Admin → Reportes (gestiones, promesas, sin contestación y detalle), con filtros por fecha, persona, campaña y etiqueta, tarjetas del periodo y exportación CSV. |
| Cifrado | El monto y la nota van cifrados (también en el historial); el tipo y las fechas quedan en claro porque los reportes agrupan y filtran por ellos. Las sumas se hacen en la aplicación, no en SQL. |
| Robustez | Al probar los reportes apareció un problema de fondo: un controlador `async` que lanza dejaba la **petición colgada** (Express 4 no atiende promesas rechazadas). Se parcheó el despacho de Express para que el rechazo llegue al manejador de errores: ahora responde 500, queda en la bitácora y dispara alertas. |

### Verificación

- 10 pruebas unitarias nuevas: atraso en días completos, vencida derivada, montos escritos a mano, fecha compromiso a medianoche local, clasificación de promesas (a tiempo, tarde, sin pago), y que un pago no cumpla dos promesas ni cuente si fue anterior.
- 36 comprobaciones contra una base real (servicio y pantallas) más capturas de las tres pantallas nuevas.

---

## Sprint 44 — Fase 3 de reportes, sesiones y giro a cobranza

**Estado: completado.** Cierra el módulo de cobranza, endurece las sesiones y cambia el posicionamiento comercial.

| Área | Qué se hizo |
| --- | --- |
| Lista del día | Vista **Hoy** en Reportes: promesas vencidas con monto, compromisos de hoy, de la semana y clientes sin contestar, en orden de urgencia y con acceso directo a la ficha. |
| Tendencias | Vista **Tendencias**: gestiones, promesas, prometido, pagos y cobrado semana a semana, más el cumplimiento de promesas por persona. |
| Sesiones | Cierre por inactividad (`SESSION_IDLE_MINUTES`, 12 h), tope de dispositivos por usuario (`SESSION_MAX_ACTIVE`, 3) con cierre de la más vieja, lista visible con dispositivo, IP y última actividad, y revocación individual o masiva. El admin ve las de toda la empresa; el agente, las suyas. |
| Limpieza | El job de retención marca inactivas las sesiones vencidas o abandonadas (no las borra: sirven para auditar). |
| Posicionamiento | La página pública (`/`) y la guía (`/como-empezar`) se reescribieron para **cobranza**: qué hace la herramienta, cómo se pone a andar, los nueve pasos de Meta con sus tropiezos comunes y la oferta de conexión con precio configurable. |
| Paquete comercial | [`propuesta-comercial.md`](propuesta-comercial.md) lista para llenar, [`guia-meta.md`](guia-meta.md) para el cliente y [`modelo-comercial.md`](modelo-comercial.md) con posicionamiento, paquetes y el flujo para mandar propuestas. |

### Decisión sobre las IP

**No se ata la sesión a una IP.** En datos móviles y en redes de oficina con salida compartida la IP cambia sola durante el día; bloquear por IP dejaría fuera a la gente legítima y no detendría a un atacante con la contraseña. En su lugar: cierre por inactividad, tope de dispositivos, lista visible con IP y dispositivo, y revocación con un clic.

### Verificación

- 6 pruebas unitarias nuevas (identificación de dispositivo y cierre por inactividad).
- 13 comprobaciones de sesiones contra una base real: tope de dispositivos (la más vieja queda fuera), cierre masivo, acceso sin cookie y lista con la sesión actual marcada; más el cierre por inactividad verificado moviendo la fecha de la sesión 13 horas atrás.
- Capturas de la pantalla de sesiones, de la lista del día y de la página pública.

---

## Backlog del Sprint 35 (interactivos)

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
2. **Programar campañas** por fecha y hora (pausar y cancelar ya están).
3. **Botones y listas interactivas**: enviarlos e interpretar la respuesta.
4. **Normalización de teléfonos** para números fuera de México.
5. **Reportes**: métricas por campaña y por número.
6. **Asignar números a agentes** y **repartir campañas entre números**.
7. **No leídos por persona** (hoy el contador es por conversación).
8. **Registro formal del opt-in**: quién lo dio, cuándo y por qué canal.
9. **Escalado a varias réplicas**: adaptador de Redis para socket.io y para las colas.

> Respuestas rápidas, contador de no leídos, límites manuales y opt-in/BAJA se cerraron en el Sprint 42; el cifrado en reposo, en el 41.

## Lo que sigue fuera de alcance

Multi-tenant con SuperAdmin, billing, integración con CRM externo, IA o chatbot, y cualquier cosa que compita por tiempo antes de que la operación actual esté sólida.
