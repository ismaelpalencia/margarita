# PWA y notificaciones Web Push

Margarita ya se puede instalar como PWA y recibir notificaciones cuando entra
un WhatsApp.

## Requisitos

- HTTPS. En producción, Railway o Cloudflare.
- Variables VAPID:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@tudominio.com
```

Generar claves:

```bash
npx web-push generate-vapid-keys --json
```

No cambies las claves si ya hay suscripciones: las existentes dejan de
funcionar.

## Instalar

### Mac / Linux

1. Abre Margarita en Chrome o Edge.
2. Abre el menú lateral y pulsa **Instalar app**.
3. Acepta.
4. Abre la app instalada.
5. Pulsa **Activar avisos**.
6. Acepta el permiso de notificaciones.

### Android

1. Abre en Chrome.
2. Menú → **Agregar a pantalla de inicio** o **Instalar app**.
3. Abre la app instalada.
4. Abre el menú lateral y pulsa **Activar avisos**.

### iPhone / iPad

Requiere iOS 16.4 o superior.

1. Abre Margarita en Safari.
2. Compartir → **Agregar a pantalla de inicio**.
3. Abre desde el icono, no desde Safari.
4. Abre el menú lateral y pulsa **Activar avisos**.

En iPhone el botón **Instalar app** muestra esas instrucciones porque Safari
no dispara el aviso automático de instalación.
5. Acepta.

## Qué notifica

- mensaje nuevo en conversación asignada,
- mensaje nuevo sin asignar a los administradores,
- toque en la notificación abre la conversación.

Se envía al agente asignado y a los administradores activos del workspace.
Un agente solo recibe conversaciones de los números que tiene permitidos.

## Dónde se guarda

Tabla:

```text
PushSubscription
```

Una fila por navegador/dispositivo. Se elimina sola si el navegador responde
404 o 410.

## Probar

En la barra superior:

```text
Probar aviso
```

El botón solo aparece cuando el navegador ya tiene una suscripción activa.
Si no aparece, primero pulsa **Activar avisos** y acepta el permiso.

Debe aparecer una notificación del sistema. Si no aparece:

1. Revisa el permiso de notificaciones del navegador.
2. Revisa que estés usando HTTPS.
3. Revisa que `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` estén configuradas.
4. En iPhone, confirma que abriste desde el icono instalado.

## Privacidad

La notificación muestra el nombre del contacto y un fragmento del mensaje.
Si no quieres mostrar contenido en la pantalla de bloqueo, se puede cambiar a
un texto genérico:

```text
Nuevo mensaje en Margarita
```

No se envía el teléfono completo ni datos internos.

## Límites

- Web Push depende del navegador y del sistema operativo.
- En iPhone requiere PWA instalada.
- Si el usuario bloquea notificaciones, no se pueden forzar.
- No reemplaza una app nativa para notificaciones críticas.
- El service worker debe servirse desde la raíz del dominio.
- El icono instalado puede quedar en caché. Si cambió el logo, desinstala y
  vuelve a instalar la PWA; en el navegador usa recarga forzada.
- Si Socket.IO se cae, la bandeja se recarga sola cuando no hay un borrador
  escrito, para no dejar mensajes sin aparecer.

## Archivos

- `src/public/site.webmanifest`
- `src/public/sw.js`
- `src/public/js/pwa.js`
- `src/services/push.service.ts`
