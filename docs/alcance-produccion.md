# Margarita — Alcance y seguridad en producción

Documento de referencia para decidir y sostener el uso de Margarita en producción. Describe **lo que la herramienta hace hoy**, lo que no hace, los controles de seguridad vigentes y las responsabilidades que quedan del lado de quien la opera.

Última revisión: 2026-10-10.

---

## 1. Qué es esta herramienta

Margarita es una aplicación web para **operar la WhatsApp Business Cloud API de Meta**: enviar campañas con plantillas aprobadas, recibir y atender conversaciones, asignarlas a agentes y seguir el ciclo real de cada mensaje (enviado, entregado, leído, fallido).

**Qué no es:** no es un CRM, no administra ventas, embudos, cotizaciones ni facturación. No es un chatbot: no responde solo. No crea plantillas en Meta.

### Modelo de despliegue

Es **una instalación por empresa** (*single-tenant*): un workspace, un número de WhatsApp y un usuario administrador por despliegue. Cada cliente tiene su propio proyecto, su propia base de datos y su propio dominio.

| Concepto | Valor actual |
| --- | --- |
| Empresas por instalación | 1 |
| Números por instalación | Los que tenga la WABA (uno o varios) |
| Roles | `ADMIN` (uno) y `AGENT` (los que se necesiten) |
| Base de datos | PostgreSQL |
| Alojamiento probado | Railway |

---

## 2. Qué puede hacer hoy

### Panel de administrador

- **Dashboard** con conversaciones abiertas, conteo de agentes por estado, últimos mensajes entrantes y errores recientes.
- **Agentes**: crear, editar, activar o desactivar, con permiso de envío manual y límite configurable.
- **Contactos**: crear, editar, buscar por texto, filtrar por etiqueta, desactivar.
- **Etiquetas**: crear, editar, desactivar y asignar a contactos.
- **Cuenta de WhatsApp**: ver número, calidad y estado; **actualizar credenciales** desde la interfaz (número, IDs, tokens, versión de API); probar la conexión contra Meta; cifrar credenciales existentes.
- **Plantillas**: sincronizar las plantillas de Meta con su estado real (`APPROVED`, `PENDING`, `REJECTED`).
- **Conversaciones**: ver todas, abrir desde un contacto, responder, asignar y reasignar, cerrar y reabrir.
- **Campañas**: crear seleccionando contactos o subiendo Excel/CSV, **con variables** (texto fijo, el nombre o el teléfono del contacto, y cualquier columna del archivo), enviar, ver el estado por destinatario y reintentar los fallidos.
- **Logs**: auditoría filtrable por nivel y módulo, con el detalle de cada evento.
- **Sistema**: checklist de configuración y estado de seguridad, cola y worker.
- **Roadmap**: alcance incluido y lo que está postergado.

### Panel de agente

- Ve **únicamente** las conversaciones asignadas a él (la restricción se aplica en la consulta a la base).
- Estado operativo: `AVAILABLE`, `BUSY`, `BREAK`, `OFFLINE`. No queda disponible automáticamente al entrar.
- Tres formas de responder: **nota local** (no sale a WhatsApp), **texto libre** dentro de la ventana de 24 horas, y **plantilla aprobada** cuando la ventana está cerrada.
- Cierra conversaciones.

### Motor de WhatsApp

- **Webhook firmado**: cada payload se valida con HMAC-SHA256 (`X-Hub-Signature-256`) y se rechaza si no corresponde.
- **Cola con reintentos**: el endpoint responde en milisegundos y el procesamiento ocurre aparte, con backoff exponencial, hasta 5 intentos y recuperación de eventos interrumpidos.
- **Idempotencia** por `wamid`: los reintentos de Meta no duplican mensajes.
- **Contactos y conversaciones** se crean o reabren automáticamente al recibir un mensaje.
- **Asignación automática** al agente disponible con menos carga.
- **Estados reales** de cada mensaje (`sent`, `delivered`, `read`, `failed`) propagados al hilo y a los destinatarios de campaña.
- **Historial de asignaciones** con quién movió qué y por qué.
- **Tiempo real**: la bandeja se actualiza sin recargar, con eventos por socket autenticados con la misma sesión del panel.
- **Multimedia entrante**: las fotos, el video, el audio y los documentos que envían los clientes se ven dentro del hilo, con visor y descarga. Las imágenes se descargan al recibirlas y el resto cuando alguien lo abre.
- **Envío de archivos**: se pueden adjuntar imágenes, video, audio y documentos dentro de la ventana de 24 horas, con texto opcional. Límites de Meta por tipo: imagen 5 MB, video y audio 16 MB, documentos 100 MB.
- **Varios números de la misma WABA**: la cuenta guarda las credenciales y cada número aporta su identidad, su calidad y sus propios hilos. El panel funciona "desde" un número activo que se elige en el encabezado: la bandeja, las campañas y las conversaciones nuevas usan ese número.
- **Chat de conversación**: hilo con burbujas, separadores de fecha, palomitas de estado reales y barra de composición, con actualización en vivo.
- **Borrado de mensajes**: ocultar un mensaje sin destruirlo (el admin puede verlo y restaurarlo) o borrar todo el hilo definitivamente escribiendo `BORRAR`.
- **Respaldos**: descarga completa en JSON o exportación por entidad en CSV.
- **Motivos de fallo traducidos**: los códigos de Meta (pago, ventana cerrada, número inválido, límites, plantillas) se explican en español en la bitácora y en el hilo.

### Auditoría y operación

- Bitácora de sistema, auth, usuarios, contactos, campañas, conversaciones, mensajes, webhooks, Meta y cuenta de WhatsApp.
- Campos que parecen credenciales se redactan antes de guardarse.
- Retención automática: 90 días de bitácora y 30 días de eventos de webhook ya resueltos.
- Alertas externas opcionales (Slack, Discord o cualquier webhook) ante errores.
- `/health` reporta base de datos, cola, worker, si Meta está entregando webhooks, si existe el admin y qué variables de seguridad faltan.

---

## 3. Qué NO hace (límites actuales)

Estos límites son reales y conviene tenerlos presentes antes de prometer algo:

| Límite | Detalle |
| --- | --- |
| **Solo México** | El normalizador de teléfonos asume números mexicanos y agrega el prefijo `521`. Números de otros países se rechazan. |
| **Archivos con caducidad** | Meta conserva lo que envían los clientes alrededor de 30 días. Un archivo que nadie abrió en ese plazo ya no se puede recuperar; el hilo lo avisa en lugar de fallar. |
| **Sin botones ni listas** | Se envían texto, plantillas y archivos, pero todavía no mensajes interactivos (botones o listas). |
| **Variables solo en el cuerpo** | Las campañas resuelven las variables del componente `BODY` de la plantilla. Si la plantilla tiene variables en el encabezado o en un botón con URL, hoy no se llenan. |
| **Campañas sin programar** | No se pueden agendar por fecha y hora, pausar ni cancelar. |
| **Envío de campañas secuencial** | El envío ocurre dentro de la petición HTTP, sin control de velocidad. Con listas grandes hay riesgo de timeout y de chocar con los límites de Meta. |
| **Límites de envío manual sin aplicar** | El permiso `canSendManualMessages` y el límite por agente se configuran en la interfaz, pero **hoy no se validan al enviar**. |
| **Respuestas de botones sin interpretar** | Si un cliente toca un botón, se guarda como mensaje interactivo genérico, sin saber qué opción eligió. |
| **Sin opt-in ni BAJA/STOP** | No hay campo de consentimiento ni baja automática al detectar una palabra clave. |
| **Solo eventos de mensajes** | Del webhook solo se procesa el campo `messages`. No se reciben avisos de plantillas rechazadas ni de cambios en la calidad del número. |
| **Una réplica** | El tiempo real y la cola funcionan en una sola instancia. Con varias haría falta el adaptador de Redis. |

---

## 4. Seguridad

### Controles implementados

| Área | Control |
| --- | --- |
| **Webhooks** | Firma `X-Hub-Signature-256` obligatoria, comparada en tiempo constante. Un payload sin firma válida se rechaza con 401. |
| **Credenciales de Meta** | `accessToken` y `verifyToken` cifrados en la base con AES-256-GCM. Sin la variable `ENCRYPTION_KEY` no se pueden leer. |
| **Sesiones** | JWT en cookie `httpOnly`, `secure` en producción y `SameSite=Lax`, con registro en base que permite revocarlas. Expiración de 7 días. |
| **Contraseñas** | Hash con bcrypt (12 rondas). Mínimo 10 caracteres con letras y números, sin contraseñas obvias. |
| **Fuerza bruta** | Bloqueo de la cuenta tras varios intentos fallidos (configurable) y límite propio de intentos por IP en el login. Todo queda auditado. |
| **Autorización** | Separación estricta `ADMIN` / `AGENT`. Un agente solo puede leer y responder las conversaciones asignadas a él, y la restricción se aplica en la consulta, no solo en la vista. |
| **CSRF** | Toda petición que cambia estado debe venir del mismo dominio configurado en `APP_URL`. Un dominio ajeno recibe 403. |
| **Validación** | Los cuerpos de entrada del panel pasan por esquemas Zod. El webhook se valida con la firma HMAC en lugar de un esquema. |
| **Límite de peticiones** | 300 cada 15 minutos en el panel, 10 en el login, 1200 por minuto en el webhook (que está exento del límite general, igual que el healthcheck). |
| **Cabeceras y CORS** | Helmet activo y CORS restringido al dominio de la aplicación. La política de contenido (CSP) está desactivada para permitir las vistas actuales; se puede habilitar con nonces. |
| **Exposición de secretos** | Los tokens nunca se envían al navegador (la vista recibe solo una versión enmascarada) y la bitácora redacta cualquier campo que parezca credencial. |
| **Acceso a archivos** | Los archivos no son públicos: se sirven por un endpoint que exige sesión y valida que el usuario pueda ver esa conversación. Un agente sin la conversación recibe 404, y los archivos se guardan fuera del alcance del servidor web. |
| **Borrado con intención** | Ocultar un mensaje es reversible y queda auditado. El borrado definitivo exige escribir `BORRAR` y también queda en la bitácora. El respaldo descargable **no incluye** credenciales de Meta ni contraseñas. |
| **Retención** | La bitácora se purga a los 90 días y los eventos de webhook resueltos a los 30. |

### Lo que la seguridad NO cubre

Ser explícito aquí es parte del trato:

1. **No hay autenticación de dos factores.** Quien tenga la contraseña del admin entra.
2. **La base no está cifrada en reposo.** Un volcado de PostgreSQL expone conversaciones, teléfonos y contenido. Lo único cifrado son los tokens de Meta.
3. **No hay antitivirus ni análisis de adjuntos** (relevante cuando se agregue multimedia).
4. **No hay respaldos automáticos.** Existe la descarga manual (respaldos en JSON y CSV), pero nada la ejecuta sola: depende de que alguien la haga o de lo que ofrezca el proveedor; conviene activar los del proveedor.
5. **No hay gestión de sesiones activas en la interfaz.** Se puede cerrar sesión, pero no ver ni revocar otras.
6. **No hay rotación automática de secretos** ni caducidad de la `ENCRYPTION_KEY`.
7. **No hay prueba de penetración.** Los controles están probados con pruebas automatizadas y verificación manual, no con un pentest externo.
8. **No hay WAF ni protección DDoS propia.** Depende del borde del proveedor.

---

## 5. Responsabilidades del operador

Hay cosas que la herramienta deja del lado de la empresa porque son decisiones de negocio o exigencias de Meta:

- **Consentimiento (opt-in)**: solo escribir a personas que aceptaron recibir mensajes. La herramienta no lo verifica.
- **Bajas**: honrar manualmente a quien pida no recibir más mensajes.
- **Método de pago en Meta**: si la cuenta no tiene método de pago válido, los envíos fallan con el código `131042` y no salen, aunque la app diga que todo está bien.
- **Plantillas**: usar solo plantillas aprobadas para iniciar conversaciones.
- **Calidad del número**: vigilar la calificación en el panel de Meta; los envíos masivos sin consentimiento la degradan.
- **Custodia de `ENCRYPTION_KEY`**: si se pierde, los tokens cifrados dejan de poder leerse y hay que capturarlos de nuevo.
- **Respaldos de la base de datos**.

---

## 6. Estado de calidad y verificación

| Aspecto | Estado |
| --- | --- |
| Pruebas automatizadas | 87 pruebas unitarias en 15 archivos |
| Verificación de tipos | `npx tsc --noEmit` limpio |
| Migraciones | Versionadas en `prisma/migrations`, con dos aplicadas |
| Integración continua | GitHub Actions en cada push: esquema, tipos, pruebas y build |

Además de las pruebas unitarias, los flujos críticos se verificaron de punta a punta contra una base real:

- Webhook firmado → encolado → procesado por el worker → mensaje guardado → llega en vivo al navegador.
- Rechazo de firma inválida, de origen ajeno y de payload sin firma.
- Bloqueo de cuenta por intentos fallidos y límite de intentos en el login.
- Cifrado de credenciales y lectura de las mismas.
- Estado `failed` de Meta → bitácora y conversación con el motivo traducido.

---

## 7. Riesgos conocidos

| Riesgo | Impacto | Mitigación hoy |
| --- | --- | --- |
| Campaña con muchos contactos | El envío puede cortarse a mitad por timeout | Usar listas moderadas; el reintento de fallidos permite continuar |
| Límites de envío manual sin aplicar | Un agente podría escribir más de lo previsto | Acuerdo operativo con el equipo |
| Falta de opt-in | Reportes de clientes y degradación de la calidad del número | Responsabilidad del operador |
| Multimedia no visible | El agente debe pedir la imagen por otra vía | Roadmap (siguiente sprint) |
| Una sola instancia | Si el servicio se reinicia, la bandeja se reconecta sola | Railway reinicia el servicio automáticamente |
| Pérdida de `ENCRYPTION_KEY` | Los tokens de Meta quedan ilegibles | Guardarla en un lugar seguro además de las variables |

---

## 8. Qué sigue

El detalle está en [`docs/roadmap-v2.md`](roadmap-v2.md):

**Proteger la operación.**

1. **Salud de la cuenta**: procesar los avisos de plantillas rechazadas y de cambios de calidad, con alertas. Es lo que protege la estrategia de varios números.
2. **Campañas en cola** con control de velocidad, más pausar y cancelar. Evita cortes por timeout y choques con los límites de Meta.
3. **Opt-in y baja automática** (BAJA/STOP), que es cumplimiento pero también protección de la calidad.
4. **Aplicar los límites de mensajes manuales**, que hoy se configuran y no se validan.

**Mejorar el día a día de la bandeja.**

5. **Respuestas rápidas** guardadas.
6. **Contador de no leídos**, búsqueda y filtros.
7. **Botones y listas**: enviarlos e interpretar la respuesta del cliente.

**Cuando el equipo crezca.**

8. **Asignar números a agentes** y **repartir campañas entre números** (ver [`multinumero.md`](multinumero.md)).

---

## 9. Cómo comprobar el estado en cualquier momento

```bash
# Estado del servicio: base, cola, worker, webhooks y configuración de seguridad
curl -s https://<tu-dominio>/health

# Pruebas y tipos, en local
npm test
npx tsc --noEmit
```

En el panel:

- **Admin → Sistema**: checklist de configuración y tarjetas de seguridad (cifrado, firma, cola, alertas, retención).
- **Admin → WhatsApp**: estado de la cuenta y cifrado de credenciales.
- **Admin → Logs**: qué pasó y por qué, con el detalle de cada evento.
