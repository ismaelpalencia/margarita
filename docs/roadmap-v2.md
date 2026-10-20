# Roadmap V2 — Margarita

Plan de los siguientes sprints después de la V1, con el contexto actual: **instalación single-tenant, para producción real y uso personal de una empresa**. Nada de multi-tenant, billing ni SuperAdmin por ahora.

Cada sprint tiene un objetivo, el detalle técnico y cómo se verifica que quedó bien.

> **Documento histórico.** Aquí se registra cómo se hizo cada sprint y qué se
> sabía en ese momento. El estado vigente —qué hace la app hoy y qué falta— es
> [`alcance-produccion.md`](alcance-produccion.md); si hay diferencia, manda ese
> documento.

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

**Límites de este sprint:** los nombres de contacto quedaron en claro (la búsqueda por texto depende de ellos; los correos se cifraron después, en el Sprint 50), los adjuntos en disco no se cifran y el cifrado es de campos, no del archivo de PostgreSQL.

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

## Sprint 45 — Respaldos automáticos con restauración probada

**Estado: completado.** Cierra el único punto que podía convertir un incidente en pérdida definitiva.

| Área | Qué se hizo |
| --- | --- |
| Copia automática | Cada `BACKUP_INTERVAL_HOURS` (24 h por defecto) se guarda una copia completa de la base en `BACKUP_DIR`, comprimida con gzip y cifrada con `ENCRYPTION_KEY`. El job revisa cada 15 minutos **si el último respaldo ya cumplió el intervalo**, así que un reinicio no salta el turno. |
| Verificación al crearse | Cada copia se relee y descifra al terminar de escribirla. Si no se puede leer, el respaldo no se da por bueno y queda como error (con alerta externa si está configurada). |
| Contenido | Se lee con un cliente **sin** la extensión de cifrado: el archivo guarda los valores tal cual están en la base, así que los campos sensibles siguen cifrados dentro y la restauración es una copia fiel. Quedan fuera `WebhookEvent` (cola transitoria) y `UserSession` (no se resucitan accesos). |
| Retención | Se conservan las últimas `BACKUP_KEEP` (7) copias; las viejas se podan por fecha. |
| Panel | Admin → Respaldos muestra el estado (al día / atrasado / apagado), la carpeta, el tamaño total y la lista de copias con **Descargar** y **Verificar**, más un botón para crear una a mano. Aviso explícito de que la carpeta debe estar en un Volume. |
| Restauración | `npm run db:restore -- --file=<archivo> [--dry-run|--yes]`: valida el archivo, muestra el resumen por tabla, y con `--yes` borra y recarga en orden de dependencias. Repetible si se interrumpe. |
| Observabilidad | `/health` reporta la edad del último respaldo y marca `checks.backupsFresh`; el fallo del job queda en la bitácora como error. |
| Tope de seguridad | Si una tabla supera `BACKUP_MAX_ROWS_PER_TABLE`, el respaldo **falla** en lugar de guardar una copia incompleta: un respaldo a medias es peor que no tenerlo. |

### Verificación

- 7 pruebas unitarias del formato (cifrado, llave distinta, archivo corrupto, nombre, tamaño).
- **Restauración real**: se creó una copia, se borraron **todos** los mensajes y se corrompieron las notas de los contactos; la restauración devolvió los 41 mensajes y las notas originales idénticas (`diff` sin diferencias) y la aplicación siguió leyendo los datos descifrados. En esa prueba saltó un error de orden de inserción (`Message` referencia a `Campaign`) que quedó corregido.
- Retención podando con `BACKUP_KEEP=2`, simulación sin tocar la base, botón de respaldo manual y `/health` con el bloque de respaldos.

---

## Sprint 46 — Varios administradores y recuperación de contraseñas

**Estado: completado.** Cierra lo que un cliente pregunta en la primera reunión: "¿y si el que sabe la contraseña no está?".

| Área | Qué se hizo |
| --- | --- |
| Varios administradores | Admin → **Equipo** lista administradores y agentes; se puede crear con cualquier rol, cambiarlo, activar y desactivar. Antes el panel solo creaba agentes y el único admin era el del alta. |
| Regla del último admin | Nunca se puede dejar la instalación sin un administrador activo: degradar o desactivar al último se bloquea con el motivo a la vista (y el botón aparece deshabilitado). La regla vive en `team-rules.ts`, sin tocar la base, y tiene pruebas. |
| Restablecer contraseña | Un administrador la restablece desde la ficha del usuario (con sugerencia de contraseña temporal). Se cierran **todas** las sesiones de esa persona y, al entrar, el sistema la obliga a cambiarla antes de operar: el administrador no se queda sabiendo la contraseña definitiva de nadie. |
| Cambio propio | Página **Mi cuenta** para ambos roles (dentro y fuera del panel según corresponda): pide la contraseña actual y, al guardar, cierra las demás sesiones. |
| Consola | `npm run admin:reset-password -- --email=…` genera (o recibe) una contraseña temporal, cierra sesiones y fuerza el cambio. Es la salida cuando nadie puede entrar. |
| Sin correo, a propósito | No se montó envío de correo solo para "olvidé mi contraseña": sería un proveedor externo más y otra superficie de ataque para un caso que se resuelve desde el panel o el servidor. Está documentado como límite. |

### Verificación

- 9 pruebas unitarias de las reglas del equipo y del generador de contraseñas.
- 36 comprobaciones contra una base real: segundo administrador que entra y ve todo; degradar con dos admins permitido y con uno bloqueado (incluido desactivar); usuario degradado con 403 en el panel y 200 en el de agente; reseteo que cierra sesiones y obliga al cambio; cambio propio con validaciones; y la consola generando contraseña y forzando el cambio.

---

## Sprint 47 — Alta de un cliente en minutos

**Estado: completado.** El paso más caro del alta dejó de ser configurar variables y rutas: ahora es un enlace.

| Área | Qué se hizo |
| --- | --- |
| Configuración de despliegue | `railway.json` con build (`npm ci --include=dev && npm run build`), migraciones antes de arrancar (`node dist/tools/deploy-migrations.js`), `npm start`, healthcheck en `/health` y política de reinicio. Nada que capturar a mano en el panel. |
| `APP_URL` automática | Si no está definida, se usa `RAILWAY_PUBLIC_DOMAIN`. Era el error número uno del alta (rompía CSRF y la URL del webhook) y ahora es imposible de cometer. |
| Asistente visible | Mientras la instalación no tenga empresa ni administrador, la raíz `/` redirige a `/setup` y el login muestra el aviso con el enlace. Antes había que saber la ruta. |
| Mensaje de error útil | Si falta `DATABASE_URL`, el arranque explica cómo agregar el plugin y la referencia, en lugar de morir con `DATABASE_URL no está definido`. |
| Plantilla y runbook | [`plantilla-railway.md`](plantilla-railway.md): publicar la plantilla (15 minutos, una vez), las variables con las funciones de Railway (`${{secret(64)}}`, `${{Postgres.DATABASE_URL}}`), el Volume en `/data`, la verificación post-deploy y los tropiezos comunes. |
| Ejemplo de entorno | `.env.example` completo, con las variables nuevas (respaldos, sesiones, bajas, campañas, contacto comercial) para el camino manual. |

### Verificación

**Alta completa de una instalación vacía, contra una base real** (con respaldo verificado antes y restauración después):

- Con la base vacía, `GET /` responde 302 hacia `/setup`, el login muestra «Esta instalación todavía no está configurada» con el enlace, y `/health` reporta `adminUserExists: false`.
- Recorriendo el asistente como un cliente nuevo (empresa + administrador), `POST /setup` crea todo y redirige al login con el correo precargado; a partir de ahí `/setup` se cierra solo (redirige al login) y el panel queda operativo: dashboard, equipo, reportes, WhatsApp y respaldos responden 200 con la sesión nueva.
- `APP_URL` se toma de `RAILWAY_PUBLIC_DOMAIN` cuando no hay variable: arrancando sin `.env` y sin `APP_URL` (como en Railway), `/health` reporta `publicUrl: https://despacho-prueba.up.railway.app` y el log explica de dónde salió la URL. Se añadieron 4 pruebas unitarias a `resolveAppUrl`, y una de ellas encontró un caso real: si el proveedor entregara el dominio **con** esquema, se generaba `https://https://…`.
- Después de la prueba se restauró la base desde el respaldo y quedó igual que antes (2 contactos, 41 mensajes, 3 usuarios, 1 campaña).

---

## Sprint 48 — Suite de integración automatizada

**Estado: completado.** Era la deuda técnica de mayor impacto: la verificación de los flujos críticos dependía de scripts que yo escribía, corría y borraba.

| Área | Qué se hizo |
| --- | --- |
| Suite propia | `npm run test:integration`: un runner levanta la aplicación compilada en un puerto aparte (varias pruebas hablan por HTTP: la firma del webhook solo se verifica de punta a punta con el endpoint arriba), corre los archivos `tests/integration/*.test.ts` y apaga la app al terminar. |
| Aislamiento | Cada archivo crea **su propia empresa de prueba** y la borra al final. Como todo el modelo cuelga del workspace, el borrado se lleva contactos, conversaciones, mensajes, campañas y usuarios. Con un candado extra: la limpieza verifica el prefijo del workspace antes de borrar, así un error de programación no puede tocar una instalación real. |
| Pruebas destructivas | El alta desde cero y la restauración de un respaldo necesitan una base vacía: se saltan solas en local y solo corren con `INTEGRATION_DESTRUCTIVE=1`, que es lo que usa CI. |
| CI | Trabajo nuevo `Integración` con PostgreSQL 16 como servicio: aplica las migraciones, verifica tipos (incluidas las pruebas, vía `tsconfig.test.json`), compila y corre la suite. El trabajo original sigue sin base de datos y rápido. |
| Cobertura | 30 pruebas: webhook firmado → cola → worker → mensaje guardado (incluida idempotencia por `wamid` y rechazo sin firma), baja automática por `STOP`, cifrado en reposo comprobado en la columna cruda, campañas con variables y exclusiones, resultados de gestión con promesa vencida y pagos, intentos, sesiones, contraseñas, reglas del último administrador y respaldos. |
| Refactor mínimo | El worker de webhooks exporta `runWebhookWorkerOnce()` para poder procesar la cola de forma determinista en las pruebas, sin esperar a un intervalo. |

### Verificación

- En local contra la base de desarrollo: **28 pruebas en verde y 2 saltadas correctamente** (las destructivas), sin tocar los datos reales (la empresa de prueba se creó y se borró).
- `npm run typecheck:all` cubre también los archivos de prueba.
- En esa primera corrida la suite encontró un fallo mío real (una prueba de poda que asumía el tope por defecto) y sirvió para ajustar el aviso de configuración de los procesos de prueba.

---

## Sprint 49 — Verificación en dos pasos y limpieza de ajustes inertes

**Estado: completado.**

Objetivo doble: quitar de la base lo que prometía funciones que no existían, y cerrar el pendiente de seguridad más grande que quedaba en el alcance de producción (era el punto 3 del «qué sigue»).

### Limpieza: ajustes inertes

`WorkspaceSettings` guardaba ocho columnas que **ningún código leía**: `autoAssign`, `assignmentMode` (dos enums completos), `businessHoursStart/End`, `outOfHoursMessage`, `maxActiveConversations`, `reopenedConversationMode` y `language`. Un administrador podía cambiarlas y no pasaba nada: la peor forma de mentir en un panel.

Se verificó campo por campo que nadie las usaba y se quitaron del esquema y de la base (migración `20261015020000_quitar_ajustes_inertes`). Quedaron solo `timezone` (fechas, topes diarios, reportes) y `maxManualMessages`. En su lugar, el panel documenta la verdad: no hay horarios de atención, la asignación automática es siempre al agente disponible con menos carga y la interfaz es solo en español.

### Verificación en dos pasos (TOTP)

| Área | Qué se hizo |
| --- | --- |
| Implementación | TOTP (RFC 6238) hecho a mano con `node:crypto`: ~40 líneas que evitan sumar una dependencia al despliegue. Se respeta el estándar, así que funciona con Google Authenticator, Authy o Microsoft Authenticator. Verificado contra los vectores del RFC en 8 pruebas unitarias. |
| Secreto cifrado | `User.twoFactorSecret` se guarda con AES-256-GCM por la extensión de cifrado en reposo: un volcado de la base no entrega la clave de nadie. Con índice ciego no hacía falta: nunca se busca por el secreto. |
| Activación en dos pasos | Primero se genera la clave y se muestra; la verificación **no** queda activa hasta confirmar un código. Así nadie se queda fuera por escanear mal, cerrar la pantalla o perder la señal. Una activación a medias se puede descartar. |
| Acceso | La contraseña correcta ya no abre sesión: devuelve un desafío firmado (JWT con `purpose: "2fa"`, 5 minutos) y la sesión se crea solo con el código válido. Los códigos fallidos **cuentan igual que una contraseña fallida**: bloquean la cuenta tras el mismo número de intentos. Sin eso, seis dígitos serían adivinables con paciencia. |
| Ventana | Se acepta un paso de 30 s antes y uno después, por relojes desfasados. |
| Recuperación | Si alguien pierde el teléfono, un administrador la desactiva desde Equipo; el rescate queda en la bitácora con quién lo hizo, así que no es una forma silenciosa de entrar a una cuenta. Desactivarla la propia exige un código vigente: con una sesión ajena no basta. |
| Panel | **Mi cuenta → Seguridad** es la pantalla de la persona (activar, confirmar, desactivar). En **Sistema** hay una tarjeta que dice cuántas cuentas la usan y cuántos administradores están cubiertos. |
| Rutas | `GET /account/security`, `POST /account/security/two-factor/{start,confirm,disable,cancel}`, `POST /auth/login/2fa` (con el mismo límite de intentos del login) y `POST /admin/users/:id/two-factor/disable`. |

### Pruebas

Nueve pruebas de integración nuevas contra PostgreSQL, además de las ocho unitarias del cálculo TOTP:

- Con la cuenta protegida, la contraseña correcta devuelve el desafío y **no** crea ninguna sesión.
- Un código incorrecto no crea sesión y suma un intento fallido.
- El código correcto abre exactamente una sesión y limpia intentos y bloqueo.
- El secreto queda cifrado en la columna cruda (se comprueba con un cliente sin cifrado).
- Desactivarla exige un código vigente; con uno inválido no se apaga.
- Un administrador puede apagarla si alguien pierde el teléfono.
- Una activación a medias no bloquea el acceso y se puede descartar.
- Por HTTP, la pantalla de seguridad exige sesión (redirige al login) y el recorrido completo funciona: activar, mostrar la clave, rechazar un código incorrecto con su motivo y aceptar el correcto.
- Por HTTP, con la cuenta protegida la contraseña correcta devuelve el formulario del código y **no** deja cookie de sesión.

### Documentación

Se actualizó `docs/alcance-produccion.md`: la verificación en dos pasos entró en «lo que puede hacer hoy», en los controles de seguridad y en «qué sigue» ya no aparece como pendiente. El punto que decía «no hay autenticación de dos factores» se reescribió con la verdad de hoy: **es opcional por cuenta** y nadie puede obligarla desde el panel.

### Ampliación — código QR para activarla

Pedirle al cliente que teclee 32 caracteres de clave es donde se pierde la gente. La pantalla de activación muestra ahora un **código QR** y, debajo, la clave como respaldo.

El generador de QR (`src/utils/qr.ts`) se escribió a mano, con el mismo criterio que el TOTP: son ~300 líneas y una tabla, y evita sumar otra dependencia al despliegue. Lo que no se improvisó fue la verificación:

- Se comparó **bit a bit** contra la implementación de referencia de Python (`qrcode`) forzando versión, nivel de corrección y máscara: **160 de 160 matrices idénticas**, con textos de 0 a 400 bytes, versiones 1 a 18, niveles `L` y `M` y las ocho máscaras, incluidos acentos y emoji (UTF-8).
- Esa comparación encontró tres errores reales que a ojo no se ven: el módulo de sincronía de la fila 6, el de la columna 6 y el módulo oscuro fijo estaban siendo pisados por las tiras de información de formato. Un QR así se ve correcto y no lo lee un escáner.
- Además se comprobó que el SVG dibuja la matriz exacta (se rasterizó y se leyeron los 2 809 módulos del PNG: cero diferencias) y que la información de formato se puede decodificar de vuelta al nivel y la máscara que se generaron.
- Lo que queda como prueba permanente: siete pruebas unitarias con las huellas de la referencia, los patrones obligatorios, la elección de versión y la del SVG. La elección automática de la **máscara** puede diferir de la de Python en algunos textos, porque el estándar (y zxing, el lector de Android) penaliza el patrón 1:1:3:1:1 en los dos sentidos y Python solo en uno; la matriz sigue siendo válida y verificada con máscara forzada.

---

## Sprint 50 — Cifrado de los correos de acceso

**Estado: completado.**

Objetivo: cerrar el penúltimo dato personal que quedaba en claro. De la deuda anotada («cifrar los nombres de contacto y los correos»), el nombre se dejó fuera a propósito y por decisión del operador: la búsqueda por texto del panel depende de él y cifrarlo la degrada a coincidencia exacta. El correo, en cambio, no tenía ese problema: solo se usa para entrar y para escribir a la persona.

| Área | Qué se hizo |
| --- | --- |
| Esquema | `User.email` pasa a guardarse cifrado (AES-256-GCM, misma llave que el resto) y se agrega `emailHash`, el índice ciego (HMAC-SHA256) que conserva la **unicidad** y resuelve el inicio de sesión. El índice único sobre `email` se retira: con IV aleatorio, el mismo correo cifrado dos veces da textos distintos, así que una unicidad sobre el texto cifrado no detectaría duplicados. |
| Migración | `20261015040000_cifrado_correos`. Las filas existentes reciben el marcador `legacy:<id>` porque el índice depende de la llave de cifrado, que no está en la base. |
| Recálculo | Un trabajo de arranque (`email-hash.job.ts`) cifra el correo de esos usuarios y calcula su índice. A diferencia del de teléfonos, corre **antes de escuchar peticiones** (`bootstrap` en `server.ts`): si corriera después, quien ya tenía cuenta no podría entrar durante ese instante. |
| Traducción transparente | La extensión de Prisma convierte cualquier `where: { email }` al índice ciego y calcula el índice al escribir, así que los servicios siguen escribiendo `email`. Los sitios que el compilador exige explícitos (alta de usuario, seed, setup, `admin:reset-password`, pruebas) usan `emailIndex()`. Buscar por partes del correo **falla con explicación** en lugar de devolver cero filas. |
| Herramientas | `db:encrypt-data` también cifra e indexa correos (idempotente). `admin:reset-password` pasa a usar el cliente **con** cifrado: con el crudo ya no encontraría a nadie, y además ahora deja su bitácora en el mismo formato cifrado que el resto. La restauración de respaldos calcula el índice al vuelo si el archivo es anterior a la migración. |
| Panel | La tarjeta de cifrado en Admin → Sistema cuenta también los correos pendientes y los usuarios sin índice. |

### Verificación

- Dos pruebas de integración nuevas: el correo queda cifrado en la columna cruda y el índice corresponde al correo; el acceso funciona (incluso escribiendo el correo en mayúsculas), un correo repetido se rechaza y buscar por partes falla con explicación.
- Contra la base de desarrollo real: los tres usuarios existentes se cifraron al arrancar, su índice quedó calculado y se comprobó que cada uno se encuentra por su índice (el camino exacto del login).
- Suite completa: 201 unitarias y 41 de integración en verde.

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

## Backlog posterior (histórico)

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

> Varias de esta lista ya salieron: las variables de encabezado y botón, las
> campañas programadas, los botones interactivos y el opt-in formal están en el
> producto. Las listas desplegables, los permisos por número y los no leídos por
> persona siguen pendientes; el estado al día está en `alcance-produccion.md`.

## Lo que sigue fuera de alcance

Multi-tenant con SuperAdmin, billing, integración con CRM externo, IA o chatbot, y cualquier cosa que compita por tiempo antes de que la operación actual esté sólida.
