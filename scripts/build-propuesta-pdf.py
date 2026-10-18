#!/usr/bin/env python3
"""
Genera la propuesta comercial en PDF a partir de un documento ODF plano.

    python3 scripts/build-propuesta-pdf.py

Deja `output/pdf/propuesta-margarita.pdf`. El diseño se controla aquí (página
A4, márgenes, colores de la marca, tablas y saltos de página) y LibreOffice solo
convierte el ODF a PDF, así que no depende de librerías de Python.
"""

import base64
import subprocess
from pathlib import Path
from xml.etree import ElementTree
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output" / "pdf"
WORK = ROOT / "tmp" / "pdfs"

VERDE = "#17865a"
VERDE_OSCURO = "#0f4632"
VERDE_CLARO = "#eefbf3"
SOL = "#fbbe1f"
TEXTO = "#0f172a"
GRIS = "#475569"
BORDE = "#e2e8f0"

LOGO = ROOT / "marca" / "logotipo" / "margarita-logotipo-512.png"
SELLO = ROOT / "marca" / "sello" / "margarita-sello-128.png"


def image_uri(path: Path) -> str:
    """
    Copia la imagen junto al ODF y devuelve el nombre.

    LibreOffice no resuelve `data:` en `xlink:href`; con un archivo relativo sí,
    y al exportar queda embebida dentro del PDF.
    """
    destino = WORK / path.name
    destino.write_bytes(path.read_bytes())

    return path.name


def p(text: str, style: str = "Body") -> str:
    return f'<text:p text:style-name="{style}">{text}</text:p>'


def h(text: str, style: str = "H1") -> str:
    return f'<text:p text:style-name="{style}">{escape(text)}</text:p>'


def page_break() -> str:
    return p("", "PageBreak")


def table(rows: list[list[str]], widths: list[str], header: bool = False) -> str:
    columns = "".join(
        f'<table:table-column table:style-name="Col{index + 1}"/>'
        for index in range(len(widths))
    )
    body = []

    for row_index, row in enumerate(rows):
        cells = []

        for cell_index, value in enumerate(row):
            style = "CellHeader" if header and row_index == 0 else "Cell"
            cells.append(
                f'<table:table-cell table:style-name="{style}" office:value-type="string">'
                f"{p(value, 'CellText')}</table:table-cell>"
            )

        body.append(f"<table:table-row>{''.join(cells)}</table:table-row>")

    return (
        f'<table:table table:name="Tabla" table:style-name="Tabla">'
        f"{columns}{''.join(body)}</table:table>"
    )


def frame(path: Path, width_cm: float, height_cm: float, name: str) -> str:
    return (
        f'<text:p text:style-name="Image">'
        f'<draw:frame draw:style-name="Imagen" draw:name="{name}" text:anchor-type="as-char" '
        f'svg:width="{width_cm}cm" svg:height="{height_cm}cm">'
        f'<draw:image xlink:href="{image_uri(path)}" xlink:type="simple" '
        f'xlink:show="embed" xlink:actuate="onLoad"/>'
        f"</draw:frame></text:p>"
    )


def styles() -> str:
    def paragraph(name: str, size: str, color: str, bold: bool = False,
                  before: str = "0cm", after: str = "0.25cm", break_before: bool = False,
                  font: str = "DejaVu Sans", line: str = "140%") -> str:
        weight = 'fo:font-weight="bold"' if bold else ""
        brk = 'fo:break-before="page"' if break_before else ""

        return (
            f'<style:style style:name="{name}" style:family="paragraph">'
            f'<style:paragraph-properties fo:margin-top="{before}" fo:margin-bottom="{after}" '
            f'fo:line-height="{line}" {brk}/>'
            f'<style:text-properties style:font-name="{font}" fo:font-size="{size}" '
            f'fo:color="{color}" {weight}/></style:style>'
        )

    return "".join(
        [
            paragraph("Title", "34pt", VERDE_OSCURO, bold=True, after="0.4cm", line="110%"),
            paragraph("Subtitle", "14pt", GRIS, after="0.6cm"),
            paragraph("H1", "24pt", VERDE_OSCURO, bold=True, before="0.8cm", after="0.4cm", line="115%"),
            paragraph("H2", "15pt", VERDE_OSCURO, bold=True, before="0.6cm", after="0.2cm"),
            paragraph("Body", "10.5pt", TEXTO, after="0.3cm"),
            paragraph("Small", "8.5pt", GRIS, after="0.2cm"),
            paragraph("Lead", "12pt", GRIS, after="0.4cm"),
            paragraph("Kicker", "9pt", VERDE, bold=True, after="0.3cm"),
            paragraph("PageBreak", "10pt", TEXTO, after="0cm", break_before=True),
            paragraph("CellText", "9.5pt", TEXTO, after="0cm", line="130%"),
            paragraph("CellBold", "9.5pt", TEXTO, bold=True, after="0cm", line="130%"),
            paragraph("Image", "10pt", TEXTO, after="0.3cm", line="100%"),
            paragraph("Footer", "8pt", "#94a3b8", after="0cm"),
            """
            <style:style style:name="Tabla" style:family="table">
              <style:table-properties table:align="margins" style:width="16.6cm"/>
            </style:style>
            <style:style style:name="Col1" style:family="table-column">
              <style:table-column-properties style:column-width="5.2cm"/>
            </style:style>
            <style:style style:name="Col2" style:family="table-column">
              <style:table-column-properties style:column-width="11.4cm"/>
            </style:style>
            <style:style style:name="ColWide" style:family="table-column">
              <style:table-column-properties style:column-width="16.6cm"/>
            </style:style>
            <style:style style:name="Cell" style:family="table-cell">
              <style:table-cell-properties fo:padding="0.32cm" fo:border="0.5pt solid #e2e8f0"
                fo:vertical-align="top"/>
            </style:style>
            <style:style style:name="CellHeader" style:family="table-cell">
              <style:table-cell-properties fo:padding="0.32cm" fo:border="0.5pt solid #e2e8f0"
                fo:background-color="#eefbf3" fo:vertical-align="top"/>
            </style:style>
            <style:style style:name="Imagen" style:family="graphic">
              <style:graphic-properties style:vertical-pos="top" style:horizontal-pos="left"/>
            </style:style>
            """,
        ]
    )


def document() -> str:
    contenido = []

    # --- Portada -------------------------------------------------------
    contenido.append(frame(LOGO, 9.5, 2.5, "Logotipo"))
    contenido.append(p(" ", "Body"))
    contenido.append(p("PROPUESTA COMERCIAL", "Kicker"))
    contenido.append(h("Cobra por WhatsApp sin perder el hilo.", "Title"))
    contenido.append(
        p(
            "Margarita opera la API oficial de WhatsApp para cobranza: envía "
            "plantillas, atiende conversaciones y registra en qué quedó cada "
            "cliente. Al día siguiente te dice a quién escribirle o llamarle "
            "primero.",
            "Lead",
        )
    )
    contenido.append(p(" ", "Body"))
    contenido.append(
        table(
            [
                ["Qué es", "Una aplicación web para operar WhatsApp Business (Cloud API) en cobranza."],
                ["Para quién", "Equipos de cobranza de 1 a 15 personas que hoy trabajan con celular y Excel."],
                ["Dónde vive", "En un dominio propio de la empresa, con su base de datos."],
                ["Cómo se usa", "Desde el navegador, en computadora y celular. Sin instalar nada."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )
    contenido.append(p(" ", "Body"))
    contenido.append(p("contacto@margaritaapp.org  ·  55 3878 3682  ·  margaritaapp.org", "Body"))
    contenido.append(page_break())

    # --- Problema y solución -------------------------------------------
    contenido.append(p("EL PROBLEMA", "Kicker"))
    contenido.append(h("La cobranza por WhatsApp se vuelve un rompecabezas", "H1"))
    contenido.append(
        table(
            [
                ["Se pierde el hilo", "La conversación vive en un celular, el acuerdo en una libreta y el reporte en un Excel que nadie actualiza."],
                ["El número se castiga", "WhatsApp normal bloquea o limita los envíos masivos; la API oficial no bloquea, pero la calidad hay que cuidarla."],
                ["No se sabe a quién llamar", "Sin una lista del día se llama a quien uno se acuerda, no a quien pidió llamada o prometió pagar."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )

    contenido.append(h("La solución: un panel que cierra el ciclo", "H1"))
    contenido.append(
        p(
            "Cada conversación termina en un resultado (promesa, convenio, pagado, "
            "sin contestación…). Cada resultado alimenta la lista de trabajo del "
            "día siguiente. No hay que capturar dos veces ni perseguir reportes.",
            "Body",
        )
    )
    contenido.append(
        table(
            [
                ["1. Conversaciones", "Bandeja con ventana de 24 horas, plantillas, archivos, notas internas y respuestas rápidas."],
                ["2. Resultado", "Promesa, convenio, pagado, pago reportado, sin contestación, número inválido o volver a llamar."],
                ["3. Lista del día", "Primero quien pidió llamada (con su cita), luego promesas vencidas y al final los que no contestan."],
                ["4. Reportes", "Gestiones, cumplimiento de promesas, tendencias y CSV para Excel."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )
    contenido.append(page_break())

    # --- Funciones ------------------------------------------------------
    contenido.append(p("QUÉ INCLUYE", "Kicker"))
    contenido.append(h("Todo lo necesario para cobrar, en un solo panel", "H1"))
    contenido.append(
        table(
            [
                ["Bandeja", "Texto y archivos dentro de las 24 horas; plantillas aprobadas cuando la ventana está cerrada."],
                ["Resultados", "Catálogo completo con monto, fecha y nota; historial con quién y cuándo."],
                ["Llamadas", "Quien pide llamada sube al inicio; se agenda fecha y hora y se marca «no contestó» en un clic."],
                ["Campañas", "Contactos o Excel con variables por destinatario; cola, pausa, reanudación y reintento."],
                ["Plantillas", "Sincronización con Meta, aviso de rechazos y bloqueo de las reclasificadas como marketing."],
                ["Botones", "Un toque del deudor registra el resultado solo y puede pausar o dar de baja."],
                ["Tramo y costo", "Mensajes de servicio del mes por número, alerta al 80% y costo estimado."],
                ["Equipo", "Usuarios ilimitados, roles, tope diario de envío y verificación en dos pasos."],
                ["Datos", "Teléfonos, mensajes y correos cifrados; respaldos diarios y bitácora."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )

    contenido.append(h("Lo que no hace (para no prometer de más)", "H2"))
    contenido.append(
        p(
            "No es un CRM ni facturación; no responde solo; no crea plantillas en "
            "Meta; no cobra ni concilia pagos; hoy solo opera números de México; el "
            "consumo de WhatsApp lo cobra Meta directamente a la empresa.",
            "Body",
        )
    )
    contenido.append(page_break())

    # --- Precios --------------------------------------------------------
    contenido.append(p("INVERSIÓN", "Kicker"))
    contenido.append(h("Dos paquetes, un mes de piloto", "H1"))
    contenido.append(
        table(
            [
                ["Paquete A · Llave en mano", "3,500.00 MXN + IVA · instalación, primer mes y conexión con Meta"],
                ["Paquete B · Ya tengo Meta", "2,500.00 MXN + IVA · instalación y primer mes"],
                ["Mensualidad", "699.00 MXN + IVA · mes a mes, usuarios ilimitados"],
                ["Compromiso opcional", "3 meses: 649 · 6 meses: 599 · 12 meses: 549 MXN + IVA al mes"],
                ["Precio de lista", "4,900.00 MXN de instalación y 1,490.00 MXN al mes"],
                ["Piloto", "El primer mes es un piloto pagado: al día 30 decides, sin penalización y con tu respaldo"],
                ["Consumo de Meta", "Aparte: se paga directo a Meta"],
            ],
            ["5.2cm", "11.4cm"],
        )
    )

    contenido.append(h("La instalación incluye", "H2"))
    contenido.append(
        table(
            [
                ["Proyecto y base de datos", "Instalación en un dominio propio de la empresa."],
                ["Usuario administrador", "Alta del equipo con roles y permisos."],
                ["Conexión con Meta", "Alta del número, credenciales y webhook firmado."],
                ["Plantillas iniciales", "Carga y revisión de las plantillas de cobranza."],
                ["Arranque de 2 horas", "Sesión con el equipo: primera campaña y operación del día."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )

    contenido.append(h("Preguntas frecuentes", "H2"))
    contenido.append(
        table(
            [
                ["¿Quién configura Meta?", "En el paquete A lo hacemos nosotros; en el B se cargan tus credenciales."],
                ["¿Cuántos usuarios?", "Los que necesites. No cobramos por agente ni por número."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )
    contenido.append(page_break())

    # --- Arranque y confianza -------------------------------------------
    contenido.append(p("CÓMO ARRANCAMOS", "Kicker"))
    contenido.append(h("Tres pasos y el equipo está operando", "H1"))
    contenido.append(
        table(
            [
                ["1. Conectamos tu WhatsApp", "Cuenta de WhatsApp Business, número registrado y plantillas aprobadas. Si no las tienes, te guiamos."],
                ["2. Subimos tu cartera", "Contactos con etiquetas o directo desde un Excel al crear la campaña."],
                ["3. Trabajamos la lista del día", "Llamadas pedidas, promesas vencidas y clientes sin contestar, en orden de urgencia."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )

    contenido.append(h("Confianza operativa", "H2"))
    contenido.append(
        table(
            [
                ["Cifrado", "Teléfonos, mensajes, notas, montos y correos, con índice ciego para buscar sin exponerlos."],
                ["Acceso", "Sesiones revocables, verificación en dos pasos y bloqueo por intentos fallidos."],
                ["Webhooks", "Cada evento de Meta se valida con firma; nada entra sin comprobación."],
                ["Respaldos", "Copia diaria cifrada y verificada, más descarga manual."],
                ["Bitácora", "Qué pasó y quién lo hizo, con retención de 90 días."],
            ],
            ["5.2cm", "11.4cm"],
        )
    )
    contenido.append(page_break())

    # --- Cierre ---------------------------------------------------------
    contenido.append(frame(SELLO, 2.2, 2.2, "Sello"))
    contenido.append(p("SIENTE LA DIFERENCIA", "Kicker"))
    contenido.append(h("¿Lo vemos con tus datos?", "Title"))
    contenido.append(
        p(
            "Te mostramos la herramienta con una cartera de ejemplo y te decimos "
            "exactamente qué necesitas para arrancar: cuenta de Meta, número, "
            "plantillas y método de pago.",
            "Lead",
        )
    )
    contenido.append(p(" ", "Body"))
    contenido.append(
        table(
            [
                ["WhatsApp", "55 3878 3682"],
                ["Correo", "contacto@margaritaapp.org"],
                ["Sitio", "margaritaapp.org"],
            ],
            ["5.2cm", "11.4cm"],
        )
    )
    contenido.append(p(" ", "Body"))
    contenido.append(
        p(
            "Margarita · Operación de WhatsApp Business Cloud API  ·  "
            "Documento generado el 17 de octubre de 2026",
            "Footer",
        )
    )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document '
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
        'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
        'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
        'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" '
        'office:mimetype="application/vnd.oasis.opendocument.text" '
        'office:version="1.3">'
        "<office:meta>"
        "<dc:title>Margarita - Propuesta comercial</dc:title>"
        "<dc:creator>Margarita</dc:creator>"
        "<dc:subject>Cobranza por WhatsApp con la API oficial de Meta</dc:subject>"
        "<meta:creation-date>2026-10-18</meta:creation-date>"
        "</office:meta>"
        "<office:font-face-decls>"
        '<style:font-face style:name="DejaVu Sans" svg:font-family="\'DejaVu Sans\'"/>'
        "</office:font-face-decls>"
        "<office:styles>"
        '<style:default-style style:family="paragraph">'
        '<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.2cm"/>'
        '<style:text-properties style:font-name="DejaVu Sans" fo:font-size="10.5pt"/>'
        "</style:default-style>"
        "</office:styles>"
        "<office:automatic-styles>"
        '<style:page-layout style:name="pm1">'
        '<style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" '
        'fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.2cm" '
        'fo:margin-right="2.2cm" fo:background-color="#ffffff"/>'
        "</style:page-layout>"
        f"{styles()}"
        "</office:automatic-styles>"
        '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>'
        "<office:body><office:text>"
        f"{''.join(contenido)}"
        "</office:text></office:body>"
        "</office:document>"
    )


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    source = WORK / "propuesta.fodt"
    xml = document()
    source.write_text(xml, encoding="utf-8")

    # Valida el XML antes de abrir LibreOffice: un solo caracter mal deja un
    # error opaco ("source file could not be loaded").
    ElementTree.fromstring(xml)

    subprocess.run(
        [
            "soffice",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(WORK),
            str(source),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    pdf = WORK / "propuesta.pdf"

    if not pdf.exists():
        raise SystemExit("LibreOffice no generó el PDF.")

    destino = OUT / "propuesta-margarita.pdf"
    pdf.replace(destino)

    # Copia pública: el botón «Descargar PDF» de la página la sirve desde ahí.
    publico = ROOT / "src" / "public" / "docs" / "propuesta-margarita.pdf"
    publico.parent.mkdir(parents=True, exist_ok=True)
    publico.write_bytes(destino.read_bytes())

    print(f"PDF: {destino}")


if __name__ == "__main__":
    main()
