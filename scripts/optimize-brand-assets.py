"""
Genera versiones optimizadas y con fondo transparente del logo de Margarita.

Los originales (1254x1254 y 2508x627, ~700 KB cada uno) son demasiado
pesados para un encabezado, y tienen fondo claro, así que no se pueden
poner sobre un fondo de color.

Requiere Pillow:
    python3 -m pip install Pillow

Uso (desde la raíz del proyecto):
    python3 scripts/optimize-brand-assets.py

Si algún día cambias el logo, reemplaza los originales en
src/public/brand/img/ y vuelve a correr esto.
"""

import os

from PIL import Image

BRAND_DIR = os.path.join("src", "public", "brand", "img")
PUBLIC_DIR = os.path.join("src", "public")

WORDMARK_SOURCE = os.path.join(BRAND_DIR, "margarita-wordmark.png")
ICON_SOURCE = os.path.join(BRAND_DIR, "margarita-icon.png")


def make_transparent(image):
    """Convierte el fondo claro en transparencia.

    Usa la luminancia: el fondo (blanco/gris claro) queda con alfa 0 y el
    color de la tinta queda opaco. El RGB de todos los píxeles se
    reemplaza por el color de la tinta para que los bordes suavizados no
    arrastren el gris del fondo.
    """

    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size

    corners = [
        pixels[0, 0],
        pixels[width - 1, 0],
        pixels[0, height - 1],
        pixels[width - 1, height - 1],
    ]
    background = sum(sum(pixel[:3]) / 3 for pixel in corners) / 4

    ink_color = None
    ink_luminance = 256.0

    for y in range(height):
        for x in range(width):
            red, green, blue, _ = pixels[x, y]
            luminance = (red + green + blue) / 3

            if luminance < ink_luminance:
                ink_luminance = luminance
                ink_color = (red, green, blue)

    span = max(1.0, background - ink_luminance)

    for y in range(height):
        for x in range(width):
            red, green, blue, _ = pixels[x, y]
            luminance = (red + green + blue) / 3

            if luminance >= background:
                alpha = 0
            else:
                alpha = round((background - luminance) * 255 / span)

            pixels[x, y] = (*ink_color, max(0, min(255, alpha)))

    return rgba


def save(image, width, name):
    ratio = width / image.width
    resized = image.resize(
        (width, max(1, round(image.height * ratio))), Image.LANCZOS
    )

    path = os.path.join(BRAND_DIR, name)
    resized.save(path, "PNG", optimize=True)

    print(f"{name}: {resized.width}x{resized.height} · {os.path.getsize(path) // 1024} KB")


def crop_to_content(image, padding_ratio=0.06):
    """Recorta el margen vacío. El ícono original deja el 'M' muy pequeño
    dentro de un lienzo cuadrado, así que sin recortar se vería diminuto."""

    bounding_box = image.getchannel("A").getbbox()

    if not bounding_box:
        return image

    left, top, right, bottom = bounding_box
    pad_x = round((right - left) * padding_ratio)
    pad_y = round((bottom - top) * padding_ratio)

    return image.crop(
        (
            max(0, left - pad_x),
            max(0, top - pad_y),
            min(image.width, right + pad_x),
            min(image.height, bottom + pad_y),
        )
    )


def square_icon(image, size, background, padding_ratio=0.12):
    """Coloca la marca centrada en un lienzo cuadrado."""

    inner = max(1, size - 2 * round(size * padding_ratio))
    ratio = min(inner / image.width, inner / image.height)

    scaled = image.resize(
        (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
        Image.LANCZOS,
    )

    canvas = Image.new("RGBA", (size, size), background)
    canvas.paste(
        scaled,
        ((size - scaled.width) // 2, (size - scaled.height) // 2),
        scaled,
    )

    return canvas


def save_icon(image, size, name, background=(255, 255, 255, 255)):
    """Escribe en src/public/ porque los íconos del navegador y del
    manifest se referencian desde la raíz del sitio."""

    icon = square_icon(image, size, background)
    path = os.path.join(PUBLIC_DIR, name)
    icon.convert("RGBA").save(path, "PNG", optimize=True)

    print(f"{name}: {size}x{size} · {os.path.getsize(path) // 1024} KB")


def main():
    wordmark = make_transparent(Image.open(WORDMARK_SOURCE))
    icon = crop_to_content(make_transparent(Image.open(ICON_SOURCE)))

    save(wordmark, 512, "margarita-wordmark-512.png")
    save(wordmark, 256, "margarita-wordmark-256.png")

    save(icon, 256, "margarita-icon-256.png")
    save(icon, 128, "margarita-icon-128.png")
    save(icon, 64, "margarita-icon-64.png")

    # Íconos del navegador y de la app instalada (PWA), con fondo blanco
    # para que se vean igual en cualquier barra o sistema operativo.
    save_icon(icon, 512, "android-chrome-512x512.png")
    save_icon(icon, 192, "android-chrome-192x192.png")
    save_icon(icon, 180, "apple-touch-icon.png")
    save_icon(icon, 32, "favicon-32x32.png")
    save_icon(icon, 16, "favicon-16x16.png")

    print("\nListo. Los originales no se modificaron.")


if __name__ == "__main__":
    main()
