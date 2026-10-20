"""
Genera una hoja de propuestas de logo para Margarita.

    python3 scripts/generate-logo-proposals.py

No cambia los assets de la aplicación. Deja:

    marketing/logo-propuestas-2026.png
    marketing/propuestas/*.png

La idea es elegir una dirección antes de tocar los archivos oficiales.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw

import brand_lib
from brand_lib import (
    GREEN,
    GREEN_DARK,
    GREEN_TILE,
    SUN_400,
    WHITE,
    daisy_badge,
    daisy_glyph,
    load_font,
)

OUT_DIR = os.path.join("marketing", "propuestas")
SHEET = os.path.join("marketing", "logo-propuestas-2026.png")

WIDTH = 1800
HEIGHT = 1280
COLS = 6
COL_W = WIDTH // COLS

SLATE_950 = (7, 24, 39)
SLATE_500 = (99, 114, 135)
SLATE_300 = (203, 213, 225)
PAPER = (246, 248, 245)


def wordmark(icon, height=76):
    """Wordmark con el icono elegido, para la hoja de propuestas."""
    font = load_font(round(height * 0.56))
    text = "Margarita"
    gap = round(height * 0.28)

    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font)

    width = height + gap + (right - left)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    image.alpha_composite(icon.resize((height, height), Image.LANCZOS), (0, 0))

    ImageDraw.Draw(image).text(
        (height + gap - left, (height - (bottom - top)) / 2 - top),
        text,
        font=font,
        fill=GREEN_DARK,
    )

    return image


def proposal_icons():
    """Las seis direcciones, sin tocar los assets oficiales."""
    return [
        {
            "slug": "sello-limpio",
            "label": "01 · Sello limpio",
            "detail": "Sin carita. La forma más cercana a GitHub/Ollama.",
            "icon": daisy_badge(180, face=False, glyph_scale=0.82),
            "small": daisy_badge(64, face=False, glyph_scale=0.82),
        },
        {
            "slug": "mirada-minima",
            "label": "02 · Mirada mínima",
            "detail": "Solo ojos, sin sonrisa. Conserva el guiño humano.",
            "icon": daisy_badge(
                180,
                background=GREEN_TILE,
                core=SUN_400,
                face_color=GREEN_TILE,
                expression="eyes",
                glyph_scale=0.82,
            ),
            "small": daisy_badge(
                64,
                background=GREEN_TILE,
                core=SUN_400,
                face_color=GREEN_TILE,
                expression="eyes",
                glyph_scale=0.82,
            ),
        },
        {
            "slug": "sello-aro",
            "label": "03 · Sello con aro",
            "detail": "Más corporativo; el aro da sensación de sello.",
            "icon": daisy_badge(180, ring=True, face=False, glyph_scale=0.72),
            "small": daisy_badge(64, ring=True, face=False, glyph_scale=0.72),
        },
        {
            "slug": "sello-hoja",
            "label": "04 · Sello con hoja",
            "detail": "Una hoja tallada; más botánico y distintivo.",
            "icon": daisy_badge(
                180,
                face=False,
                leaves=True,
                glyph_scale=0.78,
                shift_y=-30,
            ),
            "small": daisy_badge(
                64,
                face=False,
                leaves=True,
                glyph_scale=0.78,
                shift_y=-30,
            ),
        },
        {
            "slug": "flor-sola",
            "label": "05 · Flor sola",
            "detail": "Sin caja. La marca puede vivir en cualquier fondo.",
            "icon": daisy_glyph(180, GREEN, face=False),
            "small": daisy_glyph(64, GREEN, face=False),
        },
        {
            "slug": "lockup",
            "label": "06 · Lockup recomendado",
            "detail": "El sello limpio con el wordmark; así se usa en la app.",
            "icon": daisy_badge(180, face=False, glyph_scale=0.82),
            "small": daisy_badge(64, face=False, glyph_scale=0.82),
        },
    ]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    for item in proposal_icons():
        item["icon"].save(os.path.join(OUT_DIR, f"{item['slug']}.png"))

    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)

    draw.text(
        (52, 42),
        "Margarita · propuestas de logo",
        font=load_font(44),
        fill=GREEN_DARK,
    )
    draw.text(
        (54, 102),
        "Seis direcciones para conservar la flor y hacerla más de producto, no de mascota.",
        font=load_font(22, bold=False),
        fill=SLATE_500,
    )

    options = proposal_icons()
    head_y = 170
    big_y = 236
    small_y = 448
    dark_y = 548
    word_y = 786

    for index, item in enumerate(options):
        left = index * COL_W
        center = left + COL_W // 2

        draw.text(
            (center - draw.textlength(item["label"], font=load_font(19)) / 2, head_y),
            item["label"],
            font=load_font(19),
            fill=GREEN_DARK,
        )

        icon = item["icon"]
        image.paste(icon, (center - icon.width // 2, big_y), icon)

        small = item["small"]
        small_x = center - small.width // 2
        image.paste(small, (small_x, small_y), small)

        draw.rounded_rectangle(
            (center - 112, dark_y, center + 112, dark_y + 178),
            radius=24,
            fill=SLATE_950,
        )
        dark_icon = daisy_badge(
            130,
            background=WHITE,
            glyph=GREEN_TILE,
            face=False,
            glyph_scale=0.82,
        )
        image.paste(dark_icon, (center - 65, dark_y + 24), dark_icon)

        word = wordmark(item["icon"], 70)
        word.thumbnail((250, 70), Image.LANCZOS)
        image.paste(
            word,
            (
                min(max(12, center - word.width // 2), WIDTH - word.width - 12),
                word_y,
            ),
            word,
        )

        if index:
            draw.line(
                (left, head_y - 22, left, HEIGHT - 165),
                fill=SLATE_300,
                width=2,
            )

    notes = [
        "01  Sello limpio: el más versátil y el más parecido a GitHub/Ollama.",
        "02  Mirada mínima: conserva la carita sin volverla infantil.",
        "03  Aro: más formal, ideal para propuestas y presentaciones.",
        "04  Hoja: una marca botánica, más propia de Margarita.",
        "05  Flor sola: sirve para fondos, viñetas y marca de agua.",
        "06  Lockup: la versión recomendada para la landing y la app.",
    ]

    y = HEIGHT - 148
    for note in notes:
        draw.text((54, y), note, font=load_font(18, bold=False), fill=SLATE_500)
        y += 25

    image.save(SHEET)
    print("Propuestas en", OUT_DIR, "y", SHEET)


if __name__ == "__main__":
    main()
