# Cloudflare: qué configurar y para qué

Guía para dejar Cloudflare haciendo lo que le toca hoy (DNS, sitio estático,
protección) y lo que tocará después (archivos y respaldos en R2). Está pensada
para hacerse una vez por cuenta.

---

## 1. El mapa

| Servicio | Para qué | Estado |
| --- | --- | --- |
| **DNS** | Dominio y subdominios | Ya en uso |
| **Pages** | La landing estática (`landing/`) | Ya en uso |
| **R2** | Archivos de conversaciones y respaldos | Por implementar (necesita bucket y token) |
| **WAF y límites** | Freno de abuso en el borde | Opcional; requiere proxy naranja |
| **Web Analytics** | Métricas de la landing sin cookies | Recomendado |
| **Turnstile** | Captcha invisible en el acceso | Opcional |

---

## 2. DNS

En **Cloudflare → margaritaapp.org → DNS**:

| Nombre | Tipo | Destino | Proxy |
| --- | --- | --- | --- |
| `margaritaapp.org` | CNAME | El del proyecto de Pages (lo pone Pages) | Naranja |
| `www` | CNAME | El del proyecto de Pages | Naranja |
| `cliente` (uno por operación) | CNAME | `algo.up.railway.app` (lo da Railway) | **Gris** |

**Por qué gris en las operaciones:** el panel usa conexiones en vivo y Railway
necesita ver el dominio real para emitir su certificado. Con naranja hay que
probar WebSockets y certificado de origen; no se hace el día de un alta.

---

## 3. Pages (la landing)

1. **Workers & Pages → Create → Pages**.
2. Subida directa: arrastra la carpeta `landing/` (regenerada con
   `npm run landing:build`).
   - Si prefieres que se publique con cada push: conecta el repositorio,
     *Build command* vacío y *Build output directory*: `landing`.
3. **Custom domains**: agrega `margaritaapp.org` y `www.margaritaapp.org`.
4. Comprueba que `margaritaapp.org/propuesta` y `/guia` abren.

> Cada cambio de textos o precios: `npm run landing:build` y vuelve a subir la
> carpeta. No hay que tocar la app.

---

## 4. R2 (respaldos; archivos en el siguiente paso)

**Hoy**: los **respaldos** se suben cifrados a `backups/` en cuanto las cuatro
variables existen. Los **archivos de las conversaciones** siguen en disco
(`MEDIA_STORAGE_DIR`) hasta que se implemente el adaptador de medios.

### Crear el bucket

1. **R2 → Create bucket** → nombre `margarita-media` (uno por entorno).
2. Región automática.
3. **No** lo hagas público: los archivos se sirven por la app, que valida la
   sesión y el permiso sobre la conversación.

### Crear el token

1. **R2 → Manage R2 API Tokens → Create API token**.
2. Permiso: **Object Read & Write**, solo sobre ese bucket.
3. Guarda estos cuatro datos (los vas a pegar en Railway, no en el repo):

```
R2_ACCOUNT_ID=...
R2_BUCKET=margarita-media
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

El endpoint S3 es
`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

### CORS (cuando se implemente la subida directa)

```json
[
  {
    "AllowedOrigins": ["https://*.margaritaapp.org"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 5. WAF y límites (opcional, con proxy naranja)

Si decides poner una operación en naranja:

1. **SSL/TLS → Overview**: modo **Full (strict)**.
2. **SSL/TLS → Edge Certificates**: activa *Always Use HTTPS*.
3. **Speed → Network**: WebSockets activado.
4. **Security → WAF → Managed rules**: activa el conjunto gratuito.
5. **Security → WAF → Rate limiting rules**: una regla sobre `/auth/login`
   (por ejemplo, 20 peticiones por minuto por IP).

**Antes de hacerlo**, prueba en staging: entrar, ver la bandeja en vivo, subir un
archivo de 90 MB y revisar que el certificado sea válido. Si algo falla, regresa
la nube a gris.

---

## 6. Web Analytics

**Analytics & Logs → Web Analytics → Add a site** con `margaritaapp.org`.
Cloudflare inyecta el script en Pages; no usa cookies.

---

## 7. Qué me pasas para seguir

Para implementar R2 en la app (archivos y respaldos) necesito:

1. El **nombre del bucket**.
2. Un **token con permiso de escritura** (las cuatro variables de arriba).
3. Confirmación de si quieres **subida directa** del navegador a R2 (evita el
   límite de 100 MB de Cloudflare) o pasar todo por Railway.

> Los secretos van en **Variables de Railway**, nunca en el repositorio.
