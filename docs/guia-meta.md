# Guía de conexión con Meta

Documento para el cliente: **todo lo que hay que hacer en Meta antes de usar
Margarita**. La versión publicada en la aplicación es `/como-empezar`; este
archivo es el mismo contenido con notas para quien da el soporte.

> **Vender el servicio de conexión.** Este documento termina con la oferta de
> que lo hacemos nosotros por un precio (`SUPPORT_WHATSAPP`, `SUPPORT_EMAIL` y
> `SETUP_SERVICE_PRICE` se configuran por variables de entorno y aparecen solos
> en la página).

---

## Por qué hay que pasar por Meta

Margarita opera sobre **WhatsApp Business Platform (Cloud API)**, la vía
oficial de WhatsApp para empresas. No es WhatsApp Web ni la app normal de
WhatsApp Business: hay que preparar la cuenta en Meta, registrar un número y
aprobar plantillas. Es el trámite que todo mundo subestima, y es justo donde se
vende el servicio de conexión.

## Lo que el cliente necesita tener a mano

| Dato | Para qué sirve |
| --- | --- |
| **App ID** | Identificador de la app de Meta que se crea. |
| **App Secret** | Valida la firma de cada webhook. Si falta o es de relleno, Meta recibe 401 y no llega nada. |
| **Cuenta de WhatsApp Business (WABA ID)** | La cuenta que agrupa los números. |
| **Phone Number ID** | Identificador del número que envía. |
| **Número visible** | El número con el que verán los mensajes los clientes. |
| **Token permanente** | Generado para un usuario de sistema, con permisos de mensajería. |
| **Verify token** | Cadena que inventa el cliente y se pega en los dos lados (Meta y Margarita). |

## Los nueve pasos

### 1. Cuenta y portafolio de Meta Business
`business.facebook.com` → crear el portafolio comercial. Ahí viven la cuenta de
WhatsApp y el método de pago.

**Ojo:** la verificación de negocio es requisito para volumen, y **sin método de
pago válido la cuenta no envía** aunque la herramienta diga que todo está listo
(error 131042).

### 2. App en Meta Developers
`developers.facebook.com` → app de tipo **Business** → agregar el producto
WhatsApp. De **Configuración → Básica** salen el App ID y el App Secret.

**Ojo:** el App Secret se copia tal cual. Es el dato con el que se valida que
cada webhook viene de Meta.

### 3. Cuenta de WhatsApp Business (WABA)
Dentro del producto WhatsApp se crea o se vincula la WABA. De ahí sale el
**WABA ID**.

**Ojo:** el nombre de la cuenta debe ser el real del negocio; cambiarlo después
implica otra revisión de Meta.

### 4. Número dedicado
Se registra el número que enviará y recibirá. Meta lo verifica por SMS o
llamada. Al terminar se obtiene el **Phone Number ID**.

**Ojo:** el número **no** debe estar en uso en la app normal de WhatsApp
(ordinaria ni Business). Si ya está, primero hay que eliminarlo de esa app y se
pierde ese historial. El nombre visible debe cumplir las reglas de Meta.

### 5. Token permanente
En el portafolio comercial, crear un **usuario de sistema** con permisos de
mensajería de WhatsApp y generar su token permanente.

**Ojo:** los tokens de prueba duran 24 horas; al día siguiente "la herramienta
dejó de funcionar" cuando en realidad expiró el token.

### 6. Webhook
En la app de Meta → WhatsApp → Configuración:

- **URL:** `https://TU-DOMINIO/webhooks/meta/whatsapp`
- **Verify token:** el que se haya definido (idéntico en Meta y en Margarita)
- Después, **suscribir el campo `messages`**.

**Ojo:** si el verify token no coincide, la verificación falla. Si el App Secret
no es el correcto, la entrega se rechaza con 401 y el panel parece "sin
mensajes".

### 7. Primera plantilla
Las plantillas son la única forma de iniciar una conversación. Se crean en Meta
(categoría, idioma, variables) y esperan aprobación.

Ejemplo de cuerpo: `Hola {{1}}, tenemos pendiente tu pago de {{2}}. ¿Cómo te
ayudamos?`

**Ojo:** una categoría mal elegida o contenido promocional en una plantilla de
servicio es la causa más común de rechazo.

### 8. Capturar todo en Margarita
Admin → WhatsApp: App Secret, token, WABA ID, versión de API y el número.
Después, sincronizar plantillas en Admin → Plantillas.

Los tokens y el App Secret quedan **cifrados** en la base.

### 9. Prueba de punta a punta
Enviar una plantilla a 1–3 personas autorizadas, pedirles que respondan y
verificar que el mensaje entra, se asigna y queda en la bitácora.

---

## Tropiezos comunes (sirve para soporte)

| Síntoma | Causa real |
| --- | --- |
| El webhook responde 401 | App Secret equivocado o de relleno. |
| "Se envió" y no llega | Falta método de pago en Meta (error 131042). |
| No se puede iniciar conversación | Fuera de la ventana de 24 horas se requiere plantilla aprobada. |
| Plantilla rechazada | Categoría o contenido promocional mal clasificado. |
| El número no se registra | Sigue en la app normal de WhatsApp. |
| Baja la calidad del número | Envíos a quien no pidió recibirlos o muchos bloqueos. |
| Dejó de enviar de un día a otro | Token de prueba vencido (24 h). |

## Tiempo estimado

Entre **1 y 3 horas** de trabajo del lado del cliente, repartidas en uno o dos
días: la verificación de negocio y la aprobación de plantillas las controla
Meta.

## Servicio de conexión (lo que se cobra)

**Incluye:**

1. Alta y revisión de la cuenta de Meta Business y método de pago.
2. App de Meta, producto WhatsApp y App Secret.
3. Cuenta de WhatsApp Business y registro del número dedicado.
4. Usuario de sistema y token permanente.
5. Webhook configurado y firmado, con el campo `messages` suscrito.
6. Primera plantilla redactada y subida para aprobación.
7. Captura de datos en la instalación del cliente y prueba de punta a punta.
8. Capacitación de una sesión al equipo (cobranza + administración).

**No incluye** (se cotiza aparte): costos que Meta cobra por conversación,
trámites legales, aviso de privacidad del cliente, migración de un CRM ajeno,
ni teléfonos o equipos.

**Precio:** `SETUP_SERVICE_PRICE`, `$1,500.00 MXN` por omisión (se captura en
las variables de entorno y se muestra en la página pública). Es un **extra
opcional** al precio de la instalación: sirve para quien no quiere hacer el
trámite, y la guía sigue disponible para quien lo haga por su cuenta.

**Contacto:** `SUPPORT_WHATSAPP` y `SUPPORT_EMAIL`.
