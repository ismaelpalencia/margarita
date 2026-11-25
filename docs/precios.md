# Precios oficiales de Margarita

Fuente de verdad comercial vigente desde el 25 de noviembre de 2026. Los importes están en pesos mexicanos (MXN) y son **más IVA**. Si otra página o propuesta difiere, prevalece este documento hasta actualizar la publicación correspondiente.

## Planes

| Plan | Precio mensual | Equipo y números | Incluye |
| --- | ---: | --- | --- |
| **Autoservicio** | **$499 MXN + IVA** | 1 número; 1–2 usuarios | Funciones base, IA limitada y onboarding autoguiado. |
| **Negocio** | **$1,990 MXN + IVA** | 1 número; 3–5 agentes | Etiquetas, plantillas, campañas, IA, reportes, llamadas con bolsa de minutos y onboarding de 2 horas. |
| **Pro** | **$4,900 MXN + IVA** | Varios números; 6–15 agentes | IA, llamadas, reportes avanzados, soporte prioritario y onboarding incluido. **RAG está en desarrollo y no está disponible todavía.** |

## Servicios adicionales

- **Implementación asistida:** desde **$20,000 MXN + IVA**. Incluye configuración de Meta y webhook, número, plantillas, capacitación y puesta en marcha.
- **White label:** desde **$50,000 MXN + IVA** de implementación y desde **$5,000 MXN + IVA al mes**.

Los importes “desde” son referencias iniciales; el precio final depende del alcance acordado.

## Consumos y exclusiones

- Meta cobra por separado el consumo de mensajes y llamadas.
- Cloudflare TURN se cobra por consumo.
- La IA tiene límites por plan; consumo adicional o bolsas se cotizan por separado.
- RAG/embeddings/documentos no se deben ofertar como disponibles hasta su implementación y validación.
- Los planes publicados no incluyen grabación ni transcripción de llamadas.
- Ningún plan incluye soporte 24/7 ni desarrollo a medida.

No se ofrece actualmente descuento anual. Si se aprueba una promoción anual, debe indicar claramente el ahorro (por ejemplo, dos meses gratis o su equivalente), el plazo y las condiciones.

La plantilla [`contrato-servicio.md`](contrato-servicio.md) contiene condiciones y precios de una oferta anterior. No la uses para contratar con estos precios sin una revisión contractual independiente; se conserva intacta por ser un documento legal.

## Criterios para actualizar precios

Este archivo gobierna los importes y el alcance comercial publicado. Al cambiar un precio o un plan, actualizar en el mismo bloque `src/content/pricing.ts`, `landing/` y cualquier propuesta o contenido comercial activo. No modificar contratos, avisos legales, precios pactados con clientes legacy ni sus condiciones por este cambio general.
