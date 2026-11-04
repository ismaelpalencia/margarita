# Catálogo completo de Margarita

Todo lo que hace la aplicación, pantalla por pantalla, con sus reglas, atajos y
límites. Sirve para dos cosas: **la oferta comercial** (qué se puede prometer,
con qué palabras) y **los guiones de video** (qué grabar y en qué orden).

Última revisión: 17 de octubre de 2026.

---

## 1. En una frase

Margarita opera la **WhatsApp Business Cloud API de Meta** para cobranza: envía
plantillas, atiende conversaciones, registra **en qué quedó cada cliente** y te
dice **a quién escribirle o llamarle hoy**.

**No es**: un CRM, un chatbot, un sistema de facturación ni una herramienta de
mensajería masiva sin control. La IA de la fase 1 **no responde sola**: redacta
borradores que una persona revisa y envía.

**La promesa central**: cada conversación termina en un resultado; cada
resultado alimenta la lista de trabajo del día siguiente.

---

## 2. Modelo de uso

| Concepto | Cómo funciona |
| --- | --- |
| Instalación | Una por empresa, con su base de datos y su dominio (`cliente.margaritaapp.org`) |
| Usuarios | Ilimitados; el administrador crea agentes |
| Roles | `ADMIN` (todo) y `AGENT` (solo sus conversaciones) |
| Números | Los que tenga la cuenta de WhatsApp Business; uno activo a la vez en el panel |
| Idiomas | Interfaz en español; plantillas en `es_MX` u otro idioma configurado en Meta |
| Cobertura | **México** con 10 dígitos e internacional con `+` y lada |

---

## 3. Pantalla por pantalla

### 3.1 Acceso y alta

- **`/auth/login`**: correo y contraseña; bloqueo por intentos fallidos, límite
  por IP y verificación en dos pasos si está activa.
- **`/setup`**: en una instalación nueva, crea la empresa y el primer
  administrador desde el navegador. Se cierra solo cuando ya hay empresa.
- **Recuperación**: un administrador restablece contraseñas desde **Equipo**; el
  usuario debe cambiarla al entrar.
- **`/health`**: base, cola, worker, webhooks, respaldos y configuración.

### 3.2 Dashboard (inicio del administrador)

- **Conversaciones abiertas**, **sin asignar**, **asignadas** y **en progreso**.
- **Cobranza del día**: gestiones, promesas vencidas, compromisos de la semana y
  cobrado del mes.
- **Agentes** por estado: disponibles, ocupados, en break, fuera.
- **Conversaciones recientes** con el último mensaje y quién la atiende.
- **Mensajes entrantes recientes**, con botón **Ocultar** (reversible) para
  quitar un mensaje del tablero sin entrar al hilo.
- **Últimos errores o advertencias** con enlace a la bitácora.

### 3.3 Conversaciones (bandeja)

- Buscar por **nombre o teléfono**.
- Filtrar por **estado** (abierta, cerrada), **asignación** (sin asignar, mío) y
  **no leídos**.
- Contador de **no leídos** por hilo (aparece también en el menú).
- Abrir un hilo; reasignar; cerrar y reabrir.
- **Nueva conversación** desde un contacto (botón en la lista de contactos).

### 3.4 El hilo (admin y agente)

**Lo que se ve**

- Burbujas con fecha, hora y **estado real** de WhatsApp: enviado ✓, entregado
  ✓✓, leído ✓✓, fallido ⚠ (con el motivo traducido).
- Etiquetas de **nota interna**, **plantilla**, **archivo** y **respuesta de
  botón** (con el texto que tocó el cliente).
- Cabecera con contacto, número activo, ventana de 24 horas y atajos a
  eliminados y a la ficha.

**Lo que se puede hacer**

| Acción | Regla |
| --- | --- |
| Texto libre | Solo con la **ventana de 24 h abierta** |
| Archivo (imagen, video, audio, documento) | Solo con ventana abierta; imagen 5 MB, video/audio 16 MB, documentos 100 MB |
| Plantilla aprobada | Siempre; es la única forma de escribir con la ventana cerrada |
| Plantilla con variables | Pide encabezado (1), cuerpo (n) y botón de URL (1) según la plantilla |
| **Botones** (hasta 3, 20 caracteres) | Solo con ventana abierta |
| Nota interna | Nunca sale a WhatsApp |
| Respuestas rápidas | Insertan `{nombre}` y `{telefono}` |
| Ocultar mensaje | Reversible; el admin los ve en «Ver eliminados» y los restaura |
| Borrar hilo | Exige escribir `BORRAR`; borra los mensajes del hilo |
| Resultado de gestión | Desde el panel lateral, sin salir del hilo |
| Pausar el contacto | No recibe mensajes ni campañas hasta quitarla |
| Asignar / cerrar / reabrir | Queda en el historial de asignaciones |

**Atajos del compositor**

- **Enter** envía.
- **Shift + Enter** hace un salto de línea.
- **Tab** navega entre campos; **Enter** confirma el formulario enfocado.

### 3.5 Contactos

- Lista con **nombre, teléfono, resultado, intentos, etiquetas y notas**.
- Filtros: etiqueta, resultado, **solo bajas**, **promesas vencidas**, **sin
  resultado**, **nunca respondió**, intentos mínimos y búsqueda por nombre.
- La búsqueda es **exacta**: nombre completo o teléfono completo (10 dígitos en
  México o con `+` y lada fuera del país), porque ambos campos están cifrados.
- Selección múltiple para **marcar resultado en bloque**.
- Ficha del contacto: datos, consentimiento, baja, **pausa con motivo**,
  resultado vigente, historial de gestiones y etiquetas.
- En el celular: nombre (toca y abre la ficha) y botón **Abrir**.

### 3.6 Resultados de gestión

Catálogo completo, con historial inmutable por marcado:

| Resultado | Pide | Para qué |
| --- | --- | --- |
| Promesa de pago | Monto y fecha | Compromiso concreto |
| Convenio | Monto y fecha | Acuerdo de pagos |
| Pagado | Monto y fecha de pago | Pago confirmado |
| Pago reportado | — | «Ya pagué», sin conciliar |
| Promesa incumplida | — | Confirmación humana |
| Sin contestación | — | No respondió |
| Número inválido | — | No es del cliente |
| Cuenta en disputa | — | No reconoce la deuda; sugerido: pausar |
| No le interesa | — | Pidió no ser contactado |
| Volver a llamar | — | Pide llamada |
| Otro | Nota | Cualquier caso |

**Reglas**: una promesa con fecha pasada aparece vencida sola; marcar **pagado**
la cierra; **pago reportado** no cuenta como recuperación.

### 3.7 Botones inteligentes

- Tabla **identificador / texto del botón → resultado → efecto**.
- Efectos: ninguno, **pausa** la cuenta, **baja** al contacto.
- Seis reglas recomendadas con un clic (ya pagué, llámame, necesito plazo, no
  reconozco, no contactar, número equivocado).
- Mapeo por identificador **o por texto** (si Meta no manda id propio).
- En el hilo, la burbuja trae **copiar id** para crear la regla.
- Una respuesta sin regla se registra como «no mapeada», sin inventar nada.

### 3.8 Llamadas pedidas y agenda

- Bloque **«Pidieron que los llamen»** arriba de todo en Reportes → Hoy.
- Muestra tiempo de espera, hora en que lo pidieron, si fue fuera de horario
  (8:00–21:00) y si salió del **botón** o del equipo.
- **Agendar** fecha y hora; las citas de hoy o vencidas suben y se marcan «Toca
  ahora»; se pueden quitar.
- **No contestó** cierra la tarea en un clic.

### 3.9 Reportes

| Vista | Qué muestra |
| --- | --- |
| **Hoy** | Llamadas pedidas, promesas vencidas, vencen hoy, esta semana y sin contestar |
| **Gestiones** | Marcados del periodo, por persona, campaña y etiqueta |
| **Promesas** | Vigentes, cumplimiento (a tiempo / tarde / sin pago) y prometido vs cobrado |
| **Sin contestación** | Clientes tras X intentos, con «nunca respondió» |
| **Tendencias** | Semana a semana |
| **Detalle** | Todo, fila por fila |

Todas se **exportan a CSV** con los filtros puestos (con BOM para Excel).

### 3.10 Plantillas

- **Sincronizar** con Meta y ver estado (`APPROVED`, `PENDING`, `REJECTED`).
- Marca las **rechazadas o pausadas** y **bloquea** las reclasificadas como
  **marketing** (cuestan más).
- Cuenta cuántas variables pide cada componente: encabezado (1), cuerpo (n),
  botón de URL (1).

### 3.11 Campañas

**Manual**

1. Nombre.
2. **Contactos**: filtro por nombre o teléfono, «todos los visibles», contador
   de seleccionados.
3. **Plantilla** y variables (texto fijo o `{nombre}`, `{telefono}`).
4. Crear.

**Desde Excel/CSV**

- Se elige la plantilla y la página dice **qué columnas debe traer el archivo**.
- **Descargar ejemplo** con los encabezados exactos y una fila de muestra.
- Columnas de más: se ignoran. Columna faltante: error que dice cuál falta.
- Las variables se llenan por destinatario con `{columna:Pedido}`.

**Envío**

- En **cola**, por lotes, con pausa entre mensajes.
- **Pausar, reanudar, cancelar**; avance en vivo.
- Estado por destinatario y **reintentar fallidos**.

### 3.12 Etiquetas

- Crear, editar, desactivar y asignar; color para reconocerlas de un vistazo.
- Sirven para filtrar contactos y para elegir a quién le mandas una campaña.

### 3.13 Equipo

- Crear **administradores** y **agentes**; activar/desactivar; restablecer
  contraseña.
- Permiso de **envío manual** y **tope diario** por agente (se aplican de
  verdad al enviar).
- El sistema impide quedarse sin administrador activo.
- Verificación en dos pasos por persona; el admin puede desactivarla si alguien
  pierde el teléfono.

### 3.14 WhatsApp

- Credenciales de la cuenta (token, WABA, versión de API), cifradas.
- Números: alta, edición, activación, **calidad** y **probar conexión**.
- **Tramo del mes**: mensajes de servicio usados de 1,000, barra, restante,
  alerta al 80%, plantillas de utilidad y marketing con costo estimado.
- **Número sugerido** para conversaciones nuevas (el de más tramo).

### 3.15 Operación

- **Logs**: filtros por nivel y módulo, con el detalle de cada evento.
- **Webhooks recibidos**: los últimos 20 eventos tal como los mandó Meta, con
  botón para copiarlos.
- **Sistema**: checklist de configuración, cifrado, firma, cola, respaldos y
  **almacenamiento de archivos** (si es un volumen persistente).
- **Respaldos**: copia automática diaria cifrada, descarga manual y borrado total
  al cerrar contrato.
- **Sesiones**: dispositivos, IP y cierre remoto.
- **Guía**: resumen de qué hace la herramienta, con enlaces a las guías públicas.

### 3.16 IA de respuestas (fase 1: solo sugerencias)

- **Admin → IA**: interruptor por workspace, modo sugerencia, tono, idioma,
  umbral de confianza, contexto del negocio y palabras que obligan a entregar
  la conversación a una persona.
- **Base de conocimiento**: pregunta, respuesta, palabras clave y prioridad.
  Es la única fuente de la que la IA puede responder; si el dato no está, el
  borrador lo marca para que lo tome una persona.
- **Consola de prueba**: escribe una pregunta y ve qué respondería, qué
  entradas usó, el modelo y la latencia. No guarda nada ni toca un hilo real.
- **En la bandeja**: tarjeta con el borrador, la confianza y el motivo.
  **Usar borrador** lo copia al compositor; **Descartar** lo quita. Nada se
  envía solo.
- **Consumo**: borradores generados, usados, editados, descartados, tasa de
  aceptación, llamadas y tokens de los últimos 30 días.
- **Apagado por defecto**: `AI_ENABLED=false`. Sin llave o apagada, la
  herramienta funciona igual que antes.
- **Proveedor**: DeepSeek por defecto; cualquier API compatible con OpenAI
  cambiando variables. `AI_PROVIDER=mock` para pruebas sin red.

---

## 4. Automatismos (lo que pasa sin que nadie lo toque)

1. **Webhook firmado**: cada evento de Meta se valida con HMAC; si la firma no
   coincide, se rechaza.
2. **Cola con reintentos**: el endpoint responde rápido; el trabajo se procesa
   aparte con hasta 5 intentos y recuperación de eventos interrumpidos.
3. **Idempotencia**: un reintento de Meta no duplica mensajes.
4. **Contactos y conversaciones**: se crean o reabren al recibir un mensaje.
5. **Asignación**: al agente disponible con menos carga.
6. **Estados reales**: enviado, entregado, leído y fallido llegan al hilo y a la
   campaña.
7. **Bajas**: `BAJA`/`STOP` da de baja al instante y detiene campañas en curso.
8. **Reglas de botón**: registran resultado, pausan o dan de baja.
9. **Promesas**: se marcan vencidas solas al pasar la fecha.
10. **Tramo**: aviso al 80% una vez por número y mes.
11. **Retención**: bitácora 90 días, eventos de webhook resueltos 30 días.
12. **Respaldos**: cada 24 h, cifrados, verificados al crearse y subidos a Cloudflare R2 cuando está configurado.
13. **Borradores de IA** (si está encendida): se generan en segundo plano con
    debounce y aparecen en la bandeja; **nada se envía sin que una persona lo
    apruebe**.

---

## 5. Seguridad y datos

- Contraseñas con **bcrypt**; sesiones en cookie `httpOnly`, revocables.
- **2FA** TOTP por cuenta.
- **Cifrado en reposo** de teléfonos, **nombres de contacto**, mensajes, notas,
  montos, variables, payloads y **correos de acceso**, con AES-256-GCM e índices
  ciegos para buscar sin tener el dato en claro.
- **Webhooks** firmados y cola con reintentos.
- **CSRF** por origen; CORS restringido; cabeceras con Helmet.
- **Archivos** fuera del alcance del servidor web, servidos solo con sesión y
  permiso sobre la conversación.
- **Bitácora** de lo importante, con redacción de credenciales.
- **Respaldo** cifrado y verificado.

---

## 6. Límites y matices que conviene saber

- En México se capturan 10 dígitos; para otro país, el número completo con `+`
  y lada. Meta valida que el número exista y pueda recibir mensajes.
- La **ventana de 24 horas** es de WhatsApp, no de la app.
- Fuera de la ventana de 24 horas solo se inicia con una **plantilla aprobada**
  (que puede traer botones). Dentro de la ventana se envían **botones** (hasta
  3); las **listas desplegables** todavía no se envían desde el panel.
- **Sí se programan campañas** por fecha y hora, además de enviarse ya, con pausa y reanudación.
- No hay **permisos por número**: todos los agentes ven todos los números.
- El **tramo** y el costo son una **estimación**, no la factura de Meta.
- Los **archivos que envía el cliente** caducan en Meta (~30 días).
- Los **nombres de contacto** están cifrados; por eso la búsqueda es por
  **nombre completo** o **teléfono completo**, no por fragmento. Teléfonos,
  mensajes, notas, montos y correos también están cifrados.
- **Una instancia**: no hay multi-servidor.
- El **consumo de WhatsApp** lo cobra Meta directamente a la empresa.

---

## 7. Cinco flujos para demostrar

**A. Del botón a la llamada (60 s)**

1. Campaña con la plantilla de cobranza.
2. El cliente toca «Quiero que me llame un asesor».
3. Abrir Reportes → Hoy: aparece arriba con su tiempo de espera.
4. Agendar la llamada y marcar «No contestó».

**B. Cobranza del día (90 s)**

1. Hoy: promesas vencidas y sin contestar.
2. Abrir una ficha, registrar promesa con monto y fecha.
3. Volver a Hoy: la promesa quedó ordenada por fecha.

**C. Campaña desde Excel (90 s)**

1. Elegir plantilla y descargar el ejemplo.
2. Llenarlo, subirlo y ver el conteo de destinatarios.
3. Enviar, pausar y reanudar.

**D. Conversación completa (60 s)**

1. Bandeja con filtros y no leídos.
2. Responder con una respuesta rápida; adjuntar un archivo.
3. Cerrar con resultado y nota.

**E. Control y confianza (45 s)**

1. Admin → WhatsApp: tramo del mes y calidad de cada número.
2. Admin → Logs → Webhooks: el evento tal como llegó.
3. Sistema: cifrado, respaldo y almacenamiento.

---

## 8. Guiones de video (para redes y para la propuesta)

| # | Título | Duración | Qué grabar | Texto en pantalla |
| --- | --- | --- | --- | --- |
| 1 | «El problema» | 20 s | WhatsApp con números bloqueados / hojas de Excel | «Tu número no está hecho para cobrar» |
| 2 | «Qué es Margarita» | 25 s | Dashboard y bandeja | «Cobra por WhatsApp sin perder el hilo» |
| 3 | «Un botón, una tarea» | 35 s | Toque del botón → Hoy | «Ya dio el paso: llámalo hoy» |
| 4 | «La lista del día» | 30 s | Hoy con promesas y sin contestar | «Sabe a quién escribirle primero» |
| 5 | «Campañas con Excel» | 40 s | Descargar ejemplo, subir, enviar | «Tu Excel, tus variables, sin adivinar» |
| 6 | «Plantillas que cuestan menos» | 30 s | Plantillas y aviso de marketing | «Utilidad en vez de marketing» |
| 7 | «Dos personas, cero desorden» | 25 s | Equipo + asignación + resultados | «Cada quien ve lo suyo» |
| 8 | «Datos protegidos» | 25 s | Sistema y respaldos | «Cifrado, respaldos y bitácora» |
| 9 | «Tramo y costo» | 25 s | WhatsApp: barra del tramo | «Sabes cuánto llevas gastado» |
| 10 | «Cierre» | 15 s | Logo + WhatsApp de contacto | «Instalación en minutos» |

**Consejos de grabación**

- Graba a 1440×900 o 1280×720, sin datos reales: usa contactos de prueba.
- Un video = una idea. Nada de recorrer 10 pantallas.
- Muestra el resultado (la lista del día, el mensaje entregado), no el clic.
- Deja el cursor quieto al final de cada acción: da tiempo a leer.

---

## 9. Qué se puede afirmar en la oferta (y qué no)

**Se puede decir**

- «Campañas por WhatsApp con plantillas aprobadas y control de avance».
- «Cada conversación queda con su resultado y su historial».
- «Una lista diaria que prioriza llamadas pedidas y promesas vencidas».
- «Los datos van cifrados y con respaldos diarios».
- «La IA redacta borradores y tu equipo decide qué se envía» (fase 1).
- «Se instala en minutos y el equipo entra desde el navegador».

**No se puede decir**

- «Manda mensajes ilimitados» (WhatsApp cobra el consumo y tiene límites).
- «Responde solo» (en la fase 1 la IA solo sugiere; el envío automático no está
  disponible).
- «Se conecta a cualquier país» sin decir que el número debe existir y estar
  habilitado en Meta.
- «Es un CRM» (no maneja ventas ni facturación).
- «Cero riesgo de bloqueo» (la calidad del número depende del uso y de Meta).
