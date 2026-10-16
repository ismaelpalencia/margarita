# Marca — Margarita

Cómo se ve Margarita y por qué. Es corto a propósito: la marca es un símbolo, un
verde, un amarillo y unas cuantas reglas.

---

## 1. El símbolo

Una **margarita de un solo color**: ocho pétalos redondos, centro sólido y una
carita tallada en hueco. Plana, sin sombras ni degradados, como los símbolos de
Ollama o GitHub.

- El color es el verde de la marca (`#17865a`), en la flor y en el círculo. Nada
  de amarillo en el símbolo: el amarillo queda para destacar precios y
  promociones.
- La carita va recortada de verdad (transparente), no pintada de blanco, así que
  el símbolo funciona igual sobre fondo claro y oscuro.
- A 16 px (la pestaña) lo que se reconoce es la silueta de la flor; la carita se
  aprecia a partir de unos 32 px.

### Las variantes

| Variante | Cómo se ve | Dónde se usa |
| --- | --- | --- |
| `sello-hojas` | Círculo verde con la flor en blanco y **dos hojas** en la base | **Es la de la aplicación** (ícono, favicon, acceso, encabezado) |
| `sello` | Igual, sin las hojas: todo verde y blanco | La versión más limpia, si algún día se necesita |
| `sello-sol` | Sello con el centro de la flor en amarillo | Alternativa con el acento de color |
| `sello-anillo` | Sello con un aro fino por dentro del borde | Alternativa corporativa |
| `flor` | La flor sola, sin caja | El símbolo suelto: encabezados, volantes, presentaciones |
| `hueco` | La flor con el centro vacío (aro) | La más sobria; pierde la carita |

El detalle que se eligió fueron las **dos hojas en la base**, con la nervadura
tallada: dan a entender que es una margarita cortada y no una flor genérica, y
a tamaño de pestaña se funden con la flor (no ensucian). Las hojas se dibujan
después de los pétalos —como son del mismo color, el traslape no se nota— para
que la nervadura no quede tapada.

La hoja para elegir (o confirmar) está en `marketing/logo-opciones.png` y se
regenera con `python3 scripts/generate-logo-options.py`. Cambiar de variante es
una línea:

```bash
python3 scripts/generate-brand.py --variant=flor
```

### Cómo se genera

Todo sale del mismo código, así que el SVG y los PNG no se pueden separar:

```bash
python3 scripts/generate-brand.py
```

El dibujo en sí vive en `scripts/brand_lib.py` (medidas, paleta y tipografía),
así que la imagen de promoción y los archivos de la aplicación comparten la
misma margarita.

Produce:

| Archivo | Para qué |
| --- | --- |
| `src/public/brand/img/margarita-icon.svg` | El símbolo de la aplicación, vectorial |
| `src/public/brand/img/margarita-mark.svg` y `margarita-mark-*.png` | La flor sola, en un color, para fondos claros u oscuros |
| `src/public/brand/img/margarita-icon-{64,128,256,512}.png` | Encabezados del panel, pantalla de acceso, setup |
| `src/public/brand/img/margarita-wordmark-{256,512}.png` | Símbolo + nombre, para los encabezados |
| `src/public/favicon-{16x16,32x32}.png` y `favicon.ico` | Pestaña del navegador |
| `src/public/apple-touch-icon.png` y `android-chrome-*.png` | Al agregarlo a la pantalla de inicio |

Si algún día cambia el dibujo, se cambia **en el script** y se vuelve a correr:
no hay originales que "optimizar" ni versiones sueltas que se queden atrás.

El nombre va en tipografía del sistema (una negrita geométrica) y no en un
logotipo dibujado: en pantalla se lee mejor y no envejece.

### La imagen para mandar por WhatsApp

```bash
python3 scripts/generate-promo.py --whatsapp=5215512345678 --email=hola@ejemplo.mx
```

Deja en `marketing/` dos versiones listas para enviar: la cuadrada
(1080×1080, para el chat) y la vertical (1080×1920, para estados). El precio y
la etiqueta de la promoción se pasan por argumento y por omisión son los mismos
que muestra la página pública, para que la imagen y la web no se contradigan.
Si no se le da contacto, la imagen lo dice en voz alta en lugar de salir sin
forma de contestar.

---

## 2. La paleta

Está definida en un solo lugar (`src/assets/css/input.css`, bloque `@theme`) y
las vistas usan esas clases de Tailwind: `margarita-*` para el verde y `sol-*`
para el amarillo.

| Uso | Token | Valor |
| --- | --- | --- |
| Botones y enlaces de acción | `margarita-600` | `#17865a` |
| Hover de esos botones | `margarita-700` | `#0f6f4a` |
| Texto de marca sobre blanco | `margarita-700` / `margarita-900` | `#0f6f4a` / `#0f4632` |
| Fondos suaves, filas de aviso | `margarita-50` / `margarita-100` | `#eefbf3` / `#d6f5e2` |
| Acentos y promociones | `sol-400` | `#fbbe1f` |
| Texto sobre el amarillo | `margarita-950` | `#062a1e` |

**Reglas de uso**

- El amarillo es para destacar **poco y bien**: el símbolo, una promoción, el
  precio en oferta. Si todo es amarillo, deja de destacar.
- Los colores de estado no son de la marca y no se tocan: rojo para lo vencido,
  ámbar para lo que exige atención, verde para "pagado", azul para lo
  informativo. El gris (`slate`) es la base de la interfaz.
- El verde de la marca está elegido para que el blanco encima se lea
  (4.6:1). Cualquier cambio de tono se revisa contra ese mínimo antes de
  aplicarlo.

---

## 3. Tono

Lo que ya se sigue en toda la aplicación y conviene mantener:

- Español de México, directo, sin tecnicismos ("no contestó" en lugar de
  "sin respuesta del destinatario").
- Se dice lo que **no** hace: los límites van escritos, no escondidos.
- Los avisos explican qué pasó y qué hacer, no solo que algo falló.
- Los estados y los montos se muestran en pesos con dos decimales y fechas en
  formato mexicano (`dd/mm/aaaa`).
