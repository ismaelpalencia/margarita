# Workspace `COMERCIO` para la demo

Cómo dejar una instalación de demostración que **no muestre cobranza** y que
sirva para los briefs de atención al cliente, soporte y leads.

**Objetivo:** probar que el mismo código atiende otro giro y tener un número
real para la propuesta de Workana.

**Regla:** la demo usa datos inventados y una base separada. Nunca se conecta
un número de un cliente real ni se cargan conversaciones de producción.

---

## 1. Qué demuestra

| Pieza | Qué se ve en la demo |
| --- | --- |
| Giro `COMERCIO` | Bandeja, contactos, etiquetas, plantillas, campañas e IA. Sin resultados de gestión, montos, promesas ni reportes de cobranza. |
| IA en sugerencias | La IA redacta, el equipo aprueba. Nada sale solo. |
| Automático acotado | La IA contesta una FAQ cubierta y entrega una cotización a una persona. |
| Handoff | La conversación pasa a una persona con motivo visible. |
| Panel por conversación | Cuántas veces respondió sola, cuántas entregó y cuánto costó. |
| Bitácora | Cada decisión queda registrada. |

Lo que **no** se muestra: cobranza, deudores, promesas de pago, montos,
recuperación, reportes de gestión ni el vertical de Palencia.

---

## 2. Crear la instalación

La instalación es *single-tenant*: un workspace, una base y un dominio. Para la
demo se usa una instalación aparte de la de cobranza.

1. Crear un servicio nuevo en Railway (o una base local) con su propio
   PostgreSQL y su propio volumen.
2. Configurar las variables de `.env.example`. Como mínimo:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `ENCRYPTION_KEY`
   - `PRODUCT_DOMAIN` (si el sitio de venta vive en otro dominio)
   - `AI_ENABLED=true`
   - `AI_API_KEY` del proveedor real
   - `AI_PROVIDER=deepseek`
3. Aplicar migraciones: `npx prisma migrate deploy`.
4. Abrir `/setup` y crear el workspace:
   - **Giro:** `COMERCIO`.
   - **Nombre:** algo neutro, por ejemplo «Comercio Demo».
   - **Administrador:** correo de demostración, no el personal.
5. Entrar y comprobar en **Admin → Sistema** que el giro quedó en `COMERCIO`.

> Si la instalación ya existe, el giro se cambia en **Admin → Sistema → Giro
> de la operación**. Apagarlo no borra nada; volver a `COBRANZA` restaura todo.

---

## 3. Contenido mínimo

### Etiquetas

Crear en **Admin → Etiquetas**:

- `cotizacion`
- `envio`
- `devolucion`
- `mayoreo`
- `soporte`

### Base de conocimiento (10–15 entradas)

Cargar en **Admin → IA** con preguntas y respuestas inventadas pero realistas.
Sirven para que la IA tenga de dónde responder:

1. ¿Cuál es el horario de atención?
2. ¿Hacen envíos a todo el país?
3. ¿Cuánto tarda un envío?
4. ¿Puedo cambiar o devolver un producto?
5. ¿Qué formas de pago aceptan?
6. ¿Emiten factura?
7. ¿Tienen precios de mayoreo?
8. ¿Dónde están ubicados?
9. ¿Cómo sigo mi pedido?
10. ¿Los productos tienen garantía?
11. ¿Puedo recoger en tienda?
12. ¿Hacen cotizaciones personalizadas?

Las respuestas deben decir qué **sí** se sabe y, cuando aplique, cuándo hay que
pasar con una persona. Ejemplo:

> «Sí hacemos envíos a todo México. El costo y el tiempo dependen del código
> postal; si me compartes el tuyo, te paso con una persona para cotizarlo.»

### Ajustes de IA

- **Modo:** `SUGGEST` para el arranque.
- **Confianza mínima:** `0.70`.
- **Límites:** 50 respuestas por día, 5 por hilo.
- **Presupuesto:** 500 centavos (USD 5) al mes.
- **Palabras de entrega:** `queja`, `reclamo`, `devolución`, `hablar con una persona`, `factura`, `cotización`.

Después de probar la consola, se puede pasar a `AUTO` solo para la demo del
automático acotado. Para la demo comercial conviene dejar `SUGGEST` como estado
inicial y cambiar a `AUTO` en vivo, para explicar la diferencia.

---

## 4. Contactos y conversaciones de demo

Usar nombres inventados y números de prueba. No cargar clientes reales.

| Contacto | Para qué |
| --- | --- |
| Laura Méndez | Pregunta frecuente cubierta (horario, envío). |
| Jorge Ramírez | Cotización: la IA no inventa precio y entrega a una persona. |
| María López | Queja o devolución: handoff y pausa. |

Guion sugerido:

1. **FAQ cubierta.** Laura pregunta el horario. En `SUGGEST`, la IA propone; el
   agente aprueba. En `AUTO`, la IA responde sola y se ve el mensaje con su
   origen.
2. **Cotización.** Jorge pregunta cuánto cuesta enviar a su código postal. La
   IA no da un precio que no está en la base: entrega a una persona con el
   motivo «necesita cotización».
3. **Queja.** María pide devolver un producto. La IA entrega, el hilo queda
   pausado y una persona toma el control.
4. **Panel.** Abrir el panel de IA de cada hilo y mostrar: respondió sola,
   entregó a persona, borradores aprobados y costo estimado.

---

## 5. Checklist antes de enseñarla

- [ ] El workspace dice `COMERCIO` en **Admin → Sistema**.
- [ ] No aparece ningún enlace de cobranza en la navegación.
- [ ] Hay 10–15 entradas de conocimiento activas.
- [ ] La consola de prueba responde con la base cargada.
- [ ] El número de demo recibe y envía.
- [ ] La IA está en `SUGGEST` y el presupuesto está puesto.
- [ ] Los tres contactos de demo tienen su conversación.
- [ ] El panel por conversación muestra datos.
- [ ] Hay un agente de demo además del administrador.
- [ ] Los datos son inventados y la base es desechable.

---

## 6. Después de la demo

No hace falta borrar nada para la siguiente. Cerrar las conversaciones, dejar
los contactos etiquetados y volver la IA a `SUGGEST`. Si se quiere una demo
limpia, crear otra base; no mezclar con la instalación de un cliente.
