"""
Genera variantes del sello con mirada mínima (ojos, sin sonrisa).

    python3 scripts/generate-logo-mirada-variants.py

Deja:

    marketing/logo-mirada-variantes.png
    marketing/propuestas/mirada-*.png

No cambia los assets oficiales: es una hoja para elegir dirección.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw

import brand_lib
from brand_lib import (
    GREEN_TILE,
    INK,
    SUN_400,
    WHITE,
    daisy_badge,
    daisy_tile,
    load_font,
)

OUT_DIR = os.path.join("marketing", "propuestas")
SHEET = os.path.join("marketing", "logo-mirada-variantes.png")

WIDTH = 1800
HEIGHT = 1260
COLS = 6
COL_W = WIDTH // COLS

SLATE_950 = (7, 24, 39)
SLATE_500 = (99, 114, 135)
SLATE_300 = (203, 213, 225)
PAPER = (246, 248, 245)


def eyes_badge(size, **overrides):
    """Sello circular con ojos y sin boca."""
    params = {
        "background": GREEN_TILE,
        "core": SUN_400,
        "face_color": GREEN_TILE,
        "expression": "eyes",
        "glyph_scale": 0.82,
    }
    params.update(overrides)
    return daisy_badge(size, **params)


def variants():
    """Las seis variantes, todas dentro de un sello."""
    return [
        {
            "slug": "mirada-circulo",
            "label": "01 · Círculo clásico",
            "detail": "La base que ya te gustó: verde profundo, flor blanca y ojos.",
            "icon": eyes_badge(190),
            "small": eyes_badge(64),
        },
        {
            "slug": "mirada-cuadrado",
            "label": "02 · Cuadrado suave",
            "detail": "El mismo sello en formato de app; más actual y más compacto.",
            "icon": daisy_tile(
                190,
                core=SUN_400,
                expression="eyes",
                glyph_scale=0.8,
            ),
            "small": daisy_tile(
                64,
                core=SUN_400,
                expression="eyes",
                glyph_scale=0.8,
            ),
        },
        {
            "slug": "mirada-aro",
            "label": "03 · Círculo con aro",
            "detail": "Más emblema: el aro separa la marca del fondo.",
            "icon": eyes_badge(190, ring=True, glyph_scale=0.72),
            "small": eyes_badge(64, ring=True, glyph_scale=0.72),
        },
        {
            "slug": "mirada-centro-blanco",
            "label": "04 · Centro blanco",
            "detail": "Más monocromo y sobrio; los ojos van en verde.",
            "icon": eyes_badge(190, core=WHITE, face_color=GREEN_TILE),
            "small": eyes_badge(64, core=WHITE, face_color=GREEN_TILE),
        },
        {
            "slug": "mirada-hoja",
            "label": "05 · Sello con hoja",
            "detail": "La versión botánica: una hoja tallada en la base.",
            "icon": eyes_badge(
                190,
                leaves=True,
                glyph_scale=0.78,
                shift_y=-30,
            ),
            "small": eyes_badge(
                64,
                leaves=True,
                glyph_scale=0.78,
                shift_y=-30,
            ),
        },
        {
            "slug": "mirada-noche",
            "label": "06 · Sello noche",
            "detail": "Fondo tinta, flor blanca y centro amarillo; más premium.",
            "icon": eyes_badge(190, background=INK, face_color=INK),
            "small": eyes_badge(64, background=INK, face_color=INK),
        },
    ]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    options = variants()

    for item in options:
        item["icon"].save(os.path.join(OUT_DIR, f"{item['slug']}.png"))

    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)

    draw.text(
        (52, 42),
        "Margarita · variantes de la mirada mínima",
        font=load_font(42),
        fill=GREEN_TILE,
    )
    draw.text(
        (54, 100),
        "Todas conservan el sello y los ojos; ninguna lleva sonrisa.",
        font=load_font(22, bold=False),
        fill=SLATE_500,
    )

    head_y = 166
    big_y = 228
    small_y = 438
    dark_y = 540

    for index, item in enumerate(options):
        left = index * COL_W
        center = left + COL_W // 2

        draw.text(
            (
                center
                - draw.textlength(item["label"], font=load_font(18)) / 2,
                head_y,
            ),
            item["label"],
            font=load_font(18),
            fill=GREEN_TILE,
        )

        icon = item["icon"]
        image.paste(icon, (center - icon.width // 2, big_y), icon)

        small = item["small"]
        image.paste(
            small,
            (center - small.width // 2, small_y),
            small,
        )

        draw.rounded_rectangle(
            (center - 112, dark_y, center + 112, dark_y + 174),
            radius=24,
            fill=SLATE_950,
        )

        dark_icon = eyes_badge(
            130,
            background=WHITE,
            glyph=GREEN_TILE,
            core=SUN_400,
            face_color=GREEN_TILE,
        )
        image.paste(dark_icon, (center - 65, dark_y + 22), dark_icon)

        if index:
            draw.line(
                (left, head_y - 20, left, HEIGHT - 145),
                fill=SLATE_300,
                width=2,
            )

    notes = [
        "01  Círculo clásico: la opción más segura y reconocible.",
        "02  Cuadrado suave: la más actual para app, favicon y redes.",
        "03  Aro: más formal, para propuestas y presentaciones.",
        "04  Centro blanco: más monocromo, sin perder la mirada.",
        "05  Hoja: más propia de Margarita; la más botánica.",
        "06  Sello noche: más premium, para fondos claros.",
    ]

    y = HEIGHT - 128
    for note in notes:
        draw.text((54, y), note, font=load_font(18, bold=False), fill=SLATE_500)
        y += 25

    image.save(SHEET)
    print("Variantes en", OUT_DIR, "y", SHEET)


if __name__ == "__main__":
    main()
