# Dolores, mitos y posts — Margarita

Material para vender: parte del **dolor** del cliente, no de las funciones. Sirve
para tres cosas: escribir publicaciones, guiar la primera conversación de venta y
no prometer de más.

Todo lo que se afirma aquí está contrastado con lo que la herramienta **hace
hoy** ([`alcance-produccion.md`](alcance-produccion.md)) y con cómo funciona la
API de Meta ([`guia-meta.md`](guia-meta.md)). Al final hay una lista de datos que
conviene **verificar antes de publicar**, porque cambian.

---

## 1. El dolor que más duele: que te bloqueen el número

Es el miedo de todos los que cobran por WhatsApp, y no es exagerado: si te
bloquean, te quedas sin el canal por el que hablas con toda tu cartera, y a veces
el bloqueo es definitivo.

**Cómo se ve hoy (app normal de WhatsApp o WhatsApp Business):**

- Le escribes a alguien que no te tiene agregado porque le toca pagar. Esa
  persona te reporta.
- WhatsApp no te pregunta nada: te **bloquea** el número. Primero unos días, y
  a la tercera puede ser permanente.
- Mientras estás bloqueado no puedes escribir a nadie, ni siquiera a quien sí te
  conoce.
- El número vive **dentro de un teléfono**: si se rompe, se pierde o se va el
  vendedor, se va la cartera con él.
- No hay a quién reclamarle. El canal no es de negocios: es personal.

**Por qué pasa:** la app normal está pensada para hablar con conocidos. Cuando
mandas el mismo mensaje a mucha gente que no te tiene agregada, WhatsApp lo lee
como spam y lo castiga con el bloqueo. No importa que tú estés cobrando algo
legítimo: el sistema no lo sabe.

**Qué cambia con la API oficial de Meta (WhatsApp Business Cloud API):**

- El número queda **registrado en Meta como número de empresa**, no como tu
  teléfono personal. No se cae si cambias de celular.
- No te bloquean por escribirle a quien no te tiene agregado, siempre que haya
  **consentimiento** y que la conversación se abra con una **plantilla
  aprobada**.
- Lo que existe, en lugar del bloqueo, es una **calificación de calidad** por
  número (verde, amarilla, roja) y un **límite de mensajes** que empieza bajo y
  sube conforme el número se porta bien. Si la calidad baja, escribes menos
  **pero sigues escribiendo**; cuando el comportamiento mejora, la calidad
  **regresa a su estado normal y el límite sube otra vez**.
- Ese es el cambio de fondo: pasas de "me apagaron el canal" a "me bajaron la
  velocidad, y se recupera".

**Lo que sí hay que decir con honestidad (no lo escondas):**

- La API **no** es inmunidad total: Meta puede restringir o cerrar la cuenta si
  se violan sus políticas (spam, contenido prohibido, denuncias graves y
  sostenidas). La diferencia es que **no te bloquea por escribir a alguien que no
  te tiene agregado**, que es exactamente lo que hace la app normal.
- La calidad no es un adorno: si tus clientes te reportan, baja y escribes menos.
  **La calidad se cuida con consentimiento y con bajas respetadas**, y de eso
  responde quien opera.
- Fuera de la ventana de 24 horas, para iniciar una conversación **se necesita
  plantilla aprobada por Meta**.

**Gancho para publicar:**

> "Me bloquearon el número el lunes. El martes no podía cobrarle a nadie: ni a
> los que ya me conocían. Eso no pasa con la API oficial: ahí la calidad puede
> bajar, pero el canal sigue vivo y se recupera."

---

## 2. Los otros siete dolores

Cada uno está escrito en primera persona, como lo diría el cliente. Úsalos tal
cual en un post o como pregunta en la primera llamada.

### 2.1 «Mi cartera vive en el celular de un vendedor»

**Cómo se ve hoy:** los clientes están en la agenda de una persona. Si esa
persona se va, se enferma o se lleva su teléfono, la empresa se queda ciega: nadie
más sabe quién debe, cuánto ni desde cuándo.

**Qué cambia:** la cartera vive en la herramienta, no en un teléfono. Cada
persona entra con su usuario, ve las conversaciones que le tocan y la empresa
puede reasignarlas cuando alguien falta.

**Gancho:** "El día que se va tu mejor cobrador, ¿te vas a quedar sin saber a
quién le toca?"

### 2.2 «Los tres escribimos del mismo número y no se puede»

**Cómo se ve hoy:** un número de WhatsApp solo se puede abrir en un teléfono (o
en la app web conectada, que echa al otro). Si dos personas contestan del mismo
número, se pisan: se cierra la sesión, se pierden mensajes, nadie sabe quién
contestó.

**Qué cambia:** con la API, varios usuarios atienden desde el mismo número con
una bandeja compartida, con asignación de conversaciones y contador de no leídos.

**Gancho:** "Dos personas no pueden contestar del mismo WhatsApp… hasta que usas
la API."

### 2.3 «El "en qué quedó" vive en Excel y en la cabeza»

**Cómo se ve hoy:** un archivo con una columna "estatus" que nadie actualiza, un
camino de hormigas en un cuaderno, notas en el celular. A fin de mes nadie sabe
cuántos prometieron pagar ni cuántos cumplieron.

**Qué cambia:** cada conversación se marca con un resultado (prometió pagar,
pagó, convenio, promesa incumplida, sin contestación, número inválido, no le
interesa, volver a llamar), con monto, fecha compromiso y nota. La promesa
vencida **se aparece sola** con los días de atraso, y el historial dice quién lo
marcó y cuándo.

**Gancho:** "¿Cuánto te prometieron este mes? Si la respuesta tarda, ahí está el
problema."

### 2.4 «Copiar y pegar doscientos mensajes»

**Cómo se ve hoy:** el equipo se sienta a mandar el mismo recordatorio, uno por
uno, y el que se equivoca de nombre lo paga en confianza. Además, a la mitad de
la lista alguien queda bloqueado por parecer spam.

**Qué cambia:** se sube un Excel y la campaña sale con plantilla aprobada, con
variables por contacto (nombre, monto, fecha), por lotes y con pausa para no
chocar con los límites de Meta. Se puede pausar, reanudar y reintentar los que
fallaron.

**Gancho:** "200 mensajes a mano son dos horas y veinte de tu mejor gente. Con
Excel y una plantilla, son cinco minutos de revisión."

### 2.5 «No sé a quién le toca hoy»

**Cómo se ve hoy:** la lista de a quién cobrarle se arma en la cabeza, por orden
de llegada o por lo que grita más fuerte. Lo que ya venció se pierde entre lo
urgente.

**Qué cambia:** hay una pantalla que junta lo vencido, lo que vence hoy, lo de
esta semana y los que no contestan, en orden de urgencia, con acceso directo a la
ficha.

**Gancho:** "¿Y si el equipo abriera la computadora y ya supiera a quién
escribirle?"

### 2.6 «Una persona me reporta y ni me entero»

**Cómo se ve hoy:** el cliente responde "no me escriban más" o le dice a
WhatsApp que es spam, y como nadie lleva registro, la siguiente semana se le
vuelve a mandar. Ahí empiezan los reportes y la caída de calidad.

**Qué cambia:** si el cliente escribe `STOP`, queda dado de baja al instante y
sale de las campañas siguientes. Además, la calidad de cada número se ve en el
panel, y los avisos de Meta (calidad y plantillas) quedan en la bitácora.

**Gancho:** "Dar de baja a quien lo pide no es un trámite: es lo que evita que te
tumben el canal."

### 2.7 «No sé por qué no salió el mensaje»

**Cómo se ve hoy:** "no se pudo enviar". Sin explicación. ¿Es el número? ¿La
ventana? ¿El método de pago de Meta? ¿La plantilla?

**Qué cambia:** los códigos de Meta se traducen al español en el hilo y en la
bitácora: ventana de 24 horas cerrada, número inválido, plantilla no aprobada,
falta método de pago, límite alcanzado. Sabes qué arreglar en lugar de adivinar.

**Gancho:** "Decir "no se pudo enviar" no es un diagnóstico. Saber que falta el
método de pago, sí."

---

## 3. El costo de no tener control (fórmulas para llenar con tus números)

No hacen falta estadísticas de nadie: es aritmética con los datos del cliente, y
es lo que más pesa en una conversación de venta.

**1. Las promesas que se enfrían**

> Promesas de pago al mes: **[N]**. De cada diez, se quedan sin seguimiento
> **[N]** (porque nadie las ve cuando se vencen). Ticket promedio: **$[N]**.
> Dinero que se queda en la calle al mes: **[N] × $[N] = $[N]**.

**2. Las horas de copiar y pegar**

> Mensajes manuales al día: **[N]**. Segundos por mensaje (abrir chat, copiar,
> pegar, revisar nombre): **40**. Horas al mes: **[N] × 40 × 22 ÷ 3 600 = [N]**.
> Si esa hora cuesta **$[N]**, el copy-paste cuesta **$[N]** al mes.

**3. La cartera que vive en un celular**

> Clientes que atiende la persona que se fue: **[N]**. Días sin que nadie les
> escriba: **[N]**. De esos, cuántos pagan solos (sin recordatorio): **[N]**.
> Los demás: clientes a los que **no les van a cobrar** mientras se recoloca la
> cartera.

**4. El bloqueo**

> Días que el número estuvo bloqueado el año pasado: **[N]**. Mensajes que no
> salieron en esos días: **[N]**. Cobro promedio por día: **$[N]**.
> Costo del bloqueo: **$[N]**.

---

## 4. Mitos y realidad

| Lo que se dice | Lo que pasa de verdad |
| --- | --- |
| «WhatsApp bloquea si mandas muchos mensajes» | En la **app normal** sí: bloquea por reportes de gente que no te tiene agregado, y puede ser permanente. En la **API oficial**, en su lugar hay calidad y límite de mensajería que suben y bajan. |
| «Con la API nunca te pasa nada» | Se puede restringir la cuenta si se violan las políticas. Lo que **no** pasa es el bloqueo por escribirle a alguien que no te tiene agregado, si hay consentimiento y usas plantilla. |
| «Si me bajan la calidad, perdí el número» | No: escribes menos mientras la calidad está baja, y **recupera su estado normal** cuando el comportamiento mejora. |
| «La API es solo para empresas grandes» | Desde que se puede conectar una cuenta de WhatsApp Business, cualquier negocio con cartera la puede usar. |
| «Con la API los mensajes son gratis» | No: **Meta cobra el consumo** (por conversación o por mensaje, según categoría y tarifa vigente para México), con tu método de pago. Margarita no cobra por mensaje. |
| «Necesito un CRM para esto» | No: para cobrar hace falta control de **conversaciones y resultados**, no un CRM. Margarita no administra ventas ni embudos, y no lo pretende. |
| «La API responde sola y contesta a los clientes» | Solo si tú lo activas y solo para preguntas que estén en tu base de conocimiento, con umbral, límites y presupuesto; si duda, entrega la conversación a una persona. |

---

## 5. Posts listos para publicar

### Post A — el bloqueo (tu experiencia, contada)

> Fui ejecutivo de cobranza y lo que más me dolía no era el cliente que no
> pagaba: era que **WhatsApp me bloqueara el número**.
>
> Le escribías a quien te tocaba cobrar, la persona no te tenía agregado, te
> reportaba, y adiós número. Primero unos días. Después, definitivo.
>
> Con la API oficial eso cambia: el número queda registrado como número de
> empresa, no te bloquean por escribirle a alguien que no te tiene agregado, y lo
> que existe es una **calificación de calidad** que puede bajar… y volver a
> subir. Sigues cobrando mientras se recupera.
>
> Esa diferencia, para quien vive de su cartera, es toda la diferencia.
>
> Si cobras por WhatsApp con un celular y un Excel, platícame cómo le haces hoy.

### Post B — el Excel

> Tu cartera no debería vivir en el celular de un vendedor ni en un Excel que
> nadie actualiza.
>
> El día que esa persona falta, la empresa no sabe a quién cobrarle, cuánto le
> prometieron ni desde cuándo.
>
> Nosotros lo ordenamos en un panel: cada cliente con su resultado, su monto, su
> fecha compromiso y quién lo atendió. Las promesas vencidas aparecen solas con
> los días de atraso.
>
> ¿Quieres ver cómo se ve con tu cartera? Mándame un mensaje y te muestro la
> pantalla.

### Post C — la pregunta que incomoda

> Tres preguntas para cualquier equipo de cobranza:
>
> 1. ¿Cuántos clientes prometieron pagar este mes?
> 2. ¿Cuántos de esos ya pagaron?
> 3. ¿A quién le toca hoy?
>
> Si alguna te hace buscar en un cuaderno, en un Excel o en el chat de un
> compañero, el problema no es tu equipo: es que la información no está en un
> solo lugar.

### Post D — el dato que duele (para completar con tus números)

> [N] clientes en cartera. [N] mensajes al día. Si cada mensaje te toma 40
> segundos a mano, son [N] horas al mes que tu mejor gente pasa copiando y
> pegando.
>
> Con campañas por Excel y plantilla aprobada, eso baja a minutos de revisión. El
> tiempo que se libera, se va a hablar con los clientes que sí están dispuestos a
> pagar.

**Cierre que funciona en todos:** no prometas «cobra más». Ofrece **la
demostración con su propia cartera** y deja que el dolor hable.

---

## 6. Preguntas para la primera conversación

Sirven para que el cliente diga el dolor con sus palabras (y para detectar si no
es cliente todavía):

1. ¿Cómo le cobras hoy a tu cartera? (celular, Excel, sistema)
2. ¿Cuántas personas cobran y cuántos números usan?
3. ¿Alguna vez te han bloqueado un número? ¿Qué hiciste?
4. ¿Sabes cuántas promesas de pago tienes vivas hoy?
5. ¿Cómo recuerdas a quién ya le escribiste y a quién no?
6. ¿Qué pasa cuando alguien te dice que no le escribas más?
7. ¿Qué reporte le entregas a tu jefe o a ti mismo a fin de mes?
8. ¿Tienes cuenta de WhatsApp Business y método de pago en Meta?

(Si las respuestas 3, 4 y 5 duelen, el dolor es real y la conversación avanza
sola.)

---

## 7. Lo que NO se debe prometer

Publicar esto desprotegido cuesta clientes enojados y reputación:

- **«No te van a bloquear nunca.»** Falso: Meta puede restringir la cuenta por
  violar políticas. Lo correcto es: «no te bloquean por escribirle a alguien que
  no te tiene agregado».
- **«Puedes mandar a quien sea.»** No: sin consentimiento, la calidad baja y los
  reportes llegan. La base es el opt-in y las bajas respetadas.
- **«Los mensajes son gratis.»** No: los cobra Meta, directo al cliente.
- **«La herramienta contesta sola.»** Solo lo que está en la base de
  conocimiento y dentro de límites; si duda o hay una queja, pasa el hilo a una
  persona. No negocia montos, plazos ni condiciones.
- **Funciones que no existen** (todo esto está fuera del producto): botones y
  listas interactivas, programar campañas por fecha, variables en el encabezado
  de la plantilla, números de otros países, permisos por número y varias
  instancias. La lista viva está en
  [`alcance-produccion.md`](alcance-produccion.md).
- **Resultados que dependen del cliente:** que Meta apruebe una plantilla, que el
  negocio pase la verificación o que el deudor pague.

---

## 8. Datos que hay que verificar antes de publicar

Estos números cambian; consúltalos en el panel de Meta o en sus documentos
oficiales antes de imprimirlos:

1. **La escalera del límite de mensajería** (empieza bajo — y más bajo si el
   negocio no está verificado — y sube a 10 mil, 100 mil y sin límite conforme el
   número se porta bien).
2. **La tarifa de Meta para México** por conversación o por mensaje, y por tipo
   de categoría (marketing, utilidad, autenticación).
3. **Las reglas de la ventana de 24 horas** y cuándo se exige plantilla.
4. **Los requisitos de verificación del negocio** y del nombre visible del
   número, porque de eso depende arrancar con buen límite.

Cifras de usuarios o de mercado: si no traen fuente, no van. Es mejor un caso
propio —«a mí me bloquearon el número el 12 de marzo»— que un dato sin respaldo.
