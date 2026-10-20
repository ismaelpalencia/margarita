# Landing (sitio estático)

Esta carpeta es la **página de venta**, separada de la aplicación para poder
subirla a su propio dominio. No se edita a mano: son archivos generados.

```bash
npm run landing:build
```

Se genera desde las mismas plantillas que usa la aplicación
(`src/views/pages/home/*.ejs`), así que la página publicada y la que sirve la app
no pueden decir cosas distintas. Para cambiar un texto o un precio: se edita la
plantilla o la variable de entorno, se corre el comando y se vuelve a subir.

**Qué contiene:** `index.html`, `como-empezar.html`, `aviso-de-privacidad.html`,
`acceso.html`, el CSS, los archivos de marca y los favicons. Todo con rutas
relativas: funciona igual en un dominio propio o dentro de una carpeta.

> Este `README.md` es la explicación de la carpeta. Si subes la carpeta completa
> a un hosting estático, se publica como `/README.md`: no molesta, pero puedes
> quitarlo del paquete antes de subir.

---

La guía completa —dominio de la operación, variables, DNS y comprobaciones—
está en [`../docs/dominios.md`](../docs/dominios.md).

## Maqueta de rediseño 2026

La propuesta visual nueva está en
[`../mockups/landing-2026/`](../mockups/landing-2026/): HTML y CSS puro, sin
JavaScript ni Tailwind. Vive fuera de esta carpeta porque `landing:build` borra
todo lo que no venga de las plantillas; cuando se apruebe, se integra a
`src/views/pages/home/` y al generador.

## Cómo subirlo

Cualquier hosting estático sirve. Dos caminos cómodos:

| Opción | Cómo |
| --- | --- |
| **Cloudflare Pages** | Crear un proyecto, subir esta carpeta (arrastrar o conectar el repositorio y fijar el directorio en `landing`, sin comando de compilación) |
| **Railway** | Un servicio aparte del mismo repositorio, con la raíz del proyecto en `landing` y un servidor estático (`npx serve` o similar). Sin variables de entorno: no hay backend |

No hace falta Node, ni base de datos, ni variables. Es HTML y CSS.

## El reparto de dominios que evita que se rompa

| Dirección | Qué sirve |
| --- | --- |
| `margaritaapp.org` (y `www`) | **Este sitio.** La oferta, la guía de Meta y el aviso de privacidad del producto |
| `palencia.margaritaapp.org` | La instalación de esa operación (la aplicación). Su raíz manda al inicio de sesión |
| `cliente.margaritaapp.org` | Lo mismo, para cada cliente |

### DNS, con una precisión que importa

- **Un CNAME por cliente** (`palencia` → el dominio que Railway le dio a ese
  servicio), con el **proxy de Cloudflare apagado** (nube gris): el panel usa
  conexiones en vivo y el proxy puede interferir.
- El comodín `*.margaritaapp.org` **no** sirve hoy para esto: mandaría a *todos*
  los subdominios al mismo servicio. El comodín tiene sentido cuando se pase a
  multi-inquilino (una sola aplicación que atiende varias instalaciones según el
  host); como la dirección del cliente no cambia, esa migración se puede hacer
  después sin avisarle a nadie.
- En el dominio del producto, un `CNAME` a donde esté publicado este sitio.

### Las cinco reglas que hacen que la separación no rompa nada

1. **El formulario de acceso no vive aquí.** Este sitio no tiene formularios: el
   botón «Iniciar sesión» lleva a `acceso.html`, que explica de dónde se entra
   (cada operación en su subdominio). Eso evita CORS y una excepción de origen,
   que es justo el hueco que hoy protege la sesión.
2. **La cookie de sesión es solo del host**, sin atributo `Domain`: una sesión
   abierta en el espacio de un cliente no puede servir en el de otro. (Ya está
   así en el código.)
3. **Aquí no aparece la app de nadie ni el precio que paga un cliente**: solo la
   oferta pública del producto. Un subdominio de cliente no debe mostrar la
   página de venta.
4. **La raíz de la instalación de un cliente manda al inicio de sesión**, no a
   esta página. Se controla con la variable `PRODUCT_DOMAIN` (dominios donde sí
   vive la oferta, separados por coma). Sin esa variable, la aplicación sirve la
   landing como antes.
5. **El botón «Aviso de privacidad» de las plantillas de WhatsApp apunta al
   aviso de la instalación del cliente** (`https://cliente.margaritaapp.org/aviso-de-privacidad`),
   que es el que corresponde a sus datos. Esta copia es la del producto.

## Después de subirlo, comprobar

1. `https://margaritaapp.org` → se ve esta página, con el CSS y el logo.
2. `https://margaritaapp.org/acceso.html` → explica dónde entrar.
3. `https://palencia.margaritaapp.org` → manda a `/auth/login`, no a la oferta.
4. `https://palencia.margaritaapp.org/aviso-de-privacidad` → responde (ese sí se
   sirve desde la app, porque no es la raíz).
