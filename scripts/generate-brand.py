"""
Genera la marca de Margarita: una margarita con carita feliz.

Es la fuente de verdad del símbolo. Todo sale de las mismas medidas, así que
el SVG y los PNG no se pueden separar: si algún día cambia el dibujo, se
cambia aquí y se vuelve a correr.

    python3 scripts/generate-brand.py

Produce (todo en `src/public`):

    brand/img/margarita-icon.svg          el símbolo vectorial (por si hace falta a otro tamaño)
    brand/img/margarita-icon-{64,128,256,512}.png
    brand/img/margarita-wordmark-{256,512}.png
    favicon-16x16.png, favicon-32x32.png, favicon.ico
    apple-touch-icon.png, android-chrome-{192,512}.png

Decisiones de diseño:

- **El símbolo siempre es el mismo**: cuadrado redondeado verde con la
  margarita. En un menú, en una pestaña o en el ícono del celular, lo que se
  reconoce es el mismo dibujo. Antes había un "M" en un lado y otra cosa en
  otro; de ahí venía la inconsistencia.
- **Ocho pétalos y centro amarillo**: a 16 px los pétalos se leen como flor
  aunque la carita ya no se distinga. El amarillo del centro es el acento de
  la paleta (`sol`), el verde es la acción (`margarita`).
- **Se dibuja a 4x y se reduce**: así los bordes quedan suaves sin depender de
  un motor de SVG (no hay rasterizador instalado).
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

# --- Paleta -------------------------------------------------------------

# Verde de la marca. El 600 es el de los botones y el 700 el del texto.
GREEN_600 = (23, 134, 90)
GREEN_800 = (16, 87, 60)
GREEN_900 = (15, 70, 50)

# Amarillo del centro (y de los acentos de la promoción).
SUN_400 = (251, 190, 31)

PETAL = (255, 255, 255)
INK = (14, 43, 34)

# --- Medidas del dibujo (en unidades de un lienzo de 1024) --------------

CANVAS = 1024
CENTER = CANVAS / 2

PETAL_COUNT = 8
PETAL_BASE = 116  # dónde empieza el pétalo, medido desde el centro
PETAL_LENGTH = 360  # cuánto avanza hacia afuera
PETAL_WIDTH = 110  # media anchura máxima

CORE_RADIUS = 198

EYE_DX = 63
EYE_DY = -34
EYE_RX = 27
EYE_RY = 31

SMILE_BOX = (CENTER - 96, CENTER - 40, CENTER + 96, CENTER + 150)
SMILE_WIDTH = 27
SMILE_FROM = 25
SMILE_TO = 155

BADGE_RADIUS_RATIO = 0.235  # esquinas del cuadrado redondeado
SUPERSAMPLE = 4

BRAND_DIR = os.path.join("src", "public", "brand", "img")
PUBLIC_DIR = os.path.join("src", "public")

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def petal_points(angle_deg, steps=64):
    """
    Un pétalo: estrecho en la base, redondo en la punta. Es lo que hace que
    se lea como margarita y no como una nube blanca.
    """
    radians = math.radians(angle_deg)
    cos_a, sin_a = math.cos(radians), math.sin(radians)

    def point(distance, offset):
        x = distance
        y = offset
        return (CENTER + x * cos_a - y * sin_a, CENTER + x * sin_a + y * cos_a)

    contour = []

    for side in (1, -1):
        for step in range(steps + 1):
            t = step / steps if side == 1 else 1 - step / steps
            distance = PETAL_BASE + t * PETAL_LENGTH
            width = PETAL_WIDTH * math.sin(math.pi * t**0.82) * (0.62 + 0.38 * t)

            contour.append(point(distance, side * width))

    return contour


def gradient_badge(size):
    """Cuadrado redondeado con degradado verde (o cuadrado lleno)."""
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (1, size))
    pixels = gradient.load()

    for y in range(size):
        ratio = y / max(size - 1, 1)
        pixels[0, y] = (
            round(GREEN_600[0] + (GREEN_800[0] - GREEN_600[0]) * ratio),
            round(GREEN_600[1] + (GREEN_800[1] - GREEN_600[1]) * ratio),
            round(GREEN_600[2] + (GREEN_800[2] - GREEN_600[2]) * ratio),
            255,
        )

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=round(size * BADGE_RADIUS_RATIO),
        fill=255,
    )
    badge.paste(gradient.resize((size, size)), (0, 0), mask)

    return badge


def draw_daisy(size, rounded=True, full_bleed=False):
    """El símbolo completo, ya reducido al tamaño pedido."""
    big = size * SUPERSAMPLE
    scale = big / CANVAS
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))

    badge = gradient_badge(big) if not full_bleed else gradient_badge(big)

    if not rounded:
        badge = Image.new("RGBA", (big, big), GREEN_800 + (255,))

    image.alpha_composite(badge)

    draw = ImageDraw.Draw(image)

    def unit(value):
        return value * scale

    # Pétalos
    for index in range(PETAL_COUNT):
        angle = 360 / PETAL_COUNT * index
        draw.polygon([(unit(x), unit(y)) for x, y in petal_points(angle)], fill=PETAL)

    # Centro
    draw.ellipse(
        (
            unit(CENTER - CORE_RADIUS),
            unit(CENTER - CORE_RADIUS),
            unit(CENTER + CORE_RADIUS),
            unit(CENTER + CORE_RADIUS),
        ),
        fill=SUN_400,
    )

    # Carita: dos ojos y una sonrisa
    for side in (-1, 1):
        cx = CENTER + side * EYE_DX
        cy = CENTER + EYE_DY

        draw.ellipse(
            (
                unit(cx - EYE_RX),
                unit(cy - EYE_RY),
                unit(cx + EYE_RX),
                unit(cy + EYE_RY),
            ),
            fill=INK,
        )

    draw.arc(
        (
            unit(SMILE_BOX[0]),
            unit(SMILE_BOX[1]),
            unit(SMILE_BOX[2]),
            unit(SMILE_BOX[3]),
        ),
        start=SMILE_FROM,
        end=SMILE_TO,
        fill=INK,
        width=max(2, round(unit(SMILE_WIDTH))),
    )

    return image.resize((size, size), Image.LANCZOS)


def write_svg(path):
    """El mismo dibujo en vectorial, con las medidas de arriba."""
    petals = []

    for index in range(PETAL_COUNT):
        angle = 360 / PETAL_COUNT * index
        points = " ".join(
            f"{x:.1f},{y:.1f}" for x, y in petal_points(angle, steps=40)
        )

        petals.append(f'  <polygon points="{points}" fill="#ffffff"/>')

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" width="512" height="512" role="img" aria-label="Margarita">
  <title>Margarita</title>
  <defs>
    <linearGradient id="badge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#17865a"/>
      <stop offset="1" stop-color="#10573c"/>
    </linearGradient>
  </defs>

  <rect width="{CANVAS}" height="{CANVAS}" rx="{round(CANVAS * BADGE_RADIUS_RATIO)}" fill="url(#badge)"/>

{chr(10).join(petals)}

  <circle cx="{CENTER:.0f}" cy="{CENTER:.0f}" r="{CORE_RADIUS}" fill="#fbbe1f"/>
  <ellipse cx="{CENTER - EYE_DX:.0f}" cy="{CENTER + EYE_DY:.0f}" rx="{EYE_RX}" ry="{EYE_RY}" fill="#0e2b22"/>
  <ellipse cx="{CENTER + EYE_DX:.0f}" cy="{CENTER + EYE_DY:.0f}" rx="{EYE_RX}" ry="{EYE_RY}" fill="#0e2b22"/>
  <path d="M {CENTER - 83:.0f} {CENTER + 62:.0f} A 96 96 0 0 0 {CENTER + 83:.0f} {CENTER + 62:.0f}"
        fill="none" stroke="#0e2b22" stroke-width="{SMILE_WIDTH}" stroke-linecap="round"/>
</svg>
"""

    with open(path, "w", encoding="utf-8") as handle:
        handle.write(svg)


def wordmark(height):
    """Símbolo + nombre, para los encabezados."""
    icon_size = height
    icon = draw_daisy(icon_size, rounded=True)
    font_size = round(height * 0.56)
    font = None

    for candidate in FONT_CANDIDATES:
        if os.path.exists(candidate):
            font = ImageFont.truetype(candidate, font_size)
            break

    if font is None:  # pragma: no cover - depende del sistema
        raise SystemExit("No se encontró una tipografía en negrita para el wordmark.")

    text = "Margarita"
    gap = round(height * 0.26)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font)
    text_width = right - left
    text_height = bottom - top

    width = icon_size + gap + text_width
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    image.alpha_composite(icon, (0, 0))

    draw = ImageDraw.Draw(image)
    draw.text(
        (
            icon_size + gap - left,
            (height - text_height) / 2 - top,
        ),
        text,
        font=font,
        fill=GREEN_900,
    )

    return image


def main():
    os.makedirs(BRAND_DIR, exist_ok=True)

    write_svg(os.path.join(BRAND_DIR, "margarita-icon.svg"))

    for size in (64, 128, 256, 512):
        draw_daisy(size).save(os.path.join(BRAND_DIR, f"margarita-icon-{size}.png"))

    for size in (256, 512):
        wordmark(size).save(
            os.path.join(BRAND_DIR, f"margarita-wordmark-{size}.png")
        )

    # Pestaña del navegador
    draw_daisy(16).save(os.path.join(PUBLIC_DIR, "favicon-16x16.png"))
    draw_daisy(32).save(os.path.join(PUBLIC_DIR, "favicon-32x32.png"))
    draw_daisy(48).save(
        os.path.join(PUBLIC_DIR, "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # Celular: fondo completo, sin transparencia (el sistema recorta)
    draw_daisy(180, rounded=False, full_bleed=True).convert("RGB").save(
        os.path.join(PUBLIC_DIR, "apple-touch-icon.png")
    )

    for size in (192, 512):
        draw_daisy(size, rounded=False, full_bleed=True).convert("RGB").save(
            os.path.join(PUBLIC_DIR, f"android-chrome-{size}x{size}.png")
        )

    print("Marca generada en", BRAND_DIR, "y", PUBLIC_DIR)


if __name__ == "__main__":
    main()
