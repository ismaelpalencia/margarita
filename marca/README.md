# Logos de Margarita

Los archivos listos para presentaciones, propuestas y redes. Salen de los mismos
que usa la aplicación, así que no hay dos versiones del logo.

Para regenerarlos (por ejemplo, si cambia el símbolo):

```bash
python3 scripts/export-brand-assets.py
```

---

## Qué hay en cada carpeta

### `sello/` — el símbolo en círculo

El sello verde con la flor y la cara. Es la marca de la app: favicon, ícono de
la pestaña, avatar de WhatsApp y de redes.

| Archivo | Para qué |
| --- | --- |
| `margarita-sello-64.png` | Favicon, avatar pequeño |
| `margarita-sello-128.png` | Avatar de WhatsApp, Slack |
| `margarita-sello-256.png` | Presentaciones, esquinas de diapositiva |
| `margarita-sello-512.png` | Alta resolución, portadas |
| `margarita-sello-1024.png` | Portada de diapositiva (ampliado desde 512) |
| `margarita-sello.svg` | Vectorial: escalable sin perder nitidez |

### `flor/` — la flor sola

La flor con la cara, sin el círculo. Sirve sobre fondos claros y, en su versión
blanca, sobre fondos oscuros o fotografías.

| Archivo | Para qué |
| --- | --- |
| `margarita-flor-64/128/256/512.png` | Marca de agua, viñetas, esquinas |
| `margarita-flor-1024.png` | Diapositivas grandes |
| `margarita-flor-blanco-*.png` | Fondos oscuros o de color |
| `margarita-flor.svg` | Vectorial |

### `logotipo/` — símbolo + palabra

Para la portada de una presentación, la firma de una propuesta o el encabezado
de un documento.

| Archivo | Para qué |
| --- | --- |
| `margarita-logotipo-256.png` | Encabezados pequeños |
| `margarita-logotipo-512.png` | Documentos |
| `margarita-logotipo-2048.png` | Portada de diapositiva (16:9) |
| `margarita-logotipo-blanco-*.png` | Fondos oscuros. Ojo: en la versión monocroma el sello queda como un disco blanco, sin la cara |

---

## Cómo usarlo

**Espacio libre.** Deja alrededor del logo, como mínimo, el ancho del pétalo
central de la flor (aproximadamente un cuarto del alto del símbolo). Nada de
texto pegado al borde del círculo.

**Tamaño mínimo.** El sello no baja de **24 px** de alto; el logotipo, de
**120 px** de ancho. Abajo de eso la cara se pierde.

**Fondo.** El sello y el logotipo funcionan sobre blanco y sobre el verde muy
claro de la marca. Sobre fondos oscuros, usa la versión blanca de la flor o el
logotipo blanco.

**No hacer.**

- No estirar ni aplastar: siempre proporcional.
- No cambiarle el color a la flor ni al sello.
- No ponerle sombras, contornos ni degradados.
- No girarlo (la cara queda de cabeza).
- No usar el logotipo a una sola tinta que no sea la versión blanca ya
  preparada.

---

## Colores de la marca

| Uso | Hex |
| --- | --- |
| Verde principal (sello, botones) | `#17865a` |
| Verde oscuro (texto del logotipo) | `#0f4632` |
| Verde claro (fondos suaves) | `#eefbf3` |
| Amarillo del centro (acentos) | `#fbbe1f` |
| Texto principal | `#0f172a` |
| Fondo claro | `#f8fafc` |

En presentaciones conviene una tipografía sans serif (Inter, Source Sans,
Segoe UI) y dejar el logo en la esquina superior izquierda de cada diapositiva,
salvo la portada.
