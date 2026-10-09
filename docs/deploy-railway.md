# Despliegue en Railway

Guía operativa para subir Margarita (WhatsApp Business Cloud API) a Railway sin sorpresas.

## Resumen en 6 pasos

1. Crear el proyecto en Railway y agregar el plugin PostgreSQL.
2. Conectar el repo de GitHub al servicio de la app.
3. Configurar las variables de entorno (incluida `META_APP_SECRET`).
4. Ajustar Build Command, Start Command, healthcheck y dominio.
5. Crear el esquema en la base (`prisma db push`) y correr el seed una vez.
6. Registrar el webhook en Meta y verificar de punta a punta.

---

## 1. Datos clave del proyecto

| Concepto | Valor |
| --- | --- |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` (ejecuta `node dist/server.js`) |
| Healthcheck | `/health` |
| Puerto | `3000` (defínelo con la variable `PORT`) |
| Node | 22 (Prisma 7 no soporta versiones anteriores a 20.19) |
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

Nota: no hace falta `Dockerfile`; Railway detecta Node con Nixpacks. Si quieres fijar la versión, agrega `"engines": { "node": ">=22" }` en `package.json` o un archivo `.nvmrc` con `22`.

---

## 3. Variables de entorno

Pega esto en Variables del servicio de la app. Las referencias `${{...}}` apuntan a otros servicios.

| Variable | Valor | Notas |
| --- | --- | --- |
| `APP_NAME` | `Margarita` | |
| `APP_URL` | `https://<tu-dominio>.up.railway.app` | Crítico, ver avisos abajo |
| `PORT` | `3000` | Debe coincidir con el puerto del dominio |
| `NODE_ENV` | `production` | Activa cookies seguras y endurece el webhook |
| `TIMEZONE` | `America/Mexico_City` | |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al plugin |
| `JWT_SECRET` | cadena aleatoria larga | Genera con `openssl rand -hex 32` |
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

### Dos avisos que cuestan una tarde de depuración

`APP_URL` tiene que ser el dominio público con HTTPS. De ahí salen el origen permitido de CORS y el CORS del socket.io. Si se queda en `http://localhost:3000`, las actualizaciones en vivo de la bandeja no conectan y el login puede fallar por la cookie segura.

`NODE_ENV=production` rompe el build si no incluyes las devDependencies. Tailwind, TypeScript y el CLI de Prisma viven en `devDependencies`, y con `NODE_ENV=production` un `npm ci` normal no las instala. Por eso el Build Command lleva `--include=dev`. Si ves errores tipo `tsc: not found` o `tailwindcss: not found` durante el deploy, es exactamente esto.

---

## 4. Build, start, healthcheck y dominio

En el servicio de la app, entra a Settings:

Build:

- Build Command: `npm ci --include=dev && npm run build`

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

El repositorio no tiene carpeta `prisma/migrations`, así que la base se crea con `db push`. Hazlo una vez, antes del primer arranque real, apuntando a la base de Railway desde tu máquina.

En Railway, servicio Postgres → Variables → copia `DATABASE_PUBLIC_URL`, y luego:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma db push
DATABASE_URL="<DATABASE_PUBLIC_URL>" npm run db:seed
```

El seed crea el workspace, el admin, los settings y la cuenta de WhatsApp a partir de las variables.

Si prefieres no copiar URLs, con la CLI de Railway puedes inyectar las variables del proyecto:

```bash
railway link
railway run npx prisma db push
railway run npm run db:seed
```

`railway run` ejecuta el comando en tu máquina pero con las variables de Railway, así que necesita `node_modules` instalado localmente. El seed se corre desde tu máquina y no dentro del contenedor porque `tsx` es devDependency.

### Migraciones versionadas (opcional, recomendado cuando el esquema empiece a cambiar)

Con la base vacía, genera la migración inicial y pásate a un flujo con historial:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma migrate dev --name init
```

Después agrega un Pre-deploy Command en Settings → Deploy:

```bash
npx prisma migrate deploy
```

Ojo: si la base ya tiene datos y tablas creadas con `db push`, `migrate dev` detecta drift y puede querer reiniciar el esquema. En ese caso no lo corras a ciegas.

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

---

## 8. Cosas que debes saber del entorno Railway

El disco es efímero. `dist/`, `uploads/` y los temporales desaparecen en cada deploy. En este proyecto no duele: los Excel de campañas se leen dentro de la misma petición. No guardes nada importante en el sistema de archivos.

Socket.io funciona bien con una sola réplica. Si algún día escalas a dos o más instancias, los eventos en vivo no cruzarán entre ellas: necesitarás el adaptador de Redis (`@socket.io/redis-adapter`) más un plugin de Redis en Railway.

El rate limiting general es de 300 peticiones cada 15 minutos por IP. El webhook quedó excluido porque Meta envía ráfagas de estados, y tiene su propio techo de 1200 por minuto. Si ves `429` detrás de una IP compartida, sube el límite general en `src/app.ts`.

Las campañas hoy solo aceptan plantillas sin variables; en conversación puedes llenar hasta 3. Está documentado en el roadmap.

El webhook siempre responde `200`, incluso si algo falla. Es intencional para evitar reintentos infinitos de Meta: los errores quedan en la tabla `Log` y en los Deploy Logs.

Un `META_ACCESS_TOKEN` permanente no caduca, pero si lo regeneras o rotas el App Secret, actualiza la variable en Railway y vuelve a probar la conexión.

Como el build compila TypeScript, un error de tipos tumba el deploy. Corre `npx tsc --noEmit` en local antes de subir y lo detectas en segundos.

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
