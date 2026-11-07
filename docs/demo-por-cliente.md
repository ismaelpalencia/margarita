# Demo por cliente: qué cargar y cómo hacerlo simple

## Situación actual

La demo es **una sola** y su conocimiento vive en `kb.json`, dividido en
`comercio`, `servicios`, `generico` y la capa `margarita`. Si cambias ese
archivo, cambias la demo para **todos** los visitantes. No hay perfiles por
cliente ni aislamiento.

Para clientes que quieran "su demo", hace falta un **perfil** con su información
y una ruta o despliegue separado.

## Lo que necesitamos del cliente

### Identidad

- Nombre comercial y una frase de qué hace.
- Ciudad/zona y horario de atención.
- WhatsApp, teléfono, correo y sitio web.
- Link de agenda, catálogo o formulario, si existe.

### Oferta

- 5–15 productos/servicios principales.
- Precio o rango, duración y requisitos.
- Qué **no** incluye o qué no puede prometer.

### Operación

- Formas de pago.
- Envíos, entregas o cobertura.
- Garantías, devoluciones y cancelaciones.
- Tiempo de respuesta o de entrega.

### Preguntas reales

- 15–30 preguntas que sus clientes hacen de verdad, con la respuesta aprobada.
- Las que **no** quiere responder o que deben pasar a una persona.

### Voz y límites

- Tono: formal, cercano, directo, etc.
- Palabras que obligan a handoff: queja, reclamo, gerente, abogado.
- Temas prohibidos: precios especiales, plazos no confirmados, datos de terceros.

### Demo

- Vertical base: `comercio`, `servicios` o `generico`.
- 3–6 preguntas sugeridas para el visitante.
- Aclaración de que es una demo y no una oferta.

## Formato de perfil propuesto

```json
{
  "slug": "clinica-sonrisa",
  "version": 1,
  "business": {
    "name": "Clínica Sonrisa",
    "description": "Clínica dental en CDMX.",
    "city": "CDMX",
    "vertical": "servicios",
    "tone": "Cercano y directo",
    "whatsapp": "+52...",
    "website": "https://..."
  },
  "suggestedQuestions": [
    "¿Cuánto cuesta una limpieza?",
    "¿Dónde están?",
    "¿Cómo agendo una cita?"
  ],
  "knowledge": [
    {
      "question": "¿Cuál es el horario?",
      "answer": "Lunes a viernes de 9:00 a 19:00.",
      "keywords": ["horario", "abren", "cierran", "a que hora"]
    }
  ],
  "handoffKeywords": ["queja", "reclamo", "gerente"],
  "disclaimer": "Demo informativa. No es una oferta ni una aprobación."
}
```

Reglas:

- Sin datos personales de clientes reales.
- Sin precios o plazos inventados.
- Cada respuesta debe salir de la información que dio el cliente.
- Si falta un dato, se omite y se anota en `missing`.

## Flujo recomendado

1. **Brief**: el cliente llena el cuestionario o manda un documento.
2. **Extracción**: una IA convierte eso en el JSON del perfil, con una lista
   `missing` de lo que falta.
3. **Revisión humana**: el operador corrige precios, horarios y límites.
4. **Validación**: se comprueba el JSON contra el esquema y se prueba la demo.
5. **Publicación**: se carga el perfil y se comparte la URL.

La IA **no debe publicar sola**. El paso 3 es obligatorio.

## Prompt para la IA

```text
Convierte la información del negocio en un perfil JSON para una demo de
atención por WhatsApp. Devuelve SOLO JSON, sin explicaciones.

Esquema:
{
  "slug": "texto-corto",
  "business": {"name","description","city","vertical","tone","whatsapp","website"},
  "suggestedQuestions": ["..."],
  "knowledge": [{"question","answer","keywords":["..."]}],
  "handoffKeywords": ["..."],
  "disclaimer": "..."
}

Reglas:
- Usa solo datos del documento. No inventes precios, horarios, plazos ni
  promesas.
- 15 a 30 preguntas frecuentes, una respuesta clara por pregunta.
- Keywords en minúsculas, sin acentos, con sinónimos reales.
- Si falta algo, agrégalo a "missing" y no rellenes con suposiciones.
- Nada de datos personales de clientes.
- Español neutro de México.
```

## Opciones para cargarlo

| Opción | Cómo funciona | Esfuerzo | Cuándo conviene |
| --- | --- | --- | --- |
| **A. Manual** | Editar `kb.json`, commit y redeploy | Minutos por cliente | 1–5 demos, sin prisa |
| **B. Perfiles por slug** | `profiles/<slug>.json` + ruta `/d/<slug>` | 1–2 días | Varios clientes, una sola demo desplegada |
| **C. Panel + API** | El panel del producto publica el perfil y la demo lo consume | ~1 semana | Escala, autoservicio, historial |
| **D. Un deploy por cliente** | Servicio/dominio separado por cliente | Más operación | Aislamiento total |

## Mi recomendación

**Opción B** primero:

- Un solo servicio Go.
- Un archivo por cliente.
- URL `demo.margaritaapp.org/d/<slug>`.
- El perfil se valida al cargar; si falta algo, no se publica.
- El landing puede enlazar `?cliente=<slug>` o `/d/<slug>`.

Ventaja: no metes una base de datos a la demo y sigues teniendo un solo
despliegue. Cuando haya decenas de clientes, se pasa a C.

## Lo que no haría

- Pegar el JSON de ChatGPT directo sin validar.
- Mezclar información de dos clientes en el mismo perfil.
- Publicar precios o promesas que el cliente no aprobó.
- Usar la demo para captar datos personales reales; para eso está la app.
