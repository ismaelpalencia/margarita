#!/usr/bin/env python3
"""
Exporta los logos de Margarita a `marca/`, listos para presentaciones.

    python3 scripts/export-brand-assets.py

De dónde salen: `src/public/brand/img` (los mismos que usa la app, así no hay
dos versiones del logo). Este script solo copia, genera versiones en blanco
para fondos oscuros y agranda las piezas grandes; no dibuja nada nuevo.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "public" / "brand" / "img"
OUT = ROOT / "marca"


def copy(source: str, target_dir: str, name: str) -> None:
    """Copia un PNG (o cualquier archivo) tal cual."""
    destination = OUT / target_dir / name
    destination.parent.mkdir(parents=True, exist_ok=True)

    if source.endswith(".svg"):
        destination.write_bytes((SOURCE / source).read_bytes())
        return

    Image.open(SOURCE / source).save(destination)


def white_version(source: str, target_dir: str, name: str) -> None:
    """El mismo logo, todo blanco, conservando la transparencia."""
    image = Image.open(SOURCE / source).convert("RGBA")
    white = Image.new("RGBA", image.size, (255, 255, 255, 0))
    white.putalpha(image.getchannel("A"))
    destination = OUT / target_dir / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    white.save(destination)


def upscale(source: str, target_dir: str, name: str, width: int) -> None:
    image = Image.open(SOURCE / source).convert("RGBA")
    height = round(image.height * width / image.width)
    resized = image.resize((width, height), Image.LANCZOS)
    destination = OUT / target_dir / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    resized.save(destination)


def white_from_file(path: Path, name: str) -> None:
    """Toma un PNG ya generado y lo deja blanco, conservando la transparencia."""
    image = Image.open(path).convert("RGBA")
    white = Image.new("RGBA", image.size, (255, 255, 255, 0))
    white.putalpha(image.getchannel("A"))
    white.save(path.parent / name)


def main() -> None:
    for size in (64, 128, 256, 512):
        copy(f"margarita-icon-{size}.png", "sello", f"margarita-sello-{size}.png")
        copy(f"margarita-mark-{size}.png", "flor", f"margarita-flor-{size}.png")
        white_version(
            f"margarita-mark-{size}.png", "flor", f"margarita-flor-blanco-{size}.png"
        )

    copy("margarita-icon.svg", "sello", "margarita-sello.svg")
    copy("margarita-mark.svg", "flor", "margarita-flor.svg")

    upscale("margarita-icon-512.png", "sello", "margarita-sello-1024.png", 1024)
    upscale("margarita-mark-512.png", "flor", "margarita-flor-1024.png", 1024)
    white_from_file(
        OUT / "flor" / "margarita-flor-1024.png",
        "margarita-flor-blanco-1024.png",
    )

    for size in (256, 512):
        copy(
            f"margarita-wordmark-{size}.png",
            "logotipo",
            f"margarita-logotipo-{size}.png",
        )
        white_version(
            f"margarita-wordmark-{size}.png",
            "logotipo",
            f"margarita-logotipo-blanco-{size}.png",
        )

    upscale(
        "margarita-wordmark-512.png",
        "logotipo",
        "margarita-logotipo-2048.png",
        2048,
    )
    white_from_file(
        OUT / "logotipo" / "margarita-logotipo-2048.png",
        "margarita-logotipo-blanco-2048.png",
    )

    print(f"Listo: {OUT}")


if __name__ == "__main__":
    main()
