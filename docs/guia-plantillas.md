# Guía de plantillas — Margarita

Todo lo que hay que hacer en Meta para tener plantillas que **se aprueben**, que
**cuesten poco** y que **funcionen con la app**.

**Publicada** en `margaritaapp.org/plantillas` (y en `landing/plantillas.html`).
Si cambias el texto de la página, actualiza también este archivo.

---

## 1. Por qué existen las plantillas

WhatsApp solo deja escribir **texto libre durante 24 horas** después del último
mensaje del cliente. Para volver a iniciar la conversación —o para escribir a
alguien que no ha respondido— hace falta una **plantilla aprobada por Meta**.

Y no todas cuestan lo mismo:

| Categoría | Para qué es | Costo relativo |
| --- | --- | --- |
| **Utilidad** | Avisos sobre una cuenta, un pago, una entrega, un servicio que la persona ya tiene | Bajo |
| **Marketing** | Promociones, novedades, recuperación de clientes | Varias veces más |
| **Autenticación** | Códigos de un solo uso | Bajo |

Para cobranza, el objetivo es que Meta las clasifique como **utilidad**. La app
te avisa cuando una plantilla quedó como marketing y **no deja usarla en
campañas** sin que lo sepas.

---

## 2. Las cinco reglas que hacen que se aprueben

1. **Habla de la cuenta de esa persona, no de una oferta.** «Le recordamos su
   saldo pendiente» es utilidad; «aproveche el 20% de descuento» es marketing.
2. **Nada de urgencia falsa ni promociones.** Sin «última oportunidad», sin
   «promoción», sin «descuento», salvo que de verdad sea marketing.
3. **Identifícate.** El cuerpo debe decir de qué negocio es el mensaje; el
   cliente tiene que saber quién le escribe sin adivinar.
4. **Un solo objetivo por plantilla.** Recordatorio de pago, confirmación,
   convenio. No mezcles aviso, promoción y encuesta.
5. **Ejemplos reales en cada variable.** Si usas `{{1}}`, Meta pide un ejemplo
   («María»); sin él, la plantilla se rechaza.

---

## 3. Qué puede llenar la app

| Parte | Variables | Nota |
| --- | --- | --- |
| **Encabezado de texto** | **una** | Opcional |
| **Cuerpo** | las que necesites | Se resuelven por destinatario |
| **Botón con URL** | **una, al final** | La parte fija de la URL la pones tú en Meta |

En campañas, las variables se llenan con texto fijo, el **nombre**, el
**teléfono** o cualquier **columna del Excel**. En el hilo se capturan a mano.

Los botones de **respuesta rápida** no llevan variables: su texto es fijo y es
lo que la app usa para saber qué tocó el deudor.

---

## 4. Paso a paso en Meta

1. Entra a **WhatsApp Manager → Plantillas de mensajes** (dentro de tu cuenta de
   WhatsApp Business).
2. **Crear plantilla**.
3. **Nombre**: en minúsculas y con guiones bajos, por ejemplo
   `recordatorio_pago_v1`. No se puede repetir.
4. **Categoría**: `Utilidad` para cobranza.
5. **Idioma**: `es_MX` (español de México).
6. **Contenido**:
   - **Encabezado de texto** (opcional): por ejemplo `Aviso de pago`.
   - **Cuerpo**: el mensaje, con `{{1}}`, `{{2}}`… donde van los datos.
   - **Pie** (opcional): el nombre del negocio.
   - **Botones**: respuesta rápida y/o enlace.
7. **Ejemplos**: llena cada variable con un valor realista.
8. **Enviar a revisión**. Meta suele responder en minutos; a veces tarda hasta
   24–48 horas.

Cuando esté aprobada, en Margarita entra a **Admin → Plantillas → Sincronizar** y
aparece con su estado.

---

## 5. La plantilla de cobranza recomendada

**Nombre**: `recordatorio_pago_asesor`
**Categoría**: Utilidad · **Idioma**: es_MX

**Encabezado**: `Aviso de pago`

**Cuerpo**:

> Hola {{1}}, le escribimos de {{2}} por su cuenta. Tiene un saldo pendiente de
> {{3}}. Si ya lo pagó, puede avisarnos por aquí; si necesita revisarlo,
> con gusto le ayudamos.

**Pie**: `{{2}}`

**Botones**:

1. Respuesta rápida: **Quiero que me llame un asesor**
2. Enlace: **Aviso de privacidad** → `https://suempresa.margaritaapp.org/aviso-de-privacidad`

> El texto del botón importa: es lo que la app usa para reconocer la respuesta
> (además del identificador). «Quiero que me llame un asesor» ya viene mapeado
> en las reglas recomendadas de **Admin → Botones**.

---

## 6. Plantillas que sirven para el día a día

| Momento | Cuerpo sugerido | Variables |
| --- | --- | --- |
| **Recordatorio** | «Hola {{1}}, le escribimos de {{2}} por su cuenta. Tiene un saldo pendiente de {{3}}…» | nombre, negocio, monto |
| **Promesa por vencer** | «Hola {{1}}, le recordamos el pago acordado para el {{2}} por {{3}}…» | nombre, fecha, monto |
| **Convenio** | «Hola {{1}}, quedó registrado su convenio de {{2}}. El primer pago es el {{3}}…» | nombre, monto, fecha |
| **Pago confirmado** | «Hola {{1}}, recibimos su pago de {{2}}. Gracias…» | nombre, monto |
| **Reagendar llamada** | «Hola {{1}}, no pudimos localizarle. ¿A qué hora le podemos llamar?» | nombre |
| **Aviso de baja** | «Hola {{1}}, registramos que no desea recibir mensajes. No le escribiremos más…» | nombre |

---

## 7. Cuando Meta la rechaza

| Motivo típico | Qué corregir |
| --- | --- |
| «Variable sin ejemplo» | Llenar el ejemplo de cada `{{n}}` |
| «Categoría incorrecta» | Si suena comercial, es marketing; si es un aviso de cuenta, es utilidad |
| «Contenido promocional» | Quitar descuentos, urgencias y promesas de beneficio |
| «URL no válida» | La URL del botón debe ser pública y empezar con `https://` |
| «Formato de variable inválido» | Deben ser `{{1}}`, `{{2}}`… sin espacios ni texto dentro |
| «Nombre repetido» | Cambiar el nombre (por ejemplo, `_v2`) |

Una plantilla rechazada no se puede usar: se corrige, se envía de nuevo y, si
Meta la aprueba, se sincroniza en el panel.

---

## 8. Cuidar la calidad del número

- Manda solo a quien dio su consentimiento.
- Respeta las bajas el mismo día.
- No dispares campañas enormes de golpe: la app ya pone una pausa entre
  mensajes, pero el volumen total también cuenta.
- Revisa la calidad del número en **Admin → WhatsApp** y en el panel de Meta.

> Si prefieres no pelearte con esto, lo hacemos nosotros: la conexión con Meta,
> las plantillas y la prueba de punta a punta se cotizan aparte.
