# Reportes y resultado de gestión (cobranza)

Diseño del módulo que permite registrar **en qué quedó cada gestión** y sacar reportes de la operación. Pensado para el uso real: dos personas (admin y cobranza), trabajo por WhatsApp y revisión en Excel.

Estado: **implementado** (2026-10-15) y con la **fase 4 entregada el
2026-10-16** (la llamada pedida como tarea del día). Las decisiones del final ya
se tomaron y están aplicadas.

---

## 1. El hueco que hay que cerrar

Hoy Margarita sabe **qué pasó técnicamente** (mensajes enviados, entregados, leídos, conversaciones asignadas, campañas) pero no **en qué quedó la gestión**: si el cliente prometió pagar, si ya pagó, si nunca contestó o si el número no sirve. Sin ese dato no se puede reportar nada útil de cobranza.

Lo que hay hoy no alcanza para eso:

| Herramienta actual | Por qué no sirve como resultado de gestión |
| --- | --- |
| Notas internas | Texto libre: no se puede contar, agrupar ni filtrar. |
| Etiquetas | No tienen fecha, ni autor, ni monto, ni historial: se sobrescriben y no queda rastro de cuándo ni quién lo cambió. |
| `Conversation.operationalStatus` | Describe el ciclo de vida del hilo (sin asignar, asignado, en progreso, resuelto), no el resultado del negocio. |
| Estado del mensaje | Dice si el mensaje llegó, no qué contestó el cliente. |

## 2. Qué se puede aprovechar (ya está)

- Los **intentos** se derivan de los mensajes: no hace falta capturar nada.
- `CampaignRecipient` une cliente y campaña, así que el resultado por campaña se calcula sin campos nuevos.
- El **CSV con BOM** para Excel ya existe (`src/utils/csv.ts`) y lo usa el módulo de respaldos: los reportes se exportan con lo mismo.
- El hilo ya tiene el lugar natural para marcar el resultado: la columna lateral.

---

## 3. Propuesta

### 3.1 Resultado de gestión, con historial

Un registro nuevo, **de solo agregar**, con quién y cuándo:

```
ContactOutcome
  id
  workspaceId
  contactId
  conversationId?      (desde qué hilo se marcó)
  createdById          (quién lo marcó)
  type                 PROMISE | PAID | NO_ANSWER | WRONG_NUMBER |
                       NOT_INTERESTED | CALLBACK | OTHER
  note?                (se guarda cifrada, como el resto del contenido)
  promiseAmount?       (solo PROMISE)
  promiseDueAt?        (solo PROMISE)
  source               PANEL | BULK
  createdAt
```

Y en `Contact` el **estado vigente** denormalizado (`outcomeType`, `outcomeAt`, `outcomeById`, `promiseAmount`, `promiseDueAt`) para filtrar y listar sin recorrer el historial.

Por qué los dos: el estado vigente es lo que se mira el 90% del tiempo ("¿en qué quedó este cliente?", "¿cuántos quedaron en promesa?"); el historial es lo que permite responder "¿cuántas promesas se cumplieron?", "¿cuántas gestiones hizo Ana esta semana?" y "¿quién cambió esto?".

### 3.2 Intentos: calculados, no capturados

```
intentos sin respuesta = mensajes salientes con fecha posterior
                         al último mensaje entrante del cliente
```

- Cero captura manual y no se puede desincronizar.
- Un mensaje entrante reinicia el contador: eso es un contacto efectivo.
- Da igual si el intento salió de una campaña o de una respuesta manual.
- Umbral configurable (`OUTCOME_NO_ANSWER_ATTEMPTS`, por defecto 3) para saber cuándo un cliente entra a "sin contestación".
- En el reporte se ofrecen dos lecturas, porque no son lo mismo: **"no contesta desde el último intento"** y **"nunca ha respondido"**.

### 3.3 Dónde se marca: dos toques, no un formulario

**En el hilo** (columna lateral, donde ya viven las acciones): una fila de botones con el resultado. Promesa abre monto y fecha compromiso; el resto es un clic con nota opcional. El panel muestra el estado vigente del cliente.

**En Contactos**: sello con el estado vigente, filtro por estado y **acción en bloque** (seleccionar 20 contactos y marcarlos de una vez). Es el caso real de cobranza: revisar la lista y despachar por lote, no abrir hilo por hilo.

Todo cambio queda auditado (quién, cuándo, de qué estado a qué estado) y se ve en el historial del contacto.

### 3.4 Reportes (Admin → Reportes)

Todos con rango de fechas, filtros por persona, número, estado y etiqueta, y botón de exportar a CSV (Excel).

| # | Reporte | Para qué sirve |
| --- | --- | --- |
| 1 | **Gestiones del periodo**: total, por resultado, por persona y por día | Productividad: qué se hizo y quién lo hizo |
| 2 | **Promesas**: monto, cuántas, agrupadas en vencidas, de hoy y de esta semana | Saber a quién hay que escribirle hoy |
| 3 | **Resultado por campaña**: de N destinatarios, cuántos contestaron, cuántos prometieron y cuántos pagaron | Medir si la campaña sirvió |
| 4 | **Sin contestación tras X intentos** | La lista de trabajo del día, exportable y marcable en bloque |
| 5 | **Detalle exportable**: una fila por gestión y una fila por cliente con su estado vigente, incluyendo el número emisor | La "cartera" para trabajar en Excel |
| 6 | **Tarjetas del día** en el dashboard: gestiones de hoy, promesas por vencer, clientes sin resultado | Vista de entrada al panel |

### 3.5 Fases

**Fase 1 — lo que propongo construir primero.** Resultado de gestión con historial, intentos calculados, marcado en el hilo y en Contactos (individual y en bloque), reportes 1, 4 y 5 con exportación, y las tarjetas del dashboard. Con esto ya reportas clientes contactados y repartes el trabajo del día. Es la fase que conviene hacer ya aunque no tengas el resto, porque el reporte solo sirve si los datos se empiezan a capturar.

**Fase 2.** Monto y fecha de promesa, reportes 2 y 3, y recordatorio de promesas vencidas en el dashboard.

**Fase 3.** Tendencias (cumplimiento de promesa por persona y por campaña), marcado automático de "sin contestación" al pasar X intentos y sugerencias de a quién escribirle según el estado.

---

## 4. Límites que quedan escritos desde ahora

- **Marcar "pagado" es una anotación operativa**, no una conciliación: la app no comprueba que el dinero entró, y no maneja pagos parciales ni saldos.
- **Un intento es un mensaje que salió.** Si alguien llama por teléfono, ese intento no existe salvo que se registre como nota o se marque el resultado a mano.
- **Los intentos cuentan desde el último mensaje entrante**: si el cliente respondió hace tres meses, el contador arranca de ahí. Para el ciclo actual de cobranza es lo correcto; para "nunca ha respondido" está la segunda lectura.
- **El resultado vive en el cliente, no en el hilo.** Con varios números, el estado es el mismo en todos sus hilos: es un cliente, no una conversación.
- Los montos son **una promesa**, no un adeudo: Margarita no lleva cartera.

---

## 5. Decisiones tomadas

1. **Catálogo**: `PROMISE` (promesa), `PAID` (pagado), `CONVENIO`, `PROMISE_BROKEN` (promesa incumplida), `NO_ANSWER` (sin contestación), `WRONG_NUMBER`, `NOT_INTERESTED`, `CALLBACK`, `OTHER`. Se agregaron, como pediste, **convenio** y **promesa incumplida**.
2. **Sí hay monto y fecha compromiso**, cifrados los dos en la base. Las sumas se calculan en la aplicación, nunca con `SUM()` en SQL.
3. **No hay saldo por cliente.** Margarita registra promesas y pagos, no cartera.

### Cómo quedó la promesa incumplida

Es la parte que más pensé, porque lo que describiste tiene dos cosas distintas:

- **Vencida (automática).** Una promesa o convenio con fecha compromiso ya pasada **no se marca sola en la base**: se deduce de la fecha cada vez que se muestra. En la lista de contactos, en la ficha, en el hilo y en los reportes aparece como *"Promesa vencida · N días de atraso"* sin que nadie haga nada.
- **Incumplida (confirmada).** `PROMISE_BROKEN` es un resultado que una persona marca, cuando ya sabe que no se va a pagar. Desde Contactos se puede marcar en bloque a todos los vencidos de un clic.

Por qué derivar en lugar de escribir: si el sistema marcara "incumplida" a medianoche, en cuanto el cliente pagara al día siguiente habría que **deshacer** ese estado y el historial quedaría contando cosas que no pasaron. Derivándolo, marcar `PAID` resuelve la promesa sola: el atraso desaparece, la promesa sale de la lista de trabajo y el reporte la cuenta como *pagada tarde* (no como incumplida). El caso "pagó después" que mencionaste queda cubierto sin excepciones ni pasos manuales extra.

### Qué quedó implementado

- Esquema: `ContactOutcome` (historial, nunca se borra) más el estado vigente en `Contact`.
- Intentos calculados con los mensajes (una respuesta reinicia el contador) y umbral en `OUTCOME_NO_ANSWER_ATTEMPTS`.
- Marcado desde el hilo del admin y del agente, desde la ficha del contacto y **en bloque** desde la lista.
- Filtros en Contactos: resultado, promesas vencidas, sin resultado, intentos mínimos y "nunca respondió".
- Reportes: gestiones del periodo (por resultado, persona y día), promesas (vigentes, vencidas, cumplimiento del periodo y prometido vs. pagado), sin contestación tras los X intentos, y detalle exportable a CSV.
- Tarjetas del día en el dashboard y en la cabecera de reportes.

### Lo que queda

- **Marcar «sin contestación» al pasar el umbral** sin que nadie lo apriete: hoy
  la lista de intentos se revisa a mano.
- **Recordatorio de la agenda**: la llamada ya se agenda con fecha y hora y las
  citas de hoy suben al principio; falta que avise sola (notificación o
  recordatorio al deudor).
- **Prueba contra Meta real**: el circuito del botón está probado con payloads
  sintéticos; falta el toque de un botón de verdad, y para eso está
  [`pruebas-meta.md`](pruebas-meta.md).
