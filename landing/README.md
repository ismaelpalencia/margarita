# Landing (sitio estático)

Esta carpeta es la **página de venta** del producto, separada de la aplicación
para publicarla en su propio dominio (Cloudflare Pages o cualquier hosting
estático).

## Cómo se edita

Las fuentes son las plantillas `.ejs` de esta misma carpeta:

- `index.ejs` → `index.html`
- `ia.ejs` → `ia.html`
- `precios.ejs` → `precios.html`
- `demo.ejs` → `demo.html`
- `onboarding.ejs` → `onboarding.html`
- `guia.ejs` → `guia.html`
- `plantillas.ejs` → `plantillas.html`
- `privacidad.ejs` → `privacidad.html`
- `acceso.ejs` → `acceso.html`

Los parciales `_head.ejs`, `_header.ejs` y `_footer.ejs` se incluyen desde
cada página. El CSS vive en `assets/css/` (`tokens.css` y `site.css`) y las
imágenes en `assets/img/`.

```bash
npm run landing:build
```

El comando renderiza las plantillas a HTML en esta misma carpeta, copia los
assets de marca y los favicons, y **no borra** las plantillas, `assets/` ni el
`README.md`. Los `.html` son generados: no se editan a mano.

Los precios viven en `scripts/build-landing.ts` y la fuente que gobierna es
`docs/alcance-produccion.md`. Si cambian, se actualiza primero ese documento y
luego la constante del build.

## Demo

La página `/demo` es un simulador estático que llama a la API de demo de la
aplicación:

- `DEMO_API_BASE` (build): base de la app que expone `/api/demo/session` y
  `/api/demo/chat`. Por defecto `https://demo.margaritaapp.org`.
- `DEMO_URL` (build): enlace directo a la demo. Por defecto
  `${DEMO_API_BASE}/demo`.

Si la app no está publicada en esa base, la página muestra un aviso con el
enlace directo. Para que el simulador funcione de punta a punta, la app debe
tener `DEMO_ENABLED=true` y permitir el origen del sitio (mismo dominio o CORS).

## Cómo subirlo

**Cloudflare Pages**

1. Crea un proyecto conectado al repositorio.
2. Build command: vacío (o `npm run landing:build` si prefieres generarlo en CI).
3. Output directory: `landing`.
4. Publica.

O por CLI, después de `npm run landing:build`:

```bash
npx wrangler pages deploy landing --project-name margarita
```

**Railway**: un servicio aparte con la raíz en `landing` y un servidor
estático; no necesita variables ni base de datos.

No hay `_headers`, `_redirects`, `wrangler.toml` ni `functions/`: el sitio es
HTML/CSS/JS plano. Cloudflare Pages resuelve las URLs limpias (`/ia` →
`ia.html`) automáticamente.

## Reparto de dominios

| Dirección | Qué sirve |
| --- | --- |
| `margaritaapp.org` | Este sitio (oferta, guías, privacidad) |
| `cliente.margaritaapp.org` | La instalación de cada empresa; su raíz manda al inicio de sesión |

El formulario de acceso no vive aquí: el botón «Iniciar sesión» lleva a
`acceso.html`, que explica de dónde se entra en cada instalación.
