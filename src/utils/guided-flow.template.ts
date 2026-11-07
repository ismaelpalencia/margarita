import { GuidedStep } from "./guided-flow";

/**
 * Flujo de ejemplo para el caso de pensión IMSS. Los enlaces se editan en el
 * panel; no se envían solos ni se inventan.
 */
export const PENSION_GUIDED_STEPS: GuidedStep[] = [
    {
        id: "bienvenida",
        type: "message",
        text: "¡Hola! Te ayudo a revisar tu caso de pensión del IMSS. Te haré tres preguntas rápidas.",
        next: "pensionado"
    },
    {
        id: "pensionado",
        type: "question",
        text: "¿Eres pensionado o jubilado del IMSS?",
        buttons: [
            { id: "SI", title: "Sí" },
            { id: "NO", title: "No" }
        ],
        next: { SI: "ley", NO: "no_califica" }
    },
    {
        id: "ley",
        type: "question",
        text: "¿Tu pensión es Ley 73 o Modalidad 40?",
        buttons: [
            { id: "LEY73", title: "Ley 73" },
            { id: "M40", title: "Modalidad 40" }
        ],
        next: { LEY73: "necesidad", M40: "necesidad" }
    },
    {
        id: "necesidad",
        type: "question",
        text: "¿Qué necesitas: consolidar deudas o un préstamo nuevo?",
        buttons: [
            { id: "DEUDAS", title: "Consolidar deudas" },
            { id: "PRESTAMO", title: "Préstamo nuevo" }
        ],
        next: { DEUDAS: "califica", PRESTAMO: "califica" }
    },
    {
        id: "califica",
        type: "end",
        text: "Con lo que me dices, tu caso puede calificar. Elige cómo seguir:",
        links: [
            {
                label: "Agendar cita",
                url: "https://calendly.com/tu-negocio/asesoria"
            },
            {
                label: "Solicitar estado de cuenta",
                url: "https://margaritaapp.org"
            }
        ],
        handoff: false
    },
    {
        id: "no_califica",
        type: "end",
        text: "Gracias por tu tiempo. Por ahora no podemos continuar con el trámite. Si tu situación cambia, aquí estamos.",
        links: [],
        handoff: false
    }
];

export const PENSION_GUIDED_TEMPLATE = {
    name: "Pensión IMSS",
    slug: "pension-imss",
    trigger: "hola|buenas|pension|jubilado|ley 73|modalidad 40|consolidar deudas|prestamo",
    steps: PENSION_GUIDED_STEPS
};
