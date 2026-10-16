# Alta de un cliente en minutos (plantilla de Railway)

Objetivo: que un cliente nuevo pase de "aceptó la propuesta" a "tiene su panel corriendo" **sin que nadie configure variables a mano**. Se logra con una plantilla de Railway publicada una sola vez, más el asistente `/setup` que ya trae la aplicación.

Publicar la plantilla toma **unos 15 minutos, una sola vez**. Después, cada cliente es: mandarle un enlace → entra → configura su empresa y su admin → captura sus datos de Meta (o se los ponemos nosotros como servicio).

---

## Lo que ya está listo en el repositorio

No hay que configurar nada en el panel de Railway para el build ni el arranque: viene en [`railway.json`](../railway.json).

| Pieza | Qué hace |
| --- | --- |
| `package.json` → `engines` | Declara Node **20.19+/22.12+**: Prisma 7 se niega a instalar en Node 18. Es lo que Nixpacks lee para elegir la versión, junto con `.nvmrc`. |
| `nixpacks.toml` | Instala con `npm install --include=dev` (ver abajo por qué no `npm ci`) y compila con `npm run build`. |
| `preDeployCommand` | `node dist/tools/deploy-migrations.js` — aplica las migraciones antes de levantar la app, resolviendo el caso de una base nueva, una con tablas y una ya versionada. |
| `startCommand` | `npm start` |
| `healthcheckPath` | `/health` — el despliegue se marca sano cuando la base y el worker responden. |
| `restartPolicyType` | `ON_FAILURE` con 10 reintentos: un fallo pasajero no deja la instalación caída. |
| **Sin `APP_URL`** | Si no está definida, la app usa `RAILWAY_PUBLIC_DOMAIN`. Era el error número uno del alta manual (rompía CSRF y la URL del webhook). |
| **Asistente `/setup`** | La raíz `/` redirige ahí mientras la instalación no tenga empresa y administrador. El cliente no tiene que adivinar la ruta. |
| **`.env.example`** | La lista completa de variables, para el camino manual. |

## Publicar la plantilla (una vez)

1. Entra a Railway → **New** → **Template** → *Deploy from GitHub repo* y elige este repositorio.
2. **Agrega PostgreSQL**: en el editor de la plantilla, *Add service* → *Database* → *PostgreSQL*.
3. **Agrega un Volume** al servicio de la app: *Add* → *Volume*, con punto de montaje `/data`.
   Sirve para los adjuntos de los clientes **y** para los respaldos; sin él se pierden en cada deploy.
4. **Variables del servicio de la app** (en el editor de la plantilla, no en el proyecto):

| Variable | Valor | Por qué |
| --- | --- | --- |
| `NIXPACKS_NODE_VERSION` | `22.12.0` | Fija la versión de Node en el build. El repo ya la declara, pero aquí es explícita y no hay sorpresas. |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al plugin; la plantilla la resuelve sola. |
| `NODE_ENV` | `production` | Cookies seguras y menos ruido en los logs. |
| `JWT_SECRET` | `${{secret(64)}}` | Lo genera Railway por instalación. |
| `ENCRYPTION_KEY` | `${{secret(64)}}` | **Llave del cifrado**: genera una distinta por cliente y nunca la reutilices entre instalaciones. |
| `MEDIA_STORAGE_DIR` | `/data/media` | Adjuntos en el Volume. |
| `BACKUP_DIR` | `/data/backups` | Respaldos en el Volume. |
| `APP_NAME` | `Margarita` | Nombre que ve el cliente. |
| `TIMEZONE` | `America/Mexico_City` | Para fechas, topes diarios y reportes. |
| `SUPPORT_WHATSAPP` | tu número con lada | Aparece en la página pública del cliente. |
| `SUPPORT_EMAIL` | tu correo | Contacto comercial. |
| `SETUP_SERVICE_PRICE` | `se cotiza aparte` | Lo que cobras por la conexión con Meta. |
| `INSTALL_PRICE` / `INSTALL_PRICE_PROMO` | `$4,900.00 MXN` / `$2,500.00 MXN` | Precio de lista y de la oferta de instalación. |
| `INSTALL_PROMO_LABEL` | `Oferta de lanzamiento: primeros 3 clientes` | Texto de la oferta. |
| `INSTALL_PROMO_UNTIL` | `2026-12-31` | Se apaga sola al pasar esa fecha. |
| `INSTALL_MONTHLY_PRICE` | `$900.00 MXN` | La mensualidad. |
| `INSTALL_MONTHLY_LIST_PRICE` | `$1,490.00 MXN` | La mensualidad a precio de lista. |

   Marca como **requeridas** solo `DATABASE_URL`, `JWT_SECRET` y `ENCRYPTION_KEY`; el resto ya trae valor por defecto en el código.

   > **`APP_URL` déjala vacía a propósito**: se toma sola del dominio público. Si algún cliente usa dominio propio, la fija después y listo.

5. **Publica la plantilla** (*Publish template*) y copia el enlace: queda como `https://railway.com/new/template/<id>`.
6. Prueba el enlace una vez con una cuenta de Railway de prueba y cronometra: es la prueba de que el alta quedó en minutos.

## Lo que hace el cliente (o hacemos nosotros)

1. Abre el enlace de la plantilla y despliega (2–3 minutos).
2. Al terminar, Railway le da un dominio; al abrirlo, la app lo lleva sola a `/setup`, donde crea **su empresa y su usuario administrador**.
3. Entra con ese usuario y captura sus credenciales de Meta en *Admin → WhatsApp* (o se las capturamos nosotros como parte del servicio de conexión, ver [`guia-meta.md`](guia-meta.md)).
4. Sincroniza plantillas en *Admin → Plantillas* y hace una prueba con 1–3 contactos.

Pasado eso ya opera. Lo que **no** se puede automatizar y hay que decirle: la cuenta de Meta Business con método de pago, el número dedicado y la aprobación de plantillas son de Meta.

## Verificación post-deploy (5 minutos)

| Comprobación | Cómo |
| --- | --- |
| La app está sana | Abrir `/health`: `status healthy` y `checks.database` en true. |
| Migraciones aplicadas | En los logs del deploy: `[migraciones] Listo. La base quedó al día`. |
| Cifrado configurado | `/health` → `checks.encryptionKeyConfigured` en true. |
| La instalación quedó configurada | `/` ya no redirige a `/setup` y el login funciona. |
| Respaldos funcionando | *Admin → Respaldos*: "Al día" y la carpeta `/data/backups`. |
| El webhook responde | En Meta, la verificación del webhook acepta la URL `https://<dominio>/webhooks/meta/whatsapp`. |

### Dos reglas sobre el Build Command del servicio

En Railway, **Settings → Build → Build Command** debe quedar **vacío** (o, si prefieres verlo explícito, `npm run build`). La instalación de dependencias ya está declarada en `nixpacks.toml`, y si ahí se escribe otro `npm ci`, el build lo ejecuta dos veces: el segundo borra `node_modules` mientras el builder lo tiene montado y falla con `EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'`.

Por la misma razón, la instalación del repositorio usa `npm install` y no `npm ci`: `npm ci` borra la carpeta completa antes de reinstalar, y eso es justo lo que choca con el caché del builder. `npm install` reconcilia sin borrar y sigue respetando el lockfile.

## Errores que vimos en el camino

| Síntoma | Causa | Solución |
| --- | --- | --- |
| **`Prisma only supports Node.js versions 20.19+, 22.12+, 24.0+`** | El build arrancó con Node 18 (el instalador de Nixpacks corre antes que cualquier comando de build) | Agrega la variable de servicio `NIXPACKS_NODE_VERSION=22.12.0` y vuelve a desplegar. El repo ya declara `engines` y `.nvmrc`; la variable es el cinturón. |
| **`EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'`** | El Build Command del servicio ejecuta un `npm ci` **además** de la instalación de `nixpacks.toml`: corre dos veces y el segundo borra lo que el primero instaló | Vacía el Build Command del servicio (Settings → Build) y vuelve a desplegar. La instalación ya la hace `nixpacks.toml` con `npm install`. |
| El build falla por TypeScript | Se instaló sin devDependencies (`NODE_ENV=production`) | `nixpacks.toml` ya lo resuelve; si lo tocas, mantén `--include=dev`. |
| El log del build muestra un `npm ci` pelón y nada más | El servicio tiene un **Build Command** propio en el panel que ignora lo del repo | Bórralo (Settings → Build) o ponlo idéntico: `npm ci --include=dev && npm run build`. |
| La app arranca y muere en bucle | Falta `DATABASE_URL` o la referencia al plugin | Revisa las variables del servicio; el error del log ahora lo dice explícitamente. |
| El panel rechaza las acciones (403 de origen) | `APP_URL` apuntando a otro dominio | Déjala vacía (toma el dominio de Railway) o fíjala con el dominio real. |
| El webhook responde 401 | `META_APP_SECRET` mal capturado o de relleno | Recaptúralo en *Admin → WhatsApp*. |
| Se pierden los adjuntos en cada deploy | No hay Volume montado en `/data` | Agrega el Volume y verifica `MEDIA_STORAGE_DIR`. |
| Los datos cifrados no se leen | Se cambió `ENCRYPTION_KEY` | Restaura la llave original; sin ella no hay forma de recuperar el contenido. |

## Costos que conviene tener claros

1. **Railway**: el plan del cliente cubre la app + PostgreSQL + Volume. Es el costo de infraestructura que se traslada a la suscripción.
2. **Meta**: las conversaciones las cobra Meta directo al cliente, aparte de nuestra factura.
3. **El respaldo vive en el mismo Volume**: si el cliente borra el proyecto, se va todo. Conviene descargar un respaldo a un lugar externo de vez en cuando (Admin → Respaldos).
