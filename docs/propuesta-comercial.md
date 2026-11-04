# Propuesta comercial — plantilla

Plantilla para mandar propuestas. Reemplaza lo que va entre corchetes. Está pensada para **una instalación por cliente** (proyecto propio en Railway, base de datos propia, dominio propio) y para el mercado de **cobranza**.

---

## 1. Portada

| | |
| --- | --- |
| **Propuesta para** | [RAZÓN SOCIAL DEL CLIENTE] |
| **Atenta/o a** | [NOMBRE Y PUESTO] |
| **De** | [TU NOMBRE O RAZÓN SOCIAL] |
| **Fecha** | [FECHA] |
| **Vigencia de la propuesta** | [15 O 30 DÍAS] |
| **Producto** | Margarita — operación de cobranza por WhatsApp |

## 2. Resumen en cinco líneas

Margarita es un panel para **cobrar por WhatsApp con orden**: registra en qué quedó cada cliente (prometió pagar, pagó, no contestó, número equivocado), cuenta los intentos sin respuesta, arma cada mañana la lista de a quién escribirle y saca los reportes en CSV para Excel. Corre sobre la cuenta de WhatsApp Business **del cliente**, en una instalación propia.

## 3. El problema que resuelve

1. Hoy la gestión vive en **hojas de cálculo y WhatsApp personal**: nadie sabe cuántos prometieron pagar ni cuántos ya pagaron.
2. Los mensajes se mandan de números personales, sin registro ni control de quién dijo qué.
3. Cuando alguien pide que no le escriban más, no hay forma de asegurarlo.
4. No hay reporte: no se puede medir al equipo ni justificar el esfuerzo.

## 4. Alcance incluido

**Resultado de cada gestión.**

- Marcar el resultado de cada conversación: **promesa de pago, pagado, convenio, promesa incumplida, sin contestación, número inválido, no le interesa, volver a llamar u otro**, con monto, fecha compromiso y nota.
- **Historial por cliente** con quién lo marcó y cuándo, y marcado **en bloque** desde la lista de contactos.

**Lista de trabajo y seguimiento.**

- **Promesa vencida automática**: una promesa con fecha pasada aparece vencida con sus días de atraso, sin que nadie la marque. Si el cliente paga después, marcar "pagado" la resuelve sola.
- **Intentos sin contestación automáticos** (no se capturan a mano): cuántos mensajes llevan sin respuesta desde la última vez que el cliente escribió.
- **Pantalla "Hoy"**: lo vencido, lo que vence hoy, lo de la semana y los que no contestan, en orden de urgencia.

**Reportes.**

- Gestiones del periodo por resultado, **por persona y por día**.
- Promesas: vigentes, vencidas, cumplimiento (a tiempo / tarde / sin pago) y **prometido contra cobrado**.
- Detalle exportable a **CSV (Excel)** con filtros por fecha, persona, campaña y etiqueta.
- Tendencias semana a semana y cumplimiento por persona.

**Operación de WhatsApp.**

- **Campañas** con plantillas aprobadas y Excel, enviadas por lotes con pausa para no chocar con los límites de Meta; pausar, reanudar y reintentar.
- **Bandeja compartida** con varios números de la misma cuenta de WhatsApp Business, asignación a cada persona y contador de no leídos.
- **Bajas automáticas**: si el cliente escribe `STOP`, deja de recibir mensajes y campañas al instante. Reactivarlo es una decisión explícita y auditada.
- **Consentimiento (opt-in) registrado** por contacto.

**Seguridad.**

- Datos cifrados en la base con AES-256-GCM: teléfonos, **nombres de contacto**, mensajes, notas, montos y correos de acceso. La búsqueda por nombre o teléfono es por coincidencia exacta (nombre completo o número completo), no por fragmento.
- Sesiones con **cierre por inactividad**, tope de dispositivos y lista visible con revocación.
- **Bitácora** de accesos y de cada cambio, con retención configurable.
- Permisos por rol: cada persona ve solo sus conversaciones.

## 5. Servicios profesionales

| Servicio | Qué incluye |
| --- | --- |
| **Conexión con Meta** (incluida en el Paquete A; por separado se cotiza) | Alta en Meta Business, app, cuenta de WhatsApp Business, número dedicado, token permanente, webhook firmado, primera plantilla y prueba de punta a punta. Ver [`guia-meta.md`](guia-meta.md). |
| **Puesta en marcha de la instalación** (incluida en el precio de instalación) | Proyecto propio, base de datos propia, dominio, usuario administrador, cifrado de datos, respaldos configurados, **el primer mes de servicio** y una sesión de capacitación de 2 horas. |
| **Migración de cartera** ([PRECIO O INCLUIDA]) | Carga de contactos desde Excel con etiquetas y depuración de números inválidos. |
| **Capacitación** (incluida) | Una sesión de arranque de 2 horas para el equipo (cobranza y administración) y manual de uso. |

## 6. Lo que NO incluye

Decirlo aquí evita discusiones después:

1. **Costos de Meta**: las conversaciones las cobra Meta directo al cliente. Nuestra factura es solo por la herramienta y los servicios.
2. **Trámites legales**: contrato de tratamiento de datos, aviso de privacidad y consentimientos son responsabilidad del cliente (dejamos plantillas).
3. **Conciliación de pagos**: "pagado" es una anotación operativa; la herramienta no comprueba que el dinero entró ni lleva saldos contables.
4. **Creación de plantillas**: se crean en Meta (ayudamos con la redacción y la subida, pero la aprobación es de Meta).
5. **Integración con CRM, ERP o facturación.**
6. **Números telefónicos, equipos o conectividad.**

## 7. Inversión

La cobranza es del día a día, así que el cobro también: **instalación una vez y
después mes con mes**, sin mínimo obligatorio. El primer mes es un **piloto
pagado**.

| Concepto | Importe | Cuándo |
| --- | --- | --- |
| **Paquete A · Llave en mano** | **$3,500.00 MXN** | Una vez; instalación, primer mes y **conexión completa con Meta** |
| **Paquete B · Ya tengo Meta** | **$2,500.00 MXN** | Una vez; instalación y primer mes |
| **Mensualidad** (mes a mes) | **$699.00 MXN al mes** | Del segundo mes en adelante |
| Compromiso 3 meses | $649.00 MXN al mes | Opcional; baja la mensualidad |
| Compromiso 6 meses | $599.00 MXN al mes | Opcional |
| Compromiso 12 meses | $549.00 MXN al mes | Opcional |
| Consumo de WhatsApp | Lo cobra Meta | Directo a la empresa |
| **IA Esencial · instalación** | **+$1,500.00 MXN** | Una vez; se suma al paquete base |
| **IA Esencial · mensualidad** | **+$299.00 MXN al mes** | Del segundo mes en adelante |
| **IA Soporte · instalación** | **+$3,000.00 MXN** | Una vez; se suma al paquete base |
| **IA Soporte · mensualidad** | **+$599.00 MXN al mes** | Del segundo mes en adelante |
| Consumo de IA | Aparte, con presupuesto | Se ve en Admin → IA |
| Migración de cartera | [PRECIO O INCLUIDA] | Una vez |

**El complemento de IA es opcional.** IA Esencial incluye sugerencias, base de
conocimiento, handoff y pausa por conversación. IA Soporte agrega respuesta
automática acotada para FAQ, límites y presupuesto. La captura de leads y las
rutas a recursos se cotizan aparte mientras se cierra esa fase.

**El piloto de 30 días.** El primer mes está incluido en la instalación y se
trata como piloto: **al día 30 el cliente decide si continúa**, sin penalización.
Si no sigue, se le entrega su respaldo completo y se borra la instalación a
petición.

Precio de lista: $4,900 de instalación y $1,490 al mes. Promoción vigente hasta
el **31 de diciembre de 2026**; todos los precios son **más IVA**.

**Qué incluye la mensualidad** (esto es lo que se está pagando cada mes):

1. La instalación funcionando en producción: proyecto, base de datos, dominio,
   respaldos automáticos y datos cifrados.
2. **Usuarios ilimitados**: no se cobra por agente ni por número de WhatsApp.
3. Actualizaciones, correcciones y las funciones nuevas que salgan mientras la
   mensualidad esté activa.
4. Soporte por WhatsApp y correo en horario hábil ([HORARIO]).
5. Sesión de capacitación inicial para el equipo y manual de uso.
6. Aviso de privacidad y plantilla de contrato de tratamiento de datos.

**Lo que no incluye, y conviene decir en voz alta:**

- **El consumo de WhatsApp lo paga el cliente a Meta**, directo y con su propio
  método de pago (conversaciones y plantillas). Nuestra factura es solo por la
  herramienta y los servicios: **no cobramos por mensaje**.
- El número telefónico dedicado y el equipo de cómputo.
- El alojamiento, si se acuerda que va en la cuenta del cliente (Railway: unos
  $5–10 USD al mes, pagados al proveedor). Si lo absorbe el proveedor, la
  mensualidad debería ser $950.
- Cambios a la medida que no estén en el producto (se cotizan aparte).

Notas de cobro: mensual adelantado, comprobante fiscal, [días de gracia] y qué
pasa si no se renueva. **No hay mínimo obligatorio**: el primer mes es el piloto
y al día 30 el cliente decide. El compromiso de 3, 6 o 12 meses es opcional y
solo sirve para bajar la mensualidad; se anota en el contrato únicamente si el
cliente lo elige. El detalle operativo (fechas, recordatorios y frases para
cobrar) está en [`facturacion.md`](facturacion.md).

**Cómo se calculó:** la instalación cubre el alta (despliegue, conexión y
capacitación) y el primer mes; de ahí en adelante, $699 al mes por un equipo
completo sin tope de usuarios. Del lado del costo, el mes incluye el canal de
soporte (~1 hora), las mejoras del periodo, el monitoreo y, si el alojamiento va
por nuestra cuenta, unos $150 más. El precio de lista es $4,900 de instalación y
$1,490 al mes; la promoción vigente baja el precio de entrada y se anuncia hasta
el 31 de diciembre de 2026.

## 8. Requisitos del cliente

1. Cuenta de **Meta Business** (con verificación si habrá volumen) y **método de pago** válido.
2. Un **número dedicado** que no esté en uso en la app normal de WhatsApp.
3. Plantillas aprobadas para iniciar conversaciones (mínimo primer contacto y recordatorio de pago).
4. Alguien responsable del lado del cliente para validar contenido y atender las bajas.
5. Conexión a internet y navegador actualizado para el equipo.

## 9. Tiempos y responsabilidades

| Etapa | Responsable | Días hábiles |
| --- | --- | --- |
| Firma y anticipo | Cliente | 0 |
| Alta en Meta y conexión | [NOSOTROS] con apoyo del cliente | 1–3 |
| Migración de cartera | [NOSOTROS] con Excel del cliente | 1 |
| Capacitación | [NOSOTROS] | 1 |
| Prueba piloto (1–3 contactos) | Ambos | 1 |
| Operación en producción | Cliente | A partir de ahí |

## 10. Datos, confidencialidad y salida

- La instalación, la base de datos y los archivos son **del cliente**; nosotros solo damos soporte.
- Si damos soporte, accedemos a datos personales de los clientes del cliente: eso nos hace **encargados del tratamiento** y se firma un acuerdo de confidencialidad y tratamiento de datos.
- El cliente puede **descargar su respaldo completo** en cualquier momento (JSON y CSV).
- Al terminar el contrato se puede hacer un **borrado total** de la instalación con confirmación por escrito, dejando constancia en la bitácora.
- La llave de cifrado (`ENCRYPTION_KEY`) se entrega en custodia al cliente: sin ella, los datos cifrados no se pueden leer.

## 11. Soporte

| | |
| --- | --- |
| Canal | WhatsApp [NÚMERO] y correo [CORREO] |
| Horario | [LUNES A VIERNES, 9:00–18:00] |
| Tiempo de respuesta | [4 HORAS HÁBILES] |
| Qué cubre | Dudas de uso, incidencias de la herramienta, revisión de calidad y límites de Meta |
| Qué no cubre | Crear plantillas por el cliente, cobrar por él, soporte en su hardware |

## 12. Siguientes pasos

1. [CLIENTE] confirma el alcance y firma.
2. Se paga el anticipo del [50%] de la instalación (Paquete A o B).
3. Agendamos el alta en Meta ([FECHA PROPUESTA]) y la capacitación.
4. Piloto con 1–3 contactos y arranque.

**Aceptación:** firmado por [NOMBRE], [PUESTO], [FECHA].
