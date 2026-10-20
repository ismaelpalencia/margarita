# Cloudflare: qué configurar y para qué

Guía para dejar Cloudflare haciendo lo que le toca hoy: DNS, sitio estático,
protección y el bucket R2 de archivos y respaldos. Está pensada para hacerse
una vez por cuenta.

---

## 1. El mapa

| Servicio | Para qué | Estado |
| --- | --- | --- |
| **DNS** | Dominio y subdominios | Ya en uso |
| **Pages** | La landing estática (`landing/`) | Ya en uso |
| **R2** | Archivos de conversaciones y respaldos | En uso (bucket `margarita-backup`) |
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

**Hoy**: en cuanto las cuatro variables existen, los **respaldos** se suben
cifrados a `backups/` y los **archivos de las conversaciones** se copian a
`media/`. El disco (`MEDIA_STORAGE_DIR`) sigue siendo la caché local: la app
lee primero de ahí y, si el archivo ya no está, lo trae de R2.

### Crear el bucket

1. **R2 → Create bucket** → un bucket **por instalación**, por ejemplo
   `margarita-despacho`, `margarita-palencia`, `margarita-cliente-x`.
   No reutilices el bucket de tu despacho para un cliente.
2. Región automática.
3. **No** lo hagas público: los archivos se sirven por la app, que valida la
   sesión y el permiso sobre la conversación.

Los respaldos se guardan como `backups/<archivo>` y no llevan el workspace en
el nombre. Por eso un bucket compartido puede pisar copias de otro cliente. Si
más adelante quieres un solo bucket, primero hay que cambiar el código para
prefijar `backups/<workspace>/`.

### Crear el token

1. **R2 → Manage R2 API Tokens → Create API token**.
2. Permiso: **Object Read & Write**, solo sobre ese bucket (no “todos los
   buckets”).
3. Guarda estos cuatro datos (los vas a pegar en Railway, no en el repo):

```
R2_ACCOUNT_ID=...
R2_BUCKET=margarita-<slug-del-cliente>
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

El endpoint S3 es
`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

### CORS (no hace falta)

El navegador nunca habla con R2: la app sube y descarga con sus credenciales y
sirve el archivo después de validar la sesión y el permiso sobre la
conversación. No configures CORS ni hagas público el bucket.

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

## 7. Cómo comprobar que quedó

1. En Railway, las cuatro variables `R2_*` de **esa instalación** apuntan a su
   bucket exclusivo.
2. Admin → Sistema muestra el resumen de R2 con objetos, tamaño y fecha del
   último.
3. Crea un respaldo a mano desde Admin → Respaldos y comprueba que aparece en
   R2 bajo `backups/`.
4. Abre una conversación con un adjunto y verifica que el archivo se ve; la app
   lo tendrá en la caché local y también en `media/` del bucket.

> Los secretos van en **Variables de Railway**, nunca en el repositorio, y el
> bucket se queda privado. Un token de R2 no debe servir para dos clientes.
