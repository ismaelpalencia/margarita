# Revisión de seguridad externa — 19/10/2026

Pruebas de caja negra contra la instalación de producción, **autorizadas por el
dueño** y **sin acciones destructivas** (nada de borrar, escribir ni fuerza
bruta). El objetivo era comprobar lo básico que un atacante probaría primero:
rutas expuestas, inyección, firma del webhook, redirecciones y cabeceras.

Host: `palencia.margaritaapp.org` · commit `1027aa8` · ~25 peticiones.

---

## Resumen

| Severidad | Hallazgos |
| --- | --- |
| Crítica | 0 |
| Alta | 0 |
| Media | 1 (`/health` expone detalles internos) |
| Baja | 2 (CSP desactivada; pistas para enumerar) |

**No se encontró** inyección SQL, bypass de autenticación, acceso a rutas
privadas sin sesión, webhook sin firma aceptado, listado de directorios ni
archivos sensibles publicados.

---

## Pruebas y resultado

| Prueba | Resultado |
| --- | --- |
| `/.env`, `/.git/config`, `/api` | **404** |
| `/admin`, `/agent`, `/admin/backup`, `/media/x`, `/setup` sin sesión | **302** al login |
| `/brand/img/` (listado de carpeta) | **404** |
| Webhook sin firma | **401** |
| Webhook con firma falsa | **401** |
| Login con `' OR '1'='1' --` en correo y en contraseña | **400**, «Credenciales incorrectas» (sin 500 ni bypass) |
| Método `TRACE` | **404** |
| Cabecera `Host: evil.example` | **404** (sin reflejo ni redirección) |
| Cabeceras | HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`; sin `X-Powered-By` |
| Límite de login | `ratelimit-limit: 10` cada 900 s, con cabeceras |

---

## Hallazgos

### 1. Media · `/health` es público y cuenta de más

`/health` responde sin sesión con versión, **commit desplegado**, entorno,
estado de la base, número de administradores, rutas de almacenamiento
(`/data/media`, `/data/backups`), tamaño de la cola y contadores del webhook.

No expone secretos, pero le dice a un atacante qué versión corre (para buscar
fallos conocidos), si hay administradores y dónde están los archivos.

**Remediación**: dejar `/health` mínimo (`{ok, status}`) para el healthcheck de
Railway y mover el detalle a `/health/detalle?token=<HEALTH_TOKEN>` o detrás de
sesión de administrador.

### 2. Baja · CSP desactivada

No hay `Content-Security-Policy`. Es una decisión documentada (las vistas usan
scripts en línea), pero deja menos defensa ante un XSS.

**Remediación**: CSP con *nonces* para los scripts en línea; es un cambio de
plantillas y cabeceras.

### 3. Baja · Pistas de enumeración

El mensaje de login es genérico («Credenciales incorrectas»), lo cual está bien.
El conteo de administradores de `/health` sí deja inferir si la instalación está
en uso. Se resuelve con el punto 1.

---

## Límites de esta revisión

- **Sin credenciales**: no se probaron IDOR autenticado, CSRF con sesión ni
  permisos entre agentes.
- **Sin fuerza bruta**: solo se hicieron tres intentos de login; no se probó el
  bloqueo por cuenta.
- **Sin acceso a la base ni al servidor**: no hay pruebas de SQLi autenticada,
  de subida de archivos ni de configuración de Railway/Cloudflare.
- **No es un pentest**: es una revisión externa básica. Para un cliente regulado
  conviene un pentest con credenciales y alcance definido.

---

## Recomendación

1. Proteger el detalle de `/health` (media).
2. Activar CSP con nonces (baja).
3. Repetir la revisión **con una cuenta de agente** para cubrir IDOR y permisos.
4. Antes de vender a un cliente regulado: pentest externo y prueba de
   restauración desde R2 en un entorno limpio.
