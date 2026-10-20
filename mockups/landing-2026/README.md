# Maqueta de la landing 2026

Prototipo visual de una sola página, hecho con **HTML y CSS puro**. No usa
Tailwind, JavaScript, fuentes externas ni imágenes generadas.

La carpeta `landing/` se regenera con `npm run landing:build` y borra todo lo
que no venga de las plantillas, así que esta maqueta vive aparte para no
desaparecer en el siguiente build.

## Verla

Abre `index.html` directamente en el navegador. También puedes servirla:

```bash
cd mockups/landing-2026
python3 -m http.server 8080
```

Y entrar a `http://localhost:8080`.

## Qué incluye

- Hero con titular, subtítulo, CTA principal y CTA secundario.
- Mockup de chat de WhatsApp y tarjeta de llamadas pedidas, dibujados con CSS.
- Sección de dolor.
- Tres tarjetas de solución.
- Cómo funciona en tres pasos.
- Precios A/B, piloto y mensualidad.
- Sección “Lo que NO es”.
- Preguntas frecuentes con `details` nativo.
- CTA final y footer.
- Diseño mobile-first, menú móvil sin JavaScript y respeto por
  `prefers-reduced-motion`.

## Integración posterior

Para publicarla en `margaritaapp.org`, hay que llevar el HTML a
`src/views/pages/home/index.ejs` (o a una vista nueva) y el CSS a un archivo
estático que copie `scripts/build-landing.ts`. La maqueta no toca el backend ni
los endpoints actuales.

## Nota de copy

Las cifras de la sección de prueba son ilustrativas y están marcadas como tales.
Los precios y enlaces de contacto son los vigentes del producto.

## Dirección de marca

La maqueta conserva el símbolo de la margarita, pero lo lleva a un **sello
circular**: fondo verde profundo, flor blanca, centro amarillo y dos ojos sin
sonrisa. La mirada sigue ahí, a tamaño de encabezado y de pie de página.

La palabra “Margarita” va en una sans geométrica, con tracking cerrado, y el
amarillo de la marca se usa como acento de acción en lugar de naranja. Es el
mismo lenguaje de la landing actual, con una lectura más de producto SaaS.
