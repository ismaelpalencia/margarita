# Marca — Margarita

Cómo se ve Margarita y por qué. Es corto a propósito: la marca es un símbolo, un
verde, un amarillo y unas cuantas reglas.

---

## 1. El símbolo

Una **margarita con carita feliz** dentro de un cuadrado redondeado verde.

- Ocho pétalos blancos y centro amarillo con dos ojos y una sonrisa.
- El verde dice "WhatsApp corporativo"; el amarillo, que es una herramienta
  amable y no un sistema de cobranza que da miedo.
- El símbolo es **siempre el mismo**: en el menú, en la pestaña del navegador,
  en el ícono del celular y en la pantalla de acceso. Antes había una "M" en un
  lado y otro dibujo en otro, y de ahí venía la sensación de que los logos no
  coincidían.
- A 16 px (la pestaña) lo que se reconoce es el cuadro verde con la flor; la
  carita se aprecia a partir de unos 32 px y es lo que le da personalidad al
  panel.

### Cómo se genera

Todo sale del mismo código, así que el SVG y los PNG no se pueden separar:

```bash
python3 scripts/generate-brand.py
```

Produce:

| Archivo | Para qué |
| --- | --- |
| `src/public/brand/img/margarita-icon.svg` | El vectorial, por si hace falta a otro tamaño (lonas, presentaciones) |
| `src/public/brand/img/margarita-icon-{64,128,256,512}.png` | Encabezados del panel, pantalla de acceso, setup |
| `src/public/brand/img/margarita-wordmark-{256,512}.png` | Símbolo + nombre, para los encabezados |
| `src/public/favicon-{16x16,32x32}.png` y `favicon.ico` | Pestaña del navegador |
| `src/public/apple-touch-icon.png` y `android-chrome-*.png` | Al agregarlo a la pantalla de inicio |

Si algún día cambia el dibujo, se cambia **en el script** y se vuelve a correr:
no hay originales que "optimizar" ni versiones sueltas que se queden atrás.

El nombre va en tipografía del sistema (una negrita geométrica) y no en un
logotipo dibujado: en pantalla se lee mejor y no envejece.

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
