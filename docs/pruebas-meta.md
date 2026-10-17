# Pruebas contra Meta real: qué hace falta y cómo se pasa

Este documento existe por una razón concreta: **todo el código de las
respuestas de botón está probado con payloads sintéticos**, y lo único que
falta es comprobarlo contra un botón de verdad. No se puede inventar: el
identificador que Meta manda cuando alguien toca un botón es el dato con el que
se construye el mapeo respuesta → resultado, y solo se ve cuando un deudor real
lo toca.

No hace falta que armes nada especial. Basta con tocar el botón y copiar de la
pantalla.

---

## 1. Lo que se necesita (una sola vez)

| Qué | Dónde se consigue |
| --- | --- |
| Una **plantilla con botón** aprobada por Meta | Panel de Meta, como cualquier otra plantilla de cobranza |
| Un **celular de pruebas** con el número que va a recibir | Tu propio WhatsApp sirve |
| El **webhook conectado** | Admin → Sistema lo confirma; `/health` dice si Meta está entregando |

Se manda la plantilla a ese celular, se abre el mensaje y **se toca el botón**.
Con eso ya hay evento. Lo demás es copiarlo.

---

## 2. Las tres formas de pasarme los datos

De la más rápida a la más completa. Con la primera ya se puede trabajar; la
segunda es la que quiero para dejar constancia y escribir la prueba automática.

### a) Copiar el identificador desde el hilo (dos clics)

En el hilo del contacto, la burbuja del mensaje interactivo muestra la etiqueta
de lo que tocó y, debajo, un botón que dice **`copiar id: …`**. Se toca y queda
en el portapapeles.

Eso es todo lo que hace falta para crear la regla en **Admin → Botones**.

### b) Copiar el evento completo desde el panel (lo que necesito para verificar)

**Admin → Logs → Webhooks recibidos** (o directo, `/admin/logs/webhooks`).

Ahí están los últimos 20 eventos **tal como los mandó Meta**. El más reciente es
el del botón que se acaba de tocar: se abre con «Ver el evento completo» y se
usa **«Copiar evento»**.

Ese texto es el que quiero pegado en el chat. Con él:

1. Confirmo el identificador real (`button_reply.id`) y su texto.
2. Lo guardo como evidencia de la prueba.
3. Escribo la prueba automática que reproduce ese caso exacto.

### c) Si el evento no aparece

Si el panel no muestra ningún evento nuevo, el problema es de conexión, no del
botón. En ese orden:

1. `/health` → dice si Meta está entregando webhooks y si falta alguna variable.
2. Admin → Logs filtrado por módulo **WEBHOOK** → ahí queda el motivo (firma
   inválida, número sin configurar, payload sin `phone_number_id`).
3. Si no hay nada de eso, la copia del log de Railway de los últimos minutos.

---

## 3. La prueba, paso a paso

1. Enviar la plantilla con el botón desde el panel (hilo o campaña) al celular
   de pruebas.
2. En el celular, **tocar el botón** «Quiero que me llame un asesor».
3. Esperar unos segundos (el evento se procesa en la cola).
4. En el panel: abrir el hilo y comprobar que la burbuja muestra la etiqueta
   del botón y el identificador.
5. Copiar el evento completo en **Admin → Logs → Webhooks recibidos**.
6. Mirar **Reportes → Hoy**: el contacto debe aparecer arriba, en «Pidieron que
   los llamen», con el origen «El botón».

Lo que se está comprobando con eso, en una sola pasada: que el toque llega, que
se guarda con su identificador, que dispara la regla, que el cliente entra a la
lista de llamadas y que nada de eso depende de que alguien esté mirando la
pantalla.

---

## 4. Qué espero ver en el evento

**Ojo: hay dos formas y no son la misma.** El botón de una **plantilla** —el de
nuestra plantilla de cobranza— llega así (abreviado; los datos cambian):

```json
{
  "messages": [
    {
      "from": "5215500000000",
      "id": "wamid.<...>",
      "type": "button",
      "button": {
        "text": "Quiero que me llame un asesor",
        "payload": "Quiero que me llame un asesor"
      }
    }
  ]
}
```

El `payload` suele repetir el texto, porque al crear la plantilla solo se
escribe el texto del botón. Por eso el mapeo del panel admite buscar la regla
por el **texto** además del identificador: es la defensa que hace que esto
funcione aunque Meta no mande un id propio.

Un botón **interactivo** (los que se mandan dentro de la ventana de 24 horas, no
desde una plantilla) llega distinto, y una lista también:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "<WABA_ID>",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "phone_number_id": "<PHONE_NUMBER_ID>" },
            "messages": [
              {
                "from": "5215500000000",
                "id": "wamid.<...>",
                "timestamp": "1760000000",
                "type": "interactive",
                "interactive": {
                  "type": "button_reply",
                  "button_reply": {
                    "id": "<LO_QUE_HACE_FALTA>",
                    "title": "Quiero que me llame un asesor"
                  }
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

En el interactivo el dato importante es **`button_reply.id`** (y en una lista,
`list_reply.id`). Las tres formas quedan guardadas igual —como interacción, con
su identificador en claro y su texto cifrado—, así que el resto del circuito no
cambia.

> Las dos formas se descubrieron por separado: la de plantilla, con la primera
> prueba real del 2026-10-16, cuando el toque quedó guardado como `[button]`
> porque el código solo esperaba la forma interactiva. Ya está corregido, y hay
> una prueba de integración que reproduce ese payload exacto.

---

## 5. Lo que sigue después de esta prueba

- Crear en **Admin → Botones** las reglas de cobranza que correspondan y
  dejarlas activas.
- Guardar el volcado en el repositorio como evidencia de la prueba.
- Cerrar la verificación real de las fases 3 y 4, que hoy está probada solo con
  payloads sintéticos.
- Retomar el **contador del tramo de mensajes gratis por número** (fase 5 de
  [`plan-interactivos.md`](plan-interactivos.md)), que no depende de esto pero
  vale más con datos reales de consumo.

> Si además quieres cerrar el documento que se le entrega al cliente al
> contratar —cómo crear sus plantillas: categoría, textos permitidos, botones y
> variables—, ese sigue pendiente de tu lado y no bloquea nada de lo anterior.
