# Guía de uso — Margarita

Para el equipo que cobra por WhatsApp. Es la guía que se entrega al contratar,
junto con la **sesión de arranque de dos horas** y la guía de plantillas.

**Publicada** en `margaritaapp.org/guia` (y en la carpeta `landing/`, como
`guia.html`). Si cambias el texto de la página, actualiza también este archivo:
son el mismo contenido y tienen que decir lo mismo.

La idea en una frase: **cada conversación termina en un resultado**, y cada
resultado alimenta la lista de trabajo del día siguiente. Si el equipo hace eso,
los reportes salen solos.

---

## 1. Antes de la primera sesión

Margarita opera sobre la **API oficial de WhatsApp (Meta)**; no es WhatsApp Web
ni la app normal. Para que funcione hace falta:

| Qué | Quién lo prepara |
| --- | --- |
| Cuenta de WhatsApp Business con el negocio verificado | El cliente, en Meta |
| Número registrado con PIN y **método de pago válido** | El cliente, en Meta |
| Plantillas aprobadas (mínimo la de cobranza) | El cliente, con la guía de plantillas |
| Instalación en su dominio (`suempresa.margaritaapp.org`) y usuario administrador | Nosotros |

> Sin método de pago en Meta los envíos fallan aunque la app diga que todo está
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
| **Dashboard** | Foto del día: conversaciones abiertas, gestiones, promesas vencidas y errores recientes |
| **Conversaciones** | La bandeja: atender, responder, asignar y cerrar |
| **Contactos** | La cartera: datos, etiquetas, consentimiento y resultado actual |
| **Reportes** | **Hoy** y los reportes con exportación a CSV |
| **Botones** | Qué significa cada botón que toca el deudor |
| **Etiquetas** | Cómo agrupar la cartera |
| **Equipo** | Altas del equipo, permisos, límites y contraseñas |
| **Plantillas** | Las plantillas de Meta y su estado |
| **Campañas** | Envíos masivos con control de avance |
| **WhatsApp** | Credenciales, números, calidad de cada número |
| **Respuestas** | Textos guardados para insertar con un clic |
| **Logs / Webhooks** | Qué pasó y por qué; lo que mandó Meta tal cual |
| **Sistema / Respaldos** | Salud del servicio y copias de la base |

---

## 4. Contactos: cómo se llena la cartera

Los contactos llegan por tres caminos:

1. **Escriben por WhatsApp**: se crean solos, con su nombre de perfil.
2. **Subes un Excel o CSV a una campaña**: los números nuevos se dan de alta
   ahí mismo.
3. **Alta manual** en **Contactos → Nuevo**.

Lo que conviene capturar desde el principio:

- **Etiquetas** (`cartera`, `vencido`, `convenio`…): sirven para filtrar y para
  elegir destinatarios de una campaña.
- **Consentimiento (opt-in)**: la fecha en que la persona aceptó recibir
  mensajes. Es lo que te protege ante Meta y ante una queja.
- **Notas**: contexto que no debe ir al cliente.

**Bajas.** Si el cliente escribe `BAJA` o `STOP`, la app lo da de baja al
instante y deja de enviarle todo, incluso si estaba en una campaña en curso. Si
la pide por teléfono o en el mostrador, se marca a mano en su ficha. Reactivar
a alguien es una decisión explícita y queda auditada.

**Búsqueda.** Por **nombre** busca en cualquier parte del texto; por
**teléfono** hay que escribir el número completo (10 dígitos). No hay búsqueda
parcial de teléfono porque el número está cifrado en la base: es el precio de
que un volcado de la base no lo exponga.

**Pausa.** Si el cliente dice que no reconoce la deuda, pon la cuenta en
**pausa** desde su ficha: no recibe mensajes ni campañas hasta que alguien la
quite. Con la regla de botón correspondiente, la pausa se pone sola.

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
- **Ocultar o borrar**: ocultar un mensaje es reversible (el administrador lo
  ve y lo restaura); borrar el hilo completo exige escribir `BORRAR`.
- El contador de no leídos es **por conversación**, no por persona.

Cada mensaje muestra su estado real de WhatsApp: enviado, entregado, leído o
fallido, con el motivo traducido cuando falla.

---

## 6. Plantillas: la parte que abarata el envío

Meta cobra distinto según la categoría de la plantilla: una de **utilidad**
(recordatorio de pago, aviso de cuenta) cuesta una fracción de lo que cuesta
una de **marketing**. Por eso la app:

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
se usa para saber qué tocó el deudor.

---

## 7. Campañas

1. **Campañas → Nueva**. Elige una plantilla **aprobada**.
2. Destinatarios: seleccionando contactos o subiendo un **Excel/CSV** con una
   columna de teléfono. Puedes usar columnas del archivo como variables.
3. Revisa la vista previa: cuántos van, cuántos están dados de baja y cuántos no
   tienen consentimiento registrado.
4. Enviar. El envío corre **en cola**, por lotes y con una pausa entre mensajes
   para no chocar con los límites de Meta.

Durante el envío puedes **pausar**, **reanudar** o **cancelar**, y ver el avance
en vivo. Al terminar, cada destinatario muestra su estado y puedes **reintentar
los fallidos**.

Errores que vas a ver y qué significan:

| Código o mensaje | Qué hacer |
| --- | --- |
| `131042` (método de pago) | Cargar el método de pago en Meta |
| Ventana cerrada | Usar una plantilla aprobada, no texto libre |
| Número inválido | Revisar el número; la app normaliza a formato mexicano |
| Plantilla no aprobada | Esperar la aprobación en Meta y volver a sincronizar |
| Plantilla de marketing | Usar una de utilidad o aceptar el costo |

---

## 8. En qué quedó cada cliente (el corazón de la cobranza)

Se marca desde el hilo, desde la ficha o en bloque desde Contactos. Cada marcado
deja historial con quién y cuándo. El catálogo:

| Resultado | Cuándo usarlo | Pide |
| --- | --- | --- |
| **Promesa de pago** | Dijo que pagará en una fecha | Monto y fecha |
| **Convenio** | Acordaron pagos parciales | Monto y fecha |
| **Pagado** | Confirmaste que el dinero entró | Monto y fecha de pago |
| **Pago reportado** | Dijo «ya pagué» y falta confirmar | — |
| **Promesa incumplida** | Confirmaste que no va a pagar | — |
| **Sin contestación** | No respondió | — |
| **Número inválido** | El número no existe o no es de esa persona | — |
| **Cuenta en disputa** | No reconoce la deuda | — |
| **No le interesa** | Pidió que no se le insista | — |
| **Volver a llamar** | Pidió una llamada | — |
| **Otro** | Lo que no encaja arriba, con nota | — |

Reglas que hacen que los reportes sirvan:

- **Una promesa vencida no hay que marcarla**: si la fecha pasó y nadie
  registró el pago, aparece sola como *«Promesa vencida · N días»* en la lista
  del día y en los reportes. Marcar **pagado** después la resuelve sin deshacer
  nada.
- **«Promesa incumplida» es una confirmación humana**, no un estado automático:
  úsalo cuando ya sabes que no se va a pagar.
- **«Ya pagué» no es pagado**: entra como *pago reportado, por confirmar* y no
  suma a la recuperación hasta que alguien lo verifique.

---

## 9. Botones inteligentes

La plantilla de cobranza lleva botones («Quiero que me llame un asesor», «Ya
pagué», «No reconozco la deuda»…). Cuando el deudor toca uno:

1. El toque queda guardado con su texto y su identificador, visible en el hilo.
2. La app busca la regla en **Admin → Botones** — primero por identificador y,
   si no coincide, **por el texto del botón**.
3. Según la regla, registra el resultado solo y, si corresponde, **pausa** la
   cuenta o **da de baja** al contacto.

Las reglas recomendadas se crean de un clic y no pisan las que ya editaste. Si
un botón no tiene regla, no se inventa nada: queda anotado como «no mapeado» con
su identificador para agregarla en un minuto.

Para crear una regla nueva: en el hilo, la burbuja del botón trae
**`copiar id: …`**. Ese es el dato que se pega en **Botones**.

---

## 10. El día de trabajo: Reportes → Hoy

Es la pantalla que se abre en la mañana. Va de arriba abajo por urgencia:

1. **Pidieron que los llamen.** Son los que ya dieron el paso: la mayor
   intención de pago de la cartera. Muestra cuánto lleva esperando cada uno y si
   lo pidió fuera del horario permitido (**8:00 a 21:00**, hora de la empresa).
   Se despacha con **«No contestó»** o abriendo la ficha para registrar promesa,
   convenio o pago. También se le puede **agendar fecha y hora**: la cita de hoy
   o vencida sube al principio y se marca «Toca ahora». Sale de la lista solo
   cuando se registra otro resultado.
2. **Promesas vencidas**, con monto y días de atraso.
3. **Vencen hoy** y **esta semana**.
4. **Sin contestar** tras varios intentos.

El resto de los reportes:

- **Gestiones**: qué se hizo, quién y cuándo, filtrable por persona, campaña y
  etiqueta.
- **Promesas**: cumplimiento (a tiempo, tarde, sin pago) y prometido contra
  cobrado.
- **Sin contestación**: los que llevan X intentos sin responder.
- **Tendencias**: semana a semana.
- **Detalle**: todo, para bajar en CSV.

Todos se exportan a **CSV** con los filtros que tengas puestos; abre en Excel sin
pelear con los acentos.

---

## 11. Operación: lo que conviene revisar

- **Admin → Sistema**: checklist de configuración y tarjetas de seguridad.
- **`/health`** (sin sesión): base, cola, worker, si Meta está entregando
  webhooks y qué variables faltan.
- **Admin → Logs**: qué pasó y por qué. Los campos que parecen credenciales se
  redactan solos.
- **Admin → Logs → Webhooks recibidos**: lo último que mandó Meta, tal cual. Es
  la pantalla para comprobar el identificador de un botón o para reportar un
  caso con el evento completo.
- **Admin → Respaldos**: copia automática diaria (comprimida y cifrada) y
  descarga manual en JSON. Al terminar el contrato, el borrado total elimina
  mensajes, contactos, campañas, usuarios, credenciales y archivos, y deja
  constancia en la bitácora.

---

## 12. Lo que la app no hace

Para no prometer de más:

- No es un CRM: no maneja ventas, embudos, cotizaciones ni facturación.
- No responde sola ni es un chatbot.
- No crea plantillas en Meta: las plantillas se aprueban allá.
- No cobra ni concilia pagos: «pagado» es una anotación operativa.
- Solo funciona con **números de México**.
- No programa campañas por fecha y hora (se envían ya, con pausa y reanudación).
- No manda botones ni listas **dentro** de la ventana de 24 horas; sí plantillas
  con botones.
- No restringe qué números ve cada agente: con varios números, todos ven todos.
- Los archivos que envía el cliente caducan en Meta a los ~30 días si nadie los
  abrió antes.
- El **consumo de WhatsApp lo cobra Meta** directamente a la empresa; no va en
  la mensualidad.

---

## 13. La rutina que funciona

**En la mañana**

1. Abre **Reportes → Hoy**.
2. Llama primero a los que pidieron llamada; registra el resultado en el momento.
3. Revisa las promesas vencidas y las de hoy.

**Durante el día**

4. Contesta la bandeja y, al cerrar cada conversación, marca el resultado. Es lo
   que hace que mañana la lista tenga sentido.
5. Las notas internas, para lo que el equipo necesita saber.

**Al cierre**

6. Revisa lo que quedó sin contestar y despáchalo.
7. Baja el CSV del día si lo necesitas para tu control.
8. Una vez por semana, revisa **Tendencias** y el cumplimiento de promesas.

---

## 14. Problemas comunes

| Lo que ves | Qué hacer |
| --- | --- |
| No llegan mensajes de WhatsApp | `Admin → Sistema` o `/health`: si Meta no está entregando, revisa el webhook y el App Secret |
| Todo falla con «método de pago» | Cargar el método de pago en Meta (`131042`) |
| «Ventana cerrada» al responder | Pasaron 24 horas: usa una plantilla aprobada |
| Una campaña no se crea | Plantilla no aprobada, o reclasificada como marketing |
| El cliente no recibe nada | Está dado de baja, en pausa o sin consentimiento |
| No puedo buscar por teléfono | Escribe el número completo de 10 dígitos |
| La sesión se cerró sola | Pasó el tiempo de inactividad o alguien cerró las sesiones desde **Sesiones** |
| Olvidé la contraseña | Pídele a un administrador que la restablezca en **Equipo** |
| «Cargando…» y no avanza | Recarga; si sigue, revisa `/health` y los logs |

---

## 15. Soporte y condiciones

- **WhatsApp de soporte**: 55 3878 3682.
- **Correo**: contacto@margaritaapp.org.
- Atención en horario hábil. Incluye correcciones y actualizaciones mientras la
  mensualidad esté activa.
- La **sesión de arranque de dos horas** se agenda después de la instalación:
  ahí se revisan tus plantillas, se carga la primera campaña y se deja al equipo
  operando.
- **Contrato mínimo de 3 meses**. La instalación incluye el primer mes; después
  se paga la mensualidad. El consumo de Meta va por cuenta de la empresa.

> Este documento y la app cambian juntos: si algo de aquí no coincide con lo que
> ves en pantalla, gana la pantalla — y avísanos para corregir la guía.
