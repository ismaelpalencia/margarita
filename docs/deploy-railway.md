# Despliegue en Railway

Guía operativa para subir Margarita (WhatsApp Business Cloud API) a Railway sin sorpresas.

> **¿Es un cliente nuevo?** Para eso está [`plantilla-railway.md`](plantilla-railway.md): publicar la plantilla una vez y después cada alta son minutos, sin configurar variables a mano. Esta guía es el camino manual (útil para tu propio entorno o si prefieres controlar cada paso).

## Resumen en 6 pasos

1. Crear el proyecto en Railway y agregar el plugin PostgreSQL.
2. Conectar el repo de GitHub al servicio de la app.
3. Configurar las variables de entorno (incluida `META_APP_SECRET`).
4. Ajustar Build Command, Start Command, healthcheck y dominio.
5. Crear el esquema en la base (`prisma db push`) y correr el seed una vez.
6. Registrar el webhook en Meta y verificar de punta a punta.

---

## 1. Datos clave del proyecto

Ya vienen configurados en [`railway.json`](../railway.json), así que en una instalación nueva no hay que capturarlos a mano:

| Concepto | Valor |
| --- | --- |
| Node | **22** (`engines` en `package.json` y `.nvmrc`). Prisma 7 no instala en Node 18 |
| Build command | `npm ci --include=dev && npm run build` (ya en [`nixpacks.toml`](../nixpacks.toml)) |
| Start command | `npm start` (ejecuta `node dist/server.js`) |
| Healthcheck | `/health` |
| Puerto | `3000` (defínelo con la variable `PORT`) |
| Node | 22 (Prisma 7 no soporta versiones anteriores a 20.19) |
| Si el build usa Node 18 | Agrega la variable `NIXPACKS_NODE_VERSION=22.12.0` al servicio y vuelve a desplegar |
| Base de datos | PostgreSQL (plugin de Railway) |
| Webhook | `https://<tu-dominio>/webhooks/meta/whatsapp` |

El build hace cuatro cosas: `prisma generate`, compila Tailwind, compila TypeScript a `dist/` y copia vistas y assets a `dist/`.

---

## 2. Crear el proyecto

1. En Railway: New Project → Deploy from GitHub repo, y elige el repositorio de Margarita.
2. Dentro del mismo proyecto: Create → Database → Add PostgreSQL.
3. Abre el servicio de la app, pestaña Variables, y crea la referencia a la base:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Al escribir `${{` Railway te autocompleta el nombre del servicio de Postgres. Esa URL interna solo funciona dentro de Railway, que es justo donde corre la app.

Nota: no hace falta `Dockerfile`; Railway detecta Node con Nixpacks. La versión ya viene fijada en `package.json` (`engines`) y en `.nvmrc`, y las devDependencies se instalan desde `nixpacks.toml`. Si un despliegue arrancara con Node 18 (el error dice `Prisma only supports Node.js versions 20.19+, 22.12+, 24.0+`), agrega la variable de servicio `NIXPACKS_NODE_VERSION=22.12.0`: es el cinturón que no depende del repositorio.

---

## 3. Variables de entorno

Pega esto en Variables del servicio de la app. Las referencias `${{...}}` apuntan a otros servicios.

Para los valores aleatorios (`ENCRYPTION_KEY`, `JWT_SECRET`, `META_VERIFY_TOKEN` y la contraseña del admin) hay un generador en el propio repo:

```bash
npm run secrets:generate                 # los muestra
npm run secrets:generate -- --write-env  # además los agrega a tu .env, sin sobrescribir lo existente
```

Genera los cuatro de una vez y explica para qué sirve cada uno. Copia esos valores aquí en Variables.

| Variable | Valor | Notas |
| --- | --- | --- |
| `APP_NAME` | `Margarita` | |
| `APP_URL` | `https://<tu-dominio>.up.railway.app` | Crítico, ver avisos abajo |
| `PORT` | `3000` | Debe coincidir con el puerto del dominio |
| `NODE_ENV` | `production` | Activa cookies seguras y endurece el webhook |
| `TIMEZONE` | `America/Mexico_City` | |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al plugin |
| `JWT_SECRET` | generador del repo | Firma las cookies de sesión |
| `JWT_EXPIRES_IN` | `7d` | |
| `COOKIE_NAME` | `margarita_token` | |
| `WORKSPACE_NAME` | tu marca | Solo lo usa el seed |
| `WORKSPACE_SLUG` | slug sin espacios | Solo lo usa el seed |
| `ADMIN_NAME` | tu nombre | Solo lo usa el seed |
| `ADMIN_EMAIL` | tu correo | Solo lo usa el seed |
| `ADMIN_PASSWORD` | contraseña fuerte | Solo lo usa el seed |
| `META_API_VERSION` | `v23.0` | |
| `META_APP_SECRET` | Clave secreta de la app de Meta | Obligatoria en producción |
| `META_ACCESS_TOKEN` | token permanente | |
| `META_PHONE_NUMBER_ID` | ID del número | |
| `META_BUSINESS_ACCOUNT_ID` | ID de la WABA | |
| `META_VERIFY_TOKEN` | cadena que tú inventas | Debe ser idéntica a la de Meta |
| `META_PHONE_NUMBER` | número con lada, sin signo + | |
| `ENCRYPTION_KEY` | generador del repo (`npm run secrets:generate`) | Llave del cifrado en reposo: teléfonos, mensajes, notas, bitácora y tokens de Meta |
| `OPT_OUT_KEYWORDS` | `STOP` | Palabras que dan de baja a un contacto al escribirlas (separadas por coma) |
| `OUTCOME_NO_ANSWER_ATTEMPTS` | `3` | Intentos sin respuesta que llevan a un cliente a "sin contestación" en los reportes |
| `SESSION_IDLE_MINUTES` | `720` | Minutos de inactividad antes de cerrar la sesión sola |
| `SESSION_MAX_ACTIVE` | `3` | Dispositivos con sesión abierta por usuario |
| `SUPPORT_WHATSAPP` | — | Número comercial que aparece en la página pública (`https://wa.me/…`) |
| `SUPPORT_EMAIL` | — | Correo comercial de contacto |
| `SETUP_SERVICE_PRICE` | — | Precio del servicio de conexión con Meta que se muestra en la página pública |
| `BACKUP_ENABLED` | `true` | Respaldo automático de la base encendido o apagado |
| `BACKUP_INTERVAL_HOURS` | `24` | Cada cuánto se guarda una copia completa |
| `BACKUP_KEEP` | `7` | Cuántas copias se conservan (las más recientes) |
| `BACKUP_DIR` | `<MEDIA_STORAGE_DIR>/../backups` | Carpeta de las copias (**debe apuntar a un Volume**) |
| `BACKUP_MAX_AGE_HOURS` | `36` | A partir de esta edad, `/health` marca el respaldo como viejo |
| `LOGIN_MAX_ATTEMPTS` | `5` | Intentos fallidos antes de bloquear |
| `LOGIN_LOCK_MINUTES` | `15` | Duración del bloqueo |
| `LOG_RETENTION_DAYS` | `90` | Días que se conserva la bitácora |
| `WEBHOOK_EVENT_RETENTION_DAYS` | `30` | Días que se conservan los eventos resueltos |
| `WEBHOOK_QUEUE_ENABLED` | `true` | Procesa los webhooks por cola |
| `WEBHOOK_WORKER_INTERVAL_MS` | `2000` | Frecuencia del worker |
| `WEBHOOK_MAX_ATTEMPTS` | `5` | Reintentos antes de marcar `FAILED` |
| `WEBHOOK_SCHEMA_PAUSE_MS` | `300000` | Pausa del worker si faltan migraciones |
| `ALERT_WEBHOOK_URL` | *(opcional)* | Slack/Discord/Google Chat para avisos de error |
| `ALERT_COOLDOWN_MINUTES` | `10` | Enfriamiento entre avisos repetidos |
| `MEDIA_STORAGE_DIR` | `/data/media` | Carpeta de los archivos que envían los clientes (el Volume) |
| `MEDIA_MAX_BYTES` | `26214400` | Tamaño máximo que se descarga de Meta (25 MB) |
| `CAMPAIGN_WORKER_INTERVAL_MS` | `5000` | Cada cuánto revisa el worker de campañas |
| `CAMPAIGN_BATCH_SIZE` | `10` | Destinatarios por vuelta del worker |
| `CAMPAIGN_SEND_INTERVAL_MS` | `700` | Pausa entre envíos, para cuidar los límites de Meta |

### Dos avisos que cuestan una tarde de depuración

`APP_URL` tiene que ser el dominio público con HTTPS. De ahí salen el origen permitido de CORS y el CORS del socket.io. Si se queda en `http://localhost:3000`, las actualizaciones en vivo de la bandeja no conectan y el login puede fallar por la cookie segura.

Railway muestra el dominio sin esquema (`mi-app.up.railway.app`). La variable debe incluir `https://` completo. Si falta, la app lo detecta y lo agrega sola (avisando en los logs) para no dejar la validación de origen desactivada, pero lo correcto es capturarla bien desde el inicio.

Si al entrar al panel aparece **403 "Solicitud bloqueada: el origen no coincide con la aplicación"**, significa que la URL desde la que abres la app no es la que está en `APP_URL`. Compara la barra de direcciones con el campo `publicUrl` de `/health`; deben ser idénticas. Desde la versión actual del código, una diferencia de esquema (`http` contra `https`) ya no bloquea, porque el dominio es el mismo y un ataque CSRF siempre viene de otro dominio. El mensaje de error ahora también muestra ambas URLs para que la corrección sea evidente.

Si el mensaje dice que la petición llegó desde `null`, no es un problema de configuración: significa que el navegador envió `Origin: null`, algo que ocurre con orígenes opacos (una página dentro de un iframe con sandbox, un archivo local, o una redirección entre dominios). La app lo permite y lo registra en los logs, pero vale la pena entender el motivo: suele ser una extensión de privacidad, un navegador integrado o un enlace que redirige. Probar en una ventana privada o con las extensiones desactivadas lo confirma.

`NODE_ENV=production` rompe el build si no incluyes las devDependencies. Tailwind, TypeScript y el CLI de Prisma viven en `devDependencies`, y con `NODE_ENV=production` un `npm ci` normal no las instala. Por eso el Build Command lleva `--include=dev`. Si ves errores tipo `tsc: not found` o `tailwindcss: not found` durante el deploy, es exactamente esto.

---

## 4. Build, start, healthcheck y dominio

En el servicio de la app, entra a Settings:

Build:

- Build Command: `npm ci --include=dev && npm run build`

El build **no necesita `DATABASE_URL`**: `prisma generate` no se conecta a la base y `prisma.config.ts` usa un valor de relleno cuando la variable no está definida. Por eso puedes crear el servicio primero y configurar la base después sin que el build falle.

El `--include=dev` del comando es una precaución: Tailwind, TypeScript y el CLI de Prisma viven en `devDependencies`, y con `NODE_ENV=production` un `npm ci` normal podría omitirlas. Si el build falla con `tsc: not found` o `tailwindcss: not found`, es exactamente esto.

Deploy:

- Start Command: `npm start`
- Healthcheck Path: `/health`

Networking:

- Generate Domain y verifica que apunte al puerto `3000`.
- Copia el dominio generado y actualiza `APP_URL` (sin slash final).

Con `NODE_ENV=production` el logger usa pino en modo JSON a stdout: todo aparece en Deploy Logs del servicio.

### Opcional: configuración versionada

Si prefieres que la configuración viaje en el repositorio en lugar de vivir en el dashboard, crea un `railway.json` en la raíz con esto y Railway lo toma automáticamente:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "buildCommand": "npm ci --include=dev && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## 5. Base de datos: esquema y seed

El proyecto usa migraciones versionadas en `prisma/migrations`, con una migración inicial y una de endurecimiento.

### Camino recomendado: dentro de Railway, sin URL pública

No hace falta exponer la base ni copiar credenciales. El script `deploy-migrations` detecta por sí solo el estado de la base y hace lo correcto en cada caso: si es nueva aplica todo el esquema, y si ya existía sin historial de migraciones marca la inicial como aplicada antes de desplegar la nueva.

En el servicio de la app: Settings → Deploy → **Pre-deploy Command**:

```bash
node dist/tools/deploy-migrations.js
```

Corre dentro del contenedor con la `DATABASE_URL` interna, antes de que arranque el servicio, y es idempotente: si no hay nada pendiente, no hace nada. Con esto configurado, este tipo de fallo no vuelve a ocurrir.

También puedes ejecutarlo a mano desde una terminal del servicio (por ejemplo con `railway ssh`) si solo quieres aplicarlo una vez.

### El alta de la instalación

En un despliegue nuevo, las migraciones crean las tablas pero no los datos. **Abre el dominio en el navegador**: si la instalación está vacía, la app lleva al asistente de alta (`/setup`), donde se crea la empresa y el usuario administrador. Después, en Admin → WhatsApp, se capturan las credenciales de Meta y el primer número.

El asistente se cierra solo: en cuanto existe un workspace, `/setup` redirige al login.

### El seed (alternativa)

El seed sigue disponible para **reinstalar o reconfigurar** una instalación existente, y crea lo mismo que el asistente más la cuenta de WhatsApp a partir de las variables de entorno. Sin él ni el asistente, la tabla `User` está vacía y el login responde siempre "Credenciales incorrectas", porque el usuario no existe. Las credenciales del panel son `ADMIN_EMAIL` y `ADMIN_PASSWORD`; las de PostgreSQL no sirven para entrar.

Lo más cómodo es correrlo dentro de Railway, desde una terminal del servicio de la app (no necesita URL pública ni `tsx`):

```bash
node dist/tools/seed.js
```

Si falta alguna de las diez variables que necesita, el script lo dice en una sola línea y no toca la base. Y si prefieres hacerlo desde tu máquina, con una URL pública:

```bash
DATABASE_URL="<URL_PUBLICA>" npm run db:seed
```

Ojo: es idempotente pero *actualiza*. Volver a correrlo reescribe la contraseña del admin con `ADMIN_PASSWORD` y sobrescribe los datos de `WhatsAppAccount`. Úsalo una vez, o para restablecer la contraseña del admin.

### Cómo obtener una URL pública hoy

El template actual de Postgres ya **no** publica `DATABASE_PUBLIC_URL`. Tienes dos formas de conseguir la cadena pública:

1. Servicio Postgres → pestaña **Connect** → copia la cadena de la red pública.
2. Habilita el **TCP Proxy** en Settings → Networking y arma la URL con las variables que aparecen entonces:

```bash
postgresql://postgres:<PGPASSWORD>@<RAILWAY_TCP_PROXY_DOMAIN>:<RAILWAY_TCP_PROXY_PORT>/railway
```

Si no necesitas conectar desde tu máquina, quédate con el camino del Pre-deploy y evita exponer la base.

### Aplicar migraciones a mano (alternativa)

Con una URL pública, los comandos equivalentes son:

```bash
# base que ya tenía tablas pero sin historial de migraciones
DATABASE_URL="<URL_PUBLICA>" npx prisma migrate resolve --applied 20261009000000_init

# base nueva o ya baselinada
DATABASE_URL="<URL_PUBLICA>" npx prisma migrate deploy
```

### Migraciones en cada deploy

El Pre-deploy Command ya cubre esto con `node dist/tools/deploy-migrations.js`. Si prefieres el comando crudo de Prisma, usa `npx prisma migrate deploy`, sabiendo que falla si la base tiene tablas pero no historial de migraciones (para ese caso existe el script).

Para ver el estado sin modificar nada: `npx prisma migrate status`.

Cuando quieras cambiar el esquema, hazlo en local con `npx prisma migrate dev --name descripcion` y sube la carpeta generada. Evita `db push` en producción: no deja historial y el siguiente `migrate deploy` puede detectar drift.

### Cifrado en reposo y datos que ya existían

La migración del cifrado (`20261012000000_cifrado_campos`) se aplica sola con el Pre-deploy Command: agrega `Contact.phoneHash` y marca los contactos existentes con un valor temporal. Al arrancar, la aplicación recalcula el índice real de cada uno antes de empezar a atender webhooks, así que no hay que hacer nada a mano; en la bitácora del servicio aparece cuántos contactos se actualizaron.

Después de eso, los datos nuevos ya se guardan cifrados. Lo que venía de antes sigue en claro hasta que se ejecute el cifrado del histórico.

### Cifrar los datos existentes

Si la base ya tenía datos en texto plano antes de configurar `ENCRYPTION_KEY`, cífralos una vez:

- **Todo lo que quedó en claro** (teléfonos, mensajes, notas, payloads de Meta, eventos de webhook, bitácora, destinatarios de campaña y números de la WABA, además de los tokens): `npm run db:encrypt-data`. Es idempotente, se puede correr con la app en línea y solo actúa sobre lo que sigue en claro.
- **Solo los tokens de Meta**, desde el panel: **Admin → WhatsApp → Cifrar credenciales existentes**.

Admin → Sistema muestra una tarjeta de **Cifrado en reposo** con cuántos registros quedaron en claro: cuando marca 0, ya no queda nada pendiente.

`ENCRYPTION_KEY` debe quedarse quieta: es la llave de todo lo cifrado. Si la cambias o la pierdes, los teléfonos, los mensajes, las notas y la bitácora dejan de poder leerse, además de los tokens. Guárdala fuera de Railway (gestor de contraseñas) y tenla a mano si vas a restaurar un respaldo.

Con una URL pública también puedes hacerlo desde tu máquina:

```bash
DATABASE_URL="<URL_PUBLICA>" npm run db:encrypt-data
```

Si lo vas a correr dentro del contenedor de Railway (donde no hay devDependencies), usa la versión compilada:

```bash
npm run db:encrypt-data:dist
```

Los adjuntos (fotos, audios, documentos) no se cifran: viven en el Volume. Si el cliente exige cifrado en disco, hay que cifrar el volumen o mover los archivos a un almacenamiento con cifrado del proveedor.

### Respaldos automáticos y cómo restaurar

Cada 24 horas (configurable) el servicio guarda una copia completa de la base en un archivo comprimido y cifrado con `ENCRYPTION_KEY`. Se conservan las últimas 7 y cada copia se verifica al crearse (se vuelve a leer y descifrar: si eso falla, queda como error en la bitácora y dispara las alertas).

**La carpeta tiene que estar en un Volume**, o las copias se pierden en cada deploy. Lo más simple: apuntar `BACKUP_DIR=/data/backups`, donde `/data` es el mismo Volume de los archivos.

Se ven (y se descargan) en **Admin → Respaldos**. `/health` reporta la edad del último y marca `checks.backupsFresh`.

Para restaurar, desde tu máquina y con la URL pública de la base:

```bash
# Descarga el archivo desde Admin → Respaldos, y luego:
DATABASE_URL="<URL_PUBLICA>" npm run db:restore -- --file=/ruta/margarita-2026-10-15-0300.mgb --dry-run

# Si la simulación dice que el archivo se pudo leer, restaura de verdad:
DATABASE_URL="<URL_PUBLICA>" npm run db:restore -- --file=/ruta/margarita-2026-10-15-0300.mgb --yes
```

Avisos importantes:

- La restauración **borra** los datos actuales y los reemplaza por los del respaldo. Por eso pide `--yes`.
- Si se interrumpe a la mitad, vuelve a correr el mismo comando con el mismo archivo: el proceso borra y recarga, así que es repetible.
- El archivo **no se puede leer sin `ENCRYPTION_KEY`**. Guarda la llave junto con los respaldos, en otro lugar.
- El respaldo cubre **la base**, no los adjuntos (fotos, audios, documentos): esos viven en el Volume.
- Dentro del respaldo, los campos sensibles siguen cifrados: aunque alguien robe el archivo, no puede leer teléfonos ni mensajes sin la llave.
- Nadie saca la copia del servidor sola. Descarga una de vez en cuando a un lugar externo: si el Volume se pierde, se pierden la base y sus copias.

### Volume para los archivos de los clientes

Las fotos, audios y documentos que envían los clientes se guardan en disco. El disco de Railway es **efímero**: sin un Volume, esos archivos se pierden en cada deploy y la app los vuelve a descargar de Meta si todavía existen allá.

Para conservarlos:

1. En el servicio de la app: **Create → Volume**, con el punto de montaje `/data`.
2. Agrega la variable `MEDIA_STORAGE_DIR` con el valor `/data/media`.
3. Redeploy.

Un Volume va atado a un solo servicio, así que esto encaja con el modelo actual (una instalación, una réplica). Si algún día se pasa a varias réplicas o se quiere servir con CDN, la capa de almacenamiento ya está aislada en `src/services/media-storage.service.ts` y se puede cambiar por un bucket sin tocar el resto.

---

## 6. Webhook en Meta

En el panel de tu app de Meta: WhatsApp → Configuración → Webhooks.

Configura lo siguiente:

- URL de callback: `https://<tu-dominio>/webhooks/meta/whatsapp`
- Token de verificación: el mismo valor de `META_VERIFY_TOKEN`
- Campos suscritos: `messages`

Meta hace un `GET` de verificación contra esa URL. Si el token coincide, la app responde con el challenge y la suscripción queda activa. De ahí en adelante, cada mensaje entrante y cada cambio de estado llegan por `POST`.

Para probar antes de tocar Meta, levanta `ngrok` o Cloudflare Tunnel y usa su URL HTTPS como callback.

---

## 7. Verificación después del deploy

En orden, con el dominio ya activo:

1. `https://<tu-dominio>/health` responde `200` con `"status": "healthy"`.
2. Entra a `/auth/login` con el admin del seed. Si el login parece funcionar pero te regresa al login, revisa `APP_URL` y `NODE_ENV`.
3. Admin → WhatsApp → Probar conexión: debe traer el nombre verificado del número y guardar `status = CONNECTED`.
4. Admin → Plantillas → Sincronizar: deben aparecer las plantillas con estado `APPROVED`.
5. Manda un mensaje desde tu celular al número de negocio. Aparece una conversación nueva en `/admin/conversations` y, con la bandeja abierta, el mensaje se inserta en vivo sin recargar.
6. Revisa Admin → Logs y busca `WEBHOOK_INCOMING_MESSAGE_SAVED`. Si aparece `WEBHOOK_SIGNATURE_INVALID`, el `META_APP_SECRET` no coincide con el de Meta. Si aparece `WEBHOOK_SIGNATURE_SECRET_MISSING`, la variable no está puesta.
7. Abre `/health` y confirma `"status": "healthy"`, que `queue.pending` sea 0 y que el worker reporte un `lastRunAt` reciente. Si aparece `"degraded"`, revisa `queue.failed` o si el worker se quedó colgado.
8. Entra a Admin → Sistema y verifica que las tarjetas de **Seguridad y robustez** estén en verde. Si dice que las credenciales siguen en texto plano, cífralas desde Admin → WhatsApp.
9. Prueba el bloqueo de acceso: falla la contraseña `LOGIN_MAX_ATTEMPTS` veces y confirma que la cuenta se bloquea. La bitácora debe mostrar `LOGIN_FAILED` y luego `LOGIN_LOCKED`.

---

## 8. Cosas que debes saber del entorno Railway

El disco es efímero. `dist/`, `uploads/` y los temporales desaparecen en cada deploy. En este proyecto no duele: los Excel de campañas se leen dentro de la misma petición. No guardes nada importante en el sistema de archivos.

Socket.io funciona bien con una sola réplica. Si algún día escalas a dos o más instancias, los eventos en vivo no cruzarán entre ellas: necesitarás el adaptador de Redis (`@socket.io/redis-adapter`) más un plugin de Redis en Railway.

El rate limiting general es de 300 peticiones cada 15 minutos por IP. El webhook quedó excluido porque Meta envía ráfagas de estados, y tiene su propio techo de 1200 por minuto. Si ves `429` detrás de una IP compartida, sube el límite general en `src/app.ts`.

Las campañas hoy solo aceptan plantillas sin variables; en conversación puedes llenar hasta 3. Está documentado en el roadmap.

El webhook siempre responde `200`, incluso si algo falla. Es intencional para evitar reintentos infinitos de Meta: los errores quedan en la tabla `Log` y en los Deploy Logs.

Un `META_ACCESS_TOKEN` permanente no caduca, pero si lo regeneras o rotas el App Secret, actualiza la variable en Railway y vuelve a probar la conexión.

Como el build compila TypeScript, un error de tipos tumba el deploy. Corre `npx tsc --noEmit` en local antes de subir y lo detectas en segundos.

Los webhooks ya no se procesan en línea: el endpoint solo encola y responde. El worker corre dentro del mismo proceso, así que si el servicio se reinicia, lo pendiente se retoma solo (los eventos interrumpidos vuelven a la cola a los 5 minutos). Con varias réplicas el reparto sigue siendo correcto porque cada evento se reclama con una actualización condicional, pero el socket.io sí necesita el adaptador de Redis para cruzar eventos entre instancias.

El healthcheck devuelve `503` únicamente si la base de datos no responde; un backlog o un evento fallido se reporta como `degraded` con código `200` para no tumbar el deploy por una cola atrasada.

La retención corre una vez al día y borra bitácora y eventos vencidos. No genera avisos salvo que borre algo, así que si no ves nada en los logs es que no había nada que purgar.

Si configuras `ALERT_WEBHOOK_URL`, cada log de nivel `ERROR` se envía a ese endpoint con enfriamiento por tipo de error. Es la forma más barata de enterarte de un fallo sin depender de revisar el panel.

El build no necesita `DATABASE_URL`, pero el runtime sí: `src/config/prisma.ts` aborta el arranque si la variable no existe. Si ves en los Deploy Logs `DATABASE_URL no está definido.` seguido de un reinicio del servicio, es que la app arrancó sin la variable; el build puede haber pasado sin problema.

Si el build falla con `Failed to load config file "/app" ... PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`, estás desplegando un commit anterior a la corrección de `prisma.config.ts`, que exigía la variable incluso para generar el cliente. Con la versión actual ese paso ya no depende de la base.

### `relation "public.WebhookEvent" does not exist` (P2021)

Significa que la base de datos no tiene aplicadas las migraciones más recientes. La app arranca y sirve, pero `/health` responde `503` con un `migrationHint` y la cola de webhooks no funciona.

Primero distingue de qué tipo de base se trata:

```bash
psql "<DATABASE_PUBLIC_URL>" -c "select table_name from information_schema.tables where table_schema='public' order by 1"
```

**Si aparecen las tablas antiguas** (`Workspace`, `User`, `Conversation`, `Message`…) pero no `WebhookEvent`, la base ya existía y solo le falta la migración nueva:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma migrate resolve --applied 20261009000000_init
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma migrate deploy
```

**Si la lista sale vacía**, es una base nueva: `npx prisma migrate deploy` y después `npm run db:seed`.

Con el historial ya baselinado, agrega el Pre-deploy Command `npx prisma migrate deploy` para que Railway aplique las migraciones en cada deploy y este error no vuelva a aparecer.

Mientras la base siga sin migrar, el worker de webhooks registra un único error, avisa y queda en pausa 5 minutos en vez de inundar los logs cada dos segundos. No hace falta reiniciar el servicio después de migrar: se reactiva solo.

---

## 9. Comandos útiles

```bash
npm i -g @railway/cli

railway login
railway link
railway variables
railway logs
railway up
railway run npx prisma db push
```

`railway link` vincula el directorio al proyecto, ambiente y servicio. `railway logs` muestra la salida de la app en vivo. `railway run` ejecuta un comando local con las variables de Railway.

Flujo típico de un cambio:

```bash
npx tsc --noEmit      # verificar tipos antes de subir
git push origin main  # dispara el deploy automático
railway logs          # confirmar arranque y healthcheck
```
