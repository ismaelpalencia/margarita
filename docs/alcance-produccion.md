# Margarita — Alcance y seguridad en producción

Documento de referencia para decidir y sostener el uso de Margarita en producción. Describe **lo que la herramienta hace hoy**, lo que no hace, los controles de seguridad vigentes y las responsabilidades que quedan del lado de quien la opera.

Última revisión: 2026-10-16 (mensualidad a **$699** con **contrato mínimo de 3 meses** en la página, landing separada por dominio, plantillas de cobranza con dos botones, llamadas pedidas como tarea del día y volcado de webhooks para copiar).

> **Precios vigentes: estos gobiernan sobre cualquier otro documento.**
> **Instalación $2,500.00 MXN** (una vez, en oferta de lanzamiento; precio de
> lista $4,900.00) y **mensualidad $699.00 MXN** (precio de lista $1,490.00). El
> primer mes se paga junto con la instalación. **Todos los precios son más IVA.**
> **El contrato es de mínimo 3 meses**: no es mes a mes libre, y así se anuncia
> en la página. Al terminar ese plazo, el cliente decide si continúa.
> **El cliente debe llegar con su cuenta de Meta ya configurada** (verificación,
> número y método de pago); si no la tiene, la conexión se **cotiza aparte**.
> La oferta se anuncia hasta el **31 de diciembre de 2026** y la página deja de
> mostrarla sola al pasar esa fecha (`INSTALL_PROMO_UNTIL`).
>
> Los documentos [`propuesta-comercial.md`](propuesta-comercial.md) y
> [`facturacion.md`](facturacion.md) conservan los números anteriores a
> propósito; hay que ajustarlos antes de mandarlos a un cliente.

### ¿Se puede ofrecer hoy?

Sí, como **instalación por empresa** en Railway: el alta de un cliente nuevo toma minutos, el producto cubre el ciclo completo de WhatsApp (campañas, bandeja, agentes, cobranza y reportes) y los datos personales que guarda están cifrados en la base. Antes de firmar conviene que el cliente y tú tengan claro lo siguiente:

| Punto | Estado |
| --- | --- |
| Cuenta de WhatsApp y método de pago en Meta | **Del cliente, y de entrada.** Llega con su cuenta de WhatsApp Business ya configurada (verificación del negocio, nombre visible, número registrado con PIN y método de pago). Si no la tiene, acompañarlo es una **cotización aparte**; [`guia-meta.md`](guia-meta.md) sirve para hacerlo solo. |
| Cobro y contrato | **Del operador.** Instalación **$2,500** (una vez) + mensualidad **$699**, precio de oferta hasta el **31 de diciembre de 2026**; precios de lista $4,900 y $1,490. **Más IVA**, y el primer mes se paga junto con la instalación. **Contrato mínimo de 3 meses** (no es mes a mes libre), y la página lo dice así. |
| Plantillas de las campañas | **Del cliente, con nuestra guía.** Al contratar se le entrega la **guía de plantillas**, publicada en `margaritaapp.org/plantillas` (código en [`guia-plantillas.md`](guia-plantillas.md)): categorías y costo, reglas de redacción, variables, el paso a paso en Meta, la plantilla de cobranza recomendada y los motivos de rechazo. Armarlas en Meta es suyo; revisarlas con él es parte del arranque. Para la conexión con Meta está además [`guia-meta.md`](guia-meta.md). |
| Guía de uso del equipo | **Escrita y publicada** en `margaritaapp.org/guia` (código en [`guia-uso.md`](guia-uso.md) y en la página `guia.ejs`): arranque, bandeja, plantillas, campañas, resultados de gestión, botones, reportes, respaldos, límites y problemas comunes. Se entrega al contratar junto con la **sesión de arranque de 2 horas** que promete la página. |
| Opt-in de los contactos | **Del cliente.** La herramienta lo registra y respeta las bajas, pero no verifica de dónde salió el consentimiento. |
| Respaldos fuera del servidor | **Del cliente (u operación compartida).** Hay copia automática cada 24 h, pero vive en el mismo Volume que la base: alguien tiene que descargarla de vez en cuando. |
| Nombres de los contactos | **Único dato personal que queda en claro**, porque la búsqueda por texto del panel depende de ellos. Está documentado como límite y es el siguiente pendiente. |
| Verificación en dos pasos | **Disponible y opcional.** Se activa por cuenta; conviene dejarla puesta en las de administrador (el panel dice cuántas están cubiertas). |

Lo que **no** está en el producto y no se debe prometer: mandar botones o listas
*dentro* de la ventana de 24 horas (las plantillas con botones sí se envían y sus
respuestas sí se interpretan), programar campañas por fecha y hora, **agenda de
llamadas** (la llamada pedida ya es tarea, pero no se programa a una hora),
contador del tramo de mensajes gratis por número, números fuera de México,
permisos por número, multi-instancia y respaldo fuera del servidor.

### Cómo está repartido el producto entre dominios

La página de venta **ya no vive dentro de la instalación de cada cliente**:

| Dirección | Qué sirve |
| --- | --- |
| `margaritaapp.org` | La oferta, la guía de Meta y el aviso de privacidad del producto. Es un **sitio estático** que se genera con `npm run landing:build` y se sube aparte (carpeta [`landing/`](../landing/)) |
| `palencia.margaritaapp.org`, `cliente.margaritaapp.org` | La instalación de cada operación. Su raíz **manda al inicio de sesión**, no a la oferta |

Hoy cada cliente es un servicio independiente en Railway (una instalación por
empresa), así que cada subdominio lleva su propio registro DNS, con el proxy de
Cloudflare apagado porque el panel usa conexiones en vivo. El comodín
`*.margaritaapp.org` queda para cuando se pase a multi-inquilino: como la
dirección del cliente no cambia, esa migración se puede hacer después sin
avisarle a nadie. El paso a paso —variables, DNS, certificado y comprobaciones— está en
[`dominios.md`](dominios.md).

La variable `PRODUCT_DOMAIN` decide **quién sirve la oferta** (se admiten varios
dominios separados por coma). Sin ella, la aplicación se comporta como antes y
sirve la landing en su propia raíz, que es lo que hace una instalación sola.

---

## 1. Qué es esta herramienta

Margarita es una aplicación web para **operar la WhatsApp Business Cloud API de Meta**: enviar campañas con plantillas aprobadas, recibir y atender conversaciones, asignarlas a agentes y seguir el ciclo real de cada mensaje (enviado, entregado, leído, fallido).

**Qué no es:** no es un CRM, no administra ventas, embudos, cotizaciones ni facturación. No es un chatbot: no responde solo. No crea plantillas en Meta.

### Modelo de despliegue

Es **una instalación por empresa** (*single-tenant*): un workspace, una cuenta de WhatsApp Business (con uno o varios números) y uno o varios administradores por despliegue. Cada cliente tiene su propio proyecto, su propia base de datos y su propio dominio.

| Concepto | Valor actual |
| --- | --- |
| Empresas por instalación | 1 |
| Números por instalación | Los que tenga la WABA (uno o varios) |
| Roles | `ADMIN` (uno o varios) y `AGENT` (los que se necesiten) |
| Base de datos | PostgreSQL |
| Alojamiento probado | Railway |

---

## 2. Qué puede hacer hoy

### Panel de administrador

- **Dashboard** con conversaciones abiertas, conteo de agentes por estado, últimos mensajes entrantes y errores recientes.
- **Sin horarios de atención**: no hay horario laboral, mensaje fuera de horario ni modo de asignación configurable. La asignación automática es siempre al agente disponible con menos carga y la interfaz está solo en español. (Esos ajustes existían en la base sin que ningún código los leyera; se quitaron el 2026-10-15 para que la base no prometa lo que la herramienta no hace.)
- **Agentes**: crear, editar, activar o desactivar, con permiso de envío manual y límite configurable.
- **Equipo**: crear administradores y agentes, cambiar el rol, activar o desactivar y restablecer contraseñas. La instalación nunca se queda sin un administrador activo: el sistema bloquea degradar o desactivar al último (y el botón aparece deshabilitado). Al desactivar a alguien se cierran sus sesiones.
- **Contactos**: crear, editar, buscar por texto, filtrar por etiqueta y por bajas, registrar el consentimiento (opt-in), marcar la baja a mano y desactivar.
- **Resultado de la gestión (cobranza)**: marcar en qué quedó cada cliente —promesa de pago, pagado, convenio, incumplida, sin contestación, número inválido, no le interesa, volver a llamar— con monto, fecha compromiso y nota. Se marca desde el hilo, desde la ficha del contacto y en bloque desde la lista. Cada marcado deja historial con quién y cuándo.
- **Reportes**: gestiones del periodo por resultado, persona y día; promesas vigentes con lo vencido arriba, cumplimiento (a tiempo, tarde, sin pago) y prometido contra pagado; lista de clientes sin contestación tras X intentos; y detalle exportable a CSV. Con filtros por fecha, persona, campaña y etiqueta.
- **Lista de trabajo del día**: una pantalla que pone **arriba de todo las llamadas pedidas** —el cliente que tocó el botón— y debajo lo vencido, lo que vence hoy, lo de esta semana y los clientes sin contestar, en orden de urgencia, con acceso directo a la ficha.
- **Llamadas pedidas, como tarea**: el toque de «quiero que me llame un asesor» ya no se queda solo en el registro: aparece en **Reportes → Hoy** con **cuánto lleva esperando** el deudor (en palabras: «hace 3 horas»), la hora en que lo pidió, si lo pidió **fuera del horario** permitido (8:00 a 21:00) y si salió del **botón** o lo marcó el equipo. Se despacha con un clic —**«No contestó»**— o abriendo la ficha para registrar promesa, convenio o pago, y **sale de la lista sola** en cuanto se registra otro resultado. En el hilo y en la ficha, el panel del resultado avisa que hay una llamada pendiente y cuánto lleva esperando.
- **Agenda de llamadas**: desde la misma lista se le pone **fecha y hora** a la llamada, en la zona de la empresa. Las citas de hoy o vencidas suben al principio y se marcan «Toca ahora»; las futuras se ordenan por hora y luego van las que no tienen cita. La cita se puede quitar y se borra sola si el cliente pasa a otro resultado (pagó, no le interesa…).
- **Tendencias**: gestiones, promesas, prometido, pagos y cobrado semana a semana, más el cumplimiento de promesas por persona.
- **Sesiones**: cada quien ve desde qué dispositivo y qué IP entró, cierra sesiones individuales y puede cerrar todas las demás. El admin ve las de toda la empresa.
- **Verificación en dos pasos (2FA)**: cada persona la activa desde **Mi cuenta → Seguridad** con cualquier app de autenticación —Google Authenticator, Authy, Microsoft Authenticator, 1Password, Bitwarden o la app **Contraseñas** de Apple— usando un código TOTP de 6 dígitos (el estándar RFC 6238, SHA-1, 30 segundos). La pantalla muestra un **código QR** para escanear y, debajo, la clave de configuración para capturarla a mano (o el enlace `otpauth://` completo) por si no se puede escanear. Si alguien pierde el teléfono, un administrador puede desactivarla desde Equipo y queda en la bitácora con quién lo hizo. El panel de Sistema muestra cuántas cuentas y cuántos administradores la tienen.
- **Etiquetas**: crear, editar, desactivar y asignar a contactos.
- **Cuenta de WhatsApp**: administrar los números de la WABA (agregar, editar, activar o desactivar, ver calidad y estado de cada uno y probar su conexión); actualizar las credenciales de la cuenta (tokens, business account, versión de API) y cifrarlas.
- **Tramo del mes por número**: cuántos mensajes de servicio lleva cada número de los 1,000 gratis, con barra, cuánto queda y alerta al 80% (una sola vez por mes, a la bitácora); aparte, las plantillas enviadas de utilidad y de marketing con su costo estimado. En la bandeja se sugiere el número **con más tramo** para las conversaciones nuevas.
- **Plantillas**: sincronizar las plantillas de Meta con su estado real (`APPROVED`, `PENDING`, `REJECTED`), ver cuáles traen botones y **avisar si Meta las reclasificó como marketing** (cuestan varias veces más por mensaje).
- **Conversaciones**: ver todas, abrir desde un contacto, responder, asignar y reasignar, cerrar y reabrir, con búsqueda por nombre o teléfono, filtros por estado, por asignación y por no leídos, y el contador de pendientes por hilo.
- **Campañas**: crear seleccionando contactos o subiendo Excel/CSV, **con variables** (texto fijo, el nombre o el teléfono del contacto, y cualquier columna del archivo), enviar, ver el estado por destinatario y reintentar los fallidos.
- **Campañas en cola**: el envío corre en segundo plano, por lotes y con una pausa entre mensajes para no chocar con los límites de Meta. Se puede pausar, reanudar y cancelar, y la pantalla muestra el avance en vivo.
- **Logs**: auditoría filtrable por nivel y módulo, con el detalle de cada evento, más **Webhooks recibidos** (Admin → Logs → Webhooks): los últimos 20 eventos **tal como los mandó Meta**, con un botón para copiarlos completos. Es la pantalla con la que se comprueba qué identificador trae un botón cuando un deudor lo toca de verdad, sin entrar a la base.
- **Aviso de carga con la marca**: al cambiar de pantalla y al enviar un formulario aparece el sello de Margarita con un aro girando y «Cargando…». El botón que se envió queda ocupado —con un aro dentro y sin poder tocarse otra vez—, así nadie manda dos veces el mismo mensaje o la misma campaña. Con «reducir movimiento» activado en el sistema, el sello y el aro se quedan quietos y solo avisa el texto.
- **Respuestas rápidas**: textos guardados que el equipo inserta con un clic, con `{nombre}` y `{telefono}` del contacto.
- **Sistema**: checklist de configuración y estado de seguridad, cola y worker.
- **Guía rápida en el panel**: qué hace la herramienta, el día en tres pasos, lo que **no** hace y los accesos a la guía de uso, la de plantillas y soporte. Sustituyó al «Roadmap», que era información interna y no debía ver el cliente.

### Panel de agente

- Ve **únicamente** las conversaciones asignadas a él (la restricción se aplica en la consulta a la base).
- Estado operativo: `AVAILABLE`, `BUSY`, `BREAK`, `OFFLINE`. No queda disponible automáticamente al entrar.
- Cuatro formas de responder: **nota local** (no sale a WhatsApp), **texto libre** dentro de la ventana de 24 horas, **archivos** (imagen, video, audio o documento) dentro de la misma ventana, y **plantilla aprobada** cuando está cerrada.
- **Respuestas rápidas**: un clic inserta el texto guardado en el compositor, ya con el nombre y el teléfono del contacto.
- **Respuestas de botón y de lista**: cuando el cliente toca un botón o elige de una lista, se guarda **qué opción eligió** (identificador y texto), el hilo lo muestra con su etiqueta y queda en la bitácora. Se entienden las **tres formas** que manda Meta: el botón de una **plantilla** (`type: "button"` con su texto y su payload), el botón de un mensaje interactivo (`button_reply`) y la elección de una lista (`list_reply`). El identificador se guarda en claro porque es con lo que se mapea a un resultado de gestión; el texto va cifrado, como el resto del contenido. El identificador se copia de la burbuja con un clic, que es lo que hace falta para crear su regla.
- **Enviar botones dentro de la ventana de 24 horas**: desde el hilo (admin y agente) se manda un mensaje con **hasta 3 botones** de 20 caracteres. Los límites de Meta se validan antes de llamarla —texto de 1,024, pie de 60 y botones únicos— y la respuesta del cliente entra al mismo circuito de reglas que un botón de plantilla.
- **Plantillas con botones**: se envían —desde el hilo y en **campañas**— resolviendo las **tres variables** que admite Meta: una en el encabezado, las del cuerpo y una al final de la URL de un botón. El formulario muestra solo los campos que la plantilla pide, para no mandar un componente de más (que Meta rechaza), y los valores quedan guardados **por destinatario** (con `{nombre}`, `{telefono}` y columnas del Excel).
- **Aviso de plantilla reclasificada**: si Meta marca una plantilla como **marketing** (cuesta varias veces más por mensaje), la lista de plantillas lo advierte y una campaña **no se crea** con ella, con el motivo a la vista.
- **Respuestas que se traducen solas**: cada botón se mapea a un resultado de gestión en **Admin → Botones** (por el identificador que manda Meta o por el texto del botón, como respaldo). Al tocar, la respuesta **registra el resultado sin intervención del agente**, con tres efectos posibles: nada, **pausar la cuenta** o **dar de baja**. Los mapeos recomendados para cobranza se crean de un clic y no pisan lo que ya se editó.
  - **«Ya pagué» no marca pagado**: entra como **pago reportado, por confirmar**, y los reportes lo cuentan aparte de la recuperación.
  - **«No reconozco la deuda»**: deja el contacto **en pausa** (no se le escribe, ni en campañas) y el incidente queda en la bitácora **con nivel de error**, que es lo que dispara las alertas.
  - **«No quiero ser contactado»**: registra la baja el mismo día, sin depender de la palabra clave.
  - Una respuesta sin regla **no inventa nada**: se anota como «no mapeada» con su identificador, para agregarla en un minuto.
- **Bandeja con filtros y no leídos**: busca por nombre o teléfono, filtra por estado y por no leídos, y ve el contador de pendientes por hilo.
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
- **Chat de conversación**: hilo con burbujas, separadores de fecha, palomitas de estado reales y barra de composición, con actualización en vivo. El compositor se queda con lo mínimo (escribir, adjuntar, respuestas rápidas) y las acciones grandes —archivo, plantilla, nota interna y borrado— viven en la columna lateral, que tiene su propio desplazamiento: nada queda escondido ni depende del tamaño de la pantalla.
- **Borrado de mensajes**: ocultar un mensaje sin destruirlo (el admin puede verlo y restaurarlo) o borrar todo el hilo definitivamente escribiendo `BORRAR`.
- **Respaldos**: descarga completa en JSON o exportación por entidad en CSV.
- **Respaldos automáticos**: cada `BACKUP_INTERVAL_HOURS` (24 por defecto) se guarda una copia completa de la base en el servidor, comprimida y cifrada con la misma llave de los datos. Cada copia se **verifica al crearse** (se vuelve a leer y descifrar) y se conservan las últimas `BACKUP_KEEP` (7 por defecto). Se pueden crear a mano, descargar y verificar desde Admin → Respaldos, y `/health` reporta la edad del último.
- **Cifrado en reposo**: los teléfonos, las notas de contacto, el contenido de los mensajes, los nombres de archivo, los payloads de Meta (incluido el evento crudo del webhook), las variables de campaña, los números de la WABA y la bitácora se guardan cifrados con AES-256-GCM. La aplicación descifra al leer, así que el panel funciona igual; del teléfono se guarda además un índice ciego (`phoneHash`) que conserva la unicidad y la búsqueda exacta sin tener el número en claro.
- **Alta sin consola**: en una instalación nueva, `/setup` crea la empresa y el usuario administrador desde el navegador, y las credenciales de Meta y el primer número se capturan en Admin → WhatsApp. El asistente se cierra solo cuando la instalación queda configurada.
- **Alta en minutos**: el repositorio trae `railway.json` con el build, las migraciones previas al arranque, el comando de arranque y el healthcheck, así que una instalación desde plantilla no requiere configurar nada a mano. Mientras no exista empresa ni administrador, la raíz y el login llevan solos al asistente. Si falta `APP_URL`, se usa el dominio público de Railway. El paso a paso está en [`plantilla-railway.md`](plantilla-railway.md).
- **Cierre de contrato**: el borrado total elimina mensajes, conversaciones, contactos, campañas, plantillas, usuarios, sesiones, credenciales y archivos, con la confirmación del identificador de la instalación y constancia en la bitácora.
- **Versión en ejecución**: `/health` y Admin → Sistema reportan la versión y el commit desplegado, para saber qué corre cada instalación.
- **Motivos de fallo traducidos**: los códigos de Meta (pago, ventana cerrada, número inválido, límites, plantillas) se explican en español en la bitácora y en el hilo.
- **Baja automática (BAJA/STOP)**: si el cliente escribe la palabra clave (por defecto `STOP`, configurable con `OPT_OUT_KEYWORDS`), el contacto queda dado de baja y la herramienta deja de enviarle cualquier mensaje, incluso si estaba en una campaña en curso. La reactivación es una decisión explícita del operador y queda auditada.
- **Límites de envío manual aplicados**: el permiso `canSendManualMessages` y el tope diario del agente se validan al enviar, con el motivo a la vista. El uso se calcula sobre los mensajes realmente enviados, así que se reinicia solo a medianoche local; las notas internas no cuentan.
- **Notas internas diferenciadas**: se ven en el panel con su propia etiqueta (y sin palomitas) y nunca salen a WhatsApp.
- **Defensa contra búsquedas imposibles**: si una consulta intenta filtrar por un campo cifrado (por ejemplo el cuerpo de un mensaje), la herramienta falla con una explicación en lugar de devolver cero filas en silencio.
- **Salud de la cuenta**: los avisos de Meta sobre plantillas (aprobada, rechazada, pausada, marcada) y sobre la calidad de cada número se procesan, actualizan el estado en el panel y quedan en la bitácora con nivel de error cuando exigen atención.

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
| **Botones sí, listas no** | Dentro de la ventana de 24 horas ya se mandan **mensajes con hasta 3 botones** (con validación de límites antes de llamar a Meta, y con la respuesta del cliente interpretada como cualquier botón). Las **listas** desplegables todavía no se envían desde el panel; se construirán encima de la misma ruta. |
| **Plantillas reclasificadas a marketing** | Meta puede reclasificar una plantilla de cobranza como marketing si el texto suena promocional, y entonces cuesta varias veces más. La herramienta lo avisa (lista de plantillas) y lo bloquea (campañas), pero **la redacción es responsabilidad de quien la crea**: al crear plantillas, el encabezado admite **exactamente una** variable y la URL del botón **una sola, al final**. |
| **Campañas sin agendar** | Se pueden pausar, reanudar y cancelar, pero todavía no programar por fecha y hora. |
| **La llamada se agenda, pero no avisa** | La llamada pedida **es una tarea** y se puede **agendar** con fecha y hora (hora de la empresa), incluidas las citas de hoy y las vencidas, que suben al principio de la lista; y se puede quitar. Lo que no hay es recordatorio automático al deudor ni notificación push al equipo: el aviso es la pantalla. La herramienta tampoco sabe si la llamada se hizo: eso lo registra una persona. |
| **El costo del tramo es una estimación** | El panel cuenta servicio, plantillas de utilidad y de marketing, y estima el costo con las tarifas configuradas (`SERVICE_MESSAGE_RATE`, `UTILITY_TEMPLATE_RATE`, `MARKETING_TEMPLATE_RATE`). **No es la factura**: Meta cobra con sus propias tarifas por país y puede cambiar precios. Se cuentan solo los mensajes **entregados o leídos**, nunca los fallidos. |
| **Baja solo por palabra clave** | Se detecta la palabra al inicio del mensaje (`STOP`, `STOP por favor`). Si el cliente la pide con otras palabras ("no me escriban más"), hay que marcarlo a mano desde su ficha. |
| **El opt-in no se verifica** | La herramienta registra el consentimiento y respeta las bajas, pero no comprueba de dónde salió: registrar el opt-in es responsabilidad del operador. Las campañas avisan cuántos destinatarios no tienen consentimiento registrado. |
| **No leídos por conversación** | El contador es del hilo, no de cada persona: si alguien abre la conversación, el aviso desaparece para todos. |
| **Eventos de webhook acotados** | Se procesan los campos `messages`, `message_template_status_update` y `phone_number_quality_update`. Otros avisos de Meta se ignoran. |
| **Un número pertenece a una sola WABA** | Es una regla de Meta, no de la aplicación: un número no se puede compartir entre dos cuentas. Moverlo exige quitarlo de una y registrarlo en la otra, con nueva verificación. |
| **Sin permisos por número** | Con varios números, **todos los agentes ven todos**. Restringir qué números atiende cada agente está diseñado y pendiente. |
| **Recuperación de contraseña sin correo** | No hay "envié un enlace a tu correo": la herramienta no manda correos. Se resuelve con dos caminos: **un administrador restablece la contraseña** desde Equipo (y quien la recibe está obligado a cambiarla al entrar), o **desde el servidor** con `npm run admin:reset-password -- --email=…` cuando nadie puede entrar. Si el cliente pierde el acceso a la consola y a todas las cuentas de administrador, la salida es la base de datos. |
| **Adjuntos en disco** | Fotos, audios y documentos viven en el sistema de archivos, no en la base. Sin un Volume **se pierden en cada despliegue**: por eso `/health` y Admin → Sistema reportan si `MEDIA_STORAGE_DIR` es un volumen, y **el alta se bloquea en producción** si no lo es. Los archivos no están cifrados en reposo. |
| **Límite de peticiones** | El cupo del panel es **por persona** (300 cada 15 minutos, `PANEL_RATE_LIMIT_MAX`), no por IP: quince agentes en la misma oficina no se estorban entre sí, y el 429 dice cuántos minutos esperar. Queda un tope de borde por IP (`EDGE_RATE_LIMIT_MAX`, 3,000) solo contra abuso evidente. |
| **Una réplica** | El tiempo real y la cola funcionan en una sola instancia. Con varias haría falta el adaptador de Redis. |
| **Búsqueda de teléfono solo exacta** | El teléfono está cifrado, así que no se puede buscar por coincidencia parcial: en Contactos hay que escribir el número completo (10 dígitos) o buscar por nombre. |
| **Nombres de contacto en claro** | `Contact.profileName` y `Contact.customName` quedan sin cifrar porque la búsqueda por texto del panel depende de ellos; cifrarlos obliga a pasar esa búsqueda a coincidencia exacta con índice ciego. Es el único dato personal que sigue en claro: **los correos de acceso de los usuarios ya se cifran** (2026-10-15). |
| **Búsqueda de correo solo exacta** | El correo del usuario está cifrado y se resuelve con índice ciego: el inicio de sesión funciona igual y el correo se ve en el panel, pero una consulta por partes del correo falla con explicación en lugar de devolver resultados. En la práctica el panel no tiene buscador de usuarios. |
| **Un pago reportado no es un pago** | «Ya pagué» es una declaración del deudor: entra como *reportado, por confirmar* y **no** suma a la recuperación hasta que alguien lo confirme marcando pagado. |
| **"Pagado" no es conciliación** | Marcar pagado es una anotación operativa: la herramienta no comprueba que el dinero entró, no maneja pagos parciales ni saldos. Los reportes de monto son de promesas y pagos registrados, no un estado de cuenta. |
| **Los montos no se suman en SQL** | Van cifrados en la base (y también en el historial), así que los totales se calculan en la aplicación sobre las filas del periodo. Con el volumen de una cobranza normal es instantáneo; si algún día fueran cientos de miles de gestiones por periodo, habría que paginar el cálculo. |
| **Un intento es un mensaje que salió** | Se cuentan los mensajes salientes que no fallaron y que no son notas internas, posteriores al último mensaje del cliente. Una llamada telefónica no cuenta salvo que se registre el resultado a mano. |
| **El resultado vive en el cliente, no en el hilo** | Con varios números, el estado es el mismo en todos sus hilos: es un cliente. Y "sin contestación" se mide contra la última respuesta del cliente, aunque haya sido en otro número. |
| **La promesa vencida se deduce** | Una promesa con fecha pasada aparece como vencida sin que nadie la marque; "incumplida" (`PROMISE_BROKEN`) es un estado que confirma una persona. Si el cliente paga después, marcar pagado la resuelve sola. |

---

## 4. Seguridad

### Controles implementados

| Área | Control |
| --- | --- |
| **Webhooks** | Firma `X-Hub-Signature-256` obligatoria, comparada en tiempo constante. Un payload sin firma válida se rechaza con 401. |
| **Cifrado en reposo** | Los datos personales se guardan cifrados con AES-256-GCM: teléfono y notas del contacto, contenido y nombre de archivo de cada mensaje, payloads de Meta (respuestas, plantillas enviadas y evento crudo del webhook), variables de campaña, número de cada WABA, **correo de acceso de cada usuario** y bitácora. El cifrado y el descifrado son transparentes (extensión de Prisma), así que ninguna consulta del panel ve texto cifrado. Un respaldo o un volcado de la base no muestra conversaciones, teléfonos ni correos. |
| **Credenciales de Meta** | `accessToken` y `verifyToken` cifrados en la base con AES-256-GCM. Sin la variable `ENCRYPTION_KEY` no se pueden leer. |
| **Índices ciegos** | `Contact.phoneHash` y `User.emailHash` son HMAC-SHA256 con la llave de cifrado: conservan la unicidad y la búsqueda exacta sin que el valor se pueda recuperar del índice. Son los que sostienen el inicio de sesión y la detección de teléfonos o correos repetidos. |
| **Sesiones** | JWT en cookie `httpOnly`, `secure` en producción y `SameSite=Lax`, con registro en base que permite revocarlas. Expiración absoluta de 7 días, **cierre por inactividad** (`SESSION_IDLE_MINUTES`, 12 h por defecto), **tope de dispositivos** por usuario (`SESSION_MAX_ACTIVE`, 3 por defecto: al entrar en uno más se cierra el más viejo) y lista visible con revocación individual o masiva. |
| **Contraseñas** | Hash con bcrypt (12 rondas). Mínimo 10 caracteres con letras y números, sin contraseñas obvias. Cada persona cambia la suya en «Mi cuenta» (con la actual) y **al cambiarla se cierran las demás sesiones**. Cuando un administrador la restablece, quien la recibe **debe cambiarla antes de operar**: así nadie conserva la contraseña de otro. |
| **Fuerza bruta** | Bloqueo de la cuenta tras varios intentos fallidos (configurable) y límite propio de intentos por IP en el login. Todo queda auditado. |
| **Verificación en dos pasos** | TOTP (RFC 6238) hecho con `node:crypto`, sin dependencias nuevas: funciona con cualquier app de autenticación (Google Authenticator, Authy, Microsoft Authenticator). Cada persona la activa desde Mi cuenta → Seguridad. El secreto se guarda **cifrado** (AES-256-GCM) y la activación no se completa hasta confirmar un código, para que nadie se quede fuera por escanear mal. Los códigos fallidos cuentan como intentos fallidos y bloquean la cuenta igual que una contraseña mal escrita. Si alguien pierde el teléfono, un administrador puede desactivarla desde Equipo, con constancia en la bitácora. |
| **Autorización** | Separación estricta `ADMIN` / `AGENT`. Un agente solo puede leer y responder las conversaciones asignadas a él, y la restricción se aplica en la consulta, no solo en la vista. |
| **CSRF** | Toda petición que cambia estado debe venir del mismo dominio configurado en `APP_URL`. Un dominio ajeno recibe 403. |
| **Validación** | Los cuerpos de entrada del panel pasan por esquemas Zod. El webhook se valida con la firma HMAC en lugar de un esquema. |
| **Redirecciones internas** | El cambio de número activo solo acepta rutas internas, para que nadie pueda usar el panel como puente hacia un sitio externo. |
| **Límite de peticiones** | 300 cada 15 minutos **por usuario** en el panel (configurable), 10 en el login por IP, 1,200 por minuto en el webhook (exento del tope general, igual que el healthcheck). El 429 dice cuánto esperar. |
| **Cabeceras y CORS** | Helmet activo y CORS restringido al dominio de la aplicación. La política de contenido (CSP) está desactivada para permitir las vistas actuales; se puede habilitar con nonces. |
| **Exposición de secretos** | Los tokens nunca se envían al navegador (la vista recibe solo una versión enmascarada) y la bitácora redacta cualquier campo que parezca credencial. |
| **Acceso a archivos** | Los archivos no son públicos: se sirven por un endpoint que exige sesión y valida que el usuario pueda ver esa conversación. Un agente sin la conversación recibe 404, y los archivos se guardan fuera del alcance del servidor web. |
| **Borrado con intención** | Ocultar un mensaje es reversible y queda auditado. El borrado definitivo exige escribir `BORRAR` y también queda en la bitácora. El respaldo descargable **no incluye** credenciales de Meta ni contraseñas. |
| **Retención** | La bitácora se purga a los 90 días y los eventos de webhook resueltos a los 30. |
| **Respaldos** | Copia completa de la base cada 24 h, comprimida y cifrada con `ENCRYPTION_KEY`, verificada al crearse y con retención de 7 copias. El archivo guarda los campos tal como están en la base, así que los datos sensibles siguen cifrados dentro del respaldo. |
| **Errores en handlers asíncronos** | Express 4 no atiende las promesas rechazadas de un controlador: la petición se quedaba **colgada sin respuesta** y solo aparecía un rechazo no manejado en el log. Ahora cualquier rechazo llega al manejador de errores (página 500, incidente en la bitácora y alerta externa si está configurada). |

### Lo que la seguridad NO cubre

Ser explícito aquí es parte del trato:

1. **La verificación en dos pasos es opcional y no se puede obligar desde el panel.** Está disponible para cualquier cuenta y el panel de Sistema muestra cuántos administradores la usan, pero si nadie la activa, la contraseña sigue siendo el único factor. Activarla es una decisión de cada persona (o una regla de la empresa, por acuerdo del operador); conviene que los administradores la tengan puesta.
2. **El cifrado es de campos, no del disco.** Un volcado de PostgreSQL ya no expone conversaciones, teléfonos, notas, correos ni credenciales, pero sí los **nombres de los contactos** y la estructura general (con quién se habló, cuándo y cuánto). Los archivos de PostgreSQL y los adjuntos en disco tampoco están cifrados: quien tenga acceso al servidor puede leer todo lo que la aplicación no cifra.
3. **No hay antitivirus ni análisis de adjuntos.** Los archivos se guardan tal como llegan (fuera de la base, en disco).
4. **Los respaldos viven en el mismo servidor.** Hay copia automática cada 24 h y se puede descargar, pero **nadie la saca de ahí sola**: si el disco (o el Volume) se pierde, se pierden la base y sus copias. Conviene descargar una de vez en cuando a un lugar externo, o activar también los respaldos del proveedor. Y los adjuntos no entran en el respaldo.
5. **La sesión no se ata a la IP ni al dispositivo.** Se registra la IP y el dispositivo y se muestran en la lista de sesiones, se cierra por inactividad y hay tope de dispositivos, pero **no se bloquea** una sesión por venir de otra IP: en datos móviles y redes compartidas la IP cambia sola durante el día y bloquearla dejaría a la gente fuera sin motivo. La IP sirve para detectar, no para bloquear.
6. **No hay rotación automática de secretos** ni caducidad de la `ENCRYPTION_KEY`. Perder esa llave deja ilegibles los campos cifrados, no solo los tokens.
7. **No hay prueba de penetración.** Los controles están probados con pruebas automatizadas y verificación manual, no con un pentest externo.
8. **No hay WAF ni protección DDoS propia.** Depende del borde del proveedor.

---

## 5. Responsabilidades del operador

Hay cosas que la herramienta deja del lado de la empresa porque son decisiones de negocio o exigencias de Meta:

- **Consentimiento (opt-in)**: solo escribir a personas que aceptaron recibir mensajes. La herramienta guarda el consentimiento que le registres y avisa cuántos destinatarios de una campaña no lo tienen, pero no lo verifica por ti.
- **Bajas**: la herramienta deja de enviar en automático a quien escriba la palabra clave, y tú marcas la baja de quien la pida por otra vía (teléfono, mostrador). Reactivar a alguien es una decisión tuya y queda auditada.
- **Método de pago en Meta**: si la cuenta no tiene método de pago válido, los envíos fallan con el código `131042` y no salen, aunque la app diga que todo está bien.
- **Plantillas**: usar solo plantillas aprobadas para iniciar conversaciones.
- **Calidad del número**: vigilar la calificación en el panel de Meta; los envíos masivos sin consentimiento la degradan.
- **Calidad por número**: con varios números, cada uno se calienta y se vigila por separado. Un número nuevo arranca en el nivel mínimo de mensajería y necesita su nombre visible aprobado y su registro con PIN antes de enviar.
- **Custodia de `ENCRYPTION_KEY`**: es la llave de los datos cifrados **y de los índices ciegos**. Si se pierde, los teléfonos, los mensajes, las notas, la bitácora y los correos de acceso dejan de poder leerse, además de los tokens de Meta; y los índices dejan de coincidir, así que nadie podría entrar. Guárdala en un gestor de contraseñas, no solo en las variables del proveedor.
- **Respaldos de la base de datos**. Cuidado con el respaldo: para restaurarlo y poder leer los datos hace falta la misma `ENCRYPTION_KEY`.
- **Descargar el respaldo fuera del servidor** de vez en cuando: el respaldo automático vive en el mismo lugar que la base, así que cubre un borrado accidental o una migración mal hecha, no la pérdida del disco completo. Y **probar una restauración** al menos una vez (`npm run db:restore -- --file=… --dry-run` para validar, sin `--dry-run` para restaurar).
- **Acceso del administrador**: crear un segundo administrador desde Equipo y comprobar que puede entrar; definir quién más tiene acceso y dónde se guarda la contraseña. Con un solo admin, cualquier olvido depende del servidor.
- **Respaldos y adjuntos**: confirmar que el volumen de archivos existe y que alguien descarga respaldos con regularidad, porque nada de eso ocurre solo.
- **Cobro y contrato**: dejar por escrito el **mínimo de 3 meses** (es la condición de la oferta, no una recomendación), que la mensualidad es adelantada y que el consumo de Meta va por cuenta del cliente.
- **Entregar la guía de plantillas y la sesión de arranque** al contratar: el cliente arma sus plantillas en Meta (categoría, textos permitidos, botones y variables), y esa guía es la que evita que se las rechacen o que las reclasifiquen a marketing. Revisarlas con él es parte del arranque.
- **Repartir los números entre el equipo** si hay más de uno: hoy todos los agentes ven todos los números. La asignación por persona (tabla usuario ↔ número) está diseñada y pendiente en [`multinumero.md`](multinumero.md).

---

## 6. Estado de calidad y verificación

| Aspecto | Estado |
| --- | --- |
| Pruebas automatizadas | 36 archivos de pruebas unitarias + **72 pruebas de integración** contra PostgreSQL (más 2 destructivas, que solo corren en CI) |
| Verificación de tipos | `npx tsc --noEmit` limpio |
| Migraciones | Versionadas en `prisma/migrations`, con quince aplicadas |
| Integración continua | GitHub Actions en cada push: esquema, tipos, pruebas y build |
| Entorno de build | Node 22 declarado en `package.json` (`engines`) y `.nvmrc`. `nixpacks.toml` instala con `npm install --include=dev` (no `npm ci`: borra `node_modules` y choca con el caché del builder) y compila con `npm run build`. El Build Command del servicio debe quedar vacío para que la instalación no se ejecute dos veces. |
| Verificación de integración | **Automatizada**: un trabajo de CI levanta PostgreSQL, aplica las migraciones y corre la suite contra esa base (`npm run test:integration`). Cubre webhook firmado de punta a punta, cifrado en reposo, campañas, resultados de gestión, respuestas interactivas, llamadas pedidas y el volcado de webhooks, sesiones, contraseñas y respaldos. Dos pruebas destructivas (alta desde cero y restauración) solo corren en CI, donde la base es desechable, con `INTEGRATION_DESTRUCTIVE=1`. |
| Pruebas de interfaz | **Ninguna automatizada.** Los cambios de layout se verifican a mano (capturas en escritorio y móvil); no hay pruebas de navegador. |
| Estilo de código | Sin linter ni formateador automático: la consistencia se mantiene a mano. |

Además de las pruebas unitarias, hay una **suite de integración** que corre en CI contra un PostgreSQL desechable y que se puede correr en local (`npm run test:integration`). Cada archivo crea su propia empresa de prueba y la borra al terminar, así que es segura contra una base de desarrollo. Lo que cubre, automáticamente:

- **Webhook firmado → cola → worker → mensaje guardado**: sin firma responde 401; con firma encola y el worker procesa, resuelve la empresa por el número, crea el contacto (con teléfono cifrado y encontrable por índice ciego), abre el hilo, suma el no leído y no duplica nada cuando Meta reintenta el mismo `wamid`.
- **Baja automática**: un mensaje `STOP` da de baja al contacto y lo registra en la bitácora; una frase que solo menciona la palabra no da de baja a nadie.
- **Cifrado en reposo**: teléfono, notas, cuerpo del mensaje, payload de Meta, monto, variables y **correo del usuario** se escriben cifrados (se comprueba en la columna cruda) y se leen en claro por la aplicación; filtrar por un campo cifrado falla con explicación; los datos anteriores al cifrado se siguen leyendo. En el correo se comprueba además el camino completo: el índice ciego queda calculado, el acceso funciona aunque se escriba el correo en mayúsculas y un correo repetido se rechaza.
- **Campañas**: resuelven `{nombre}`, cifran teléfono y variables del destinatario, excluyen a quien pidió la baja, rechazan una campaña sin destinatarios válidos y se pueden poner en cola y pausar sin perder pendientes.
- **Resultados de gestión**: la promesa vencida se deduce con los días de atraso correctos, marcar pagado la cierra y sale de la lista de trabajo, el cumplimiento la cuenta como pagada tarde, los intentos se cuentan solos y se reinician al responder, el marcado en bloque deja historial con autor.
- **Sesiones y contraseñas**: tope de dispositivos, cierre de sesiones al restablecer la contraseña y al desactivar a alguien, cambio obligatorio, y la regla que impide quedarse sin administrador activo.
- **Respaldos**: se crean cifrados, se vuelven a leer, contienen las tablas y su poda respeta el tope; un archivo ajeno se rechaza.
- **Respuestas que disparan reglas**: «ya pagué» entra como pago reportado (**no** como pagado), «no reconozco la deuda» pausa la cuenta y deja el incidente como error, «no quiero ser contactado» da de baja, una respuesta sin regla queda anotada como no mapeada, y el mapeo por **texto** del botón funciona cuando el identificador no coincide.
- **Respuestas interactivas**: un toque de botón y una elección de lista llegan por el webhook firmado, se guardan con su identificador en claro y su texto cifrado en la columna cruda, dejan su registro en la bitácora y un interactivo sin opción reconocible no rompe nada.
- **Llamadas pedidas (fase 4)**: quien toca el botón aparece en la lista del día con lo que lleva esperando y el origen «El botón»; el atajo **«No contestó»** guarda el resultado y lo saca de la lista; un resultado que no es del atajo —por ejemplo «pagado», que necesita monto y fecha— **se rechaza en lugar de guardarse a la brava**; y el volcado crudo del webhook se ve y se copia desde el panel.
- **Botón de plantilla**: el toque de un botón que viene dentro de una plantilla (`type: "button"`) se guarda y dispara su regla igual que un interactivo. Se comprobó con el payload exacto que llegó en la primera prueba real contra Meta (2026-10-16), donde el toque quedaba como `[button]` porque el código solo esperaba la forma interactiva.
- **Verificación en dos pasos**: con la cuenta protegida, la contraseña correcta **no** abre sesión (devuelve un desafío y no crea ninguna); un código incorrecto no crea sesión y suma un intento fallido; el código correcto abre exactamente una y limpia los intentos; el secreto queda cifrado en la columna cruda; desactivarla exige un código vigente; y un administrador puede apagarla si alguien pierde el teléfono. Se comprobó también que una activación a medias (con la clave generada pero sin confirmar) no bloquea el acceso y se puede descartar.

Los flujos que además se verificaron a mano contra una base real, antes de tener suite:

- Webhook firmado → encolado → procesado por el worker → mensaje guardado → llega en vivo al navegador.
- Rechazo de firma inválida, de origen ajeno y de payload sin firma.
- Bloqueo de cuenta por intentos fallidos y límite de intentos en el login.
- Cifrado de credenciales y lectura de las mismas.
- Cifrado en reposo contra una base con datos reales: la migración del `phoneHash` conserva los contactos existentes, el arranque recalcula los índices pendientes, el alta de un contacto y el webhook guardan teléfono, notas y cuerpos cifrados, y la aplicación sigue leyendo exactamente los mismos valores que antes de cifrar (comparación campo por campo de contactos, mensajes, bitácora, destinatarios de campaña y números de la WABA).
- Cifrado del histórico con `npm run db:encrypt-data` sobre 72 registros existentes, sin que la aplicación cambie lo que lee.
- Webhook firmado contra un contacto ya guardado: no se duplica el contacto y el mensaje entrante queda cifrado.
- Estado `failed` de Meta → bitácora y conversación con el motivo traducido.
- Envío de archivos contra un servidor que simula la Graph API: subida, envío por `media id`, guardado y servido de vuelta.
- Multinúmero: alta de un segundo número, filtrado de la bandeja por número activo, dos hilos para el mismo contacto y envío por el número de cada hilo.
- Campañas en cola: el inicio responde en milisegundos, el worker envía por lotes con pausa entre mensajes, y pausar detiene el envío sin perder los pendientes.
- Salud de la cuenta: plantilla rechazada y calidad marcada por webhook actualizan el estado en el panel y dejan el aviso en la bitácora con el nivel correcto.
- Baja automática y límites (31 comprobaciones contra una base real): el webhook con `STOP` da de baja al contacto, deja el aviso en la bitácora y suma el no leído; el hilo muestra el aviso, esconde el cuadro de escritura y bloquea el envío manual; una campaña con puros contactos dados de baja no se crea, y una mixta excluye solo a esos; reactivar desde la ficha registra el consentimiento; un agente sin permiso no puede enviar, el uso del día cuenta solo los mensajes enviados (no las notas internas) y al llegar al tope se bloquea con el motivo.
- Interfaz del chat revisada con capturas reales en escritorio (1366×900) y móvil (390×844): el compositor se queda en una línea, las acciones (archivo, plantilla, nota y borrado) se ven sin achicar la ventana y el encabezado no se corta. Fue justo lo que faltaba: el primer intento seguía rompiéndose en móvil y solo se vio al mirar la captura.
- Resultados y reportes (36 comprobaciones contra una base real y capturas de las pantallas): promesa con monto y fecha cifrados; la promesa vencida se deduce con los días de atraso correctos; marcar pagado la cierra y la saca de la lista de trabajo; el cumplimiento la cuenta como pagada tarde; tres mensajes salientes suman tres intentos y una respuesta los reinicia; el marcado en bloque alcanza a varios contactos; una promesa sin fecha se rechaza con aviso; los cuatro reportes exportan CSV; y el monto se mostró cifrado en la base cruda.
- **Restauración de un respaldo probada de verdad**: se creó una copia, se borraron **todos** los mensajes y se corrompieron las notas de los contactos, y la restauración devolvió los 41 mensajes y las notas originales byte por byte (comparadas con `diff`). La aplicación siguió leyendo los datos descifrados después de restaurar, porque el respaldo conserva el cifrado tal cual. En esa prueba se descubrió y corrigió el orden de inserción (`Message` referencia a `Campaign`). También se verificó la retención podando con `BACKUP_KEEP=2`, y que `/health`, el panel y el botón de respaldo manual responden.
- **Equipo y contraseñas (16 + 20 comprobaciones)**: se crea un segundo administrador, entra y ve todas las pantallas; con dos admins se puede degradar a uno, pero **degradar o desactivar al último se bloquea** con el motivo a la vista y el botón deshabilitado; un usuario degradado pierde el panel (403) y conserva el de agente. Sobre contraseñas: al restablecerla se cierran las sesiones de esa persona, al entrar el sistema la obliga a cambiarla (no puede ir a ninguna otra pantalla), el cambio propio exige la contraseña actual y rechaza confirmaciones que no coinciden, y la consola `admin:reset-password` genera una temporal, cierra sesiones y también obliga al cambio.
- **Alta de una instalación vacía**: con la base sin empresa ni administrador, la raíz manda a `/setup` y `/health` lo reporta (`adminUserExists: false`); el asistente crea la empresa y el administrador desde el navegador; a partir de ahí el asistente se cierra solo y el panel queda operativo con esa cuenta. Se probó con un respaldo previo y se restauró la base al terminar.

---

## 7. Riesgos conocidos

| Riesgo | Impacto | Mitigación hoy |
| --- | --- | --- |
| Campaña con muchos contactos | Podría tardar más de lo esperado | El envío va en cola con pausa entre mensajes, así que no se corta por timeout; se puede pausar y reanudar |
| Agente sin tope configurado | Podría escribir más de lo previsto | El tope global de la empresa aplica por defecto; el uso del día se ve en Admin → Agentes y en el panel del agente |
| Consentimiento sin verificar | Reportes de clientes y degradación de la calidad del número | La baja por palabra clave es automática y las campañas avisan cuántos destinatarios no tienen opt-in registrado |
| Baja pedida con otras palabras | El cliente sigue recibiendo mensajes | Se marca a mano desde la ficha del contacto; conviene revisar los mensajes que se lean como baja |
| Calidad de un número | Ese número envía menos o queda limitado | La calidad es por número, así que no arrastra a los demás; los avisos de Meta todavía se revisan en su panel (pendiente: alertas dentro de la app) |
| Una sola instancia | Si el servicio se reinicia, la bandeja se reconecta sola | Railway reinicia el servicio automáticamente |
| Pérdida de `ENCRYPTION_KEY` | Los campos cifrados (teléfonos, mensajes, notas, bitácora) y los tokens de Meta quedan ilegibles | Guardarla en un lugar seguro además de las variables, y respaldarla junto con la base |
| Búsqueda por teléfono parcial | Escribir parte del número ya no encuentra contactos | La pantalla de Contactos lo recuerda: se busca por el número completo o por nombre |
| Se pierde el teléfono con la verificación en dos pasos | Esa persona no puede entrar con su contraseña | Un administrador la desactiva desde Equipo y vuelve a entrar con su contraseña; el rescate queda en la bitácora. Conviene activarla también en el teléfono de respaldo |
| Un solo administrador | Si esa persona falta, la instalación queda sin quien la administre | Crear un segundo administrador desde Equipo; la regla impide quedarse en cero, pero no obliga a tener dos. La recuperación desde el servidor existe (`npm run admin:reset-password`) |
| Respaldos en el mismo servidor | Si se pierde el Volume (o el proyecto completo), se van la base y sus copias | Hay copia automática cada 24 h, verificada y con retención de 7; conviene descargar una a un lugar externo de vez en cuando y activar también los respaldos del proveedor |
| Adjuntos sin Volume | Los archivos enviados se pierden en cada deploy | Configurar `MEDIA_STORAGE_DIR` apuntando a un Volume y verificarlo en el checklist de alta |
| Cupo de peticiones compartido | Varios agentes en la misma oficina pueden recibir 429 | Subir el tope o limitar por usuario cuando haya equipo; hoy el acuerdo es operativo |

---

## 8. Qué sigue

El detalle está en [`docs/roadmap-v2.md`](roadmap-v2.md):

**Antes de vender o crecer.**

1. **Sacar el respaldo del servidor**: hay copia automática verificada, pero vive en el mismo Volume que la base. Nadie la mueve a un lugar externo sola.

**Sprint en curso (botones e interacciones).** El plan está en
[`plan-interactivos.md`](plan-interactivos.md). Ya entregado: interpretar las
respuestas de botón y de lista, el envío de plantillas con botones (hilo y
campañas, con las tres variables), el aviso y bloqueo de plantillas
reclasificadas a marketing, **el puente de la respuesta al resultado de gestión
con sus efectos automáticos** (pausa y baja) y **la llamada pedida como tarea de
la lista de trabajo** (fase 4), con su tiempo de espera, su atajo y la pantalla
para copiar el volcado de un webhook.
Ya está también el **contador del tramo del mes por número** (fase 5), con
alerta al 80% y costo estimado, y la **agenda de llamadas** (fase B2) con fecha
y hora, orden por vencimiento y limpieza automática. De la fase 6 quedan las
**listas** desplegables (los botones ya se envían). Y queda una **verificación
pendiente**: la prueba contra Meta
real —plantilla aprobada y botón tocado— para cerrar las fases 3 y 4. Lo que hay
que copiar y de dónde sale está en [`pruebas-meta.md`](pruebas-meta.md).

**Proteger la operación.**

2. **Cifrar los nombres de contacto**, que hoy quedan en claro porque la búsqueda por texto del panel depende de ellos. Al cifrarlos, esa búsqueda pasa a coincidencia exacta con índice ciego. (Los correos de acceso ya se cifraron el 2026-10-15.)
3. **Registro formal del opt-in**: quién lo dio, cuándo y por qué canal, en lugar de una sola fecha.

**Mejorar el día a día de la bandeja.**

4. **Interactivos libres**: mandar botones y listas desde el compositor dentro de la ventana de 24 horas (las plantillas con botones ya se envían y sus respuestas ya se interpretan).
5. **Programar campañas** por fecha y hora.
6. **Recordatorios de la agenda**: la cita ya existe y se ordena por hora; falta que avise sola (notificación o recordatorio al deudor).

**Cuando el equipo crezca.**

7. **Asignar números a agentes** y **repartir campañas entre números** (ver [`multinumero.md`](multinumero.md)).
8. **No leídos por persona**, si el equipo crece y molesta que el aviso sea por conversación.

> La verificación en dos pasos salió de esta lista el 2026-10-15: ya está en el producto.
> Y el 2026-10-16 salieron «interpretar las respuestas de botón y de lista»,
> «enviar plantillas con botones» y «resolver las variables del encabezado y del
> botón» —en el hilo **y en campañas**—, más el aviso y el bloqueo de plantillas
> reclasificadas a marketing, el puente respuesta → resultado de gestión con sus
> efectos automáticos, la llamada pedida como tarea del día y el volcado de
> webhooks para copiar desde el panel.

---

## 9. Cómo comprobar el estado en cualquier momento

```bash
# Estado del servicio: base, cola, worker, webhooks y configuración de seguridad
curl -s https://<tu-dominio>/health

# Pruebas y tipos, en local
npm test
npx tsc --noEmit

# Cifrar los datos que quedaron en claro antes del cifrado en reposo
npm run db:encrypt-data
```

Para comprobar el reparto de dominios:

```bash
# La oferta vive en el dominio del producto (sitio estático aparte)
curl -sI https://margaritaapp.org | head -1

# La instalación de un cliente manda al acceso, no a la oferta
curl -sI https://palencia.margaritaapp.org | grep -i location
```

Para regenerar el sitio de venta después de cambiar un texto o un precio:

```bash
npm run landing:build     # deja la carpeta landing/ lista para subir
```

En el panel:

- **Admin → Sistema**: checklist de configuración y tarjetas de seguridad (cifrado en reposo, firma, cola, alertas, retención). La tarjeta de cifrado dice cuántos registros quedaron en claro de antes del cifrado, si los hay.
- **Mi cuenta → Seguridad**: activar o desactivar la verificación en dos pasos de la propia cuenta (la tarjeta de Sistema dice cuántas cuentas y cuántos administradores la tienen puesta).
- **Admin → WhatsApp**: credenciales de la cuenta, números con su calidad, y cifrado.
- **Admin → Agentes**: permiso de envío manual, tope diario y cuántos mensajes manuales lleva cada agente hoy.
- **Admin → Contactos**: consentimiento y bajas (filtro "Solo bajas").
- **Admin → Logs**: qué pasó y por qué, con el detalle de cada evento.
- **Admin → Logs → Webhooks recibidos**: lo que Meta mandó, tal cual, con botón para copiarlo. Es donde se ve el identificador real de un botón y donde se saca el volcado para reportar un caso.
- **Admin → Reportes → Hoy**: las llamadas pedidas, con su tiempo de espera, y el atajo para despacharlas.
