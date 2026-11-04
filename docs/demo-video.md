# Video de demo de 3 minutos

Guion y lista de tomas para el video que se enlaza en la propuesta de Workana y
en la página `/ia`.

**Regla:** se muestra lo que el producto hace hoy. No se promete constructor de
flujos, alto volumen sin medir ni integraciones que no existen.

**Antes de grabar:** workspace `COMERCIO` con datos inventados, IA en
`sugerencias`, base de conocimiento cargada y panel por conversación con datos.
Ver [`demo-comercio.md`](demo-comercio.md).

---

## 1. Estructura (3:00)

| Tiempo | Qué se ve | Qué se dice |
| --- | --- | --- |
| 0:00–0:20 | Pantalla del panel o landing `/ia` | El problema: el equipo repite las mismas respuestas y los clientes esperan. |
| 0:20–0:40 | Admin → WhatsApp y bandeja | La conexión es con la API oficial de Meta, no con WhatsApp Web. |
| 0:40–1:20 | Conversación con FAQ y tarjeta de borrador | La IA propone; una persona aprueba. Nada sale solo. |
| 1:20–1:50 | Modo automático acotado | Solo responde lo que está en la base. Si duda, entrega. |
| 1:50–2:20 | Conversación con queja o cotización | La IA entrega a una persona con motivo y el hilo se pausa. |
| 2:20–2:45 | Panel de IA del hilo y Admin → IA | Cuántas respondió sola, cuántas entregó, aceptación y costo. |
| 2:45–3:00 | CTA | «Mándame tres preguntas reales y te muestro cómo responde». |

---

## 2. Guion narrado

### 0:00–0:20 · El problema

> «Tu equipo contesta las mismas cinco preguntas todo el día. Mientras tanto,
> los clientes esperan y las conversaciones importantes se pierden. Margarita
> pone una capa de IA sobre WhatsApp, pero con una regla: la IA propone y tu
> equipo autoriza.»

**Toma:** primer plano del panel con la bandeja y mensajes sin leer.

### 0:20–0:40 · La conexión

> «Esto no es WhatsApp Web. Es la API oficial de WhatsApp Business: webhook
> firmado, cola de mensajes, ventana de 24 horas y plantillas aprobadas por
> Meta.»

**Toma:** Admin → WhatsApp con el número conectado y el estado de la cuenta.
No mostrar tokens ni datos sensibles.

### 0:40–1:20 · La IA propone

> «Cuando llega una pregunta, la IA busca en la base de conocimiento del
> negocio y redacta un borrador. Aquí está la confianza, la intención y el
> motivo. El agente puede usarlo, editarlo o descartarlo. Nada sale sin que una
> persona lo apruebe.»

**Toma:** abrir una conversación con una pregunta frecuente. Señalar la tarjeta
del borrador, la confianza y el botón **Usar borrador**. Enviar y mostrar el
mensaje en el hilo.

### 1:20–1:50 · El automático acotado

> «Cuando el equipo ya confía en la base, se enciende el automático acotado.
> La IA solo contesta preguntas cubiertas, dentro de la ventana y con la
> confianza mínima. Si falta cualquier condición, no inventa: entrega.»

**Toma:** Admin → IA con el modo `AUTO`, los límites y el presupuesto. Volver a
la conversación y mostrar una respuesta enviada sola, con su etiqueta.

### 1:50–2:20 · El handoff

> «Esta es la parte que casi nadie trae. El cliente pide una cotización que no
> está en la base. La IA no se la inventa: entrega la conversación a una
> persona, deja el motivo y pausa el hilo. Si alguien del equipo responde, la
> IA se detiene sola.»

**Toma:** conversación de cotización o queja. Mostrar el aviso de handoff, el
hilo pausado y el botón **Reactivar**. No mostrar nombres reales.

### 2:20–2:45 · Todo queda registrado

> «En cada conversación se ve qué hizo la IA: cuántas veces respondió sola,
> cuántas entregó, cuántos borradores aprobó el equipo y cuánto costó. En Admin
> → IA está la aceptación, el consumo y la base de conocimiento.»

**Toma:** panel de IA del hilo (respondió sola, entregó, aprobados, costo) y
luego Admin → IA (aceptación, enviados solos, entregados, costo).

### 2:45–3:00 · Cierre

> «Si quieres verlo con tus propias preguntas, mándame tres consultas reales de
> tu operación. Te muestro cómo responde, cuándo entrega y qué queda
> registrado.»

**Toma:** pantalla final con la dirección del sitio y el botón de WhatsApp de
la página `/ia`.

---

## 3. Lista de tomas

1. Bandeja con mensajes sin leer.
2. Admin → WhatsApp con el número conectado.
3. Conversación con pregunta frecuente y tarjeta de borrador.
4. Envío aprobado por el agente.
5. Admin → IA con modo, límites y presupuesto.
6. Respuesta automática en el hilo.
7. Conversación con handoff y pausa.
8. Panel de IA por conversación.
9. Admin → IA con métricas globales.
10. Cierre con la página `/ia` y el botón de demo.

---

## 4. Qué no decir ni mostrar

- «Somos expertos en IA» o «hacemos lo que necesites».
- «Alto volumen» sin un número medido.
- «Flujos intuitivos» o constructor visual: no existe.
- Cobranza, deudores, montos o promesas: la demo es de comercio.
- Nombres, teléfonos o conversaciones de clientes reales.
- Tokens, claves, correos internos o la base de datos.

---

## 5. Grabación

- Resolución 1080p, navegador sin marcadores ni pestañas personales.
- Zoom del navegador al 110–125 % para que el texto se lea en móvil.
- Tema claro para que coincida con la landing; el panel también tiene modo
  oscuro, pero el video se graba una sola vez.
- Audio: micrófono cerca, sin música de fondo durante la explicación.
- Subtítulos en español; el video se consume sin sonido en redes.
- Guardar el archivo como `demo-margarita-ia.mp4` y subirlo a YouTube no
  listado o a la carpeta pública del sitio.
