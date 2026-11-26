# Margarita Calls

Servicio independiente de señalización para WhatsApp Calling. Ejecuta Node.js 22 o posterior y despliega el Dockerfile `services/calls/Dockerfile` desde la raíz del repositorio. Margarita mantiene usuarios, autorización, datos de contacto, historial y auditoría; este proceso mantiene SDP y estado efímero de WebRTC en memoria. No guarda SDP, tokens, audio, grabaciones ni transcripciones.

## Arquitectura

```text
Navegador -- HTTPS y sesión --> Margarita
Navegador -- WSS /signal --> Calls
Meta -- webhook firmado --> Margarita -- evento firmado, asíncrono --> Calls
Calls -- contexto y eventos autenticados --> Margarita
Calls -- HTTPS --> Graph API de Meta
Calls -- HTTPS --> Cloudflare Realtime TURN
Navegador -- WebRTC/SRTP --> Meta; TURN solo retransmite si hace falta
```

No se usa Cloudflare Calls SFU. El panel establece una sesión global de recepción para agentes y administradores autorizados, así que no hace falta abrir previamente una conversación. Se prioriza al agente asignado si está disponible; de lo contrario puede atender un administrador autorizado. Si no hay una sesión web conectada, se intenta avisar por Web Push y la llamada queda pendiente brevemente para que el usuario abra la PWA. Web Push depende del navegador y no garantiza contestar con la app cerrada; si nadie abre el panel dentro de la ventana de Meta, la llamada se rechaza y se registra como perdida. El navegador debe permitir micrófono.

## Variables

Configura estas variables en el proceso separado de Calls:

| Variable | Uso |
| --- | --- |
| `PORT=4100` | Puerto HTTP/WSS. |
| `CALLS_PUBLIC_ORIGIN=https://calls.margaritaapp.org` | Origen público del servicio; TLS debe terminar en el proxy. |
| `CALLS_INTERNAL_SECRET` | Secreto aleatorio compartido con Margarita para contexto, eventos y reenvío de webhooks. |
| `CALLS_JWT_SECRET` | Secreto aleatorio compartido con Margarita para JWT de 5 minutos. Mínimo 32 caracteres; genera una llave independiente del secreto interno. |
| `MARGARITA_INTERNAL_URL=https://palencia.margaritaapp.org` | URL HTTPS de Margarita usada por el servicio. |
| `CLOUDFLARE_TURN_KEY_ID` | ID de la llave TURN. |
| `CLOUDFLARE_TURN_API_TOKEN` | Token Cloudflare con permiso para generar credenciales TURN. Solo existe en el servidor Calls. |

Genera `CALLS_INTERNAL_SECRET` y `CALLS_JWT_SECRET` con valores aleatorios independientes (por ejemplo, `openssl rand -hex 32`). No reutilices `JWT_SECRET`, `ENCRYPTION_KEY` ni tokens de Meta.

Configura además en Margarita:

```env
CALLS_ENABLED=true
CALLS_PUBLIC_ORIGIN=https://calls.margaritaapp.org
CALLS_SERVICE_URL=https://calls.margaritaapp.org
CALLS_INTERNAL_SECRET=<mismo valor que en Calls>
CALLS_JWT_SECRET=<mismo valor que en Calls>
```

El servicio de llamadas no debe recibir `DATABASE_URL`, `ENCRYPTION_KEY` ni credenciales de Meta. Los tokens de Meta se resuelven por el contrato interno y solo viven en memoria de Calls durante la señalización. Cambia ambos secretos compartidos de forma coordinada: desactiva llamadas, cambia los dos servicios, y vuelve a activarlas. Al cambiar `CALLS_JWT_SECRET`, los JWT ya emitidos dejan de funcionar.

## Configurar Meta

1. En Meta Developers, confirma que el número está activo en WhatsApp Cloud API y que la app tiene `whatsapp_business_messaging`.
2. Activa Calling para el número de empresa y revisa los horarios/control de llamadas en WhatsApp Manager.
3. Suscribe la app al campo de webhook `calls` de la WABA. Mantén como callback la URL existente de Margarita, `https://<dominio-de-margarita>/webhooks/meta/whatsapp`; **no** registres el endpoint de Calls con Meta.
4. Asegúrate de que `META_APP_SECRET` siga configurado. Margarita valida `X-Hub-Signature-256` antes de reenviar cualquier evento.
5. Para llamadas salientes, el usuario de WhatsApp debe haber concedido permiso de llamada al número de empresa. Meta valida el permiso y puede rechazar la llamada si no existe o expiró. No se solicita permiso automáticamente en esta fase.
6. Verifica las condiciones actuales de elegibilidad del número y la cuenta de Meta. Calling debe estar habilitado en la cuenta; los números de prueba requieren configuración explícita.

## Configurar Cloudflare TURN

1. En Cloudflare Realtime, crea una TURN key para la cuenta.
2. Crea un API token con el permiso mínimo que permita generar credenciales para esa key. Guarda el key ID y el token como variables de servidor en Calls.
3. Calls invoca `POST https://rtc.live.cloudflare.com/v1/turn/keys/{keyId}/credentials/generate-ice-servers` con `{"ttl":3600}`. Cachea las credenciales hasta el vencimiento y entrega solo `iceServers` al navegador.
4. El puerto alternativo 53 se filtra porque los navegadores suelen bloquearlo. El cliente renueva las credenciales y aplica `RTCPeerConnection.setConfiguration()`.

Cloudflare cobra el tráfico TURN según el plan y uso vigentes; TURN solo participa cuando la conexión directa no atraviesa la red. WebRTC cifra el audio con SRTP. Revisa la tarifa y medición de la cuenta antes de habilitar llamadas en producción.

## Despliegue

1. Crea un servicio separado desde el repositorio y selecciona `services/calls/Dockerfile` como Dockerfile.
2. Asigna el dominio `calls.margaritaapp.org` con HTTPS/WSS y configura el healthcheck `GET /health`.
3. Añade las variables de Calls y despliega el servicio.
4. Añade las variables Margarita, aplica la migración Prisma y despliega Margarita.
5. Confirma que los logs del proxy no registren los parámetros de la URL WSS: el JWT de corta duración viaja en `?token=` para el handshake. La aplicación no registra URL, JWT, SDP, ICE credentials ni access token de Meta.
6. Habilita `CALLS_ENABLED=true` después de probar el número. Con la bandera apagada, el botón se mantiene inactivo y el resto de Margarita funciona normalmente.

Los endpoints internos de Margarita son `POST /internal/calls/context` y `POST /internal/calls/events`; requieren `Authorization: Bearer CALLS_INTERNAL_SECRET`. Las rutas del usuario (`/panel/calls/*`) requieren la sesión normal de Margarita. `GET /turn-credentials` requiere el JWT de llamada en `Authorization: Bearer ...` y CORS solo permite el origen derivado de `MARGARITA_INTERNAL_URL`.

## Flujo y limitaciones actuales

- Entrante: Meta entrega `calls/connect` a Margarita; Margarita valida firma y reenvía el payload sin esperar. Al abrir el panel, agentes y administradores registrados mantienen una conexión global de presencia, sin tener que conectar cada conversación. Calls resuelve el contacto y ofrece la llamada primero al agente asignado disponible y después a una persona administradora autorizada.
- Si no hay conexión WebSocket activa, la llamada queda en espera hasta 25 segundos y se envía Web Push a las personas autorizadas con suscripción. Al abrir el enlace, la PWA recibe la llamada pendiente. Meta permite aproximadamente 30–60 segundos para aceptar; una notificación puede llegar tarde o el sistema operativo puede suspender el navegador, así que Web Push es un respaldo y no garantiza respuesta cuando el panel está cerrado.
- Si no existe una conversación abierta, no hay una persona autorizada, el contacto tiene baja o está inactivo, Calls rechaza la llamada. Las llamadas pendientes que expiran se registran como perdidas y nunca como contestadas.
- Saliente: el agente disponible inicia WebRTC desde la conversación y Calls manda `action=connect` a Meta. Requiere permiso de llamada previamente concedido por el usuario. El `biz_opaque_callback_data` asocia el webhook de respuesta con la llamada interna.
- Se guarda estado, dirección, agente, tiempos, duración y error acotado. Las relaciones `Call` no escriben en tablas cifradas ni guardan SDP/tokens.
- No se implementan grabación ni transcripción. El panel puede recibir llamadas desde cualquier pantalla mientras su sesión WebSocket esté conectada. Web Push avisa en segundo plano, pero para negociar y contestar la PWA debe abrirse antes de que expire el tiempo de Meta. No se puede garantizar una experiencia telefónica con la aplicación cerrada.

## Ejecutar y probar

```bash
npm install
npm run dev
npm test
npm run build
```

Desde la raíz también se ejecutan las pruebas y comprobaciones de Margarita:

```bash
npm test
npx tsc --noEmit
npm run build
npm --prefix frontend test -- --watch=false
```

Las unitarias no necesitan Meta ni Cloudflare: prueban JWT, cache/filtro TURN, parseo de eventos, petición Graph API, reenvío webhook y máquina de estados. La prueba manual México necesita número Cloud API elegible, permiso de llamada del usuario, webhook `calls`, dominio público HTTPS/WSS y credenciales TURN reales. Comprueba primero entrante, después saliente, red con TURN y caída del servicio; esta configuración externa no se puede simular con credenciales de desarrollo.
