# Kit comercial — Margarita

Materiales para la primera conversación, la demo y las objeciones. Todo está
alineado con lo que la app hace hoy: si algo no está en el
[`catalogo-producto.md`](../catalogo-producto.md), no se promete.

---

## 1. Guion de primer contacto (WhatsApp)

Cuatro mensajes, sin audio y sin links en el primero:

> 1. «Hola [NOMBRE], soy [TU NOMBRE] de Margarita. Trabajamos con despachos de
>    cobranza en CDMX que cobran por WhatsApp y pierden el hilo entre el celular,
>    el Excel y las promesas de pago. ¿Te late que te cuente en dos minutos cómo
>    lo resuelven?»
>
> 2. (si responde) «La idea es simple: cada conversación termina en un resultado
>    —promesa, convenio, pagado, sin contestación— y al día siguiente la app te
>    dice a quién escribirle o llamarle primero. Todo desde el mismo panel, con la
>    API oficial de WhatsApp.»
>
> 3. «¿Hoy cómo llevan el seguimiento: WhatsApp Web, celular del cobrador, Excel?»
>
> 4. «Te propongo una demo de 15 minutos con datos de ejemplo, para que veas el
>    flujo completo: campaña, respuesta del deudor, resultado, promesa, vencida y
>    pago. Si te sirve, te paso el enlace.»

**Micro-compromiso**: que confirme la hora de la demo. No mandes precios en el
primer mensaje.

---

## 2. Guion de llamada (10 minutos)

| Minuto | Qué hacer |
| --- | --- |
| 0–1 | «Gracias por el tiempo. ¿Te parece si te hago tres preguntas y luego te muestro solo lo que aplique?» |
| 1–4 | **Diagnóstico**: ¿cuántos casos al mes? ¿cuántas personas cobran? ¿cómo registran promesas? ¿qué pasa cuando no contestan? |
| 4–8 | **Demo guiada** de la sección 3, solo las pantallas que respondan a su dolor |
| 8–10 | **Siguiente paso**: piloto de 30 días, qué necesita de Meta y qué le toca a él |

---

## 3. Demo de 15 minutos (orden exacto)

Con el cargador de datos de demo (`npm run demo:datos`) o con una cartera de
ejemplo:

1. **Campaña** con la plantilla de cobranza (30 s).
2. **Respuesta del deudor**: el botón «Quiero que me llame un asesor» (20 s).
3. **Reportes → Hoy**: aparece arriba con su tiempo de espera (30 s).
4. **Agendar la llamada** y marcar «No contestó» (20 s).
5. **Ficha**: registrar promesa con monto y fecha (40 s).
6. **Hoy otra vez**: la promesa aparece ordenada; al pasar la fecha se marca
   vencida sola (30 s).
7. **Pagado**: se registra el monto y la promesa se cierra (30 s).
8. **Reportes**: cumplimiento y CSV (30 s).
9. **WhatsApp**: tramo del mes y calidad del número (30 s).
10. **Sistema**: cifrado, respaldos y webhook firmado (30 s).

Cierra con: «Todo esto corre en tu dominio, con tu cuenta de Meta, y el primer
momento es un piloto: si no te sirve, te llevas tu respaldo».

---

## 4. Criterios de calificación (antes de invertir tiempo)

| Señal | Sí califica | No califica |
| --- | --- | --- |
| Cartera | 200–5,000 casos de cobranza al mes | Cartera inexistente o ventas nuevas |
| Equipo | 1–15 personas cobrando | Más de 30 (necesita multi-empresa) |
| Canal | Ya usan WhatsApp manual o WhatsApp Web | No usan WhatsApp |
| Meta | Tienen o pueden tener WABA y método de pago | No quieren pasar por Meta |
| Dolor | Pierden promesas, no saben a quién llamar | Solo quieren «mandar publicidad» |
| Decisión | Quien decide está en la llamada | «Le paso la info a mi jefe» sin fecha |

**Checklist de 60 segundos**: ¿cuántos casos al mes? ¿cuántas personas? ¿cómo
registran hoy las promesas? ¿quién configura Meta? ¿tienen método de pago en
Meta? ¿qué pasa si no funciona?

---

## 5. Objeciones

**«Está caro.»**
> «Es un solo plan: $1,299 al mes, todo incluido y sin instalación. Puedes cancelar cuando quieras, sin compromiso; el primer mes se paga si usas el servicio.»

**«Ya uso WhatsApp Web y me funciona.»**
> «WhatsApp Web no te dice a quién llamar hoy ni guarda en qué quedó cada
> cliente. Aquí cada conversación termina en un resultado y la app te arma la
> lista del día. Y usa la API oficial, no Web.»

**«¿Y si Meta me bloquea?»**
> «La API oficial no bloquea como el WhatsApp normal, pero la calidad sí se
> cuida: la app te avisa de la calidad del número, de las plantillas rechazadas
> y de las que Meta clasifica como marketing. Las bajas se respetan solas.»

**«¿Y si no funciona?»**
> «Cancelas cuando quieras, sin penalización, con tu respaldo y con la cuenta
> borrada a petición. El primer mes se paga si usas el servicio.»

**«Ya tengo un CRM.»**
> «Perfecto: no competimos con el CRM. Margarita es el canal de WhatsApp y el
> registro de la gestión; el CRM se queda con lo demás.»

**«Meta me va a cobrar aparte.»**
> «Sí, el consumo lo cobra Meta directo a tu cuenta. Nosotros no cobramos por
> mensaje. La app te muestra una estimación y te avisa cuando el número se
> acerca al tramo.»

**«Déjame pensarlo.»**
> «Claro. ¿Qué te falta saber para decidir: el precio, quién configura Meta o
> ver la demo con tus datos? Te dejo agendada la demo y, si quieres, hablamos
> el [DÍA].»

---

## 6. Lista de prospectos (plantilla)

Columnas para el CSV:

```
negocio,contacto,puesto,telefono,correo,zona,vertical,casos_mes,usa_whatsapp,waba,motivo,estado,notas
```

- **Fuente**: despachos de cobranza, financieras de auto, casas de empeño,
  colegios privados, clínicas dentales, gimnasios, inmobiliarias con rentas.
- **Zona**: CDMX y zona metropolitana.
- **Ritmo**: 10 llamadas o 25 mensajes al día; 100 prospectos por semana.
- **Estado**: `nuevo`, `contactado`, `demo`, `piloto`, `cliente`, `perdido`.

Mientras no haya lista cargada, el criterio es: negocios con cartera vencida
propia y al menos una persona dedicada a cobrar.

---

## 7. Caso de estudio (plantilla)

```
Cliente:             [NOMBRE / sector]
Tamaño:              [casos al mes] · [personas cobrando]
Antes:               [cómo cobraban] · [dolor principal]
Qué cambió:          [campaña / botones / resultados / agenda]
Primer mes:          [N] promesas · [N] llamadas pedidas · [N] pagos
Cita del cliente:    "[...]"
Tiempo de respuesta: [N] horas en promedio
```

Se llena con el primer cliente del piloto y se usa en la landing y en la
propuesta.
