# Decisión de runtime: ¿hace falta Go?

**Estado:** propuesta para revisión (2026-11-03; actualizada 2026-11-06).
**Aplica a:** el núcleo de Margarita y a los servicios nuevos de IA.

> **Actualización 2026-11-06:** la demo pública ya vive en un microservicio Go
> aparte (`margaritademo`), sin base de datos ni Meta. Esta decisión sigue
> aplicando al **núcleo** (panel, webhook, campañas, IA); la demo se extrajo
> precisamente porque no comparte estado con la app.

---

## Contexto

El proyecto está creciendo y se pregunta si conviene introducir Go «para mayor
velocidad en ciertos servicios». La palabra *velocidad* puede significar tres
cosas distintas y conviene separarlas:

1. **Latencia** por petición (que el webhook o el panel respondan rápido).
2. **Throughput** (cuántos mensajes por segundo aguanta el sistema).
3. **Velocidad de desarrollo** (qué tan rápido se agregan funciones sin romper
   lo que ya existe).

Hoy el cuello de botella no es el lenguaje. La aplicación es
**intensiva en entrada/salida**: espera a PostgreSQL, a la Graph API de Meta y
al almacenamiento de archivos. Node 22 maneja eso bien. Lo que tarda no es
calcular, es esperar.

---

## Decisión

**No introducir Go ahora.** Mantener Node 22 + TypeScript + Express + Prisma y
medir antes de dividir el stack. Si algún día se justifica, se extrae **un
servicio** detrás de una cola o de HTTP, no se reescribe el núcleo.

---

## Evidencia en el repositorio

| Hecho | Dónde | Qué implica |
| --- | --- | --- |
| El webhook responde en milisegundos y encola | `src/controllers/meta-webhook.controller.ts`, `src/jobs/webhook-worker.ts` | La parte crítica ya está fuera del camino síncrono. |
| El envío de campañas está limitado a ~1 mensaje cada 700 ms | `CAMPAIGN_SEND_INTERVAL_MS=700` en `src/config/app.config.ts` | El ritmo lo pone Meta y el cuidado de la cuenta, no el runtime. |
| La instalación es single-tenant, con un número por workspace | `docs/alcance-produccion.md` | El volumen esperado es de decenas o cientos de mensajes al día, no millones. |
| El cifrado en reposo y los índices ciegos viven en una extensión de Prisma | `src/config/prisma-encryption.ts` | Reimplementarlos en Go duplicaría la superficie de seguridad. |
| Hay 251 pruebas unitarias y 76 de integración con PostgreSQL real | `src/**/*.test.ts`, `tests/integration/` | Cualquier reescritura tendría que replicar esa red de seguridad. |
| Node 22.23.4 LTS, Prisma 7 y TypeScript estricto | `package.json`, `.nvmrc` | El stack ya es moderno y recibe parches. |

Con ese panorama, Go no haría que Meta entregue más rápido ni que PostgreSQL
responda antes. Sí agregaría un segundo runtime, un segundo conjunto de
dependencias, dos pipelines de build, dos formas de desplegar y dos lugares
donde buscar un error.

---

## Qué cuesta introducir Go ahora

- **Seguridad duplicada:** autenticación, sesiones, CSRF, cifrado AES-256-GCM,
  índices ciegos HMAC y redacción de bitácora tendrían que existir en dos
  lenguajes. Un cambio de regla habría que hacerlo dos veces.
- **Datos duplicados:** Prisma genera el cliente y las migraciones. Un servicio
  en Go necesitaría su propio acceso a las mismas tablas o un contrato interno.
- **Operación:** dos imágenes, dos healthchecks, dos formas de leer logs y
  trazas, dos versiones de Node/Go que actualizar.
- **Equipo:** el conocimiento y las pruebas están en TypeScript. Mantener Go
  «por si acaso» cuesta más que el problema que resuelve.
- **Riesgo de regresión:** el flujo de WhatsApp tiene reglas finas (ventana de
  24 h, bajas, asignación, cifrado). Moverlo es más riesgoso que optimizarlo.

---

## Alternativas que sí mejoran el rendimiento sin cambiar de lenguaje

1. **Medir antes de optimizar:** latencia p50/p95 por ruta, tiempo de consulta,
   *event loop lag*, CPU y memoria. Sin números, cualquier reescritura es una
   apuesta.
2. **Índices y consultas:** revisar `EXPLAIN ANALYZE` de las consultas del panel
   y de los reportes; agregar índices compuestos cuando falten.
3. **Pool de conexiones:** ajustar el pool de PostgreSQL y, si hay varias
   réplicas, usar un pooler (PgBouncer o el de Railway).
4. **Procesos separados:** el worker de webhooks, el de campañas y el de IA
   pueden correr como procesos aparte (`node dist/worker.js`) para no competir
   con el panel. Sigue siendo el mismo lenguaje.
5. **Trabajo pesado en `worker_threads`:** compresión de respaldos, cifrado de
   archivos grandes o importación de CSV. Node lo resuelve sin otro runtime.
6. **Réplicas horizontales:** el panel y el webhook pueden escalar en horizontal
   cuando el socket.io y las colas tengan un adaptador compartido (Redis), que
   ya está en el backlog histórico.
7. **Caché:** respuestas de la base de conocimiento, configuración del workspace
   y sesiones calientes.

---

## Cuándo sí habría que revisar Go

Disparadores concretos, no intuiciones:

- Throughput sostenido por encima de **20–50 mensajes por segundo** por número o
  **cientos de webhooks por segundo** en una instalación multi-tenant.
- `p95` del webhook por encima de **150–200 ms** después de haber probado cola,
  índices y pool.
- *Event loop lag* por encima de **100 ms** de forma sostenida.
- CPU al **70 %** durante más de 10 minutos con tráfico normal.
- Procesamiento de **video o audio** que bloquee el proceso principal.
- Decenas de instalaciones multi-tenant en un solo despliegue.

Si se llega ahí, el orden es: medir, extraer el servicio con contrato claro,
ponerlo detrás de la cola o de HTTP y mantener el núcleo en Node. Go sería un
buen candidato para un **ingestor de webhooks** o un **procesador de medios**,
no para el panel ni para la lógica de negocio.

---

## Prueba opcional (si se quiere salir de la duda)

Un *spike* de una semana, en una rama, sin producción:

1. Levantar un servicio mínimo en Go que reciba un webhook, valide la firma y
   escriba en una cola.
2. Correr una prueba de carga contra el endpoint actual y contra el de Go con
   el mismo PostgreSQL.
3. Comparar p95, CPU y memoria.

Si la diferencia no es de orden de magnitud, se descarta y se sigue en Node. Si
lo es, se decide con datos y se extrae solo ese servicio.

---

## Consecuencias

- **Positivas:** un solo runtime, una sola forma de desplegar, la seguridad en
  un solo lugar y el equipo trabajando donde ya tiene contexto.
- **Negativas:** si el volumen crece mucho, Node exigirá más réplicas o más
  cuidado con el *event loop*. Es un costo conocido y medible.
- **Revisión:** este documento se actualiza cuando se cumpla alguno de los
  disparadores anteriores, no por preferencia de lenguaje.
