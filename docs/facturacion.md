# Cobro y facturación — Margarita

Guía corta para cuando toca cobrar y facturar, sin improvisar. Los precios
salen de las variables `INSTALL_*` y `SETUP_*` (la página pública y este
documento tienen que decir lo mismo). La plantilla para mandar la propuesta
está en [`propuesta-comercial.md`](propuesta-comercial.md).

---

## 1. Precios vigentes (revisión del 15 de octubre de 2026)

| Concepto | Precio | Cuándo se cobra |
| --- | --- | --- |
| **Instalación** (promoción de lanzamiento, todo noviembre) | **$1,500.00 MXN** | Una vez, al firmar. **Incluye el primer mes** |
| Instalación a precio de lista (fuera de la promoción) | $2,500.00 MXN | Una vez, al firmar. Incluye el primer mes |
| **Mensualidad** | **$800.00 MXN** | Del segundo mes en adelante, mes adelantado |
| Conexión con Meta (opcional) | +$1,500.00 MXN | Una vez, junto con la instalación |
| Instalación + conexión con Meta | $2,500.00 MXN | Una vez (ahorra $500) |
| Anual, si el cliente lo prefiere | $8,000.00 MXN | Doce meses por adelantado (dos de regalo) |
| Migración de cartera | [definir o incluir] | Una vez |

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

- **Todo noviembre**: la instalación está en promoción ($1,500). **El 1 de
  diciembre se apaga**: iguala `INSTALL_PRICE_PROMO` con `INSTALL_PRICE` (o
  cambia `INSTALL_PROMO_LABEL`) y la página deja de anunciarla sola.
- **Cada trimestre**: revisar si toca subir la mensualidad (ver sección 7).
- **Por cada cliente** guardar: contrato firmado, comprobante del primer pago,
  fecha de inicio (es la base del cobro mensual) y el historial de pagos.

## 5. Qué decirle al cliente (frases cortas, ya probadas)

- «La instalación cuesta $1,500 e incluye el primer mes. Después son $800 al
  mes, sin plazos forzosos: si un mes decides no seguir, se acaba ahí.»
- «Los mensajes de WhatsApp los cobra Meta directo a tu cuenta. Nosotros no
  cobramos por mensaje: nuestra factura es por la herramienta.»
- «Si prefieres que nos encarguemos de Meta, son $1,500; y si va junto con la
  instalación, los dos por $2,500.»
- «Si me pagas el año, te cobro diez meses.»
- Si pide descuento: **no bajar la mensualidad**. Ofrecer el anual, o incluir
  la migración de la cartera, o la capacitación extra.

## 6. Datos que hay que pedir para facturar

Razón social, RFC, régimen fiscal, domicilio fiscal, correo para facturas y
confirmar quién es el contacto de pagos (y si es distinto del de operación).

## 7. Cuándo subir el precio

- A **$1,000 al mes** cuando pases de unos diez clientes activos, o cuando el
  soporte de un cliente pase de dos horas al mes.
- Se sube **sólo a clientes nuevos**; a los que ya están se les respeta el
  precio hasta su siguiente renovación anual.
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
