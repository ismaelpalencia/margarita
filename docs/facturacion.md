# Cobro y facturación — Margarita

Guía corta para cuando toca cobrar y facturar, sin improvisar. Los precios
salen de las variables `INSTALL_*` y `SETUP_*` (la página pública y este
documento tienen que decir lo mismo). La plantilla para mandar la propuesta
está en [`propuesta-comercial.md`](propuesta-comercial.md).

---

## 1. Precios vigentes (revisión del 4 de noviembre de 2026)

| Concepto | Precio | Cuándo se cobra |
| --- | --- | --- |
| **Paquete A · Llave en mano** | **$3,500.00 MXN** | Una vez, al firmar: instalación, **primer mes** y conexión completa con Meta |
| **Paquete B · Ya tengo Meta** | **$2,500.00 MXN** | Una vez, al firmar: instalación y **primer mes** |
| **Mensualidad** (mes a mes) | **$699.00 MXN** | Del segundo mes en adelante, mes adelantado |
| **IA Esencial · instalación** | **+$1,500.00 MXN** | Una vez, al firmar; se suma al paquete base |
| **IA Esencial · mensualidad** | **+$299.00 MXN** | Del segundo mes en adelante, junto con la mensualidad base |
| **IA Soporte · instalación** | **+$3,000.00 MXN** | Una vez, al firmar; se suma al paquete base |
| **IA Soporte · mensualidad** | **+$599.00 MXN** | Del segundo mes en adelante, junto con la mensualidad base |
| Compromiso 3 meses (opcional) | $649.00 MXN al mes | Baja la mensualidad; se firma solo si el cliente lo elige |
| Compromiso 6 meses (opcional) | $599.00 MXN al mes | Igual |
| Compromiso 12 meses (opcional) | $549.00 MXN al mes | Igual |
| Conexión con Meta por separado | Se cotiza aparte | Solo si el cliente no contrata el Paquete A |
| Precio de lista (referencia) | $4,900.00 MXN de instalación y $1,490.00 MXN al mes | Es el precio sin promoción; sirve para mostrar el ahorro |
| Migración de cartera | [definir o incluir] | Una vez, si se contrata |

Todos los precios son **más IVA**. El **consumo de WhatsApp** (conversaciones y
plantillas) lo cobra Meta directo al cliente, con su método de pago; no está
incluido en ninguno de estos importes. El **consumo del modelo de IA** se cobra
aparte, con el presupuesto mensual que el cliente ve en Admin → IA; no se
revende por mensaje.

**Qué incluye cada nivel de IA (alcance vigente):**

| Nivel | Incluye |
| --- | --- |
| **IA Esencial** | IA en sugerencias, base de conocimiento de hasta 30 entradas, handoff con motivo, pausa por conversación, panel de IA por hilo y métricas de aceptación. |
| **IA Soporte** | Todo lo de Esencial, más respuesta automática acotada para FAQ, límites por día y por hilo, presupuesto mensual y entrega automática ante duda, queja o falta de conocimiento. |

La captura de leads y las rutas a recursos **se cotizan aparte** mientras se
cierra esa fase. No se publican como incluidas en el nivel Soporte.

## 2. Las tres reglas que no se negocian

1. **El primer mes es piloto y no hay mínimo obligatorio.** Se cobra la
   instalación con el primer mes incluido; al día 30 el cliente decide si sigue.
   Si no sigue, se le entrega su respaldo y se borra la instalación a petición.
   El **compromiso es opcional** y solo sirve para bajar la mensualidad:
   3 meses $649, 6 meses $599, 12 meses $549 (todos más IVA). **Anotar en el
   contrato** qué eligió el cliente, si eligió alguno.
2. **La mensualidad es adelantada.** Se cobra el día 1 (o al cumplirse el mes
   de la instalación), nunca a mes vencido.
3. **El consumo de Meta y el alojamiento no son nuestros.** Los mensajes los
   cobra Meta directo al cliente, con su método de pago. El alojamiento va en
   la cuenta del cliente (unos $5–10 USD al mes) salvo que se acuerde lo
   contrario por escrito; si lo absorbemos, la mensualidad sube a $950.

## 3. El ciclo de cobro, paso a paso

1. **Firma y cobro de la instalación** (con el primer mes incluido). Aquí se
   piden también los datos de facturación (sección 6).
2. **Alta**: instalación, capacitación y prueba con contactos reales (1–3 días
   hábiles).
3. **Aviso al cliente**: «tu primer mes está cubierto hasta el [fecha]; el
   [fecha] te mando el cobro del siguiente».
4. **Día 1 de cada mes**: recordatorio con el monto y el comprobante fiscal.
5. **Si no paga**: a los [5] días se pausa el servicio (la instalación no se
   borra), y a los [15] días se cierra: se entrega el respaldo y se borra todo
   a petición. Queda constancia en la bitácora.

## 4. Fechas y recordatorios

- **Hasta el 31 de diciembre de 2026**: rige el precio de la tabla ($3,500 /
  $2,500 de instalación y $699 al mes). **El 1 de enero de 2027 se apaga sola**
  porque `INSTALL_PROMO_UNTIL` es `2026-12-31`; para extenderla se cambia esa
  variable, y para retirarla antes se iguala `INSTALL_PRICE_PROMO` con
  `INSTALL_PRICE` o se ajusta `INSTALL_PROMO_LABEL`.
- **Cada trimestre**: revisar si toca subir la mensualidad (ver sección 7).
- **Por cada cliente** guardar: contrato firmado, comprobante del primer pago,
  fecha de inicio (es la base del cobro mensual) y el historial de pagos.

## 5. Qué decirle al cliente (frases cortas, ya probadas)

- «El paquete completo, con la conexión a Meta, cuesta $3,500 e incluye el
  primer mes. Si ya tienes Meta, son $2,500. Después son $699 al mes, sin
  mínimo obligatorio: al día 30 decides si sigues.»
- «Si te comprometes a 3, 6 o 12 meses, la mensualidad baja a $649, $599 o
  $549. Es opcional; no hace falta firmar plazo para empezar.»
- «Los mensajes de WhatsApp los cobra Meta directo a tu cuenta. Nosotros no
  cobramos por mensaje: nuestra factura es por la herramienta.»
- «La IA se agrega al paquete: Esencial son +$1,500 de instalación y +$299 al
  mes; Soporte, +$3,000 y +$599. El consumo del modelo va aparte, con un
  presupuesto mensual que tú ves en el panel.»
- «Si no quieres hacer el trámite de Meta, lo hacemos nosotros dentro del
  Paquete A; si tu cuenta ya está lista, te ahorras esa parte con el B.»
- Si pide descuento: **no bajar la mensualidad fuera de la tabla**. Ofrecer un
  compromiso opcional, incluir la migración de la cartera o una capacitación
  extra.

## 6. Datos que hay que pedir para facturar

Razón social, RFC, régimen fiscal, domicilio fiscal, correo para facturas y
confirmar quién es el contacto de pagos (y si es distinto del de operación).

## 7. Cuándo subir el precio

- A **$1,000 al mes** cuando pases de unos diez clientes activos, o cuando el
  soporte de un cliente pase de dos horas al mes.
- Se sube **sólo a clientes nuevos**; a los que ya están se les respeta el
  precio mientras mantengan su mensualidad activa.
- Si el alojamiento pasa a cargo nuestro: **+$150 al mes**.

## 8. Errores caros que conviene evitar

- Cobrar la instalación y olvidar el primer cobro mensual del mes siguiente
  (se pierde el ritmo y el cliente se acostumbra a que «no le cobraron»).
- Prometer cosas del roadmap. Lo que se puede ofrecer **hoy** está en
  [`alcance-produccion.md`](alcance-produccion.md), y lo que no está en esa
  lista no se promete.
- Dejar sin firmar la cláusula de tratamiento de datos cuando damos soporte
  (ahí somos encargados del tratamiento): la plantilla está en
  [`propuesta-comercial.md`](propuesta-comercial.md).
