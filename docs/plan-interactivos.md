# Plan de dos sprints — botones e interacciones

Cómo meter la evolución de [`nuevo_roadmap.md`](../nuevo_roadmap.md) en **dos
sprints de una semana**, qué se queda fuera y qué depende de Meta. El roadmap
propone ocho sprints más una vía comercial; comprimirlo a dos no es acelerar el
mismo trabajo: es **elegir el tramo que más vale y posponer el resto**.

---

## 1. Qué entra, qué se pospone y por qué

**Estado: sprint A cerrado.** Fase 1 ✅ (respuestas de botón y de lista
interpretadas, guardadas, visibles en el hilo y en la bitácora) · fase 2 ✅ en el
hilo **y en campañas** (las tres variables resueltas por destinatario, con
`{nombre}`, `{telefono}` y columnas del Excel) · aviso **y bloqueo** de plantillas
reclasificadas a marketing.

**Fase 3 entregada** (el puente respuesta → resultado de gestión, con la pausa y
la baja automáticas y el mapeo por identificador o por texto).

**Fase 4 entregada** (2026-10-16): el toque del botón ya es una **tarea** en
Reportes → Hoy, «Pidieron que los llamen», arriba de todo y con el tiempo que
lleva esperando el deudor. Se despacha con un clic («No contestó») o desde la
ficha, sale de la lista sola al registrar otro resultado, avisa si pidió la
llamada fuera del horario permitido (8:00 a 21:00) y distingue si salió del
**botón** o lo marcó el equipo. No manda ningún mensaje: una llamada pedida es
una tarea, no un envío automático.

**Sigue la fase 5** (el contador del tramo de mensajes de servicio gratis por
número, con alerta al 80% y costo acumulado). Nada de esto depende de Meta para
construirse: solo la **verificación real** necesita la plantilla aprobada y un
teléfono, y para eso está [`pruebas-meta.md`](pruebas-meta.md), que dice qué
copiar y de dónde.

| Sprint | Fases | Entregable | Criterio de cierre |
| --- | --- | --- | --- |
| **A** (semana 1) | 1 y 2 completas | Las respuestas de botón se **entienden y se guardan**; las plantillas con botones se **crean y se envían** (envío suelto y campaña), con las variables del cuerpo, del encabezado y del botón de URL; aviso si la plantilla se reclasifica a marketing | Pruebas de integración contra la Graph API simulada: el cuerpo enviado lleva los tres componentes con sus parámetros. Un toque se ve en el hilo con su etiqueta |
| **B** (semana 2) | 3 y 4 | El puente **respuesta → resultado de gestión** con sus reglas automáticas (pausa, baja, pago reportado) y el **botón que agenda una llamada** como tarea en la lista de trabajo | Los cinco efectos disparan sin intervención del agente; el toque de llamada **crea tarea y no crea mensaje** |
| **B, si sobra** | 5 | Contador del tramo de servicio por número, alerta al 80% y costo acumulado | El contador cuenta solo entregados y cuadra con la factura |

**Fuera de los dos sprints, a propósito:**

| Qué | Cuándo |
| --- | --- |
| Fase 6 · Interactivos libres (botones y listas dentro de la ventana) | Sprint siguiente |
| Fase 7 · Flows | Cuando el producto esté terminado |
| Fase 8 · Llamadas por WhatsApp | Igual: es un producto dentro del producto |
| Vía comercial C1–C11 (precios, contador, abogado, landing separada, subdominios) | **En paralelo, no es código.** No se puede «implementar» en un sprint de desarrollo |

**Por qué ese orden y no otro** (es el del propio roadmap, y estoy de acuerdo):

1. La fase 1 **no depende de Meta** y sin ella nada más sirve.
2. La fase 2 **tiene el plazo más largo**, porque depende de que Meta apruebe la
   plantilla: por eso arranca el primer día, en paralelo con la fase 1.
3. La fase 3 convierte la mecánica en dinero y evidencia, y es la que alimenta a
   la 4. La 4, una vez que existe la 3, sale casi gratis.
4. La fase 5 (contador) es valiosa pero **no bloquea nada**: si el tiempo
   aprieta, se cae sin dejar deuda.

---

## 2. El bloqueante real es Meta, y hay que decirlo

El roadmap lo llama «sprint 0» y tiene razón en que **no es opcional**: hay que
mandar una plantilla de prueba con un botón a un número real, tocar el botón y
**mirar qué devuelve el webhook**. De ahí sale el `id` con el que se diseña todo
el mapeo de la fase 3. La segunda incógnita es **qué pasa con la ventana de 24
horas cuando la conversación empezó en un número y la respuesta sale de otro**
(eso decide si el enrutamiento puede ser a mitad de conversación o solo al
iniciar).

Eso depende de que **Meta acepte los números**, así que el plan se divide así:

| Se puede construir ya (sin Meta) | Necesita a Meta |
| --- | --- |
| Todo el código de las fases 1, 2, 3 y 4, verificado con **payloads sintéticos** (webhook) y contra un **servidor que simula la Graph API** (envío) | La **verificación** con una plantilla real: el `id` que devuelve, la aprobación de la plantilla, el comportamiento de la ventana entre números |

**Regla de cierre:** si al terminar el sprint B la plantilla real sigue sin
aprobarse, el sprint se cierra con la prueba simulada y la verificación real
queda como **pendiente bloqueante antes del primer cliente**. No se promete a
nadie sobre un contrato que no se comprobó.

**Mientras tanto, dos defensas de diseño** (por si el `id` no es confiable):

1. Mapear **también por el texto del botón** (`title`), que es lo que el deudor
   ve, y **validar ese texto al cargar la plantilla** en el producto, para que
   nadie lo edite y rompa la regla en silencio.
2. Guardar el **volcado crudo** del webhook de la prueba en el repositorio, como
   evidencia y como dato de prueba para las integraciones.

---

## 3. Decisiones que hay que tomar antes de escribir código

0. **La plantilla de cobranza, ya decidida:** **dos botones** — «Quiero que me
   llame un asesor» (respuesta rápida, que agenda la llamada de la fase 4) y
   «Aviso de privacidad» (botón de enlace a la URL del aviso). El cliente recibe
   al contratar **el documento de cómo crear sus plantillas** (categoría, textos
   permitidos, botones y variables) y las armas/revisas con él en el arranque.
   Ese documento es entregable del sprint B (vía comercial C7).
1. **El catálogo de respuestas.** La tabla `id` → resultado de gestión → efecto
   automático. La del roadmap sirve de borrador; hay que cerrarla con tu criterio
   de cobranza (sobre todo qué hace cada respuesta que **no** sean los cinco
   efectos claros).
2. **`YA_PAGUE` no marca pagado.** Es la decisión más importante del documento y
   la respaldo: entra a *pagos reportados, pendientes de confirmar*. Si el
   producto lo diera por cobrado, estaría reportando recuperación no conciliada.
3. **El horario de contacto** (el roadmap duda entre 7:00–22:00 y 8:00–21:00) y
   la hora local del deudor para las tareas de llamada.
4. **La tarifa por mensaje** que usará el contador de la fase 5 para estimar el
   costo acumulado (es un dato de configuración, no un precio de venta).
5. **Los precios.** El roadmap propone $4,900 de instalación y $1,490 al mes; lo
   que está publicado hoy es $1,500–$2,500 de instalación y $800 al mes. **Hoy
   los dos documentos se contradicen**: hay que decidir cuál gobierna y alinear
   la página, la propuesta y [`facturacion.md`](facturacion.md) en el mismo
   cambio.

---

## 4. Mapa técnico (dónde se toca, con nombres)

Para que se pueda revisar antes de empezar:

| Pieza | Qué cambia |
| --- | --- |
| **Webhook** | `src/services/meta-webhook-handler.service.ts:469`: hoy `interactive` se guarda como `[Mensaje interactivo]` y se pierde el dato. Ahí se leen `button_reply` / `list_reply` con su `id` y su `title`. El contrato del endpoint **no cambia** |
| **Modelo de mensajes** | Campos nuevos en `Message`: subtipo de interactivo, `replyId` (en claro, para poder filtrar y mapear) y `replyTitle` (cifrado, como el resto del contenido). Migración **aditiva** |
| **Plantillas** | `Template` guarda hoy solo variables del cuerpo. Se suman: variable de encabezado, botones con su tipo y, en los de URL, la variable final y su ejemplo. El sync de Meta tiene que **guardar los componentes**, no solo el texto |
| **Envío** | El constructor del payload de plantilla pasa de un componente a tres (encabezado, cuerpo, botón de URL). Campañas: guardar por destinatario los valores del encabezado y de la URL, además de los del cuerpo |
| **Catálogo de respuestas** | Tabla nueva `InteractiveReplyRule` (id o título → resultado → efecto), editable en Admin, con bitácora de cambios |
| **Efectos** | Se reutiliza lo que ya existe: la baja (`optOut`), la pausa, el resultado de gestión y la bitácora. La fase 4 **no** crea pantalla nueva: suma renglones a la lista de trabajo del día |
| **Contador (fase 5)** | Por número, en Admin → WhatsApp: servicio enviado del mes, restante, fecha de reinicio, alerta al 80% y costo estimado. Cuenta `delivered` y `read`, nunca `failed` |

---

## 5. Riesgos de comprimir, dichos en voz alta

1. **Se recorta verificación, no trabajo.** Con dos sprints se construye lo
   mismo que el roadmap reparte en seis, pero con menos tiempo de prueba manual
   contra Meta. La red que lo sostiene es la misma de siempre: la suite (208
   unitarias, 55 de integración) más el recorrido de pantallas que se agregó
   después del 500 de las plantillas.
2. **Migraciones aditivas, sin excepción.** Con varios clientes conectados a
   `release`, una migración destructiva no se puede deshacer.
3. **Nada se despliega un viernes.**
4. **Las pruebas tienen que venir con cada fase**, no después: aquí, un `id` mal
   interpretado no rompe una pantalla, **dispara la regla equivocada** (una baja,
   una pausa, un pago reportado).

---

## 6. Qué hago yo y qué necesito de ti

**Yo**: el sprint A completo (fases 1 y 2) con sus pruebas, y el andamiaje del
sprint B. En el mismo commit, la actualización de `alcance-produccion.md` —quitar
los límites «sin botones ni listas», «respuestas sin interpretar» y «variables
solo en el cuerpo»— y el apartado nuevo de límites vigentes.

**Tú**:

1. La plantilla de prueba con botones en Meta, en cuanto te acepten los números,
   y el volcado del webhook al tocarla. El paso a paso, con los tres caminos
   para pasármelo (el más rápido: el botón **copiar id** de la burbuja), está en
   [`pruebas-meta.md`](pruebas-meta.md).
2. Las decisiones de la sección 3, empezando por **los precios**.
3. Un número de pruebas (o el que ya tienes) para la campaña de validación.
