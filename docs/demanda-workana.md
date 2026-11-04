# Lo que el mercado pide en Workana y qué le falta a Margarita para ser demandable

Análisis de cuatro publicaciones reales de Workana (categoría *Programación y
Tecnología → Inteligencia Artificial*, noviembre de 2026) y plan para convertir
la demanda repetida en una oferta que se pueda vender sin reinventar el producto
en cada cliente.

**Estado:** análisis para decisión. No cambia precios ni código.
**Documentos relacionados:** [`ia-respuestas.md`](ia-respuestas.md) (cómo se
implementa), [`propuesta-comercial.md`](propuesta-comercial.md) (oferta actual),
[`catalogo-producto.md`](catalogo-producto.md) (qué se puede afirmar hoy),
[`alcance-produccion.md`](alcance-produccion.md) (límites reales).

---

## 1. Las cuatro publicaciones, lado a lado

| # | Título / foco | Tamaño | Propuestas | Qué pide literalmente |
| --- | --- | --- | --- | --- |
| 1 | Automatización de respuestas para soporte | Medio | 50 (1 día) | Configurar respuestas automáticas para consultas frecuentes, gestionar interacciones básicas y mejorar la comunicación. Valora experiencia en atención al cliente e integración de herramientas. |
| 2 | Asistente virtual para comunicación con clientes | Medio | — | Responder de forma eficiente y automatizada, manejar consultas frecuentes, dar información relevante y **«posiblemente calificar leads o dirigir a recursos específicos»**. Liberar tiempo al personal. |
| 3 | Sistema de respuesta con IA para WhatsApp | Medio | 46 (5 horas) | Configuración, **integración con la API de WhatsApp Business**, lógica conversacional con IA y un **mecanismo de «autorización» o gestión de las respuestas automáticas**. Solución robusta y escalable para alto volumen. |
| 4 | Respuestas automáticas y flujos | Pequeño | — | Reducir tiempos de espera, consultas frecuentes, soporte básico, **guiar por procesos sencillos** y **crear flujos de conversación intuitivos**. |

### Lo que se repite (4 de 4)

- **WhatsApp como canal** y conexión con la plataforma/API de WhatsApp Business.
- **Respuestas automáticas a consultas frecuentes.**
- **Atención al cliente más rápida** y menos tiempo del personal en lo repetitivo.
- **«Configuración e implementación»**: el cliente compra un trabajo hecho, no una
  licencia para configurar por su cuenta.
- Empresa B2B que atiende a **sus** clientes finales.

### Lo que aparece en una o dos

| Señal | Dónde | Lectura |
| --- | --- | --- |
| Calificar leads y dirigir a recursos | #2 | Quieren que el asistente **haga algo** con la conversación, no solo contestar. |
| Flujos de conversación intuitivos | #4 | Expectativa de un constructor de flujos, aunque el proyecto sea «Pequeño». |
| **Autorización / gestión de las respuestas** | #3 | Piden control humano explícito. Es la señal más valiosa de las cuatro. |
| Robusto, escalable, alto volumen | #3 | Vocabulario de comprador corporativo; suele venir con más presupuesto y más exigencias. |

### Lo que **no** pide ninguna

- Cobranza, deudores, promesas de pago o montos.
- Campañas masivas o plantillas.
- Roles, auditoría, cifrado, retención o respaldos.
- CRM, ERP, facturación o integraciones profundas.
- Multi-tenant, SaaS ni panel de reventa.
- Un vertical concreto.

**Primera conclusión:** el mercado no está buscando «software de cobranza» ni
«un CRM». Está buscando **que WhatsApp deje de ser un caos**. La cobranza es
invisible para este comprador: no es un obstáculo, pero tampoco un argumento de
venta. En la demo no debe aparecer.

---

## 2. Qué está comprando realmente ese mercado

1. **Un resultado, no una arquitectura.** Nadie pregunta por la cola, el cifrado
   o la ventana de 24 horas. Preguntan cuánto tarda en estar funcionando.
2. **Alguien que ya haya conectado Meta.** La integración con la API es el
   trabajo aburrido y propenso a error; quien la domina cobra por eso.
3. **Tranquilidad.** «Autorización», «gestión» y «escalable» son formas de decir
   «no quiero que la IA haga una barbaridad con mis clientes».
4. **Precio y velocidad.** 46–50 propuestas en horas significa que el comprador
   compara rápido y decide por confianza y precio. La propuesta *es* el producto.

### La trampa del modelo

Las cuatro publicaciones son, en el fondo, **el mismo brief con cuatro máscaras**.
Si Margarita las atiende una por una como desarrollo a medida:

- cada cliente se vuelve un fork con su prompt, sus flujos y sus excepciones;
- el precio de Workana no paga ese trabajo (ver §5);
- el conocimiento no se acumula: el cliente 5 cuesta lo mismo que el 1.

La demanda es real y repetida; el **formato de venta** es lo que hay que cambiar.

---

## 3. Margarita contra el brief

| Lo que pide el mercado | Estado en Margarita | Qué falta |
| --- | --- | --- |
| Conexión con WhatsApp Business API | **Hecho y en producción**: webhook firmado, cola, reintentos, ventana de 24 h, plantillas, control de ritmo | Nada |
| Bandeja con personas reales | **Hecho**: asignación por carga, no leídos, historial, sockets | Nada |
| Responder consultas frecuentes con IA | **Hecho**: proveedor DeepSeek, base de conocimiento, borradores por mensaje y **respuesta automática acotada** con límites y presupuesto | Medir aceptación y ampliar la base de conocimiento |
| **Autorización / control de lo que responde** | **Hecho**: modo sugerencia con tarjeta de confianza, modo automático acotado, pausa por conversación y auto-pausa al responder una persona | Panel de métricas por conversación |
| Entregar a una persona cuando hace falta | **Implementado**: `AssignmentService` asigna al menos cargado y el automático entrega ante duda, queja, baja confianza o falta de conocimiento | Reglas de escalado más finas por intención |
| Calificar leads | **Parcial**: etiquetas, campos de contacto, resultados | Captura guiada de datos (nombre, interés, intención) sin formularios rígidos |
| Dirigir a recursos / procesos | **Parcial**: botones interactivos y enlaces | Catálogo de recursos y rutas configurables |
| Flujos de conversación intuitivos | **Parcial**: botones inteligentes con reglas | Constructor visual; **no** construirlo en la primera fase |
| Alto volumen y escalabilidad | **Suficiente para el segmento**: cola, workers, ritmo de Meta | Un número honesto y medido, no una promesa |
| Implementación llave en mano | **Hecho**: guías de Meta, plantillas, uso y despliegue | Alta guiada de 1 página y checklist de onboarding |
| Auditoría, cifrado, bajas, respaldos | **Hecho** | Nada: los textos de IA (`AiSuggestion.body`, `KnowledgeEntry`, `AiSettings.systemPrompt`) ya se cifran |

### La asimetría que define la estrategia

> **La pieza que el mercado pide es la que falta. La pieza que Margarita ya tiene
> es la que nadie pide… y la que hace que el proyecto no fracase.**

Cualquiera de las 49 propuestas competidoras puede pegar un modelo a un webhook
en un fin de semana. Lo que no tiene es bandeja, handoff, ventana, bajas,
cifrado, bitácora, respaldos y una instalación que ya opera. Eso no se ve en la
primera línea del brief, pero es exactamente lo que evita el desastre que el
cliente aún no sabe que puede tener.

Por eso la oferta no debe decir «soy un chatbot barato». Debe decir: **«la IA
propone, tu equipo autoriza; si duda, entrega la conversación; todo queda
auditado»**. Es la frase 3 del brief y la única que se puede sostener con
producto real.

---

## 4. Qué significa «demandable» (seis condiciones)

1. **La función del titular existe y se ve en tres minutos.** Ya existe: la IA
   responde sola lo frecuente y entrega a una persona cuando duda
   ([`ia-respuestas.md`](ia-respuestas.md)). La página pública `/ia` ya cuenta
   la promesa «responde, entrega, registra», y cada conversación muestra su
   panel de IA. Falta grabar el video corto
   ([`demo-video.md`](demo-video.md)), sin prometer más de lo que hace.
2. **Se instala sin que el cliente toque infraestructura.** Ya está la página
   `/onboarding` con lo que hay que traer, el plan de siete días y el checklist
   de cierre. Falta usarla en un alta real y ajustar lo que falle.
3. **Tiene un precio que se explica en una línea.** Hoy el precio está atado a
   cobranza y a una promoción que expira el 2026-12-31. La edición IA necesita
   su propio nivel, con su propio argumento.
4. **Hay prueba que se pueda ver.** Falta número de demostración, video de tres
   minutos y un caso con métricas del piloto.
5. **El riesgo está resuelto y se puede nombrar.** Ya está: ventana de 24 h,
   opt-out, cifrado, auditoría, aprobación humana. Es el diferenciador real.
6. **No se vende a medida.** Un alcance fijo, un onboarding fijo y un «esto no
   incluye». Lo que se salga, se cotiza aparte o se declina.

Sin las seis, Margarita compite en el único terreno donde no tiene ventaja: el
precio del bot.

---

## 5. La oferta que conviene productizar

### Nombre y promesa

> **Asistente de IA para WhatsApp, con control humano.**
> Contesta lo frecuente en segundos, entrega a una persona cuando hace falta y
> deja todo registrado. Tu equipo autoriza qué responde.

Tres columnas: **responde / entrega / registra**. La tercera es la que nadie
ofrece y la que sostiene el precio.

### Alcance fijo (una sola cosa, bien hecha)

| Incluye | No incluye (se cotiza o se declina) |
| --- | --- |
| Conexión con WhatsApp Business API | CRM, ERP, facturación |
| Bandeja compartida y roles | Constructor visual de flujos |
| Base de conocimiento de hasta 30 entradas (cargada contigo) | Integraciones a medida |
| IA en modo **sugerencia** desde el día 1 | Campañas masivas |
| Paso a **automático acotado** para FAQ (incluido en el mes) | Multi-idioma |
| Handoff a persona con motivo y prioridad | Multi-tenant / reventa |
| Ventana de 24 h, bajas, cifrado, bitácora y respaldos | Garantía de que Meta apruebe plantillas |
| Capacitación de 2 horas y guía escrita | Contenido y redacción de la base de conocimiento |
| Piloto de 30 días | Soporte 24/7 |

### Precio: hipótesis a validar, no precio vigente

> **Regla del repo:** los precios los gobiernan
> [`alcance-produccion.md`](alcance-produccion.md) y las variables
> `INSTALL_*` / `SETUP_*`. Nada de lo siguiente se publica hasta que se apruebe y
> se actualice primero ese documento, `facturacion.md` y la landing **en el mismo
> cambio**.

Punto de partida para discutir:

| Nivel | Instalación (una vez) | Mensualidad | Para quién |
| --- | --- | --- | --- |
| **Base** (lo de hoy, sin IA) | $3,500 MXN | $699 MXN | Cobranza y operación actual |
| **IA Esencial** (sugerencias + KB + handoff) | +$1,500 MXN | +$299 MXN | Quien quiere control total y medir calidad |
| **IA Soporte** (automático acotado + leads + rutas) | +$3,000 MXN | +$599 MXN | Quien quiere liberar tiempo de verdad |

**Por qué sube el precio y por qué sigue siendo barato para el cliente:**

- El costo variable de la IA es de centavos: ~$0.0002 por respuesta con GPT-5
  nano. El margen del nivel IA es alto.
- El costo real para el cliente es el de una persona: una respuesta humana
  cuesta $0.08–$0.17. A 300 respuestas al mes, el ahorro es de $25–$50 USD, muy
  por encima del incremento.
- El precio actual ($3,500 MXN ≈ $190 USD por instalación + primer mes) solo
  funciona porque es **repetible**. En cuanto se personaliza, se pierde dinero.
  Ese es el argumento más fuerte contra aceptar proyectos a medida de Workana.

**Lo que no se debe hacer:** bajar el precio para ganar la publicación. Con 50
propuestas, siempre habrá alguien más barato; la ventaja está en el alcance
claro y la demostración, no en el descuento.

### Tiempos

| Etapa | Duración | Entregable |
| --- | --- | --- |
| Alta y conexión con Meta | 1–2 días hábiles | Número recibiendo y enviando |
| Base de conocimiento | 1 día (con el cliente) | 20–30 entradas revisadas |
| Calibración en sugerencias | 3–5 días | Métricas del piloto |
| Paso a automático acotado | 1 semana | FAQ respondidas sin persona |
| Cierre del piloto | día 30 | Informe y decisión |

---

## 6. Qué construir, en qué orden

El orden no es técnico: es comercial. Primero lo que se ve, después lo que
escala.

| Orden | Qué | Por qué ahora | Criterio de aceptación |
| --- | --- | --- | --- |
| **1** | Fase 1 de [`ia-respuestas.md`](ia-respuestas.md): proveedor + `KnowledgeEntry` + `AiSuggestion` + tarjeta en la bandeja + consola de prueba | Es el titular del brief y habilita vender **hoy** la versión honesta («IA que propone, tú autorizas») | **Hecho (2026-11-03):** un agente usa un borrador y con `AI_ENABLED=false` nada cambia |
| **2** | Handoff con motivo y pausa por intervención humana | Es la señal #3 del brief y el diferenciador frente a los 49 bots | Una queja o un «quiero hablar con alguien» entrega la conversación y lo registra |
| **3** | Automático acotado por confianza + base de conocimiento | Convierte «sugerencia» en «ahorro de tiempo», que es lo que se vende | Responde FAQ, no responde a baja, no responde fuera de ventana, escala si duda |
| **4** | Captura de leads y rutas a recursos | Cubre la publicación #2 sin construir un CRM | Guarda nombre e interés y envía el recurso configurado |
| **5** | Segundo workspace con perfil `COMERCIO` | Prueba que el camino genérico es real | Responde con el mismo código y otras etiquetas. **Guía lista** en [`demo-comercio.md`](demo-comercio.md); falta desplegarlo y cargar el contenido. |
| **6** | Demo, video y caso del piloto | Sin esto no hay propuesta que compita | Número demo + video de 3 min + métricas. **Guion listo** en [`demo-video.md`](demo-video.md); falta grabar y correr el piloto. |

**Explícitamente fuera de orden:** constructor visual de flujos, multi-tenant,
integraciones a medida y campañas para otros giros. Son las tres trampas que
convierten el producto en una agencia.

---

## 7. Cómo presentarse en Workana (si se decide entrar ya)

### Estructura de la propuesta (400–600 palabras, nunca una plantilla)

1. **Primera línea: el problema, con sus palabras.** «Tu equipo repite las mismas
   cinco respuestas todo el día y los clientes esperan.»
2. **Qué vas a entregar en 7 días**, en tres viñetas: contesta lo frecuente,
   entrega a una persona cuando hace falta, todo queda registrado.
3. **La prueba de control**, que es lo que ninguno de los 49 va a ofrecer:
   «la IA redacta y tu equipo autoriza; se apaga por conversación».
4. **Un enlace a la demo** (número de WhatsApp + video de 3 minutos). Sin esto,
   la propuesta es una promesa más.
5. **Precio fijo y qué no incluye.** Dos líneas. El comprador que compara 50
   propuestas agradece no tener que pedir cotización.
6. **Una pregunta concreta** para abrir conversación: «¿cuántas consultas
   repetidas reciben al día y en qué horario?».

### Qué no decir

- «Somos expertos en IA» (lo dicen los 50).
- «Podemos hacer lo que necesites» (señal de que no hay producto).
- «Alto volumen» sin un número (mentira detectable).
- «Flujos intuitivos» si no hay constructor de flujos.
- Nada de cobranza en la propuesta salvo que el cliente la mencione.

### Sobre estas cuatro publicaciones en concreto

- **#3 es la mejor**: pide autorización, integración y volumen. Es el comprador
  que entiende el problema y paga por control.
- **#2 es la segunda**: pide leads y recursos; se puede atender con la fase 4.
- **#1 es la más genérica**: se gana con demo, no con texto.
- **#4 es «Pequeño»**: probablemente busca el precio más bajo. Se puede atender,
  pero no define el producto.

Si la fase 1 no está lista esta semana, **no conviene postular a estas cuatro**:
se pierde credibilidad y se compite con las manos vacías. La demanda se repite
todos los días; la siguiente tanda se atiende con demo y con producto.

---

## 8. Riesgos y decisiones abiertas

| Riesgo | Mitigación |
| --- | --- |
| **Comoditización**: 50 propuestas y un bot se hace en un fin de semana | Vender control, no bot: autorización, handoff, auditoría, cifrado. Nunca competir por precio. |
| **Meta Business Agent** a ~4–5 ¢ por mensaje | Nuestra combinación (GPT-5 nano + tarifa de servicio) ronda $0.009: ~5× más barata y con bandeja y control propios. Pero refuerza que la capa «solo contestar» no es defendible. |
| **Aceptar a medida** y perder el margen | Alcance fijo por escrito; lo demás se cotiza aparte o se declina. |
| **Prometer «alto volumen»** sin medirlo | Publicar un número medido y honesto; el segmento no necesita millones. |
| **Datos personales y proveedor de IA** | Aviso de privacidad, acuerdo de tratamiento, proveedor declarado, cifrado de textos generados. |
| **Demo con cobranza a un prospecto de comercio** | Segundo workspace `COMERCIO` como demo; el de cobranza se usa solo como caso de volumen y control. |
| **Precio IA sin aprobar** | No publicar hasta actualizar `alcance-produccion.md`, `facturacion.md`, variables y landing en el mismo cambio. |

Decisiones que faltan:

1. ¿Se entra a Workana con la versión de sugerencias **antes** del automático, o
   se espera a tener automático acotado?
2. ¿El vertical de la segunda demo es **comercio** (pedidos, horarios,
   ubicación) o **servicios** (citas, cotizaciones)?
3. ¿La base de conocimiento la carga el cliente con nuestra guía o la cargamos
   nosotros como parte del alta? Define el costo real de onboarding.
4. ¿Se publica un nivel IA con precio propio o se incluye en la mensualidad para
   no complicar la oferta?

---

## 9. Anexo: responder una publicación en 30 minutos

1. **Minuto 0–5:** leer y marcar las tres palabras que el cliente repite. Usarlas
   en la primera línea.
2. **Minuto 5–10:** identificar si pide *contestar* (fase 1), *actuar* (leads,
   rutas) o *construir flujos* (fuera de alcance hoy).
3. **Minuto 10–15:** elegir el nivel de la tabla de §5 y el tiempo de entrega.
4. **Minuto 15–25:** grabar un Loom de 60–90 segundos mostrando la bandeja, el
   borrador de IA y el botón de autorizar. Nada más.
5. **Minuto 25–30:** enviar con precio fijo, qué no incluye y una pregunta.

La métrica que importa no es cuántas propuestas se mandan, sino **cuántas
responden pidiendo la demo**. Si menos del 20 % responde, el problema no es el
precio: es que la propuesta no se distingue.
