/**
 * Ideas de plantillas de cobranza para ayudar a cada cuenta a empezar.
 * No son plantillas autorizadas por Meta ni se pueden enviar directamente.
 */
export type TemplateLibraryIdea = {
    id: string;
    name: string;
    scenario: string;
    whenToUse: string;
    body: string;
    variables: Array<{ token: string; meaning: string; example: string }>;
    buttons: string[];
    caution?: string;
};

export const TEMPLATE_LIBRARY: TemplateLibraryIdea[] = [
    {
        id: "primer-contacto",
        name: "Primer contacto",
        scenario: "Primer mensaje",
        whenToUse:
            "Para iniciar el contacto e invitar a la persona a continuar la conversación sin exponer detalles de su cuenta.",
        body:
            "Hola. Te contactamos de parte de {{1}} para conversar contigo sobre un asunto relacionado con una cuenta. Para proteger tu información, podemos compartir más detalles cuando confirmemos que hablamos con la persona indicada. Responde a este mensaje para continuar. Si este número no corresponde, avísanos para revisar el dato.",
        variables: [
            {
                token: "{{1}}",
                meaning: "Nombre de la empresa o equipo que contacta",
                example: "Financiera del Centro"
            }
        ],
        buttons: ["Quiero que me llame un asesor", "Número equivocado"],
        caution:
            "No incluyas saldo, número de cuenta ni detalles de la deuda hasta confirmar la identidad de la persona."
    },
    {
        id: "recordatorio-pago",
        name: "Recordatorio de pago",
        scenario: "Antes del vencimiento",
        whenToUse:
            "Para recordar una fecha próxima y facilitar que la persona informe si ya pagó o necesita apoyo.",
        body:
            "Hola, {{1}}. Te recordamos que la fecha de pago de tu cuenta es {{2}}. Si ya realizaste el pago o necesitas apoyo, responde a este mensaje para ayudarte.",
        variables: [
            { token: "{{1}}", meaning: "Nombre de la persona", example: "María" },
            { token: "{{2}}", meaning: "Fecha de pago", example: "25 de octubre" }
        ],
        buttons: ["Ya pagué", "Necesito plazo"]
    },
    {
        id: "promesa-confirmada",
        name: "Confirmación de promesa de pago",
        scenario: "Acuerdo registrado",
        whenToUse:
            "Para confirmar por escrito la fecha de pago que la persona acordó durante una conversación.",
        body:
            "Hola, {{1}}. Registramos la fecha de pago que acordaste para el {{2}}. Si necesitas revisar o cambiar este compromiso, responde a este mensaje para que nuestro equipo te apoye.",
        variables: [
            { token: "{{1}}", meaning: "Nombre de la persona", example: "María" },
            { token: "{{2}}", meaning: "Fecha acordada", example: "30 de octubre" }
        ],
        buttons: ["Necesito plazo", "Quiero que me llame un asesor"]
    },
    {
        id: "promesa-proxima",
        name: "Recordatorio de promesa próxima",
        scenario: "Seguimiento de acuerdo",
        whenToUse:
            "Para recordar con anticipación una fecha de pago acordada, manteniendo el tono informativo y respetuoso.",
        body:
            "Hola, {{1}}. Te recordamos el compromiso de pago que registraste para el {{2}}. Si ya realizaste el pago o necesitas apoyo, responde a este mensaje.",
        variables: [
            { token: "{{1}}", meaning: "Nombre de la persona", example: "María" },
            { token: "{{2}}", meaning: "Fecha acordada", example: "30 de octubre" }
        ],
        buttons: ["Ya pagué", "Necesito plazo"]
    },
    {
        id: "promesa-vencida",
        name: "Seguimiento de promesa vencida",
        scenario: "Acuerdo pendiente de confirmar",
        whenToUse:
            "Para verificar el estado de un compromiso cuya fecha ya pasó, dando opciones de respuesta sin asumir que la persona no pagó.",
        body:
            "Hola, {{1}}. Queremos dar seguimiento a la fecha de pago que registraste para el {{2}}. Si ya realizaste el pago, avísanos para revisarlo; si necesitas apoyo, podemos atenderte por este medio.",
        variables: [
            { token: "{{1}}", meaning: "Nombre de la persona", example: "María" },
            { token: "{{2}}", meaning: "Fecha acordada", example: "20 de octubre" }
        ],
        buttons: ["Ya pagué", "Necesito plazo"]
    },
    {
        id: "pago-reportado",
        name: "Pago reportado por la persona",
        scenario: "Seguimiento de pago",
        whenToUse:
            "Para confirmar que recibimos el aviso de pago, sin afirmar que ya quedó aplicado o conciliado.",
        body:
            "Hola, {{1}}. Recibimos tu aviso de pago. Nuestro equipo revisará la información y te confirmará cuando quede aplicado. Si necesitas ayuda mientras tanto, responde a este mensaje.",
        variables: [
            { token: "{{1}}", meaning: "Nombre de la persona", example: "María" }
        ],
        buttons: ["Quiero que me llame un asesor"]
    },
    {
        id: "aclaracion",
        name: "Solicitud de aclaración",
        scenario: "Duda o cuenta no reconocida",
        whenToUse:
            "Para ofrecer una vía de atención cuando la persona no reconoce la cuenta o necesita aclarar la información.",
        body:
            "Hola, {{1}}. Queremos ayudarte a revisar la información relacionada con tu cuenta. Si no la reconoces o consideras que hay un error, responde a este mensaje y nuestro equipo revisará el caso antes de continuar.",
        variables: [
            { token: "{{1}}", meaning: "Nombre de la persona", example: "María" }
        ],
        buttons: ["No reconozco la deuda", "Quiero que me llame un asesor"],
        caution:
            "La respuesta “No reconozco la deuda” debe estar configurada en Admin → Botones para pausar el contacto y revisar el caso."
    }
];

export function formatTemplateLibraryIdea(idea: TemplateLibraryIdea): string {
    const variables = idea.variables
        .map(
            (variable) =>
                `- ${variable.token}: ${variable.meaning} (ejemplo: ${variable.example})`
        )
        .join("\n");

    return [
        `Nombre sugerido: ${idea.id.replace(/-/g, "_")}`,
        "Idioma: Español (es_MX)",
        "Categoría sugerida: Utilidad (Meta decide la categoría final)",
        "Cuerpo:",
        idea.body,
        "Variables:",
        variables,
        "Botones de respuesta rápida sugeridos:",
        ...idea.buttons.map((button) => `- ${button}`),
        idea.caution ? `Nota: ${idea.caution}` : "",
        "Importante: idea de Margarita; no está aprobada por Meta. Revisa y adapta el contenido antes de crearla en Meta."
    ]
        .filter(Boolean)
        .join("\n");
}
