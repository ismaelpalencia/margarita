/** Precios públicos aprobados para Margarita. Importado por la landing y la home Express. */
export const PRODUCT_PRICING = {
    plans: [
        {
            name: "Autoservicio",
            monthly: 499,
            audience: "1–2 usuarios",
            numbers: "1 número",
            description: "Para empezar a ordenar la atención con una operación autoguiada.",
            onboarding: "Autoguiado",
            features: [
                "Bandeja compartida y funciones base",
                "Contactos, etiquetas y plantillas",
                "IA limitada según la configuración del plan",
                "Onboarding autoguiado"
            ]
        },
        {
            name: "Negocio",
            monthly: 1990,
            audience: "3–5 agentes",
            numbers: "1 número",
            description: "Para equipos que necesitan seguimiento, automatización y coordinación.",
            onboarding: "2 horas",
            featured: true,
            features: [
                "Etiquetas y plantillas",
                "Campañas y reportes",
                "Funciones de IA",
                "Llamadas con bolsa de minutos",
                "Onboarding de 2 horas"
            ]
        },
        {
            name: "Pro",
            monthly: 4900,
            audience: "6–15 agentes",
            numbers: "Varios números",
            description: "Para operaciones con varios equipos o números y necesidades avanzadas.",
            onboarding: "Incluido",
            features: [
                "IA; RAG en desarrollo y no disponible todavía",
                "Llamadas",
                "Reportes avanzados",
                "Soporte prioritario",
                "Onboarding incluido"
            ]
        }
    ],
    assistedImplementation: {
        price: 20000,
        items: [
            "Configuración de Meta y webhook",
            "Alta del número y plantillas",
            "Capacitación y puesta en marcha"
        ]
    },
    whiteLabel: {
        setupFrom: 50000,
        monthlyFrom: 5000
    },
    cancellation: "Los planes se cotizan por mes; consulta condiciones de contratación.",
    notIncluded: [
        "Consumo de mensajes y llamadas de Meta, facturado por Meta.",
        "Consumo de Cloudflare TURN, facturado según uso.",
        "Consumo adicional de IA o bolsas de uso acordadas.",
        "Grabación y transcripción de llamadas.",
        "Soporte 24/7.",
        "Desarrollo a medida."
    ]
} as const;

export const money = (value: number) =>
    new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);
