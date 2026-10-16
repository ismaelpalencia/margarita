"""
Arma la hoja para elegir el símbolo.

    python3 scripts/generate-logo-options.py

Deja `marketing/logo-opciones.png`: el símbolo actual y las tres variantes
nuevas, en varios tamaños y sobre fondo claro y oscuro, para poder decidir de un
vistazo y contestar con una letra.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw

import brand_lib
from brand_lib import GREEN, GREEN_DARK, draw_icon, load_font, wordmark

OUTPUT = os.path.join("marketing", "logo-opciones.png")

WIDTH = 1400
HEIGHT = 1180
TITLE_Y = 56
HEAD_Y = 150
ROW_LIGHT_Y = 230
ROW_SMALL_Y = 400
ROW_DARK_Y = 480
ROW_WORD_Y = 700

SLATE_950 = (2, 6, 23)
SLATE_500 = (100, 116, 139)
SLATE_300 = (203, 213, 225)


def main():
    image = Image.new("RGB", (WIDTH, HEIGHT), (255, 255, 255))
    draw = ImageDraw.Draw(image)

    options = [
        ("sello (base)", "sello"),
        ("D · centro amarillo", "sello-sol"),
        ("E · con hojas  ✓ elegida", "sello-hojas"),
        ("F · con aro", "sello-anillo"),
    ]

    column_width = WIDTH // len(options)

    draw.text((60, TITLE_Y), "Margarita · opciones de símbolo", font=load_font(44), fill=GREEN_DARK)
    draw.text(
        (60, TITLE_Y + 58),
        "Elegida: E · con hojas. El tamaño real de la pestaña es el más chico de la fila de en medio.",
        font=load_font(24, bold=False),
        fill=SLATE_500,
    )

    for index, (label, variant) in enumerate(options):
        left = index * column_width
        center = left + column_width // 2

        draw.text(
            (center - draw.textlength(label, font=load_font(30)) / 2, HEAD_Y),
            label,
            font=load_font(30),
            fill=GREEN_DARK,
        )

        big = draw_icon(200, variant)
        small = [draw_icon(size, variant) for size in (64, 48, 32, 16)]
        mark = draw_icon(150, variant)
        mark_dark = draw_icon(150, variant)
        word = wordmark(96, variant)

        image.paste(big, (center - 100, ROW_LIGHT_Y), big)

        cursor = center - sum(size + 22 for size in (64, 48, 32, 16)) // 2 + 11

        for icon, size in zip(small, (64, 48, 32, 16)):
            image.paste(icon, (cursor, ROW_SMALL_Y + (64 - size) // 2), icon)
            cursor += size + 22

        draw.rounded_rectangle(
            (center - 110, ROW_DARK_Y - 10, center + 110, ROW_DARK_Y + 170),
            radius=24,
            fill=SLATE_950,
        )
        image.paste(mark_dark, (center - 75, ROW_DARK_Y + 5), mark_dark)

        word_x = min(
            max(12, center - word.width // 2),
            WIDTH - word.width - 12,
        )
        image.paste(word, (word_x, ROW_WORD_Y), word)

        if index:
            draw.line(
                (left, HEAD_Y - 20, left, HEIGHT - 120),
                fill=SLATE_300,
                width=2,
            )

    notes = [
        "sello (base): verde y blanco, sin más.",
        "D · centro amarillo: el centro en el amarillo de la marca. La que más se reconoce a tamaño de pestaña.",
        "E · con hojas: dos hojas en la base, como flor cortada. La más amable.",
        "F · con aro: un aro fino por dentro del borde. La más sobria.",
    ]

    y = HEIGHT - 172

    for note in notes:
        draw.text((60, y), note, font=load_font(23, bold=False), fill=SLATE_500)
        y += 32

    os.makedirs("marketing", exist_ok=True)
    image.save(OUTPUT)
    print("Hoja generada en", OUTPUT)


if __name__ == "__main__":
    main()
