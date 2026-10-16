![PALENCIA](../marca/logo-palencia-96.png)

# Roadmap · Botones e interacciones en Margarita

Versión 0.1 · 15 de octubre de 2026

Especificación de desarrollo para la evolución que convierte Margarita en una herramienta que **no solo
manda mensajes, sino que recibe respuestas estructuradas**. Complementa las secciones 3 y 8 de
`alcance-produccion.md`, que hoy declaran estos dos límites:

> **Sin botones ni listas** — Se envían texto, plantillas y archivos, pero todavía no mensajes
> interactivos (botones o listas).
>
> **Respuestas de botones sin interpretar** — Si un cliente toca un botón, se guarda como mensaje
> interactivo genérico, sin saber qué opción eligió.

---

## 0. Por qué ahora, y no es solo por comodidad

**El 1 de octubre de 2026 Meta empezó a cobrar los mensajes de servicio**: las respuestas libres dentro
de la ventana de 24 horas, que antes eran gratis, se cobran **por mensaje, a la tarifa de utilidad y sin
descuentos por volumen**. Cada número tiene 1,000 mensajes de servicio gratis al mes y de ahí en
adelante se paga. Las plantillas de utilidad enviadas dentro de la ventana también dejaron de ser
gratis.

Eso cambia la aritmética de una operación de cobranza. Una conversación que hoy consume cinco mensajes
—"¿quién habla?", "¿de qué crédito?", "no reconozco", "déjeme ver", "ya pagué"— cuesta cinco cargos. La
misma conversación resuelta con **un botón en la plantilla** cuesta uno solo, y encima deja un dato
estructurado en lugar de un texto que alguien tiene que interpretar.

Hay un segundo efecto que conviene tener presente: **cada toque del deudor es un mensaje entrante**, así
que **reinicia la ventana de 24 horas** y, con ella, el contador de intentos que ya usa el módulo de
resultados. Un botón no solo ahorra dinero: también mejora la contactabilidad medida.

Y un tercero, que es el más valioso: hoy hay **tres límites documentados del producto que un botón
resuelve de raíz**:

| Límite actual | Cómo lo resuelve un botón |
|---|---|
| "Baja solo por palabra clave": si el deudor pide la baja con otras palabras, hay que marcarla a mano | Un botón "No quiero ser contactado" registra la baja sin ambigüedad y sin depender de que escriba `STOP` |
| "Respuestas de botones sin interpretar" | El botón trae un identificador, no texto libre |
| Los mensajes de servicio ahora se cobran | Se resuelve en un toque en lugar de cinco mensajes |

---

## 1. Alcance de esta evolución

**Entra:**

| Fase | Qué |
|---|---|
| 1 | **Interpretar** las respuestas de botones y listas que ya llegan y hoy se guardan como genéricas |
| 2 | **Plantillas con botones**: enviar plantillas aprobadas cuyos componentes incluyan botones de respuesta rápida y de URL, con variables en el encabezado y en el botón de URL |
| 3 | **Puente con el resultado de gestión**: mapear cada respuesta a un resultado de cobranza y disparar las reglas que ya existen (pausa, aviso al acreedor, baja) |
| 4 | **El botón que agenda una llamada**: convertir el toque del deudor en una tarea de llamada, para resolver el caso sin un solo mensaje de servicio |
| 5 | **El contador del tramo por número y el enrutamiento**: administrar los 1,000 mensajes de servicio gratis de cada número como un presupuesto |
| 6 | **Mensajes interactivos libres**: botones y listas dentro de la ventana de 24 horas |
| 8 | **Llamadas por WhatsApp**: iniciar y recibir llamadas dentro del mismo hilo, con el número verificado (la 7, Flows, queda fuera de este alcance) |

**No entra, y hay que resistir la tentación:**

- **WhatsApp Flows** (formularios). Es la fase siguiente, después de esto. Ver sección 8.
- **Llamadas por WhatsApp.** Se investigaron y **sí se pueden**, pero implican construir audio en tiempo
  real: es un producto dentro del producto. Quedan documentadas en la sección 9 para retomarlas cuando el
  proyecto esté terminado. Mientras tanto, la llamada telefónica normal resuelve y no cuesta.
- Botones en plantillas de autenticación: Meta controla ese contenido.
- Interpretar respuestas generadas por la IA de Meta (Business Agent): es otra categoría de cobro.
- Envío de catálogos o carruseles de producto.

---

## 2. Fase 1 · Interpretar lo que ya llega

**Es el arranque más barato porque el webhook ya recibe estos eventos.** Hoy la aplicación los guarda
como mensaje interactivo genérico y pierde el dato.

### 2.1 Lo que llega

Cuando el deudor toca un botón:

```json
{
  "messages": [{
    "from": "5215512345678",
    "id": "wamid.HBgLNTIxNTUxMjM0NTY3OBUCABIYFj...",
    "timestamp": "1760000000",
    "type": "interactive",
    "interactive": {
      "type": "button_reply",
      "button_reply": { "id": "YA_PAGUE", "title": "Ya pagué" }
    }
  }]
}
```

Cuando elige de una lista:

```json
{
  "messages": [{
    "from": "5215512345678",
    "type": "interactive",
    "interactive": {
      "type": "list_reply",
      "list_reply": {
        "id": "PAGO_PARCIAL",
        "title": "Pago parcial",
        "description": "Abonar una parte y acordar el resto"
      }
    }
  }]
}
```

### 2.2 Qué construir

1. **Detectar** `type: "interactive"` y sus dos subtipos (`button_reply`, `list_reply`) en el
   procesamiento del webhook, sin cambiar el contrato del endpoint.
2. **Guardar** en el mensaje: el subtipo, el `id` de la respuesta y su `title`.
3. **Renderizar** en el hilo como una burbuja distinta y legible —"El deudor tocó: Ya pagué"— en lugar
   de un mensaje genérico.
4. **Registrar en la bitácora** el `id`, que es lo que después se mapea a un resultado.

### 2.3 Decisión de cifrado que hay que tomar aquí

La política del producto es cifrar el contenido de los mensajes. Hay que separar dos campos:

| Campo | Tratamiento propuesto | Por qué |
|---|---|---|
| `interactiveReplyId` | **En claro** | Es un código del negocio (`YA_PAGUE`), no un dato personal, y hay que poder **filtrar y agregar** por él. Cifrarlo obligaría a recorrer toda la tabla |
| `interactiveReplyTitle` | **Cifrado**, como el cuerpo del mensaje | Puede contener texto libre si el despacho arma las opciones con datos del deudor |

Si se cifra el `id`, la fase 3 no se puede hacer con consultas eficientes. Esta decisión hay que
tomarla antes de escribir la migración.

### 2.4 Criterio de aceptación

- Un toque de botón se ve en el hilo con su etiqueta, no como texto genérico.
- El `id` queda en la bitácora y en la base en claro, consultable.
- Prueba de integración contra PostgreSQL: se recibe un `button_reply`, se guarda y se lee de vuelta.
- Prueba de integración: un `list_reply` con descripción se guarda completo.
- Nada de esto rompe el procesamiento de mensajes de texto, imagen o audio que ya funciona.

---

## 3. Fase 2 · Plantillas con botones (la prioridad)

**Es la fase que más vale, y por una razón de mecánica, no de gusto:** una plantilla es el **primer
contacto**. Es lo único que se puede enviar fuera de la ventana de 24 horas. Si el botón va en la
plantilla, el deudor puede responder **sin que exista conversación previa** — y esa es exactamente la
situación de una cartera vencida.

Los mensajes interactivos libres de la fase 6 solo funcionan **después** de que el deudor escribió. Por
eso van después, aunque parezcan más fáciles.

### 3.1 Los dos tipos de botón que hay que soportar

| Tipo | Para qué sirve en cobranza | Límite |
|---|---|---|
| **Respuesta rápida** (`QUICK_REPLY`) | "Ya pagué", "Necesito plazo", "No reconozco la deuda" | Hasta 10 por plantilla según la documentación vigente, sujeto a reglas de combinación. En la práctica, 3 es lo que cabe legible en un celular |
| **URL** | "Ver mi estado de cuenta", "Descargar mi convenio" | El texto del botón es corto; la URL admite **una sola variable al final** |

### 3.2 El hueco actual que hay que cerrar

Hoy se resuelven variables **solo del cuerpo**. Hay que agregar:

1. **Una variable en el encabezado de texto.** Meta permite exactamente una.
2. **Una variable al final de la URL** de un botón de tipo URL, con codificación de caracteres
   especiales.

### 3.3 Cómo se crea la plantilla (con botones)

```json
{
  "name": "recordatorio_pago_con_opciones",
  "language": "es_MX",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Crédito {{1}}",
      "example": { "header_text": ["CP-20260001"] } },
    { "type": "BODY",
      "text": "Estimado(a) {{1}}: su crédito presenta un saldo de {{2}} al {{3}}.\n\nElija una opción y le damos seguimiento.",
      "example": { "body_text": [["María Fernanda Ríos Aguilar", "$6,491.77", "15 de octubre de 2026"]] } },
    { "type": "FOOTER", "text": "Los pagos se realizan directamente al acreedor" },
    { "type": "BUTTONS", "buttons": [
        { "type": "QUICK_REPLY", "text": "Ya pagué" },
        { "type": "QUICK_REPLY", "text": "Necesito plazo" },
        { "type": "URL", "text": "Ver mi cuenta", "url": "https://ejemplo.mx/cuenta/{{1}}",
          "example": ["https://ejemplo.mx/cuenta/CP-20260001"] }
    ] }
  ]
}
```

### 3.4 Cómo se envía, con las tres variables resueltas

```json
{
  "messaging_product": "whatsapp",
  "to": "5215512345678",
  "type": "template",
  "template": {
    "name": "recordatorio_pago_con_opciones",
    "language": { "code": "es_MX" },
    "components": [
      { "type": "header", "parameters": [ { "type": "text", "text": "CP-20260001" } ] },
      { "type": "body", "parameters": [
          { "type": "text", "text": "María Fernanda Ríos Aguilar" },
          { "type": "text", "text": "$6,491.77" },
          { "type": "text", "text": "15 de octubre de 2026" } ] },
      { "type": "button", "sub_type": "url", "index": "0",
        "parameters": [ { "type": "text", "text": "CP-20260001" } ] }
    ]
  }
}
```

### 3.5 El punto que hay que verificar con una plantilla real, antes de construir nada más

**No está confirmado qué regresa Meta en el `id` de un botón que viene de una plantilla.** Puede
regresar el texto del botón, o un identificador propio; y depende de cómo se haya creado la plantilla.
De eso depende **toda** la fase 3.

Instrucción: **crear una plantilla de prueba con un botón, enviarla a un número real, tocarla y mirar el
webhook**. Ese volcado se guarda como evidencia en el repositorio.

Y la defensa por si el `id` no es confiable: **mapear también por `title`**, que es lo que el deudor ve.
El mapeo por `title` tiene el riesgo de que alguien edite el texto del botón y rompa la regla, así que
si se usa, hay que validarlo al cargar la plantilla en el producto.

### 3.6 Cuidado con la categoría

La plantilla debe quedarse en **utilidad**. Meta reclasifica a **marketing** si detecta lenguaje
promocional, y la diferencia de precio es de cinco veces. Para una plantilla de cobranza:

- Nada de "aprovecha", "descuento especial", "última oportunidad", mayúsculas sostenidas ni emojis.
- Los botones deben ser **transaccionales**: "Ya pagué", "Necesito plazo", "No reconozco la deuda",
  "Ver mi cuenta". Todos se leen como gestión de una cuenta, no como promoción.
- El pie de la plantilla es un buen lugar para la frase obligatoria de que los pagos van directo al
  acreedor.

### 3.7 Lead time que hay que presupuestar

Las plantillas se aprueban en **24 a 48 horas** y suele haber más de un rechazo. Por eso esta fase debe
**arrancar en paralelo con la fase 1**, aunque se termine después: el cuello de botella es Meta, no el
código.

### 3.8 Criterio de aceptación

- Se puede definir una plantilla con botones de respuesta rápida y de URL desde el producto.
- Se envían resueltas las variables del cuerpo, **del encabezado y del botón de URL**.
- Una campaña puede usar una plantilla con botones y registra, por destinatario, el estado real de
  entrega.
- El panel avisa si una plantilla con botones cambió de categoría a marketing.
- Prueba de integración con un servidor que simula la Graph API: el cuerpo enviado incluye los tres
  componentes con sus parámetros.

---

## 4. Fase 3 · El puente con el resultado de gestión

Aquí es donde los botones dejan de ser una mejora de mensajería y se vuelven dinero y evidencia.

### 5.1 La tabla de mapeo

Un catálogo editable por el despacho que liga cada `id` de respuesta con el resultado de gestión que el
producto ya maneja:

| `id` del botón | Resultado de gestión | Efecto automático |
|---|---|---|
| `YA_PAGUE` | Pago reportado por el deudor | **No** marca pagado. Queda como **reportado, pendiente de confirmar** y entra a la sección de pagos reportados del reporte semanal |
| `NECESITO_PLAZO` | Volver a llamar / promesa en negociación | Crea una tarea para el agente |
| `PAGO_TOTAL`, `PAGO_PARCIAL`, `CONVENIO` | Volver a llamar con intención declarada | Tarea con la intención anotada |
| `NO_RECONOZCO` | En disputa | **Pausa la cuenta de inmediato** y avisa al responsable designado, conforme a la regla de conducta |
| `NO_CONTACTAR` | Baja | **Registra la baja el mismo día**, sin depender de la palabra clave |
| `NUMERO_INVALIDO` | Número inválido | Marca el dato para depuración con el acreedor |

**La distinción de `YA_PAGUE` es la más importante del documento.** El propio alcance del producto dice
que *"marcar pagado es una anotación operativa: la herramienta no comprueba que el dinero entró"*. Un
botón no cambia eso. Si `YA_PAGUE` marcara pagado, el producto estaría reportando como recuperación algo
que no se ha conciliado, y eso rompe la regla de que **la comisión solo se calcula sobre recuperación
confirmada por escrito por el acreedor**.

La solución es elegante: `YA_PAGUE` alimenta **la sección 3 del reporte semanal** —"Pagos reportados por
deudores, pendientes de tu confirmación"— que ya existe en la plantilla del reporte. El botón convierte
una conversación en un renglón de conciliación.

### 5.2 Reglas que se disparan solas

| Respuesta | Qué dispara, con el código que ya existe |
|---|---|
| `NO_RECONOZCO` | Pausa inmediata + notificación al responsable designado + clasificación del incidente en la bitácora |
| `NO_CONTACTAR` | Baja registrada + bloqueo de envíos + auditoría, igual que la palabra clave |
| `YA_PAGUE` | Renglón en pagos reportados pendientes de confirmación |

### 5.3 Criterio de aceptación

- Tocar un botón de la plantilla crea el resultado correcto **sin intervención del agente**.
- `NO_CONTACTAR` deja el contacto dado de baja y bloquea cualquier envío de campaña en curso.
- `NO_RECONOZCO` pausa la cuenta y deja el incidente en la bitácora.
- `YA_PAGUE` aparece en la sección de pagos reportados del reporte semanal y **no** en recuperación.
- Pruebas de integración para cada uno de los cinco efectos.

---

## 5. Fase 4 · El botón que agenda una llamada

Es el caso más barato que puede existir, y el que más sube la contactabilidad: **un solo mensaje pagado
—la plantilla— y una resolución por teléfono, que no pasa por Meta.**

### 5.1 Cómo funciona

1. La plantilla de la campaña lleva un botón: **"Quiero que me llamen"**.
2. El deudor lo toca. Llega como un `button_reply` con el identificador `LLAMARME` (fase 1).
3. El mapeo de la fase 3 le asigna el resultado **Solicita llamada** y **crea una tarea** para el agente.
4. La tarea entra a la **lista de trabajo del día**, que ya existe. No hace falta una pantalla nueva: es
   una fuente más de renglones en la lista que el agente ya usa.
5. El agente llama, y el resultado de la llamada se registra con el mismo catálogo de resultados
   (promesa de pago, convenio, no le interesa, número inválido, volver a llamar).

### 5.2 La regla que ahorra dinero en cada toque

**El botón no debe disparar una respuesta automática.** Nada de contestar "un asesor le llamará": ese
mensaje es un mensaje de servicio y se cobra en **todos** los toques.

La confirmación va en el **pie de la plantilla** —"un asesor le llamará dentro del horario de
atención"— y no cuesta nada, porque el pie ya viene con la plantilla pagada.

Es una línea de texto la que decide si pagas o no pagas un mensaje por cada deudor que pide llamada.

### 5.3 Las reglas de conducta se aplican igual

No es una llamada telefónica cualquiera: es cobranza, y las reglas ya están escritas en el Anexo B del
contrato de servicios.

| Regla | Cómo se implementa |
|---|---|
| Horario | La tarea muestra la hora **del huso del deudor** y solo es trabajable de 8:00 a 21:00 en días hábiles |
| Identificación | El agente se identifica completo, igual que por escrito |
| Un solo interlocutor | La tarea es de quien va a atender la cuenta; no se reasigna sin motivo |
| Constancia | El resultado de la llamada se registra con fecha, hora y qué se dijo |

### 5.4 Por qué es el mejor renglón de la cartera

El deudor que pide que lo llamen es **la mayor intención de pago de toda la cartera**. No hay que
convencerlo de nada: ya dio el paso.

Eso significa dos cosas:

1. **Estas tareas se trabajan primero**, antes del barrido normal del día.
2. Hay un indicador nuevo que conviene medir y reportar: **tiempo entre el toque y la llamada**. Un
   despacho que llama en dos horas convierte mucho mejor que uno que llama en tres días.

### 5.5 Criterio de aceptación

- Un toque en `LLAMARME` crea una tarea visible en la lista de trabajo, con cuenta, deudor, teléfono y
  la hora local del deudor.
- El teléfono se descifra solo para el agente asignado.
- La tarea respeta el horario permitido y avisa cuando la solicitud cayó fuera.
- El resultado de la llamada se registra y cierra la tarea.
- **No se envía ningún mensaje automático** al tocar el botón.
- Prueba de integración: el toque crea la tarea y **no** crea un mensaje.

---

### 5.6 Dos formas de llamar, y cuál usar

| Forma | Costo | Ventaja | Cuándo |
|---|---|---|---|
| **Llamada telefónica normal** | Prácticamente cero dentro de tu plan | Disponible hoy | Desde el día uno |
| **Llamada por WhatsApp** (fase 8) | ~$0.24 MXN por minuto saliente | Mismo hilo, número verificado en pantalla, y reinicia la ventana de 24 h | **Para después.** Ver sección 9 |

Para el arranque, la llamada telefónica normal resuelve y no cuesta, y la de WhatsApp queda para después
(sección 9). **La llamada por WhatsApp no sustituye a la normal por barata** —porque la normal es más barata— sino porque **el deudor ve el número verificado en su pantalla** y porque **la conversación queda en el mismo hilo**. Ese es el argumento, no el precio.

## 6. Fase 5 · El contador del tramo por número y el enrutamiento

### 6.1 El hecho que hay que administrar

**Cada número de teléfono tiene 1,000 mensajes de servicio gratis al mes**, y de ahí en adelante se
cobran. El contador es **por número, no por cuenta de WhatsApp Business**: un despacho con tres números
tiene 3,000. Se renueva cada mes y **no se acumula**.

Convertido en decisión de producto: **el tramo gratis no es un accidente que se descubre en la factura,
es un presupuesto que se administra.**

### 6.2 Qué construir

| Pieza | Detalle |
|---|---|
| **Contador por número** | Cuántos mensajes de servicio se enviaron en el mes en curso, por número, en Admin → WhatsApp junto a la calidad |
| **Barra de avance** | Con el consumo, lo que queda y la fecha de reinicio |
| **Alerta al 80%** | Aviso en el panel y en la bitácora, y por el sistema de alertas externas que ya existe |
| **Costo acumulado** | Los mensajes ya facturables del mes, con una tarifa por mensaje configurable, para que el operador vea lo que se está acumulando |
| **Enrutamiento** | Al **iniciar** una conversación nueva, preferir el número con tramo disponible |

### 6.3 Dos contadores, no uno

No es lo mismo un mensaje de servicio que una plantilla de utilidad:

| Tipo | ¿Tiene tramo gratis? | Cómo se cobra |
|---|---|---|
| **Servicio**: respuesta libre dentro de la ventana de 24 h | **Sí, 1,000 por número al mes** | A la tarifa de servicio, por mensaje, sin descuentos por volumen |
| **Plantilla de utilidad** | **No** | A la tarifa de utilidad, con descuentos por volumen. Esos tramos se calculan sumando **todas** las cuentas de WhatsApp del mismo portafolio de negocio |
| **Plantilla de marketing** | **No** | La más cara. Aquí no debería caer ninguna plantilla de cobranza |

Y una precisión de conteo: Meta cobra **lo que se entrega**, no lo que se intenta. El contador debe
contar los mensajes en estado `delivered` —o `read`, que implica entregado— y **no** los `failed`. El
producto ya conoce esos estados, así que el contador puede cuadrar con la factura de Meta.

### 6.4 La pregunta que hay que resolver antes de diseñar el enrutamiento

**Qué pasa con la ventana de 24 horas cuando la conversación empezó en un número y la respuesta sale de
otro.** Hay dos posibilidades y no se puede diseñar a ciegas:

| Si… | Entonces |
|---|---|
| La ventana es del par negocio-deudor y **se traslada** entre números | Se puede enrutar a mitad de conversación, y el contador es el del número que envía |
| La ventana es **del número** | Enrutar a mitad de conversación obligaría a mandar una plantilla, que se cobra aparte. El enrutamiento solo se puede hacer **al iniciar** |

Hasta comprobarlo con una prueba real, el alcance seguro es: **enrutar solo al iniciar la conversación**,
y dejar el enrutamiento a mitad de conversación como pendiente de verificación. Es la misma prueba que
hay que hacer para los botones de plantilla: un envío real, un toque, y mirar el webhook y la factura.

### 6.5 Esto también sirve para tu propia operación

El contador no es solo para los clientes de Margarita: **PALENCIA cobra por WhatsApp con su propio
número y su propio método de pago.** El mismo panel te dice cuánto llevas del tramo y cuánto te va a
costar el mes. Es la forma más barata de saber si tu comisión cubre el canal.

### 6.6 Criterio de aceptación

- El panel muestra, por número, los mensajes de servicio del mes, lo que queda y la fecha de reinicio.
- La alerta al 80% dispara en el panel, en la bitácora y por el canal externo configurado.
- El contador cuenta solo los entregados y no los fallidos.
- Al iniciar una conversación nueva, el sistema propone el número con más tramo disponible.
- Prueba de integración: se envían N mensajes de servicio, el contador refleja N y la alerta dispara en
  el umbral.

---

## 7. Fase 6 · Mensajes interactivos libres

Solo dentro de la ventana de 24 horas. Si la ventana está cerrada, el panel debe **ofrecer una plantilla
en lugar del constructor de botones** — la aplicación ya conoce el estado de la ventana.

### 4.1 Botones

```json
{
  "messaging_product": "whatsapp",
  "to": "5215512345678",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "Aviso de pago" },
    "body": { "text": "Su crédito CP-20260001 presenta un saldo de $6,491.77 al 15 de octubre de 2026." },
    "footer": { "text": "Despacho Ejemplo del Norte" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "YA_PAGUE",       "title": "Ya pagué" } },
        { "type": "reply", "reply": { "id": "NECESITO_PLAZO", "title": "Necesito plazo" } },
        { "type": "reply", "reply": { "id": "NO_RECONOZCO",   "title": "No reconozco" } }
      ]
    }
  }
}
```

**Máximo 3 botones** y títulos muy cortos. Los títulos largos se cortan en el celular y arruinan la
experiencia.

### 4.2 Listas

```json
{
  "messaging_product": "whatsapp",
  "to": "5215512345678",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": { "type": "text", "text": "¿Cómo quiere resolver su adeudo?" },
    "body": { "text": "Elija una opción y le damos seguimiento." },
    "footer": { "text": "Los pagos se realizan directamente al acreedor" },
    "action": {
      "button": "Ver opciones",
      "sections": [
        { "title": "Formas de pago", "rows": [
            { "id": "PAGO_TOTAL",   "title": "Pago total",       "description": "Liquidar el saldo en un solo pago" },
            { "id": "PAGO_PARCIAL", "title": "Pago parcial",     "description": "Abonar una parte y acordar el resto" },
            { "id": "CONVENIO",     "title": "Convenio de pago", "description": "Repartir el saldo en exhibiciones" } ] },
        { "title": "Otras opciones", "rows": [
            { "id": "NO_RECONOZCO", "title": "No reconozco la deuda",     "description": "Pausar y revisar con el acreedor" },
            { "id": "NO_CONTACTAR", "title": "No quiero ser contactado",  "description": "Registrar la baja de inmediato" } ] }
      ]
    }
  }
}
```

**Máximo 10 filas en total**, repartidas en secciones. Los títulos de fila son cortos y la descripción
es la que explica.

### 4.3 Interfaz

- Un constructor de botones en el compositor, con vista previa de cómo se ve en el celular.
- Un catálogo de opciones reutilizables, para no reescribir "Ya pagué" cada vez.
- **Cambio de nombre importante:** hoy existen las **"respuestas rápidas"**, que son fragmentos de
  **texto** que el agente inserta. Los nuevos son **botones de WhatsApp**. Hay que nombrarlos distinto
  en la interfaz y en el código (`quickReplies` contra `interactiveButtons`) o se van a confundir para
  siempre.

### 4.4 Criterio de aceptación

- Se puede enviar un mensaje con hasta 3 botones y uno con una lista de hasta 10 filas.
- Si la ventana de 24 horas está cerrada, la interfaz **no permite** enviarlos y ofrece una plantilla.
- Se valida la longitud de los títulos **antes** de llamar a Meta, con un mensaje claro en lugar de un
  error de la API.
- Pruebas unitarias del armado de los dos payloads y de las validaciones de límite.

---

## 8. Fase 7 · Flows, y por qué no ahora

Los **WhatsApp Flows** permiten resolver con **un solo mensaje** un formulario completo —elegir una
opción, capturar una fecha, confirmar— en lugar de una cadena de mensajes. Con los mensajes de servicio
ahora facturados, esa es la siguiente frontera de ahorro.

Queda **fuera de este roadmap** a propósito: primero hay que tener resuelto el envío, la recepción y el
mapeo. Un Flow que no sabe aterrizar el dato en el resultado de gestión no sirve de nada.

---

## 9. Fase 8 · Llamadas por WhatsApp — para después, fuera de este alcance

> **Estado: fuera de este alcance.** Se investigó y **sí se puede** —México está habilitado y sale más
> barato que chatear—, pero implica construir audio en tiempo real, que es un producto dentro del
> producto. Queda documentado aquí para retomarlo **cuando el proyecto esté terminado**. Mientras tanto,
> la llamada telefónica normal resuelve y no cuesta.

Es la pieza que cierra el círculo de la fase 4, y la que resuelve el problema que tenía la idea original de "llamar desde otro número": **la llamada sale dentro del mismo hilo, desde el número verificado, y sin salirse de la API.**

### 9.1 Cuánto cuesta en México

Precio publicado por un proveedor de la API para llamadas a México:

| Tipo de llamada | Precio por minuto |
|---|---|
| **Entrante** (el deudor llama) | **USD 0.0040** (unos $0.07 MXN) |
| **Saliente** (el despacho llama) | **USD 0.0130** (unos $0.24 MXN) |

Y las reglas de cobro de Meta:

1. **Solo se cobra la llamada saliente contestada.** Iniciar, timbrar y no contestar cuesta cero.
2. Se cobra **por minuto en incrementos de 6 segundos**.
3. **La tarifa depende del país del deudor**, no del tuyo.
4. Hay **descuentos por volumen por país**, automáticos y que se reinician cada mes.

### 9.2 La comparación que cambia la conversación

| Forma de resolver un caso | Costo aproximado |
|---|---|
| Una conversación de chat de 9.7 mensajes (el promedio medido en México) | ~$1.45 MXN |
| Una llamada saliente de 3 minutos | **~$0.73 MXN** |
| Una llamada entrante del deudor | ~$0.21 MXN |

**Llamar sale más barato que chatear** en cuanto la conversación pasa de cinco mensajes, y el promedio medido es de casi diez.

### 9.3 Lo que la llamada arregla sola

1. **El número verificado aparece en la pantalla de llamada entrante**, con el nombre y el sello del negocio. Es el mismo mecanismo que ya se midió en la operación propia de PALENCIA: la identidad verificada sube la contactabilidad. Ahora aplica también a la voz.
2. **La llamada abre o reinicia la ventana de 24 horas**, la contestes o no. Una llamada te devuelve el derecho a escribir sin plantilla.
3. **Se acaba el problema del número distinto.** El deudor toca el botón, recibe la llamada del mismo número con el que habló, y todo queda en el mismo hilo.
4. **Y se acaba la zona gris:** no hay que mover nada a la app gratuita ni inventar un segundo WhatsApp.

### 9.4 La advertencia técnica que hay que decir en voz alta

**Esto no es un POST como mandar un mensaje.** Una llamada es audio en tiempo real: hay que establecer y mantener el flujo de audio durante toda la conversación. Eso significa que construirlo dentro de Margarita es un proyecto de otra naturaleza. Hay tres caminos:

| Camino | Qué implica | Recomendación |
|---|---|---|
| **Puente a un teléfono** | Un proveedor recibe la llamada de WhatsApp y la conecta al teléfono del agente | **El recomendado para empezar.** El agente no cambia de herramienta y no hay que construir audio |
| Panel de llamadas del proveedor | El agente atiende desde la interfaz del proveedor | Rápido, pero parte la operación en dos pantallas |
| Audio propio dentro de Margarita | Control total e integración perfecta | Solo cuando el volumen lo justifique. Es un producto dentro del producto |

Y dos límites que hay que verificar antes de prometer:

- **Meta no entrega la grabación de la llamada por su API.** La grabación la pone el proveedor en su capa. En cobranza la quieres como evidencia, así que hay que confirmarlo con el proveedor elegido.
- **Antes de una llamada saliente hay que mandar una plantilla de consentimiento**, salvo que la ventana de 24 horas esté abierta. En el flujo del botón, el toque del deudor **abre la ventana**, así que no hace falta plantilla. Si algún día se quiere llamar en frío, esa plantilla se cobra.

### 9.5 Disponibilidad

La llamada saliente **no está disponible desde números registrados en Estados Unidos, Canadá, Egipto, Vietnam y Nigeria**. **México no está en esa lista**, así que un número mexicano sí puede llamar. Las llamadas entrantes funcionan donde está la API.

Meta actualiza esa lista con frecuencia: **verificar al momento de activar**, no confiar en este documento.

### 9.6 Criterio de aceptación

- Se puede iniciar una llamada saliente desde el hilo de la conversación.
- El webhook procesa los eventos de la llamada (timbrando, contestada, terminada) y los registra en la bitácora con su duración.
- El resultado de la llamada se registra con el mismo catálogo de resultados de la fase 3.
- La llamada aparece en la línea de tiempo del contacto, junto a los mensajes.
- Queda documentado en el alcance si **la grabación está disponible o no** según el proveedor.

---

## 10. Límites de Meta que hay que respetar

### De plantillas

| Componente | Límite |
|---|---|
| Nombre de la plantilla | 512 caracteres, minúsculas, alfanumérico y guion bajo |
| Cuerpo | 1,024 caracteres, **contando el valor real de las variables ya sustituidas** |
| Encabezado de texto | 60 caracteres y **exactamente una variable**; sin caracteres de Markdown |
| Encabezado de imagen, video o documento | Sin límite de texto; rige el requisito del archivo |
| Pie | 60 caracteres, **sin variables** |
| Texto de botón (respuesta rápida, URL o teléfono) | 25 caracteres según la documentación vigente de Meta. Algunas guías antiguas dicen 20: **manda lo que acepte el editor** |
| URL en botón de URL | 2,000 caracteres, con **una variable al final**, codificada |
| Valor de copiar código | 20 caracteres |
| Número de botones de respuesta rápida | Hasta 10 por plantilla, sujeto a reglas de combinación |

### De mensajes interactivos libres

| Componente | Límite |
|---|---|
| Botones de respuesta rápida | 3 como máximo, con títulos muy cortos |
| Botón que abre la lista | 1, con título corto |
| Filas de la lista | 10 en total, repartidas en secciones |
| Título de sección y de fila | Cortos; la descripción es la que explica |
| Ventana | Solo dentro de las 24 horas desde el último mensaje del deudor |

### De llamadas por WhatsApp

| Componente | Límite o condición |
|---|---|
| Llamada saliente | Requiere una **plantilla de consentimiento** previa, salvo que la ventana de 24 h esté abierta |
| Cobro | Solo la saliente **contestada**, por minuto en incrementos de 6 segundos. Timbrar y no contestar: cero |
| Tarifa | Depende del **país del deudor**, no del número que llama |
| Descuentos por volumen | Por país, automáticos, se reinician cada mes |
| Disponibilidad de salida | No disponible desde números de **Estados Unidos, Canadá, Egipto, Vietnam y Nigeria**. México sí puede |
| Grabación | **La API de Meta no la entrega.** Depende del proveedor |
| Efecto en la ventana | Una llamada **abre o reinicia** la ventana de 24 h, la contestes o no |

> Los límites de este segundo cuadro son los que maneja la industria y **hay que confirmarlos contra la
> documentación viva de Meta al momento de implementar**, porque Meta los revisa periódicamente. Los del
> primer cuadro están tomados de una fuente actualizada a septiembre de 2026.

---

## 11. Cambios en datos y en webhooks

| Dónde | Qué cambia |
|---|---|
| Tabla de mensajes | Campos nuevos: subtipo de interactivo, `id` de la respuesta (en claro) y su título (cifrado) |
| Modelo de plantillas | Hoy solo guarda variables del cuerpo. Agregar: variable de encabezado, botones con su tipo y, en las de URL, la variable y su ejemplo |
| Campañas | Guardar por destinatario los valores de las variables del encabezado y del botón de URL, además de las del cuerpo |
| Catálogo de resultados | Tabla nueva y editable: `id` de respuesta → resultado de gestión → efecto automático |
| Webhook | **Sin cambios en el contrato del endpoint.** Solo cambia el procesamiento interno del evento `messages` cuando el tipo es `interactive` |
| Bitácora | Registrar cada respuesta con su `id` y el efecto aplicado |
| Migración | Los datos ya cifrados no se tocan; los campos nuevos se agregan con la extensión de cifrado que ya existe |

---

## 12. Orden recomendado, y por qué

| Orden | Fase | Por qué en ese lugar |
|---|---|---|
| 1 | **Fase 1** · Interpretar lo que llega | No depende de Meta, es barato y sin esto nada de lo demás sirve |
| 2 | **Fase 2** · Plantillas con botones | Es el primer contacto y el mayor valor, **y tiene el lead time más largo** porque depende de aprobación de Meta. Arrancarla en paralelo |
| 3 | **Fase 3** · Puente con el resultado | Con las respuestas llegando, aquí se convierte en valor de negocio. Es la plomería que alimenta todo lo demás |
| 4 | **Fase 4** · El botón que agenda una llamada | Es el caso más barato que existe y sale casi gratis una vez que existe la fase 3. Si se puede, se construye junto con ella |
| 5 | **Fase 5** · El contador del tramo por número | Se apoya en el multinúmero que ya existe y convierte el tramo gratis en un presupuesto. Sirve igual para la operación propia |
| 6 | **Fase 6** · Interactivos libres | Es valioso, pero solo dentro de la ventana: menos alcance que la plantilla |
| 7 | **Sprint 8** · Página de precios | No depende de nada y habilita la venta |
| — | **Fase 7** · Flows y **Fase 8** · Llamadas | **Para después.** Están investigadas; se retoman cuando el proyecto esté terminado |

**Y una tarea que no es de código y hay que hacer primero:** crear y aprobar una **plantilla de prueba
con botones** y capturar lo que devuelve el webhook al tocarla. Ese volcado decide el diseño de la fase
4 y es el único punto del roadmap que no se puede resolver leyendo documentación.

---

## 13. Sprints propuestos

**Reglas del juego para todos los sprints:**

1. **Las 208 pruebas unitarias y las 41 de integración siguen pasando.** Un sprint que rompe la suite no se cierra.
2. **Cada sprint agrega pruebas** de lo que construyó.
3. **Cada sprint actualiza `alcance-produccion.md`** en el mismo commit, no después.
4. **Los sprints son de una semana.** La restricción real no es la velocidad de escritura de código: es el tiempo de revisión y los tiempos de aprobación de Meta, que corren en paralelo.

| Sprint | Objetivo | Entregable | Criterio de cierre |
|---|---|---|---|
| **0** | Quitar las incógnitas que no se resuelven leyendo | Plantilla de prueba con botones enviada, toque capturado y volcado del webhook guardado. Ventana de 24 h probada entre dos números | El volcado y la prueba de la ventana quedan en el repositorio, con las decisiones escritas |
| **1** | Fase 1 · Interpretar lo que ya llega | Subtipo, `id` y título en el modelo; render en el hilo; bitácora | Un toque se ve con su etiqueta y el `id` es consultable |
| **2** | Fase 2a · Plantilla con botones: crear y enviar | Modelo de plantilla con botones y variables de encabezado y de URL; envío con los tres componentes | Prueba de integración contra la Graph API simulada |
| **3** | Fase 2b · Campañas con botones | Campaña que usa una plantilla con botones y guarda el estado por destinatario; aviso de cambio de categoría | Una campaña no puede salir si la plantilla se reclasificó a marketing |
| **4** | Fase 3 · Puente con el resultado | Catálogo `id` → resultado; reglas automáticas de pausa, baja y pago reportado | Los cinco efectos disparan sin intervención del agente |
| **5** | Fase 4 · El botón que agenda una llamada | Tarea de llamada en la lista de trabajo, con huso del deudor y prioridad; indicador de tiempo entre el toque y la llamada | Un toque crea la tarea y **no** crea un mensaje |
| **6** | Fase 5 · Contador del tramo y enrutamiento | Contador por número, alerta al 80%, costo acumulado, propuesta de número al iniciar | El contador cuenta solo entregados y cuadra con la factura |
| **7** | Fase 6 · Interactivos libres | Botones y listas desde el compositor, con validaciones y vista previa | No se pueden enviar fuera de la ventana de 24 h |
| **8** | **Página de precios y oferta** | La oferta de captación y el precio de lista en la página del producto, con su vigencia y el "qué no incluye" | La página muestra las dos tablas y el "qué no incluye" sin iniciar sesión; **la oferta se apaga sola** al vencer la fecha o al llegar al tercer cliente |

**Fuera de estos sprints quedan la fase 7 (Flows) y la fase 8 (llamadas por WhatsApp).** Las dos están
investigadas y documentadas, y se retoman cuando el proyecto esté terminado.

**El sprint 8 puede ejecutarse de inmediato.** No depende de ningún otro: lo único que necesita es que
la oferta de captación esté decidida, y está en la sección 14.2.

**El sprint 0 no es opcional y va primero.** Todo el diseño de las fases 3 y 4 depende de saber qué devuelve Meta en el `id` de un botón de plantilla y de cómo se comporta la ventana de 24 horas entre números distintos.

### La vía comercial, en paralelo

No depende de código y no debería esperar a que la herramienta esté lista:

| Sprint | Qué |
|---|---|
| **C1** | Cerrar precios: el precio único, la **oferta de captación** y la garantía. Escribirlos en `../../margarita/facturacion.md` |
| **C2** | Junta con el contador: las nueve preguntas, más el IVA del prepago y la retención |
| **C3** | Dar de alta la actividad de software en el SAT y emitir un CFDI de prueba |
| **C4** | Kit de venta con el precio único, la oferta de captación y las dos frases nuevas |
| **C5** | Revisión del abogado: contrato de Margarita, convenio y el horario de contacto |
| **C6** | Publicar la oferta y el precio en la página del producto. Es el sprint 8 de la tabla de arriba |
| **C7** | **La guía de uso**: el documento que se lleva el cliente, con plantillas, clasificación, candados y su responsabilidad |
| **C8** | **La sesión de arranque**: el guion de las dos horas y lo que hay que dejar configurado antes de que el cliente se vaya |
| **C9** | **La política de uso aceptable** en el contrato, y el **límite de peticiones por usuario** en lugar de por IP, que es requisito para prometer agentes ilimitados |
| **C10** | **El proceso de liberación**: rama `release`, proyecto de staging y un Volume en cada proyecto de cliente. Ver el bloque operativo de abajo |
| **C11** | **Separar la landing del backend**: primero el chequeo de host y después el sitio estático. Regla: el inicio de sesión vive siempre en el dominio de la app. Ver el bloque operativo |

### La parte operativa: despliegues, subdominios y liberaciones

Esto no es comercial ni es producto: es la operación que sostiene el precio único. **Sin esto, el precio
bajo se vuelve insostenible cuando haya más de cinco clientes.**

**a) Un subdominio por cliente, no un dominio por cliente.**
El servicio se opera en `margaritaapp.org` y cada cliente recibe `cliente.margaritaapp.org`. En DNS basta
**un registro comodín** `*.margaritaapp.org` para todos los clientes, presentes y futuros, y Railway emite
el certificado de cada subdominio. **Recomendación: el subdominio en "solo DNS" (nube gris en Cloudflare),
sin proxy**, porque el panel usa conexiones en vivo y el proxy puede interferir con ellas.

**b) Las actualizaciones sí se aplican solas, y ahí está el riesgo.**
Si todos los proyectos de Railway están conectados al **mismo repositorio y la misma rama**, un `push`
dispara compilación y despliegue en **todos**. Y como el arranque corre las migraciones antes de levantar,
el esquema también se actualiza solo. Eso es una ventaja enorme **y un riesgo enorme**: una versión mala
tumba a todos los clientes al mismo tiempo y no hay forma de detenerla a media lista.

**c) El proceso de liberación que propongo.**

| Paso | Qué |
|---|---|
| 1 | Se trabaja en `main`. Un proyecto de **staging** conectado a `main` despliega solo y sirve de prueba |
| 2 | Se prueba en staging: webhook firmado, botones, campañas, migraciones y respaldos |
| 3 | Cuando está verificado, `main` se promueve a la rama **`release`** |
| 4 | Los proyectos de los clientes escuchan **`release`**, no `main`. Ese push los actualiza a todos |
| 5 | Si algo sale mal, se revierte `release` al commit anterior y todos vuelven |

Dos reglas que acompañan al proceso:

- **Las migraciones tienen que ser aditivas y compatibles hacia atrás.** Con varios clientes, una
  migración destructiva aplicada en todos a la vez no se puede deshacer. Primero se agrega, se despliega,
  y la limpieza va en una liberación posterior.
- **Nunca se despliega un viernes.** Con una sola persona y sin guardia, un problema el viernes se
  convierte en un fin de semana perdido.

**d) Lo que hay que arreglar ANTES de conectar a los clientes con `release`.**
Los adjuntos viven en el sistema de archivos y **sin un Volume configurado se pierden en cada
despliegue**. Con liberaciones automáticas, un cliente sin Volume pierde **todos sus archivos en cada
actualización**. Es requisito de entrada, no una mejora: **cada proyecto de cliente debe tener su Volume
antes de conectarlo.**

**e) La landing no puede vivir en el dominio del cliente.**

Hoy la raíz de la aplicación sirve la landing de venta. En el subdominio de un cliente eso está mal por
tres razones:

1. **Filtra el precio.** La landing muestra la lista y la oferta: cualquier empleado del despacho —o un
   competidor que adivine un subdominio— ve lo que ese cliente paga.
2. **Se ve mal.** El equipo del cliente cae en una página de venta del producto que ya compró.
3. **Y en un dominio propio del cliente sería peor:** su dominio corporativo mostrando la página de venta
   de otra empresa.

Y hay una cuarta razón, que es la operativa: **si la landing vive dentro de la aplicación, cambiar un
párrafo de marketing exige una liberación que toca a todos los clientes.** Es exactamente el acoplamiento
que este bloque operativo busca reducir.

**El orden correcto:**

| Cuándo | Qué |
|---|---|
| **Ahora** | Un **chequeo de host**: si la petición llega al dominio del producto, la raíz sirve la landing; si llega a un subdominio de cliente, la raíz redirige al inicio de sesión. Son unas cinco líneas y resuelve el problema completo |
| **Después** | **Separar la landing** como sitio estático, con el mismo patrón del sitio de PALENCIA. Entonces el marketing deja de requerir liberaciones |

**La regla que hace que la separación funcione:** **el formulario de inicio de sesión vive SIEMPRE en el
dominio de la aplicación, nunca en la landing.** La landing solo lleva un enlace. Si el formulario
estuviera en la landing y mandara la petición a otro dominio, ahí sí harían falta CORS y una excepción de
CSRF: se abriría justo el hueco que hoy protege.

**Y una nota de seguridad:** la cookie de sesión debe ser **solo del host**, sin atributo `Domain`. Si se
compartiera para todo `margaritaapp.org`, una sesión abierta en el espacio de un cliente podría servir en
el de otro.

**f) Y el subdominio te deja migrar después sin romper nada.**
Como la dirección del cliente es `cliente.margaritaapp.org` y no depende de dónde vive la instalación,
puedes pasar de "una instalación por cliente" a **multi-inquilino** sin cambiarle la dirección a nadie.
Eso convierte la decisión de multi-inquilino en algo que puedes posponer, en lugar de algo que tienes que
acertar hoy.

---

## 14. La parte comercial: precios y oferta

Los números definitivos, para que el roadmap y la oferta no se contradigan.

### 14.1 El modelo: un solo plan, precio único, todo incluido

**Se acabaron los niveles por número y por agente.** Si el cliente contrata, puede tener varios números,
el administrador crea los agentes que quiera, manda los mensajes que quiera y cambia de número. **Nada de
eso cuesta más**, así que no se cobra más. Y es un argumento de venta que nadie más de la lista ofrece:
**"todos los números, todos los agentes, un solo precio".**

| Concepto | Precio de lista | Oferta de captación · primeros 3 clientes |
|---|---|---|
| **Instalación** (pago único) | **$4,900.00 + IVA** | **$2,500.00 + IVA** |
| **Licencia mensual** | **$1,490.00 + IVA / mes** | **$990.00 + IVA / mes** |
| **Hora adicional** | $900.00 + IVA | $900.00 + IVA |

**La instalación incluye:** el despliegue, la configuración acompañada de la cuenta de WhatsApp, el alta
del primer número, la carga de las plantillas iniciales, **la guía de uso** y **una sesión de arranque de
2 horas**.

**El primer mes se paga con la instalación:** $6,390.00 + IVA a precio de lista, o **$3,490.00 + IVA** con
la oferta de captación.

**El dominio no se cobra.** El servicio se opera en `margaritaapp.org` y cada cliente recibe un subdominio
del tipo `cliente.margaritaapp.org`. Un dominio propio es un servicio adicional que se cotiza aparte.

### 14.2 La oferta de captación

Para los **primeros tres clientes**, vigente hasta el **31 de diciembre de 2026**:

| | |
|---|---|
| Instalación | $2,500.00 + IVA (en lugar de $4,900.00) |
| Licencia mensual | $990.00 + IVA (en lugar de $1,490.00) |
| **Arranque de tres meses, todo incluido** | **$5,470.00 + IVA** |

A cambio de la **carta de recomendación** al cuarto mes y de **autorizar su caso como referencia**.

**Qué significa, sin adornos:** a este precio los primeros tres clientes **no son negocio, son
adquisición.** Cubren el costo y entregan lo único que no se puede comprar: **tres casos de referencia.**
El error sería dejarlo como precio de lista. **El precio de lista es $1,490.**

### 14.3 El reparto de responsabilidad, que hay que dejar escrito

| Quién | De qué responde |
|---|---|
| **El proveedor** | Que la app funcione, que esté disponible, que los datos estén cifrados, que no se caiga por un error propio, y **entregar la guía y la sesión para que el cliente la aproveche** |
| **El cliente** | **Del uso**: a quién le escribe, con qué plantillas, con qué listas y con qué frecuencia |

Y esto **no es quitarse responsabilidad: es un argumento de venta**, porque la herramienta trae los
candados puestos: la baja automática, el horario permitido y las reglas de conducta vienen configuradas
por defecto.

### 14.3 Las anclas para defender el precio

| Ancla | Dato |
|---|---|
| **Implementación de HubSpot** | **USD 1,500 obligatorios** (unos $27,750 MXN) antes de la primera mensualidad. La instalación de Margarita es una fracción |
| **Kommo** | Exige **mínimo 6 meses**. El mínimo y el prepago son práctica de mercado |
| **Kosmo** (México) | $4,497 MXN al mes por un agente de IA ya configurado. **Margarita está en esa banda, no en la de Bitrix24** |
| **ContactShip** (cobranza con IA) | USD 150 al mes (unos $2,775 MXN) **más USD 0.32 a 0.35 por minuto de llamada** |
| **Rango del mercado para 3 personas** | $999 a $2,550 MXN al mes en CRMs genéricos |
| **El verdadero rival** | Excel + WhatsApp Web: **$0** |

### 14.5 Las dos frases de venta que salen de la investigación

1. **La de la banda:** "No te vendo una herramienta para que la armes. Te entrego tu operación funcionando, con alguien que sabe de cobranza detrás."
2. **La de la sanción:** "Una queja le cuesta a tu cliente financiero hasta $134,580. A ti te cuesta la cuenta. Y lo único que te protege es poder mostrar la bitácora de cada gestión."

### 14.6 Pendientes comerciales

| Pendiente | Nota |
|---|---|
| El número N de la garantía atada al uso | Tiene que ser realista y medible con la bitácora |
| Cómo se factura el prepago de los tres meses | A la junta del contador, con el IVA de por medio |
| El horario de contacto: 7:00-22:00 o 8:00-21:00 | Verificar el texto de la Disposición CUARTA y relabelar los once documentos |
| **El asterisco del "ilimitado"** | El tope de peticiones se comparte por dirección de internet. **No se promete "agentes ilimitados" hasta que el límite sea por usuario** (sprint C9) |

---

## 15. Lo que hay que actualizar en `alcance-produccion.md` cuando esto entre

Para que el documento de alcance no quede mintiendo:

1. Quitar de la sección 3 los límites "Sin botones ni listas" y "Respuestas de botones sin interpretar".
2. Quitar también "Variables solo en el cuerpo" y precisar que ahora se resuelven encabezado y botón de
   URL.
3. Agregar a la sección 2 lo que sí hace: envío de plantillas con botones, interactivos libres dentro de
   la ventana, mapeo de la respuesta al resultado de gestión y las reglas automáticas de pausa y baja.
4. Actualizar la lista de "qué no se debe prometer" del documento de oferta comercial, en
   `../../margarita/oferta-servicio.md`.
5. Sumar a la sección 6 las pruebas de integración nuevas, con su número.
6. Agregar a la oferta comercial el argumento de costo, que ahora es medible: "resolvemos la mayoría de
   los casos en un toque o con una llamada, y el panel te dice cuánto llevas del tramo gratis de cada
   número".
7. Registrar en la sección 3, como límite vigente, que **el enrutamiento a mitad de conversación está
   pendiente de verificar** contra el comportamiento real de la ventana de 24 horas.

Y una nota de venta que conviene no perder: cuando esto entre, el argumento para un despacho deja de ser
"tienes una bandeja más bonita" y pasa a ser **"cada respuesta te cuesta menos y te deja evidencia"**.
Ese es el encuadre que hay que usar en la próxima conversación.
