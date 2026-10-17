"""
Genera la imagen de la promoción para mandar por WhatsApp.

    python3 scripts/generate-promo.py
    python3 scripts/generate-promo.py --whatsapp=5215512345678 --email=hola@ejemplo.mx

Produce (en `marketing/`):

    margarita-promocion.png           cuadrada 1080x1080, para el chat
    margarita-promocion-historia.png  vertical 1080x1920, para estados

El precio sale de los mismos valores por omisión que la página pública
(instalación con el primer mes incluido y mensualidad mes con mes), así que la
imagen y la página no se pueden contradecir. Cuando la promoción termine, se
vuelve a correr con `--price="$4,900 MXN"`.

El contacto se toma de los argumentos o de `SUPPORT_WHATSAPP` y
`SUPPORT_EMAIL`; el correo por omisión es el del producto
(contacto@margaritaapp.org). Si no queda ningún dato, la propia imagen lo dice:
más vale eso que mandar un volante sin forma de contestar.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw

import brand_lib
from brand_lib import (
    GREEN,
    GREEN_800,
    GREEN_900,
    INK,
    daisy_badge,
    daisy_glyph,
    load_font,
)

OUTPUT_DIR = "marketing"

SLATE_500 = (100, 116, 139)
SLATE_700 = (51, 65, 85)
SOL_50 = (255, 250, 235)
SOL_200 = (255, 226, 138)

BASE_WIDTH = 1080


def wrap(draw, text, font, max_width):
    """Corta el texto en renglones que quepan en el ancho dado."""
    lines = []
    current = ""

    for word in text.split():
        candidate = f"{current} {word}".strip()

        if draw.textlength(candidate, font=font) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines


def gradient_band(image, height):
    """Franja verde con degradado, como el recuadro del símbolo."""
    band = Image.new("RGBA", (1, height))
    pixels = band.load()

    for y in range(height):
        ratio = y / max(height - 1, 1)
        pixels[0, y] = tuple(
            round(GREEN[channel] + (GREEN_800[channel] - GREEN[channel]) * ratio)
            for channel in range(3)
        ) + (255,)

    image.alpha_composite(band.resize((image.width, height)), (0, 0))


def draw_content(draw, image, width, top, unit, content):
    """
    Dibuja el cuerpo (titular, puntos, precio y nota) y devuelve dónde terminó.

    Está apartado del resto para poder **medirlo** antes de dibujarlo en serio:
    así el volante se ajusta solo, sin importar cuánto texto lleve ni el tamaño
    del lienzo.
    """
    padding = round(84 * unit)
    inner = width - padding * 2
    cursor = top

    headline_font = load_font(round(76 * unit))

    for line in wrap(draw, content["headline"], headline_font, inner):
        draw.text((padding, cursor), line, font=headline_font, fill=GREEN_900)
        cursor += round(88 * unit)

    cursor += round(18 * unit)

    bullet_font = load_font(round(34 * unit), bold=False)
    bullet_icon = daisy_glyph(round(46 * unit))

    for bullet in content["bullets"]:
        lines = wrap(draw, bullet, bullet_font, inner - round(70 * unit))
        start = cursor

        for index, line in enumerate(lines):
            draw.text(
                (padding + round(66 * unit), start + index * round(46 * unit)),
                line,
                font=bullet_font,
                fill=SLATE_700,
            )

        icon_top = start - round(2 * unit)

        if icon_top + bullet_icon.height <= image.height:
            image.alpha_composite(bullet_icon, (padding, icon_top))

        cursor = start + max(round(52 * unit), len(lines) * round(46 * unit)) + round(18 * unit)

    cursor += round(20 * unit)

    # Tarjeta del precio.
    card_height = round(300 * unit)
    draw.rounded_rectangle(
        (padding, cursor, width - padding, cursor + card_height),
        radius=round(40 * unit),
        fill=SOL_50,
        outline=SOL_200,
        width=round(3 * unit),
    )

    draw.text(
        (padding + round(48 * unit), cursor + round(36 * unit)),
        content["promo_label"].upper(),
        font=load_font(round(28 * unit)),
        fill=GREEN_800,
    )

    price_font = load_font(round(118 * unit))
    draw.text(
        (padding + round(48 * unit), cursor + round(84 * unit)),
        content["price"],
        font=price_font,
        fill=INK,
    )

    price_width = draw.textlength(content["price"], font=price_font)
    before_font = load_font(round(40 * unit))
    before_x = min(
        padding + round(48 * unit) + price_width + round(28 * unit),
        width - padding - round(60 * unit),
    )
    before_y = cursor + round(128 * unit)
    before_width = draw.textlength(content["price_before"], font=before_font)

    draw.text(
        (before_x, before_y),
        content["price_before"],
        font=before_font,
        fill=SLATE_500,
    )
    draw.line(
        (
            before_x,
            before_y + round(24 * unit),
            before_x + before_width,
            before_y + round(24 * unit),
        ),
        fill=SLATE_500,
        width=round(4 * unit),
    )

    draw.text(
        (padding + round(48 * unit), cursor + round(228 * unit)),
        content["detail"],
        font=load_font(round(32 * unit), bold=False),
        fill=SLATE_700,
    )

    cursor += card_height + round(44 * unit)

    note_font = load_font(round(28 * unit), bold=False)

    for line in wrap(draw, content["meta_note"], note_font, inner):
        draw.text((padding, cursor), line, font=note_font, fill=SLATE_500)
        cursor += round(38 * unit)

    return cursor


def content_height(width, top, unit, content):
    """Mide el cuerpo sobre un lienzo de sobra, sin escribir nada definitivo."""
    scratch = Image.new("RGBA", (width, 6000), (255, 255, 255, 255))

    return draw_content(ImageDraw.Draw(scratch), scratch, width, top, unit, content)


def render(width, height, content):
    """Dibuja el volante completo, ajustando el texto al alto disponible."""
    unit = width / BASE_WIDTH
    padding = round(84 * unit)
    band_height = round(200 * unit)
    contact_height = round(120 * unit)

    top = band_height + round(70 * unit)
    bottom_limit = height - padding - contact_height - round(30 * unit)

    # Se mide con el tamaño natural y, si no cabe, se encoge lo justo. Se
    # repite porque el texto no escala igual que los espacios: al cambiar de
    # renglón, cambia el alto.
    for _ in range(4):
        used = content_height(width, top, unit, content) - top

        if used <= bottom_limit - top:
            break

        unit *= max(0.5, (bottom_limit - top) / used)

    used = content_height(width, top, unit, content) - top

    if used < bottom_limit - top:
        # Si sobra espacio (lienzo vertical), se reparte: un poco arriba y el
        # resto antes del contacto, para que no quede todo apelotonado.
        top = round(top + (bottom_limit - top - used) * 0.4)

    image = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(image)

    gradient_band(image, band_height)

    badge = daisy_badge(round(112 * unit))
    image.alpha_composite(badge, (padding, round((band_height - badge.height) / 2)))

    draw.text(
        (
            padding + badge.width + round(26 * unit),
            round(band_height / 2) - round(52 * unit),
        ),
        "Margarita",
        font=load_font(round(62 * unit)),
        fill=(255, 255, 255),
    )

    draw.text(
        (
            padding + badge.width + round(26 * unit),
            round(band_height / 2) + round(4 * unit),
        ),
        "Cobranza por WhatsApp",
        font=load_font(round(30 * unit), bold=False),
        fill=(190, 236, 213),
    )

    draw_content(draw, image, width, top, unit, content)

    contact_y = height - padding - contact_height
    draw.rounded_rectangle(
        (padding, contact_y, width - padding, contact_y + contact_height),
        radius=round(32 * unit),
        fill=GREEN_800,
    )

    if content["whatsapp"]:
        contact_lines = [f"WhatsApp {content['whatsapp']}"]
    elif content["email"]:
        contact_lines = [content["email"]]
    else:
        contact_lines = ["Escribe tu WhatsApp y correo aquí"]

    if content["whatsapp"] and content["email"]:
        contact_lines.append(content["email"])

    contact_font = load_font(round(36 * unit))
    line_height = round(44 * unit)
    text_y = contact_y + round((contact_height - len(contact_lines) * line_height) / 2)

    for line in contact_lines:
        text_width = draw.textlength(line, font=contact_font)
        draw.text(
            ((width - text_width) / 2, text_y),
            line,
            font=contact_font,
            fill=(255, 255, 255),
        )
        text_y += line_height

    return image.convert("RGB")


def main():
    parser = argparse.ArgumentParser(description="Imagen de promoción de Margarita")
    parser.add_argument("--price", default="$2,500 MXN")
    parser.add_argument("--price-before", default="$4,900 MXN")
    parser.add_argument("--monthly", default="$900 MXN")
    parser.add_argument(
        "--promo-label", default="Precio de instalación vigente"
    )
    parser.add_argument(
        "--whatsapp",
        default=os.environ.get("SUPPORT_WHATSAPP_DISPLAY", "55 3878 3682"),
        help="Número tal como se muestra en la imagen (con espacios)",
    )
    parser.add_argument(
        "--email",
        default=os.environ.get("SUPPORT_EMAIL", "contacto@margaritaapp.org"),
    )
    args = parser.parse_args()

    if not args.whatsapp and not args.email:
        print(
            "Aviso: no hay contacto configurado, así que la imagen sale con un "
            "hueco visible para que no se te vaya sin datos. Pásalo con "
            "--whatsapp= y --email=, o define SUPPORT_WHATSAPP y SUPPORT_EMAIL.",
            file=sys.stderr,
        )

    content = {
        "headline": "Cobra por WhatsApp sin perder el hilo.",
        "bullets": [
            "Marca en qué quedó cada cliente: prometió pagar, pagó, no contestó.",
            "Promesas vencidas e intentos sin respuesta, calculados solos.",
            "Reportes de cobranza listos para Excel, por persona y por campaña.",
        ],
        "promo_label": args.promo_label,
        "price": args.price,
        "price_before": args.price_before,
        "detail": (
            f"Instalación + el primer mes · después {args.monthly} al mes · "
            "usuarios ilimitados · más IVA"
        ),
        "meta_note": (
            "Los mensajes de WhatsApp los paga tu empresa directo a Meta. "
            "La herramienta es tuya: instalación propia, datos cifrados y "
            "respaldo diario."
        ),
        "whatsapp": args.whatsapp,
        "email": args.email,
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    render(1080, 1080, content).save(
        os.path.join(OUTPUT_DIR, "margarita-promocion.png")
    )
    render(1080, 1920, content).save(
        os.path.join(OUTPUT_DIR, "margarita-promocion-historia.png")
    )

    print("Imágenes generadas en", OUTPUT_DIR)


if __name__ == "__main__":
    main()
