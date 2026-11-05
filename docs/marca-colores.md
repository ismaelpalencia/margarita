# Paleta de marca para anuncios y diseños

Guía corta para que cualquier IA de diseño (o diseñador) use **los colores reales** de Margarita. Los valores salen de `src/assets/css/tokens.css`, `src/assets/css/input.css` y `landing/assets/css/tokens.css`.

## Regla de oro

- **Landing pública:** azul `#2B6CB0`.
- **Panel:** azul en el shell y **verde margarita** en la IA/marca.
- **Para anuncios que llevan al landing:** usa el **azul como primario** y el verde/amarillo como acentos de marca. No mezcles el verde como color principal del anuncio si el destino es azul.

## Paleta primaria (anuncios)

| Token | Hex | Uso |
|---|---|---|
| `--brand-500` | `#2B6CB0` | Primario: CTA, títulos, enlaces (≈60%) |
| `--brand-600` | `#245A94` | Hover y énfasis |
| `--brand-50` | `#EBF3FB` | Fondos suaves, chips |
| `--margarita-600` | `#17865A` | WhatsApp, IA, sellos de “incluido” (≈30%) |
| `--margarita-50` | `#EEFBF3` | Fondo de bloques de IA |
| `--sol-400` | `#FBBE1F` | Acento: precio, “2,000 incluidas”, promoción (≈10%) |
| `--sol-500` | `#EDAC00` | Detalles y estrellas |
| `--text-primary` | `#1A1D21` | Texto principal |
| `--text-secondary` | `#5A6270` | Texto secundario |
| `--text-tertiary` | `#8B94A3` | Texto terciario |
| `--surface-bg` | `#F7F8FA` | Fondo general |
| `--surface-card` | `#FFFFFF` | Tarjetas |
| `--surface-border` | `#E4E7EC` | Bordes |
| `--success` | `#1E8E5A` | Confirmaciones |
| `--warning` | `#B7791F` | Avisos |
| `--danger` | `#C53030` | Errores / “sin asignar” |

> El verde completo va de `#EEFBF3` (50) a `#062A1E` (950); el amarillo de `#FFFAEB` (50) a `#71460F` (900). Para anuncios bastan el 600 y el 400.

## Tipografía

- **Inter** (400, 500, 600, 700, 800).
- H1: 40/48, `letter-spacing: -0.03em`.
- H2: 28/36.
- Cuerpo: 14/20 en panel; para anuncios usa 16/24 o 18/26.
- Sin serifas, sin script, sin mayúsculas sostenidas largas.

## Logo

- Icono: `landing/assets/img/margarita-icon-512.png` (o `margarita-mark.svg`).
- Wordmark: `landing/assets/img/margarita-wordmark-512.png`.
- No recolorear la flor, no ponerle degradados, no rotar, no comprimir.
- Espacio libre mínimo: el alto de la “M” alrededor.

## Estilo visual

- Plano, blanco, tarjetas con borde `#E4E7EC` y radio 8–12 px; sombra suave.
- Nada de degradados, neón, 3D, cristal o stock genérico.
- Capturas reales del panel y de WhatsApp; personas solo si aportan contexto.
- Copy en español, directo: “Atiende, califica y deriva”.

## Prompt para IA de diseño

Copia y ajusta:

```text
Diseña un anuncio para Margarita (automatización de WhatsApp con IA para
negocios). Formato 1080x1080 (y una versión 1080x1920). Estilo plano, limpio,
tipo SaaS B2B, fondo #F7F8FA, tarjetas blancas #FFFFFF con borde #E4E7EC y
radio 12px, sombra suave. Tipografía Inter (700 para titulares).

Paleta EXACTA:
- Primario azul #2B6CB0 (CTA y titulares), hover #245A94, fondo suave #EBF3FB.
- Acento verde WhatsApp/IA #17865A, fondo #EEFBF3.
- Acento amarillo #FBBE1F solo para precio o “2,000 incluidas”.
- Texto #1A1D21 y secundario #5A6270. Éxito #1E8E5A, aviso #B7791F, error #C53030.

Mensaje: “Automatiza WhatsApp con IA — atiende, califica y deriva”.
Oferta: “$1,299 MXN/mes + IVA, 2,000 respuestas de IA incluidas, sin
instalación, onboarding incluido”. CTA: “Agenda una demo”.

Composición: titular arriba, captura del panel o mock de chat al centro,
bloque de precio y CTA abajo. Máximo 3 colores dominantes. Sin degradados,
sin neón, sin 3D, sin stock genérico. Deja 80 px de margen seguro.
```

## Dónde están los archivos

- Tokens del panel: `src/assets/css/tokens.css`
- Verde/amarillo de marca: `src/assets/css/input.css` (`@theme`)
- Tokens del landing: `landing/assets/css/tokens.css`
- Estilos del landing: `landing/assets/css/site.css`
