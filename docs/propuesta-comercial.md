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

- Datos cifrados en la base (teléfonos, mensajes, notas, **montos** y los correos de acceso). Los nombres de contacto quedan en claro porque la búsqueda por texto depende de ellos: se dice antes de firmar.
- Sesiones con **cierre por inactividad**, tope de dispositivos y lista visible con revocación.
- **Bitácora** de accesos y de cada cambio, con retención configurable.
- Permisos por rol: cada persona ve solo sus conversaciones.

## 5. Servicios profesionales

| Servicio | Qué incluye |
| --- | --- |
| **Conexión con Meta** (+$1,500.00 MXN, opcional) | Alta en Meta Business, app, cuenta de WhatsApp Business, número dedicado, token permanente, webhook firmado, primera plantilla y prueba de punta a punta. Ver [`guia-meta.md`](guia-meta.md). |
| **Puesta en marcha de la instalación** (incluida en el precio de instalación) | Proyecto propio, base de datos propia, dominio, usuario administrador, cifrado de datos, respaldos configurados y una sesión de capacitación de 60 minutos. |
| **Migración de cartera** ([PRECIO O INCLUIDA]) | Carga de contactos desde Excel con etiquetas y depuración de números inválidos. |
| **Capacitación** (incluida) | Una sesión de 60 minutos para el equipo (cobranza y administración) y manual de uso. |

## 6. Lo que NO incluye

Decirlo aquí evita discusiones después:

1. **Costos de Meta**: las conversaciones las cobra Meta directo al cliente. Nuestra factura es solo por la herramienta y los servicios.
2. **Trámites legales**: contrato de tratamiento de datos, aviso de privacidad y consentimientos son responsabilidad del cliente (dejamos plantillas).
3. **Conciliación de pagos**: "pagado" es una anotación operativa; la herramienta no comprueba que el dinero entró ni lleva saldos contables.
4. **Creación de plantillas**: se crean en Meta (ayudamos con la redacción y la subida, pero la aprobación es de Meta).
5. **Integración con CRM, ERP o facturación.**
6. **Números telefónicos, equipos o conectividad.**

## 7. Inversión

**El paquete es uno solo**: instalación completa + 6 meses de servicio. No hay
mensualidad ni cobro por usuario.

| Concepto | Importe | Cuándo |
| --- | --- | --- |
| **Instalación Margarita (promoción de lanzamiento, todo noviembre)** | **$3,000.00 MXN** (en lugar de $5,000.00 MXN) | Pago único, al firmar |
| Instalación Margarita a precio de lista (fuera de la promoción) | $5,000.00 MXN | Pago único, al firmar |
| Conexión con Meta (opcional) | +$1,500.00 MXN | Pago único, junto con la instalación |
| Renovación por otros 6 meses (a partir del séptimo mes) | $4,200.00 MXN (o $800.00 MXN al mes) | Al renovar |
| Migración de cartera | [PRECIO O INCLUIDA] | Pago único |

**Qué incluyen los 6 meses** (esto es lo que se está comprando):

1. La instalación funcionando en producción: proyecto, base de datos, dominio,
   respaldos automáticos y datos cifrados.
2. **Usuarios ilimitados**: no se cobra por agente, ni por número de WhatsApp.
3. Actualizaciones y correcciones durante la vigencia, incluidas las funciones
   nuevas que salgan en ese periodo.
4. Soporte por WhatsApp y correo en horario hábil ([HORARIO]).
5. Sesión de capacitación para el equipo y manual de uso.
6. Aviso de privacidad y plantilla de contrato de tratamiento de datos.

**Lo que no incluye, y conviene decir en voz alta:**

- **El consumo de WhatsApp lo paga el cliente a Meta**, directo y con su propio
  método de pago (conversaciones y plantillas). Nuestra factura es solo por la
  herramienta y los servicios: **no cobramos por mensaje**.
- El número telefónico dedicado y el equipo de cómputo.
- El alojamiento, si se acuerda que va en la cuenta del cliente (Railway:
  aproximadamente $5–10 USD al mes, pagados al proveedor). Si lo absorbemos
  nosotros, el precio de instalación sube [AJUSTE].
- Cambios a la medida que no estén en el producto (se cotizan aparte).

Notas de cobro: [anticipo / pago completo al inicio, comprobante fiscal, días de
gracia, qué pasa si no se renueva].

**Cómo se calculó:** el precio de instalación cubre el alta (2–3 horas de
trabajo entre despliegue, conexión y capacitación), el soporte de los 6 meses
(~1 hora al mes de base, más incidencias), la infraestructura si la absorbemos, y
el margen para sostener y seguir mejorando el producto. La promoción de
lanzamiento baja el precio para los primeros clientes a cambio de
retroalimentación y de un caso de éxito que se pueda mostrar.

**Por qué la renovación cuesta $4,200 y no menos:** son $700 al mes por un
equipo completo, sin tope de usuarios y sin costo por mensaje. Una herramienta
de cobranza por suscripción cobra eso o más **por usuario**, y aquí los usuarios
son ilimitados. Del lado del costo, el mes incluye el canal de soporte
(~1 hora), las mejoras que salgan en el periodo y el monitoreo; si además el
alojamiento va por nuestra cuenta, hay que sumar unos $150 al mes. Con $2,500
por semestre ($417 al mes) el margen se quedaba en nada: era un precio de
"amigo", no de negocio. Quien prefiera no pagar seis meses por adelantado tiene
el mes suelto a $800, y quien renueva por semestre ahorra un mes.

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
2. Se paga el anticipo del [50%] del servicio de conexión.
3. Agendamos el alta en Meta ([FECHA PROPUESTA]) y la capacitación.
4. Piloto con 1–3 contactos y arranque.

**Aceptación:** firmado por [NOMBRE], [PUESTO], [FECHA].
