# Despliegue en Railway

Guía operativa para levantar Margarita en Railway, ya sea una instalación
propia o la de un cliente nuevo.

> **Alta de un cliente nuevo:** usa primero
> [`plantilla-railway.md`](plantilla-railway.md). Publicar la plantilla una vez
> deja el alta en minutos. Esta guía es el camino manual, paso por paso, y sirve
> para entender qué hace la plantilla y para resolver un despliegue que ya
> empezó.

---

## Antes de empezar: ramas

Hoy el repositorio tiene **una sola rama: `main`**. La separación entre
`main` (staging) y `release` (clientes) que describe
[`ramas-y-despliegue.md`](ramas-y-despliegue.md) todavía **no está creada**.

Mientras siga así:

- una instalación nueva se conecta a **`main`**;
- **cada push a `main` actualiza esa instalación**.

Cuando vayas a tener staging y clientes reales al mismo tiempo, crea `release`
y cambia los servicios de los clientes a esa rama antes de seguir usando
`main` para pruebas. Los pasos están en [`ramas-y-despliegue.md`](ramas-y-despliegue.md).

---

## Resumen para una empresa nueva

| Paso | Qué hacer |
| --- | --- |
| 1 | Crear el proyecto en Railway desde el repositorio de GitHub |
| 2 | Agregar el plugin **PostgreSQL** |
| 3 | Agregar un **Volume** montado en `/data` |
| 4 | Capturar las variables mínimas (`DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `NODE_ENV`, `META_APP_SECRET`) |
| 5 | **Dejar vacío el Build Command**; `railway.json` y `nixpacks.toml` hacen el resto |
| 6 | Generar el dominio y, si es dominio propio, fijar `APP_URL` |
| 7 | Abrir el dominio: la app lleva a `/setup` para crear empresa y administrador |
| 8 | En **Admin → WhatsApp**, capturar las credenciales de Meta y registrar el webhook |

No hace falta `prisma db push` ni `npm run db:seed` en este camino.

---

## 1. Lo que ya trae el repositorio

El build y el arranque están versionados. No los copies a mano en el panel:

```json
{
    "$schema": "https://railway.app/railway.schema.json",
    "build": { "builder": "NIXPACKS" },
    "deploy": {
        "startCommand": "npm start",
        "preDeployCommand": "node dist/tools/deploy-migrations.js",
        "healthcheckPath": "/health",
        "healthcheckTimeout": 120,
        "restartPolicyType": "ON_FAILURE",
        "restartPolicyMaxRetries": 10
    }
}
```

`nixpacks.toml` instala y compila:

- `npm install --include=dev --no-audit --no-fund`
- `npm run build`, que ejecuta `prisma generate`, Tailwind, TypeScript y copia
  vistas y assets a `dist/`.

**El Build Command del servicio debe quedar vacío.** Si escribes ahí otro
`npm ci`, la instalación corre dos veces y el segundo intento choca con el
caché del builder:

```text
EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'
```

Si por alguna razón el panel exige un valor, el único aceptable es
`npm run build`; nunca `npm ci`.

---

## 2. Crear el proyecto

1. Railway → **New Project** → **Deploy from GitHub repo**.
2. Elige el repositorio de Margarita.
3. Si el repositorio tiene más de una rama, elige **`main`** mientras no exista
   `release`; si ya existe la separación, elige **`release`** para un cliente.
4. En el mismo proyecto: **Create → Database → Add PostgreSQL**.
5. En el servicio de la app: **Create → Volume**, con punto de montaje `/data`.
6. En Variables, agrega la referencia a la base:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Al escribir `${{`, Railway autocompleta el nombre del servicio de PostgreSQL.
Esa URL interna solo funciona dentro de Railway, que es justo donde corre la
app.

---

## 3. Variables

### 3.1 Las que sí hacen falta para una instalación funcional

| Variable | Valor | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Base de datos |
| `JWT_SECRET` | genera 64 caracteres | Firma las sesiones |
| `ENCRYPTION_KEY` | genera **otra** cadena de 64 caracteres | Cifrado en reposo e índices ciegos |
| `NODE_ENV` | `production` | Cookies seguras y endurecimiento |
| `MEDIA_STORAGE_DIR` | `/data/media` | Adjuntos en el Volume |
| `BACKUP_DIR` | `/data/backups` | Copias de la base en el Volume |
| `META_APP_SECRET` | App Secret de Meta | Valida la firma del webhook; sin él, Meta recibe 401 |

Puedes generar `JWT_SECRET` y `ENCRYPTION_KEY` desde el repositorio:

```bash
npm run secrets:generate
```

`ENCRYPTION_KEY` debe ser **distinta por instalación** y no se cambia después:
es la llave de los datos cifrados y de los índices de búsqueda.

### 3.2 `APP_URL`: cuándo ponerla

| Situación | Qué hacer |
| --- | --- |
| Dominio que da Railway (`algo.up.railway.app`) | Puedes dejarla vacía: la app usa `RAILWAY_PUBLIC_DOMAIN` |
| Dominio propio (`palencia.margaritaapp.org`) | **Obligatoria**, con el dominio exacto y `https://` |

Si usas dominio propio y dejas `APP_URL` vacía, la app creerá que vive en el
dominio de Railway. El login puede entrar, pero las acciones del panel fallan
con **403 por origen** y el webhook queda con la URL equivocada.

### 3.3 `PORT`: no la definas

Railway inyecta `PORT` y la app escucha en ese puerto. Si la defines a mano,
debes asegurarte de que el dominio apunte exactamente a ese mismo puerto.
Lo normal es **no tocarla**.

### 3.4 Opcionales que conviene conocer

| Variable | Default | Para qué |
| --- | --- | --- |
| `APP_NAME` | `Margarita` | Nombre visible |
| `TIMEZONE` | `America/Mexico_City` | Fechas, reportes y topes diarios |
| `HEALTH_TOKEN` | vacío | Si se define, el detalle de `/health` exige `?token=` |
| `SESSION_IDLE_MINUTES` | `720` | Cierre por inactividad |
| `SESSION_MAX_ACTIVE` | `3` | Dispositivos por usuario |
| `LOGIN_MAX_ATTEMPTS` | `5` | Intentos antes de bloquear la cuenta |
| `LOGIN_LOCK_MINUTES` | `15` | Duración del bloqueo |
| `LOG_RETENTION_DAYS` | `90` | Retención de bitácora |
| `WEBHOOK_EVENT_RETENTION_DAYS` | `30` | Retención de eventos resueltos |
| `OPT_OUT_KEYWORDS` | `STOP` | Palabras que dan de baja |
| `OUTCOME_NO_ANSWER_ATTEMPTS` | `3` | Intentos para “sin contestación” |
| `ALERT_WEBHOOK_URL` | vacío | Slack/Discord/Google Chat para errores |
| `SUPPORT_WHATSAPP` | el del producto | Número comercial |
| `SUPPORT_EMAIL` | el del producto | Correo comercial |

### 3.5 R2 (opcional)

Si quieres respaldos y adjuntos fuera del Volume:

| Variable | Valor |
| --- | --- |
| `R2_ACCOUNT_ID` | Cuenta de Cloudflare |
| `R2_BUCKET` | `margarita-<slug-del-cliente>` (un bucket privado por instalación) |
| `R2_ACCESS_KEY_ID` | Llave con permiso *Object Read & Write* |
| `R2_SECRET_ACCESS_KEY` | Secreto de esa llave |

El bucket debe ser privado. La app sube los respaldos cifrados a `backups/` y
copia los adjuntos a `media/`. El Volume sigue siendo necesario como caché
local y para el respaldo que se crea antes de subirlo.

**No reutilices el bucket de tu despacho para un cliente.** Los nombres de los
respaldos no incluyen el workspace, así que dos instalaciones en el mismo bucket
pueden pisarse. Crea `margarita-<slug-del-cliente>` y un token de R2 limitado a
ese bucket.

### 3.6 Variables que solo usa el seed

Estas **no** hacen falta si usas el asistente `/setup` y Admin → WhatsApp:

- `WORKSPACE_NAME`, `WORKSPACE_SLUG`
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `META_API_VERSION`
- `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_BUSINESS_ACCOUNT_ID`
- `META_VERIFY_TOKEN`, `META_PHONE_NUMBER`

El seed es el camino de automatización o de reinstalación; se explica abajo.
`META_APP_SECRET`, en cambio, **no** se captura en el panel: va siempre en las
variables del servicio.

---

## 4. Configuración del servicio

En **Settings** del servicio de la app:

| Campo | Valor |
| --- | --- |
| Build Command | **vacío** (o `npm run build` si el panel no acepta vacío) |
| Start Command | `npm start` |
| Pre-deploy Command | Ya viene en `railway.json`: `node dist/tools/deploy-migrations.js` |
| Healthcheck Path | `/health` |
| Healthcheck Timeout | `120` |

No agregues `npm install` ni `npm ci` al Build Command: la instalación ya la
hace Nixpacks desde `nixpacks.toml`.

### Dominio

1. **Networking → Generate Domain**.
2. Abre el dominio y comprueba que responde.
3. Si vas a usar un dominio propio, agrégalo en **Custom Domain** y fija
   `APP_URL` con ese dominio exacto, sin slash final.
4. Si usas el dominio de Railway, puedes dejar `APP_URL` vacía.

El paso de DNS, certificado y proxy de Cloudflare está en
[`dominios.md`](dominios.md).

La URL del webhook que vas a registrar en Meta es:

```text
https://<tu-dominio>/webhooks/meta/whatsapp
```

---

## 5. Primer arranque

El **Pre-deploy Command** aplica las migraciones antes de levantar la app. Es
idempotente: en una base nueva crea todo; en una que ya tenía tablas sin
historial marca la migración inicial y continúa; en una ya versionada solo
aplica lo pendiente.

En los logs debes ver:

```text
[migraciones] Listo. La base quedó al día; el worker de webhooks se reactiva solo.
```

Después:

1. Abre el dominio.
2. Si la instalación está vacía, la app lleva a **`/setup`**.
3. Crea la empresa y el usuario administrador ahí.
4. El asistente se cierra solo cuando existe el workspace y el administrador.

### El seed: solo para automatización o reinstalación

El seed crea workspace, admin, configuración y cuenta de WhatsApp a partir de
diez variables. Se ejecuta dentro del servicio:

```bash
node dist/tools/seed.js
```

Es idempotente pero **actualiza**: vuelve a escribir la contraseña del admin y
sobrescribe la cuenta de WhatsApp. No lo corras en una instalación que ya está
operando salvo que quieras restablecer esos datos.

### Lo que no se hace en producción

No uses `prisma db push` ni `npm run db:push` en una instalación real. No deja
historial de migraciones y el siguiente deploy puede detectar drift. El camino
correcto es una migración versionada en `prisma/migrations`.

---

## 6. Conectar Meta

### 6.1 Credenciales de la cuenta

Entra a **Admin → WhatsApp** y captura:

- Business Account ID (WABA)
- token permanente
- verify token
- versión de la API
- número y Phone Number ID

Usa **Probar conexión**. Debe traer el nombre verificado del número y dejar el
estado en `CONNECTED`.

### 6.2 App Secret

`META_APP_SECRET` va en las **variables de Railway**, no en el panel. Sin esa
variable, en producción el webhook responde `401` y no entra ningún mensaje.

### 6.3 Webhook

En Meta: **WhatsApp → Configuración → Webhooks**.

- URL: `https://<tu-dominio>/webhooks/meta/whatsapp`
- Verify token: el mismo que capturaste en Admin → WhatsApp
- Campos: `messages` y, si el panel de Meta lo permite, los avisos de estado de
  plantillas y calidad del número.

Meta hará un `GET` de verificación. Si el token coincide, la suscripción queda
activa. Para probar en local usa un túnel HTTPS (ngrok o Cloudflare Tunnel) y
apunta el webhook a esa URL temporal.

---

## 7. Verificación después del deploy

1. **`/health` responde `200`.**
   En producción, sin `HEALTH_TOKEN`, solo verás `{ok, status, timestamp}`.
   Para el detalle:

   ```text
   https://<tu-dominio>/health?token=<HEALTH_TOKEN>
   ```

   Si no definiste `HEALTH_TOKEN`, el detalle no se publica en producción.

2. **`/setup` ya no aparece** y el login entra con el administrador que creaste.
3. **Admin → WhatsApp → Probar conexión** funciona.
4. **Admin → Plantillas → Sincronizar** trae las plantillas de Meta.
5. Envía un mensaje desde tu celular al número de negocio: debe aparecer en
   Conversaciones y actualizarse en vivo.
6. **Admin → Logs** debe mostrar `WEBHOOK_INCOMING_MESSAGE_SAVED`.
   Si aparece `WEBHOOK_SIGNATURE_INVALID`, el `META_APP_SECRET` no coincide.
7. **Admin → Sistema** debe mostrar cifrado activo, respaldos recientes y, si
   configuraste R2, el resumen del bucket.
8. Crea un respaldo manual y compruébalo en **Admin → Respaldos**.

---

## 8. Volume, respaldos y restauración

### Volume

Sin Volume, los adjuntos y las copias locales se pierden en cada deploy. Crea
uno montado en `/data` y deja:

```bash
MEDIA_STORAGE_DIR=/data/media
BACKUP_DIR=/data/backups
```

El **nombre** del Volume en Railway es libre (`margarita`, `margarita-data`,
etc.); lo que importa es el **Mount Path**. La combinación recomendada es:

| Volume | Mount Path | `MEDIA_STORAGE_DIR` | `BACKUP_DIR` |
| --- | --- | --- | --- |
| `margarita` | `/data` | `/data/media` | `/data/backups` |
| `margarita` | `/media` | `/media` | `/media/backups` |

No mezcles las dos columnas: si el Volume está montado en `/media` pero
`MEDIA_STORAGE_DIR` sigue en `/data/media`, el setup va a decir que la carpeta
no existe o que no es persistente. La app crea `/data/media` al arrancar cuando
`/data` ya es el punto de montaje, pero no puede convertir en Volume una carpeta
que vive en el contenedor.

### Respaldos

Cada 24 horas se crea una copia completa, comprimida y cifrada, se verifica al
crearse y se conservan las últimas 7. La copia local queda en `BACKUP_DIR`.

Si R2 está configurado, la misma copia se sube cifrada a `backups/` del bucket
y los adjuntos se copian a `media/`. Admin → Sistema muestra el estado de R2.

### Restaurar

Descarga el archivo desde **Admin → Respaldos** y valida primero:

```bash
DATABASE_URL="<URL_PUBLICA>" npm run db:restore -- --file=/ruta/margarita-2026-10-15-0300.mgb --dry-run
```

Si la simulación lo lee bien, restaura:

```bash
DATABASE_URL="<URL_PUBLICA>" npm run db:restore -- --file=/ruta/margarita-2026-10-15-0300.mgb --yes
```

La restauración **borra** los datos actuales y los reemplaza por los del
respaldo. Necesita la misma `ENCRYPTION_KEY` con la que se creó. El respaldo
cubre la base, no los adjuntos; esos viven en el Volume y, si está configurado,
en R2.

---

## 9. Errores comunes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `Prisma only supports Node.js versions 20.19+, 22.12+, 24.0+` | El build arrancó con Node 18 | Agrega `NIXPACKS_NODE_VERSION=22.12.0` y redeploya |
| `EBUSY: ... node_modules/.cache` | Hay un Build Command con `npm ci` además de Nixpacks | Vacía el Build Command; nunca pongas `npm ci` ahí |
| `tsc: not found` o `tailwindcss: not found` | Se instaló sin devDependencies | No sobrescribas la instalación de `nixpacks.toml`; mantén `--include=dev` |
| `DATABASE_URL no está definido` | Falta la variable o la referencia al plugin | Revisa Variables y que el servicio Postgres se llame igual que la referencia |
| 403 “el origen no coincide” | `APP_URL` no es el dominio desde el que abres la app | Corrige `APP_URL`; en dominio propio no la dejes vacía |
| El webhook responde 401 | `META_APP_SECRET` falta o no coincide | Captúralo de nuevo en Variables de Railway |
| `relation "public.WebhookEvent" does not exist` | La base no tiene migraciones aplicadas | Revisa el Pre-deploy Command y los logs; no uses `db push` |
| Salud `503` | La base no responde o no se puede leer la cola | Revisa Postgres, `DATABASE_URL` y migraciones |
| El login no reconoce al admin | No se creó el workspace/admin | Abre `/setup` o corre el seed con sus diez variables |
| Se pierden los adjuntos | No hay Volume | Monta `/data` y configura `MEDIA_STORAGE_DIR` |
| No se pueden leer los datos cifrados | Cambió `ENCRYPTION_KEY` | Restaura la llave original; sin ella no hay recuperación |

---

## 10. Ramas y actualizaciones

Con la situación actual —solo `main`— cada push a `main` redespliega la
instalación del cliente. Eso es aceptable mientras estés probando, pero no
cuando tengas staging y clientes reales.

Para separarlo:

1. Crea la rama `release` desde el commit que ya está probado.
2. Conecta los servicios de clientes a `release`.
3. Deja `main` solo para staging.

El detalle y la reversión están en [`ramas-y-despliegue.md`](ramas-y-despliegue.md).

---

## 11. Comandos útiles

```bash
# Verificación local antes de publicar
npm run typecheck:all
npm test
npm run build

# Ver el estado de migraciones (sin modificar nada)
npx prisma migrate status

# Crear un respaldo ahora
npm run db:backup

# Restaurar (primero en seco)
npm run db:restore -- --file=/ruta/al/respaldo.mgb --dry-run
```

Para revisar logs y variables del servicio:

```bash
railway logs
```

Las variables se revisan en **Railway → servicio → Variables**, no en la
terminal: así no quedan los secretos en el historial del shell.

Si el despliegue falla, revisa primero **Deploy Logs** y luego **Admin →
Sistema** cuando la app ya esté arriba.
