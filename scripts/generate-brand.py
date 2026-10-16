"""
Escribe los archivos de marca que usa la aplicación.

    python3 scripts/generate-brand.py
    python3 scripts/generate-brand.py --variant=flor

Produce (dentro de `src/public`):

    brand/img/margarita-icon.svg          el símbolo vectorial
    brand/img/margarita-icon-{64,128,256,512}.png
    brand/img/margarita-wordmark-{256,512}.png
    favicon-16x16.png, favicon-32x32.png, favicon.ico
    apple-touch-icon.png, android-chrome-{192,512}.png

El dibujo vive en `brand_lib.py`: aquí solo se escribe en disco.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import brand_lib

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Símbolo de Margarita")
    parser.add_argument(
        "--variant",
        default="sello-hojas",
        choices=list(brand_lib.VARIANTS),
        help=(
            "sello: círculo con la flor en negativo · sello-sol: con el centro amarillo · "
            "sello-hojas: con dos hojas · sello-anillo: con un aro · flor: solo la flor · "
            "hueco: flor con el centro vacío"
        ),
    )
    brand_lib.write_app_assets(parser.parse_args().variant)
