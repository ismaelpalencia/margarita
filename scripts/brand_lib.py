"""
Dibuja la marca de Margarita: una margarita de un solo color, plana.

Es la fuente de verdad del símbolo y de la paleta; la usan los dos scripts que
sí se ejecutan:

- `python3 scripts/generate-brand.py` → los archivos de la aplicación.
- `python3 scripts/generate-promo.py` → la imagen para WhatsApp.

La idea del símbolo: **un solo color, sin sombras ni degradados**, como los
marcas de Ollama o GitHub. Lo que se reconoce es la silueta de la flor; la
carita va tallada dentro del centro (en hueco), así que funciona igual sobre
fondo claro y oscuro, y a 16 px se sigue leyendo.

Variantes (`variant`):

- `sello-hojas`: círculo lleno con la flor en negativo y dos hojas en la base.
  **Es la elegida** para la aplicación y los favicons.
- `sello-sol`: igual, con el centro amarillo.
- `sello` / `sello-anillo`: el sello liso y con un aro fino por dentro.
- `flor`: solo la flor, sin caja. La más "Ollama".
- `hueco`: la flor con el centro vacío (aro). Pierde la carita.

Todo se dibuja a 4x y se reduce, así que los bordes quedan suaves sin depender
de un motor de SVG (no hay rasterizador instalado).
"""

import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFont

# --- Paleta -------------------------------------------------------------

# Paleta de la marca, la misma del CSS (`margarita-*` y `sol-*`).
GREEN = (23, 134, 90)  # margarita-600: acción y símbolo
GREEN_DARK = (15, 70, 50)  # margarita-900: texto de marca
GREEN_800 = (16, 87, 60)  # margarita-800: fondos del volante
GREEN_900 = (15, 70, 50)
GREEN_TILE = (12, 91, 76)  # sello moderno: verde profundo del tile
SUN_400 = (251, 190, 31)  # sol-400: solo para destacar
INK = (14, 43, 34)
WHITE = (255, 255, 255)

# --- Medidas, sobre un lienzo de 1024 ----------------------------------

CANVAS = 1024
CENTER = CANVAS / 2

PETAL_COUNT = 8
PETAL_DISTANCE = 238  # qué tan lejos del centro está el centro de cada pétalo
PETAL_LONG = 186  # radio del pétalo en dirección al centro
PETAL_SHORT = 96  # radio del pétalo a lo ancho (pétalos redondos y separados)
CORE_RADIUS = 202
GLYPH_SCALE = 0.88  # cuánto ocupa la flor dentro del sello

EYE_DX = 72
EYE_DY = -22
EYE_RX = 32
EYE_RY = 37

SMILE_BOX = (CENTER - 110, CENTER - 46, CENTER + 110, CENTER + 158)
SMILE_WIDTH = 30
SMILE_FROM = 22
SMILE_TO = 158

BADGE_MARGIN_RATIO = 0.0  # el sello llega al borde
TILE_RADIUS_RATIO = 0.235  # esquinas del sello moderno
SUPERSAMPLE = 4

BRAND_DIR = os.path.join("src", "public", "brand", "img")
PUBLIC_DIR = os.path.join("src", "public")


def petal_points(angle_deg, steps=64, distance=None, long=None, short=None):
    """
    Un pétalo: una elipse redondeada, no una punta. Es lo que hace que la
    silueta se lea como margarita y no como estrella.

    Va en coordenadas del lienzo de 1024 y se traslapa con el centro, así que
    la flor queda de una sola pieza.
    """
    distance = PETAL_DISTANCE if distance is None else distance
    long = PETAL_LONG if long is None else long
    short = PETAL_SHORT if short is None else short

    radians = math.radians(angle_deg)
    cos_a, sin_a = math.cos(radians), math.sin(radians)
    cx = CENTER + distance * cos_a
    cy = CENTER + distance * sin_a

    return [
        (
            cx + long * math.cos(theta) * cos_a - short * math.sin(theta) * sin_a,
            cy + long * math.cos(theta) * sin_a + short * math.sin(theta) * cos_a,
        )
        for theta in (2 * math.pi * step / steps for step in range(steps))
    ]


def leaf_axis(angle_deg, distance, length):
    """Punto de la nervadura de una hoja: de la base a la punta."""
    radians = math.radians(angle_deg)
    cos_a, sin_a = math.cos(radians), math.sin(radians)

    return [
        (
            CENTER + (distance + t * length) * cos_a,
            CENTER + (distance + t * length) * sin_a,
        )
        for t in [index / 20 for index in range(21)]
    ]


def leaf_points(angle_deg, distance=None, long=None, short=None, steps=72):
    """
    Una hoja: ancha al principio, con punta. Distinta de un pétalo a propósito,
    para que no se confunda con la flor.
    """
    distance = 258 if distance is None else distance
    long = 152 if long is None else long
    short = 62 if short is None else short

    radians = math.radians(angle_deg)
    cos_a, sin_a = math.cos(radians), math.sin(radians)

    def point(along, offset):
        return (
            CENTER + along * cos_a - offset * sin_a,
            CENTER + along * sin_a + offset * cos_a,
        )

    contour = []

    for side in (1, -1):
        for step in range(steps + 1):
            t = step / steps if side == 1 else 1 - step / steps
            along = distance + t * long
            # Lente simétrica: puntiaguda en la punta y angosta en la base,
            # que es lo que hace que se lea como hoja y no como pétalo.
            half = short * math.sin(math.pi * t)

            contour.append(point(along, side * half))

    return contour


def hex_color(rgb):
    """Color RGB a notación hexadecimal para los SVG."""
    return "#%02x%02x%02x" % rgb


def mapper(big, glyph_scale=1.0, shift_y=0.0):
    """
    Convierte coordenadas del lienzo a píxeles, con escala alrededor del centro.

    `shift_y` sube o baja todo el dibujo (en unidades del lienzo), que es lo que
    permite equilibrar la flor cuando abajo lleva hojas.
    """
    scale = (big / CANVAS) * glyph_scale
    half = big / 2

    def to_pixels(x, y):
        return (
            half + (x - CENTER) * scale,
            half + (y - CENTER) * scale + shift_y * scale,
        )

    return to_pixels, scale


def daisy_glyph(size, color=GREEN, face=True, center="solid", glyph_scale=1.0):
    """
    La flor sola, en un solo color y con fondo transparente.

    La carita se recorta de verdad (alpha 0), no se pinta de blanco: así el
    símbolo se puede poner sobre cualquier fondo sin que aparezca un parche.
    """
    big = size * SUPERSAMPLE
    to_pixels, scale = mapper(big, glyph_scale)
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    def box(radius):
        top_left = to_pixels(CENTER - radius, CENTER - radius)
        bottom_right = to_pixels(CENTER + radius, CENTER + radius)
        return (top_left[0], top_left[1], bottom_right[0], bottom_right[1])

    for index in range(PETAL_COUNT):
        angle = 360 / PETAL_COUNT * index
        draw.polygon(
            [to_pixels(x, y) for x, y in petal_points(angle)],
            fill=color + (255,),
        )

    if center != "hole":
        draw.ellipse(box(CORE_RADIUS), fill=color + (255,))

    holes = Image.new("L", (big, big), 255)
    punch = ImageDraw.Draw(holes)

    if center == "hole":
        punch.ellipse(box(CORE_RADIUS), fill=0)

    if face and center != "hole":
        for side in (-1, 1):
            x = CENTER + side * EYE_DX
            y = CENTER + EYE_DY
            eyes = (
                to_pixels(x - EYE_RX, y - EYE_RY)[0],
                to_pixels(x - EYE_RX, y - EYE_RY)[1],
                to_pixels(x + EYE_RX, y + EYE_RY)[0],
                to_pixels(x + EYE_RX, y + EYE_RY)[1],
            )
            punch.ellipse(eyes, fill=0)

        smile = box(0)
        smile = (
            to_pixels(SMILE_BOX[0], SMILE_BOX[1])[0],
            to_pixels(SMILE_BOX[0], SMILE_BOX[1])[1],
            to_pixels(SMILE_BOX[2], SMILE_BOX[3])[0],
            to_pixels(SMILE_BOX[2], SMILE_BOX[3])[1],
        )
        punch.arc(
            smile,
            start=SMILE_FROM,
            end=SMILE_TO,
            fill=0,
            width=max(2, round(SMILE_WIDTH * scale)),
        )

    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), holes))

    return layer.resize((size, size), Image.LANCZOS)


def daisy_badge(
    size,
    background=GREEN,
    glyph=WHITE,
    face=True,
    glyph_scale=GLYPH_SCALE,
    core=None,
    face_color=None,
    ring=False,
    leaves=False,
    shift_y=0.0,
):
    """
    Círculo lleno con la flor en negativo: el estilo "sello", como el de
    GitHub.

    Los detalles son opcionales y se pueden combinar:

    - `core`: color del centro de la flor. Con `SUN_400` el centro queda
      amarillo (el acento de la marca) y la carita se talla en tinta oscura.
    - `ring`: un aro fino por dentro del borde, a juego con la flor.
    - `leaves`: dos hojas en la base de la flor, como si acabara de cortarse.
    """
    big = size * SUPERSAMPLE
    to_pixels, scale = mapper(big, glyph_scale, shift_y)
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.ellipse((0, 0, big - 1, big - 1), fill=background + (255,))

    if ring:
        stroke = max(2, round(big * 0.018))
        inset = big * 0.075

        draw.ellipse(
            (inset, inset, big - inset, big - inset),
            outline=glyph + (255,),
            width=stroke,
        )

    def box(radius):
        top_left = to_pixels(CENTER - radius, CENTER - radius)
        bottom_right = to_pixels(CENTER + radius, CENTER + radius)
        return (top_left[0], top_left[1], bottom_right[0], bottom_right[1])

    for index in range(PETAL_COUNT):
        angle = 360 / PETAL_COUNT * index
        draw.polygon(
            [to_pixels(x, y) for x, y in petal_points(angle)],
            fill=glyph + (255,),
        )

    draw.ellipse(box(CORE_RADIUS), fill=(core or glyph) + (255,))

    if leaves:
        """
        Dos hojas abajo, abiertas en V, con la punta asomando por debajo de la
        flor y la nervadura tallada. Van después de los pétalos: como son del
        mismo color, no se nota el traslape, y así la nervadura no queda tapada.
        En pantalla el ángulo 90° apunta hacia abajo.
        """
        for side in (-1, 1):
            angle = 90 - side * 22.5

            draw.polygon(
                [to_pixels(x, y) for x, y in leaf_points(angle)],
                fill=glyph + (255,),
            )

            spine = leaf_axis(angle, 278, 108)

            draw.line(
                [to_pixels(x, y) for x, y in spine],
                fill=background + (255,),
                width=max(2, round(5.5 * scale)),
                joint="curve",
            )

    if face:
        carved = (face_color or background) + (255,)

        for side in (-1, 1):
            x = CENTER + side * EYE_DX
            y = CENTER + EYE_DY
            top_left = to_pixels(x - EYE_RX, y - EYE_RY)
            bottom_right = to_pixels(x + EYE_RX, y + EYE_RY)

            draw.ellipse(
                (top_left[0], top_left[1], bottom_right[0], bottom_right[1]),
                fill=carved,
            )

        smile_top_left = to_pixels(SMILE_BOX[0], SMILE_BOX[1])
        smile_bottom_right = to_pixels(SMILE_BOX[2], SMILE_BOX[3])

        draw.arc(
            (
                smile_top_left[0],
                smile_top_left[1],
                smile_bottom_right[0],
                smile_bottom_right[1],
            ),
            start=SMILE_FROM,
            end=SMILE_TO,
            fill=carved,
            width=max(2, round(SMILE_WIDTH * scale)),
        )

    return image.resize((size, size), Image.LANCZOS)


def daisy_tile(
    size,
    background=GREEN_TILE,
    glyph=WHITE,
    core=SUN_400,
    face=True,
    glyph_scale=0.8,
):
    """
    Sello moderno: cuadrado redondeado, flor blanca, centro amarillo y carita.

    Es la evolución del sello circular. Conserva la silueta y la cara, pero se
    lee como un icono de producto actual y funciona mejor junto a un wordmark.
    Sigue siendo plano: sin sombras ni degradados dentro del archivo.
    """
    big = size * SUPERSAMPLE
    to_pixels, scale = mapper(big, glyph_scale)
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    radius = max(1, round(big * TILE_RADIUS_RATIO))
    draw.rounded_rectangle(
        (0, 0, big - 1, big - 1),
        radius=radius,
        fill=background + (255,),
    )

    def box(radius_value):
        top_left = to_pixels(CENTER - radius_value, CENTER - radius_value)
        bottom_right = to_pixels(CENTER + radius_value, CENTER + radius_value)
        return (top_left[0], top_left[1], bottom_right[0], bottom_right[1])

    for index in range(PETAL_COUNT):
        angle = 360 / PETAL_COUNT * index
        draw.polygon(
            [to_pixels(x, y) for x, y in petal_points(angle)],
            fill=glyph + (255,),
        )

    draw.ellipse(box(CORE_RADIUS), fill=core + (255,))

    if face:
        carved = background + (255,)

        for side in (-1, 1):
            x = CENTER + side * EYE_DX
            y = CENTER + EYE_DY
            top_left = to_pixels(x - EYE_RX, y - EYE_RY)
            bottom_right = to_pixels(x + EYE_RX, y + EYE_RY)
            draw.ellipse(
                (top_left[0], top_left[1], bottom_right[0], bottom_right[1]),
                fill=carved,
            )

        smile_top_left = to_pixels(SMILE_BOX[0], SMILE_BOX[1])
        smile_bottom_right = to_pixels(SMILE_BOX[2], SMILE_BOX[3])
        draw.arc(
            (
                smile_top_left[0],
                smile_top_left[1],
                smile_bottom_right[0],
                smile_bottom_right[1],
            ),
            start=SMILE_FROM,
            end=SMILE_TO,
            fill=carved,
            width=max(2, round(SMILE_WIDTH * scale)),
        )

    return image.resize((size, size), Image.LANCZOS)


def load_font(size, bold=True):
    """Tipografía del sistema, con respaldo si falta la primera opción."""
    candidates = [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]

    for candidate in candidates:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)

    raise SystemExit(f"No se encontró una tipografía en {candidates[0]}")


def glyph_svg(variant="flor"):
    """El mismo dibujo en vectorial, con las medidas de este archivo."""
    petals = []

    for index in range(PETAL_COUNT):
        angle = 360 / PETAL_COUNT * index
        points = " ".join(
            f"{x:.1f},{y:.1f}" for x, y in petal_points(angle, steps=40)
        )

        petals.append(f'  <polygon points="{points}" fill="currentColor"/>')

    core = (
        f'  <circle cx="{CENTER:.0f}" cy="{CENTER:.0f}" r="{CORE_RADIUS}" fill="currentColor"/>'
    )
    face = (
        f'  <ellipse cx="{CENTER - EYE_DX:.0f}" cy="{CENTER + EYE_DY:.0f}" rx="{EYE_RX}" ry="{EYE_RY}" fill="#000"/>'
        f'\n  <ellipse cx="{CENTER + EYE_DX:.0f}" cy="{CENTER + EYE_DY:.0f}" rx="{EYE_RX}" ry="{EYE_RY}" fill="#000"/>'
        f'\n  <path d="M {CENTER - 90:.0f} {CENTER + 58:.0f} A 104 104 0 0 0 {CENTER + 90:.0f} {CENTER + 58:.0f}"'
        f' fill="none" stroke="#000" stroke-width="{SMILE_WIDTH}" stroke-linecap="round"/>'
    )

    if variant == "sello-moderno":
        radius = round(CANVAS * TILE_RADIUS_RATIO)
        tile = (
            f'  <rect width="{CANVAS}" height="{CANVAS}" rx="{radius}" '
            f'fill="{hex_color(GREEN_TILE)}"/>'
        )
        face_tile = face.replace(
            'fill="#000"', f'fill="{hex_color(GREEN_TILE)}"'
        ).replace('stroke="#000"', f'stroke="{hex_color(GREEN_TILE)}"')
        body = (
            tile
            + "\n"
            + "\n".join(petal.replace('fill="currentColor"', 'fill="#fff"') for petal in petals)
            + f'\n  <circle cx="{CENTER:.0f}" cy="{CENTER:.0f}" r="{CORE_RADIUS}" fill="{hex_color(SUN_400)}"/>'
            + "\n"
            + face_tile
        )
        return _svg_document(body)

    if variant == "sello":
        body = (
            f'  <circle cx="{CENTER:.0f}" cy="{CENTER:.0f}" r="{CENTER:.0f}" fill="currentColor"/>\n'
            + "\n".join(petal.replace('fill="currentColor"', 'fill="#fff"') for petal in petals)
            + f'\n  <circle cx="{CENTER:.0f}" cy="{CENTER:.0f}" r="{CORE_RADIUS}" fill="#fff"/>'
            + "\n"
            + face.replace('fill="#000"', 'fill="currentColor"').replace(
                'stroke="#000"', 'stroke="currentColor"'
            )
        )
    elif variant == "hueco":
        mask = (
            f'  <mask id="aro"><rect width="{CANVAS}" height="{CANVAS}" fill="#fff"/>'
            f'<circle cx="{CENTER:.0f}" cy="{CENTER:.0f}" r="{CORE_RADIUS}" fill="#000"/></mask>'
        )
        body = (
            '  <g mask="url(#aro)">\n'
            + "\n".join(petals)
            + f'\n  <circle cx="{CENTER:.0f}" cy="{CENTER:.0f}" r="{CORE_RADIUS}" fill="currentColor"/>'
            + "\n  </g>"
        )
        return _svg_document(body, defs=mask)
    else:
        mask = (
            f'  <mask id="carita"><rect width="{CANVAS}" height="{CANVAS}" fill="#fff"/>'
            + "\n"
            + face.replace('fill="#000"', 'fill="#000"')
            + "\n  </mask>"
        )
        body = (
            '  <g mask="url(#carita)">\n'
            + "\n".join(petals)
            + "\n"
            + core
            + "\n  </g>"
        )
        return _svg_document(body, defs=mask)

    return _svg_document(body)


def _svg_document(body, defs=""):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" width="512" height="512" role="img" aria-label="Margarita" color="#17865a">
  <title>Margarita</title>
  <defs>
{defs}
  </defs>

{body}
</svg>
"""


def wordmark(height, variant="sello-moderno"):
    """Símbolo + nombre, para los encabezados. Usa el mismo símbolo que el ícono."""
    icon = draw_icon(height, variant)
    font = load_font(round(height * 0.56))
    text = "Margarita"
    gap = round(height * 0.3)

    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font)

    width = height + gap + (right - left)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    image.alpha_composite(icon, (0, 0))

    ImageDraw.Draw(image).text(
        (height + gap - left, (height - (bottom - top)) / 2 - top),
        text,
        font=font,
        fill=GREEN_DARK,
    )

    return image


VARIANTS = (
    "sello-moderno",
    "sello",
    "sello-sol",
    "sello-hojas",
    "sello-anillo",
    "flor",
    "hueco",
)


def draw_icon(size, variant="sello-moderno"):
    """El símbolo como se usa en la aplicación, según la variante pedida."""
    if variant == "sello-moderno":
        return daisy_tile(size)

    if variant == "sello":
        return daisy_badge(size)

    if variant == "sello-sol":
        return daisy_badge(size, core=SUN_400, face_color=INK)

    if variant == "sello-hojas":
        return daisy_badge(
            size, leaves=True, glyph_scale=0.8, shift_y=-30
        )

    if variant == "sello-anillo":
        return daisy_badge(size, ring=True, glyph_scale=0.78)

    if variant == "hueco":
        return daisy_glyph(size, GREEN, face=False, center="hole")

    return daisy_glyph(size, GREEN, face=True)


def write_app_assets(variant="sello-moderno"):
    """Escribe los archivos que usa la aplicación."""
    os.makedirs(BRAND_DIR, exist_ok=True)

    with open(os.path.join(BRAND_DIR, "margarita-icon.svg"), "w", encoding="utf-8") as handle:
        handle.write(glyph_svg(variant))

    with open(os.path.join(BRAND_DIR, "margarita-mark.svg"), "w", encoding="utf-8") as handle:
        handle.write(glyph_svg("flor"))

    for size in (64, 128, 256, 512):
        draw_icon(size, variant).save(
            os.path.join(BRAND_DIR, f"margarita-icon-{size}.png")
        )
        daisy_glyph(size, GREEN).save(
            os.path.join(BRAND_DIR, f"margarita-mark-{size}.png")
        )

    for size in (256, 512):
        wordmark(size, variant).save(
            os.path.join(BRAND_DIR, f"margarita-wordmark-{size}.png")
        )

    # Pestaña del navegador
    draw_icon(16, variant).save(os.path.join(PUBLIC_DIR, "favicon-16x16.png"))
    draw_icon(32, variant).save(os.path.join(PUBLIC_DIR, "favicon-32x32.png"))
    draw_icon(48, variant).save(
        os.path.join(PUBLIC_DIR, "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # Celular: cuadrado lleno, sin transparencia (el sistema recorta)
    full = (
        draw_icon(512, variant).convert("RGB")
        if variant.startswith("sello")
        else daisy_badge(512).convert("RGB")
    )
    full.resize((180, 180), Image.LANCZOS).save(
        os.path.join(PUBLIC_DIR, "apple-touch-icon.png")
    )

    for size in (192, 512):
        full.resize((size, size), Image.LANCZOS).save(
            os.path.join(PUBLIC_DIR, f"android-chrome-{size}x{size}.png")
        )

    print("Marca generada en", BRAND_DIR, "y", PUBLIC_DIR, "· variante:", variant)
