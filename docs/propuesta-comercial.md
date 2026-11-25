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
| **Implementación asistida** (desde $20,000 MXN + IVA) | Configuración de Meta y webhook, número, plantillas, capacitación y puesta en marcha. El alcance final se concreta en la propuesta. Ver [`guia-meta.md`](guia-meta.md). |
| **Onboarding Negocio** | Dos horas conforme al alcance del plan. |
| **Onboarding Pro** | Incluido conforme al alcance acordado. |
| **Autoservicio** | Onboarding autoguiado. |
| **Migración de cartera** ([PRECIO O INCLUIDA]) | Carga de contactos desde Excel con etiquetas y depuración de números inválidos. |
| **White label** (desde $50,000 MXN + IVA de implementación y $5,000 MXN + IVA/mes) | Configuración con marca propia y alcance final cotizado por separado. |

## 6. Lo que NO incluye

Decirlo aquí evita discusiones después:

1. **Costos de Meta**: las conversaciones las cobra Meta directo al cliente. Nuestra factura es solo por la herramienta y los servicios.
2. **Trámites legales**: contrato de tratamiento de datos, aviso de privacidad y consentimientos son responsabilidad del cliente (dejamos plantillas).
3. **Conciliación de pagos**: "pagado" es una anotación operativa; la herramienta no comprueba que el dinero entró ni lleva saldos contables.
4. **Creación de plantillas**: se crean en Meta (ayudamos con la redacción y la subida, pero la aprobación es de Meta).
5. **Integración con CRM, ERP o facturación.**
6. **Números telefónicos, equipos o conectividad.**

## 7. Inversión

Los precios oficiales y el alcance por plan están en [`precios.md`](precios.md). Todos los importes son MXN más IVA.

| Plan | Precio mensual | Alcance resumido |
| --- | --- | --- |
| Autoservicio | **$499** | 1 número, 1–2 usuarios, funciones base, IA limitada y onboarding autoguiado |
| Negocio | **$1,990** | 3–5 agentes, 1 número, etiquetas, plantillas, campañas, IA, reportes, llamadas con bolsa de minutos y onboarding de 2 h |
| Pro | **$4,900** | 6–15 agentes, varios números, IA/RAG, llamadas, reportes avanzados, soporte prioritario y onboarding incluido |

Servicios adicionales: implementación asistida desde **$20,000** (configuración de Meta, webhook, número, plantillas, capacitación y puesta en marcha); white label desde **$50,000** de implementación y **$5,000/mes**.

Los cargos de Meta por mensajes y llamadas, Cloudflare TURN y el consumo adicional o bolsa de IA se cobran por separado. No se ofrece uso ilimitado, grabación/transcripción de llamadas ni soporte 24/7. El desarrollo a medida se cotiza aparte. La grabación, transcripción y soporte 24/7 no están incluidos en los planes.

No hay descuento anual publicado. Cualquier promoción debe especificar el ahorro (dos meses gratis o equivalente), duración y condiciones. La facturación, cancelación, alojamiento y compromisos se formalizan en el contrato/propuesta particular; no se deben inferir de los precios de lista.

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
| Pruebas de puesta en marcha según el plan contratado | Ambos | Acordado en la propuesta |
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
2. Se paga el monto y calendario indicados en la propuesta para el plan y, si aplica, la implementación asistida.
3. Agendamos onboarding y configuración según el alcance contratado.
4. Se acuerdan las pruebas de puesta en marcha y fecha de inicio del servicio.

**Aceptación:** firmado por [NOMBRE], [PUESTO], [FECHA].
