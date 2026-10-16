# Dominios: la operación y la landing

Cómo conectar el dominio de una operación (`palencia.margaritaapp.org`), dónde
vive la página de venta y qué comprobar después. Está pensado para hacerse una
vez por operación y no volver a tocarlo.

---

## El mapa

| Dirección | Qué sirve | Dónde vive |
| --- | --- | --- |
| `margaritaapp.org` (y `www`) | La oferta, la guía de Meta y el aviso de privacidad del producto | **Cloudflare Pages** (sitio estático, carpeta [`landing/`](../landing/)) |
| `palencia.margaritaapp.org` | La instalación de esa operación. **Su raíz manda al inicio de sesión** | **Railway** (el servicio de esa instalación) |
| `cliente.margaritaapp.org` | Lo mismo, para cada cliente que se sume | Railway, un servicio por cliente |

Sí: en `palencia.margaritaapp.org` **no debe verse nada de la landing** —ni la
oferta ni los precios— porque ahí entra el equipo del cliente, no un prospecto.
Quien llega a la raíz de una operación va directo a `/auth/login`.

---

## Antes de tocar el DNS: las variables del servicio

En el servicio de Railway de la operación, pestaña **Variables**:

| Variable | Valor | Por qué |
| --- | --- | --- |
| `APP_URL` | `https://palencia.margaritaapp.org` (sin barra al final) | Con ella se valida el origen de cada formulario y se firma la sesión. Si queda con el dominio viejo, el acceso funciona pero **cualquier acción con formulario responde 403** |
| `PRODUCT_DOMAIN` | `margaritaapp.org,www.margaritaapp.org` | Marca dónde vive la oferta. En cualquier otro dominio, la raíz manda al inicio de sesión en lugar de mostrar la página de venta |

No hay que tocar `JWT_SECRET`, `ENCRYPTION_KEY` ni las `META_*`: no dependen del
dominio. (Y `ENCRYPTION_KEY` no se cambia nunca: perderla deja ilegibles los
datos cifrados.)

---

## Paso 1 · El dominio en Railway

1. Entrar al servicio → **Settings** → **Networking** → **Custom Domain**.
2. Escribir `palencia.margaritaapp.org` y confirmar.
3. Railway muestra el **valor del CNAME** (algo del tipo
   `algo.up.railway.app`). Ese valor es el que va en Cloudflare.
4. Railway emite el certificado TLS solo, en cuanto el DNS resuelva.

## Paso 2 · El DNS en Cloudflare

En la zona `margaritaapp.org` → **DNS** → *Add record*:

| Campo | Valor |
| --- | --- |
| Type | `CNAME` |
| Name | `palencia` |
| Target | El valor que dio Railway |
| Proxy status | **DNS only (nube gris)** |
| TTL | Auto |

**Por qué la nube gris y no la naranja:** el panel usa conexiones en vivo
(socket.io) y, además, Railway necesita ver el dominio real para emitir su
certificado. Con el proxy por delante hay que habilitar WebSockets y el
certificado queda en modo laxo. Para un panel de operación, gris es lo correcto.

En **SSL/TLS**, el modo recomendado es **Full (strict)**.

**No crees todavía el comodín `*.margaritaapp.org`.** Hoy cada operación es su
propio servicio de Railway, así que el comodín mandaría *todos* los subdominios
al mismo lugar. Ese comodín tiene sentido cuando se pase a multi-inquilino
(una sola aplicación que atiende varias instalaciones según el host); como la
dirección del cliente no cambia, esa migración se puede hacer después sin
avisarle a nadie.

## Paso 3 · Comprobar la operación

```bash
# El DNS ya resuelve
dig +short palencia.margaritaapp.org

# La raíz manda al acceso, no a la oferta
curl -sI https://palencia.margaritaapp.org | grep -i location

# El aviso de privacidad sí se sirve (lo usan los botones de las plantillas)
curl -sI https://palencia.margaritaapp.org/aviso-de-privacidad | head -1
```

En el navegador: la raíz tiene que llevar a la pantalla de acceso, con el
**sello nuevo en la pestaña**. Si la pestaña sigue mostrando el logo anterior, es
caché del navegador (el favicon se guarda durante días): recarga forzada
(`Ctrl+Shift+R`) o borra los datos del sitio. Desde el cambio de hoy, los
archivos de marca y el CSS llevan la versión del despliegue al final de la URL,
así que en el siguiente deploy se refrescan solos.

Dentro del panel: **Admin → Sistema** y `/health` muestran la dirección pública
que la aplicación cree tener (`publicUrl`). Ahí se ve si `APP_URL` quedó bien.

---

## Paso 4 · La landing en Cloudflare Pages

Primero se genera la carpeta:

```bash
npm run landing:build
```

Queda en `landing/`. Y sí: **la carpeta va aparte de la aplicación**. Hay dos
formas de publicarla, y conviene elegir según cada cuánto cambie el texto:

| Opción | Cómo | Cuándo conviene |
| --- | --- | --- |
| **Subida directa** (sin repositorio) | Cloudflare Pages → *Create project* → **Direct Upload** → arrastrar la carpeta `landing` → *Deploy* | Es lo más rápido y no depende de git. Cada cambio de textos o precios: regenerar y volver a arrastrar |
| **Conectado al repositorio** | Pages → *Connect to Git* → elegir el repositorio de Margarita → *Build command* **vacío** → *Build output directory*: `landing` | Si quieres que un `push` republique solo. Requiere **commitear la carpeta `landing/`** en cada cambio de copy |

Luego, en el proyecto: **Custom domains** → agregar `margaritaapp.org` y
`www.margaritaapp.org`. Para el dominio raíz, Pages crea el registro solo.

**No hace falta tocar el DNS a mano** para el dominio del producto: Pages lo
administra.

---

## Lo que rompe cosas (y por eso no se hace)

1. **No mover el formulario de acceso a la landing.** El inicio de sesión vive
   siempre en el dominio de la operación; la landing solo enlaza a
   `acceso.html`, que explica de dónde se entra. Si el formulario estuviera en
   otro dominio harían falta CORS y una excepción de origen: justo el hueco que
   hoy protege la sesión.
2. **No cambiar el dominio sin actualizar `APP_URL`.** Si el dominio cambia y la
   variable se queda atrás, los formularios responden 403 (protección de origen)
   y el socket no conecta.
3. **No usar el proxy naranja en el subdominio de la aplicación**, por las
   conexiones en vivo y por el certificado.
4. **No compartir la cookie de sesión entre subdominios** (nada de atributo
   `Domain` "para que sirva en todos"): sería el camino por el que la sesión de
   un cliente serviría en la instalación de otro.
5. **El botón «Aviso de privacidad» de las plantillas apunta al aviso de la
   operación** (`https://palencia.margaritaapp.org/aviso-de-privacidad`), que es
   el que corresponde a los datos de esa empresa; la copia de la landing es la
   del producto.

---

## Checklist por operación nueva

- [ ] `APP_URL` con el dominio nuevo (https y sin barra final)
- [ ] `PRODUCT_DOMAIN` con los dominios de la oferta
- [ ] Custom domain agregado en Railway y su CNAME en Cloudflare **en gris**
- [ ] `curl -sI https://el-dominio` → 302 a `/auth/login`
- [ ] `/aviso-de-privacidad` responde 200
- [ ] El panel abre, se ve el logo nuevo en la pestaña y `Admin → Sistema` muestra el dominio correcto
- [ ] Volumen de archivos montado (si no, los adjuntos se pierden en cada despliegue)
- [ ] Respaldo automático corriendo y una copia descargada fuera del servidor
