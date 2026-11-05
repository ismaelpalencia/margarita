# Guía de uso — Margarita

Para el equipo que atiende por WhatsApp. Es la guía que se entrega al contratar,
junto con la **sesión de arranque de dos horas** y la guía de plantillas.

**Publicada** en `margaritaapp.org/guia` (y en la carpeta `landing/`, como
`guia.html`). Si cambias el texto de la página, actualiza también este archivo:
son el mismo contenido y tienen que decir lo mismo.

La idea en una frase: **cada conversación se atiende, se califica y, cuando hace
falta, se deriva a una persona**. Si el equipo hace eso, el resto del panel
trabaja solo.

---

## 1. Antes de la primera sesión

Margarita opera sobre la **API oficial de WhatsApp (Meta)**; no es WhatsApp Web
ni la app normal. Para que funcione hace falta:

| Qué | Quién lo prepara |
| --- | --- |
| Cuenta de WhatsApp Business con el negocio verificado | El cliente, en Meta |
| Número registrado con PIN y **método de cobro válido** | El cliente, en Meta |
| Plantillas aprobadas (mínimo la de bienvenida) | El cliente, con la guía de plantillas |
| Publicación en su dominio (`suempresa.margaritaapp.org`) y usuario administrador | Nosotros |

> Sin método de cobro en Meta los envíos fallan aunque la app diga que todo está
> bien (error `131042`). Es el problema número uno del primer día.

---

## 2. Entrar y dejar la cuenta segura

1. Abre `https://suempresa.margaritaapp.org`. La raíz lleva directo al inicio de
   sesión.
2. Entra con el correo y la contraseña que te entregaron. Si es la primera vez,
   cámbiala en **Mi cuenta**.
3. Activa la **verificación en dos pasos** en **Mi cuenta → Seguridad**. Sirve
   cualquier app de códigos: Google Authenticator, Authy, Microsoft
   Authenticator, 1Password, Bitwarden o la app **Contraseñas** de Apple. Escanea
   el código QR o captura la clave que aparece debajo.

Reglas de contraseña: mínimo 10 caracteres, con letras y números. Nada de
`1234567890` ni el nombre de la empresa.

**Si alguien pierde el teléfono o la contraseña**: un administrador restablece
la contraseña desde **Equipo** y desactiva la verificación en dos pasos; la
persona debe cambiar la contraseña al volver a entrar. Todo queda en la
bitácora.

En **Sesiones** cada quien ve desde qué dispositivo entró y puede cerrar las
otras. Un administrador ve las de toda la empresa.

---

## 3. El mapa del panel

| Pantalla | Para qué sirve |
| --- | --- |
| **Dashboard** | Foto del día: conversaciones abiertas, sin asignar, agentes y errores recientes |
| **Conversaciones** | La bandeja: atender, responder, asignar y cerrar |
| **Contactos** | Datos, etiquetas, consentimiento y notas |
| **Etiquetas** | Cómo agrupar contactos y segmentar campañas |
| **Equipo** | Altas del equipo, permisos, límites y contraseñas |
| **Plantillas** | Las plantillas de Meta y su estado |
| **Campañas** | Envíos masivos con control de avance |
| **WhatsApp** | Credenciales, números y calidad de cada número |
| **Respuestas** | Textos guardados para insertar con un clic |
| **IA** | Base de conocimiento, modo, límites y consola de prueba |
| **Logs / Webhooks** | Qué pasó y por qué; lo que mandó Meta tal cual |
| **Sistema / Respaldos** | Salud del servicio y copias de la base |
| **Horarios** | Zona horaria, días, hora de apertura y cierre, y qué responde fuera de horario |
| **Leads** | Contactos capturados con su correo e interés, con exportación a CSV |
| **Reportes de servicio** | IA vs persona, primera respuesta, resolución sin persona y preguntas sin cobertura |

> Algunas instalaciones antiguas muestran módulos adicionales según el giro con
> el que nacieron. Si no ves una pantalla en tu menú, no aplica a tu operación.

---

## 4. Contactos: cómo se llena la agenda

Los contactos llegan por tres caminos:

1. **Escriben por WhatsApp**: se crean solos, con su nombre de perfil.
2. **Subes un Excel o CSV a una campaña**: los números nuevos se dan de alta
   ahí mismo.
3. **Alta manual** en **Contactos → Nuevo**.

Lo que conviene capturar desde el principio:

- **Etiquetas** (`cliente`, `prospecto`, `mayoreo`…): sirven para filtrar y para
  elegir destinatarios de una campaña.
- **Consentimiento (opt-in)**: la fecha en que la persona aceptó recibir
  mensajes, **por qué canal** y **quién lo capturó**. Es lo que te protege ante
  Meta y ante una queja.
- **Notas**: contexto que no debe ir al cliente.

**Bajas.** Si el cliente escribe `BAJA` o `STOP`, la app lo da de baja al
instante y deja de enviarle todo, incluso si estaba en una campaña en curso. Si
la pide por teléfono o en el mostrador, se marca a mano en su ficha. Reactivar
a alguien es una decisión explícita y queda auditada.

**Búsqueda.** Por **nombre** hay que escribir el nombre completo; por
**teléfono**, el número completo (10 dígitos en México o con `+` y lada fuera
de México). No hay búsqueda parcial porque nombre y teléfono están cifrados en
la base: es el precio de que un volcado de la base no los exponga.

**Pausa.** Si la persona pide que no se le escriba mientras se revisa un caso,
pon la cuenta en **pausa** desde su ficha: no recibe mensajes ni campañas hasta
que alguien la quite.

---

## 5. La bandeja: atender conversaciones

- Cada agente ve **solo las conversaciones asignadas a él**.
- El estado (**Disponible, Ocupado, Break, Fuera**) lo pone la persona; no se
  queda disponible solo al entrar. La asignación automática va al disponible con
  menos carga.
- **Ventana de 24 horas**: si el cliente escribió en las últimas 24 horas puedes
  mandar texto libre y archivos. Pasado ese plazo, WhatsApp solo permite
  **plantillas aprobadas**; la app te lo avisa en el compositor.
- **Nota interna**: no sale a WhatsApp, sirve para el equipo.
- **Archivos**: imagen hasta 5 MB, video y audio hasta 16 MB, documentos hasta
  100 MB.
- **Respuestas rápidas**: insertan un texto guardado con `{nombre}` y
  `{telefono}` ya resueltos.
- **Enter envía** el mensaje y **Shift + Enter** hace un salto de línea.
- **Botones dentro de las 24 horas**: desde la columna lateral se manda un
  mensaje con hasta **3 botones** de 20 caracteres. Sirve para pedir un sí/no o
  dirigir a una opción sin gastar plantilla. Cuando el cliente toca, la respuesta
  entra al hilo con su identificador y su texto.
- **Listas dentro de las 24 horas** (si el workspace las tiene encendidas): hasta
  **10 opciones**, con título de 24 caracteres y descripción de 72. La respuesta
  entra por el mismo circuito que un botón. Si el límite se pasa, la app no llama
  a Meta y muestra el motivo.
- **Ocultar o borrar**: ocultar un mensaje es reversible (el administrador lo
  ve y lo restaura); borrar el hilo completo exige escribir `BORRAR`.
- El contador de no leídos es **por conversación**, no por persona.

Cada mensaje muestra su estado real de WhatsApp: enviado, entregado, leído o
fallido, con el motivo traducido cuando falla.

---

## 6. Plantillas: la parte que abarata el envío

Meta cobra distinto según la categoría de la plantilla: una de **utilidad**
(confirmación de pedido, aviso de entrega, respuesta a una solicitud) cuesta una
fracción de lo que cuesta una de **marketing**. Por eso la app:

- Sincroniza el estado real de cada plantilla: aprobada, pendiente, rechazada.
- Marca en rojo las que salieron **rechazadas o pausadas**.
- **Avisa y bloquea** las que Meta reclasificó como **marketing**, para que no
  se usen en campañas sin saber lo que cuestan.

Al crear una plantilla, ten en cuenta lo que la app puede llenar:

| Parte de la plantilla | Variables |
| --- | --- |
| Encabezado de texto | **una** |
| Cuerpo | las que necesites |
| Botón con URL | **una, al final de la dirección** |

Los botones de respuesta rápida no llevan variable: su texto es fijo y es lo que
se usa para saber qué tocó el cliente.

---

## 7. Campañas

1. **Campañas → Nueva**. Elige una plantilla **aprobada**.
2. Destinatarios: seleccionando contactos o subiendo un **Excel/CSV** con una
   columna de teléfono. Puedes usar columnas del archivo como variables.
3. Revisa la vista previa: cuántos van, cuántos están dados de baja y cuántos no
   tienen consentimiento registrado.
4. Enviar ahora o **programar** para una fecha y hora (zona de la empresa). La
   campaña programada queda en estado `PROGRAMADA` y el planificador la arranca
   solo; el envío corre **en cola**, por lotes y con una pausa entre mensajes
   para no chocar con los límites de Meta.

**El Excel, sin adivinar.** Al elegir la plantilla, la página te dice **qué
columnas debe traer tu archivo** y te deja **descargar un ejemplo** con los
encabezados exactos (`phone`, `name`, `var1`, `var2`… y `encabezado` o `enlace`
si la plantilla los pide) y una fila de muestra. Bájalo, llénalo y súbelo tal
cual. Si el archivo trae **columnas de más**, no pasa nada: solo se usan las que
referencias. Si le **falta** una que usas, la app dice cuál falta y cuáles hay.

Durante el envío puedes **pausar**, **reanudar** o **cancelar**, y ver el avance
en vivo. Al terminar, cada destinatario muestra su estado y puedes **reintentar
los fallidos**.

Errores que vas a ver y qué significan:

| Código o mensaje | Qué hacer |
| --- | --- |
| `131042` (método de cobro) | Cargar el método de cobro en Meta |
| Ventana cerrada | Usar una plantilla aprobada, no texto libre |
| Número inválido | Revisar el número; la app normaliza a formato mexicano |
| Plantilla no aprobada | Esperar la aprobación en Meta y volver a sincronizar |
| Plantilla de marketing | Usar una de utilidad o aceptar el costo |

---

## 8. IA de respuestas

La IA de Margarita no es un chatbot general: responde **solo** con la base de
conocimiento del negocio y dentro de límites.

- **Admin → IA → Base de conocimiento**: pregunta, respuesta, palabras clave y
  prioridad. Si el dato no está, la IA no inventa: entrega el hilo a una persona.
- **Modos**: apagado, **sugerencias** (redacta y tu equipo decide) y
  **automático acotado** (responde solo lo cubierto, con umbral de confianza,
  límites por día y por hilo, y presupuesto mensual).
- **En la bandeja**: en sugerencias ves una tarjeta con el borrador, la confianza
  y el motivo. **Usar borrador** lo copia al compositor; **Descartar** lo quita.
  Nada se envía sin aprobación en ese modo.
- **Control humano**: cualquiera puede **pausar o reactivar** la IA en un hilo.
  Responder a mano la pausa automáticamente.
- **Entrega**: si la IA duda, detecta una queja o falta conocimiento, asigna la
  conversación al agente con menos carga y deja el motivo a la vista.
- **Consola de prueba**: escribe una pregunta y ve qué respondería, qué entradas
  usó, el modelo y la latencia. No guarda nada ni toca un hilo real.

Con `AI_ENABLED=false` la herramienta funciona igual que antes: la IA no
interviene.

**Idiomas.** En **Admin → IA → Idiomas** puedes activar inglés y/o portugués;
el español siempre está disponible. Si el cliente escribe en un idioma
habilitado, la IA responde en ese idioma. La interfaz y las plantillas siguen en
español.

**Paquete inicial.** En **Admin → IA → Paquete inicial** puedes cargar flujos
precargados (bienvenida, horarios, estado de un pedido, cotizar, hablar con una
persona) y una base de conocimiento lista, por vertical (comercio, servicios o
genérico). Un flujo responde solo cuando el mensaje contiene su palabra clave;
la respuesta puede traer botones o lista. Cargar dos veces no duplica nada ni
pisa lo que ya editaste.

---

## 9. El día de trabajo

**En la mañana**

1. Abre el **Dashboard**: conversaciones abiertas, sin asignar y errores
   recientes.
2. Revisa la **bandeja**: lo nuevo, lo no leído y lo que quedó pendiente.
3. Si tu cuenta tiene módulo de resultados, abre **Reportes → Hoy** y
   empieza por lo que ya pidió atención.

**Durante el día**

4. Contesta y asigna. Si la IA dejó un borrador, decídelo tú.
5. Cuando la conversación lo pida, **deriva** a una persona o pausa la IA.
6. Usa notas internas para lo que el equipo necesita saber.

**Al cierre**

7. Revisa lo que quedó sin contestar y despáchalo.
8. Si usas reportes, baja el CSV del día.
9. Una vez por semana, revisa el consumo de IA y la calidad de tus respuestas.

---

## 10. Operación: lo que conviene revisar

- **Admin → Sistema**: checklist de configuración y tarjetas de seguridad.
- **`/health`** (sin sesión): en producción devuelve solo el estado; con
  `?token=` (variable `HEALTH_TOKEN`) muestra base, cola, worker, si Meta está
  entregando webhooks y qué variables faltan.
- **Admin → Logs**: qué pasó y por qué. Los campos que parecen credenciales se
  redactan solos.
- **Admin → Logs → Webhooks recibidos**: lo último que mandó Meta, tal cual. Es
  la pantalla para comprobar el identificador de un botón o para reportar un
  caso con el evento completo.
- **Admin → Respaldos**: copia automática diaria (comprimida y cifrada), copia en
  Cloudflare R2 cuando está configurado y descarga manual en JSON. Al terminar el
  contrato, el borrado total elimina mensajes, contactos, campañas, usuarios,
  credenciales y archivos, y deja constancia en la bitácora.
- **Admin → Configuración → Horarios**: si activas el horario de atención, los
  mensajes que llegan fuera de él no se asignan a un agente. Según el modo
  configurado responden con tu mensaje de fuera de horario (una vez por
  intervalo), responden con IA si la base cubre la pregunta, o solo se encolan
  para la mañana. Apagado, todo se atiende como siempre.

---

## 11. Lo que la app no hace

Para no prometer de más:

- No es un CRM: no maneja ventas, embudos, cotizaciones ni facturación.
- No responde cualquier cosa: la IA solo cubre la base de conocimiento y
  entrega cuando duda.
- No crea plantillas en Meta: las plantillas se aprueban allá.
- No procesa cobros ni concilia transacciones.
- En México se capturan **10 dígitos**; para otro país, el número completo con
  `+` y lada. Meta valida que el número exista y pueda recibir mensajes.
- Dentro de la ventana de 24 horas **sí** manda botones (hasta 3) y listas
  (hasta 10 opciones, si el workspace las tiene encendidas). Las plantillas con
  botones también se envían.
- No restringe qué números ve cada agente: con varios números, todos ven todos.
- Los archivos que envía el cliente caducan en Meta a los ~30 días si nadie los
  abrió antes.
- El **consumo de WhatsApp lo cobra Meta** directamente a la empresa; no va en
  la mensualidad.

---

## 12. La rutina que funciona

1. **Responde rápido lo nuevo.** La bandeja ordena por no leídos y asignación.
2. **No dejes crecer la cola.** Lo que no puedas atender hoy, asígnalo o
   respóndele con una plantilla.
3. **Una conversación, un contexto.** Usa notas internas y etiquetas.
4. **La IA propone, la persona decide.** En sugerencias, revisa antes de enviar.
5. **Cierra el día con la bandeja vacía de pendientes.**

---

## 13. Problemas comunes

| Lo que ves | Qué hacer |
| --- | --- |
| No llegan mensajes de WhatsApp | `Admin → Sistema` o `/health`: si Meta no está entregando, revisa el webhook y el App Secret |
| Todo falla con «método de cobro» | Cargar el método de cobro en Meta (`131042`) |
| «Ventana cerrada» al responder | Pasaron 24 horas: usa una plantilla aprobada |
| Una campaña no se crea | Plantilla no aprobada, o reclasificada como marketing |
| El cliente no recibe nada | Está dado de baja, en pausa o sin consentimiento |
| No puedo buscar por teléfono | Escribe el número completo: 10 dígitos en México o con `+` y lada para otro país |
| La sesión se cerró sola | Pasó el tiempo de inactividad o alguien cerró las sesiones desde **Sesiones** |
| Olvidé la contraseña | Pídele a un administrador que la restablezca en **Equipo** |
| «Cargando…» y no avanza | Recarga; si sigue, revisa `/health` y los logs |

---

## 14. Soporte y condiciones

- **WhatsApp de soporte**: 55 3878 3682.
- **Correo**: contacto@margaritaapp.org.
- Atención en horario hábil. Incluye correcciones y actualizaciones mientras la
  mensualidad esté activa.
- La **sesión de arranque de dos horas** va incluida en el plan y se agenda
  después del alta: ahí se revisan tus plantillas, se carga la primera campaña y
  se deja al equipo operando.
- **El primer mes tiene garantía de satisfacción**: si no te convence, te
  devolvemos la mensualidad. Después se paga mes a mes. El consumo de Meta va
  por cuenta de la empresa.

> Este documento y la app cambian juntos: si algo de aquí no coincide con lo que
> ves en pantalla, gana la pantalla — y avísanos para corregir la guía.
