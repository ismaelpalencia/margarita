# Margarita: alcance de producto y producción

**Revisión:** 26 de noviembre de 2026. Este documento describe el estado del código del repositorio; no verifica el estado de un despliegue concreto. La disponibilidad de WhatsApp, llamadas, IA y almacenamiento depende de las cuentas y servicios configurados en cada instalación.

Los precios y límites comerciales se mantienen en [`precios.md`](precios.md). Para dar de alta un negocio usa [`configuracion-por-negocio.md`](configuracion-por-negocio.md).

## Estado real del producto

Margarita es una aplicación web para operar WhatsApp Business Cloud API con un equipo. Cada instalación se configura para un negocio (single-tenant por instalación). El panel operativo actual es Angular; Express/TypeScript controla rutas, sesión, permisos, lógica e integraciones.

La aplicación puede recibir mensajes y estados desde el webhook firmado de Meta, mostrar conversaciones y contactos, asignar hilos, responder con mensajes/medios/plantillas y registrar seguimiento. Campañas, IA, llamadas, notificaciones y almacenamiento externo requieren sus respectivas configuraciones y aceptación del cliente.

## Funcionalidades disponibles en el código

- Bandeja de administración/agente, conversación, asignación, toma/cierre, notas internas y eventos en vivo.
- Contactos, etiquetas, bajas, consentimiento declarado, bloqueo y acciones masivas.
- Mensajes de texto y multimedia, plantillas aprobadas por Meta, botones/listas cuando corresponden, respuestas rápidas y campañas controladas.
- Usuarios, roles de administrador/agente, sesiones, auditoría, reportes, configuración y respaldos.
- IA configurable con conocimiento, modos de sugerencia/respuesta, límites, presupuesto y handoff. El negocio es responsable de validar el contenido y los resultados.
- Llamadas entrantes y salientes de WhatsApp, sujetas a activación y configuración de Meta, Margarita, Call Service y TURN.
- Administración de WhatsApp Flows de Meta desde la configuración de WhatsApp: consulta, creación de borradores y publicación; consulta de catálogos y productos.
- El selector de número muestra los mensajes sin leer de cada número. Los avisos en vivo y push identifican el número asociado para distinguirlos cuando el usuario trabaja con varias líneas.

No se incluye grabación ni transcripción. Meta cobra aparte mensajes y llamadas; Cloudflare TURN e IA pueden generar cargos por consumo. No se ofrece soporte 24/7 ni desarrollo a medida en los planes de lista.

## Arquitectura

```text
WhatsApp ↔ Meta Cloud API → webhook firmado → Express/TypeScript → Prisma/PostgreSQL
                                                 ↕ Socket.IO
                                        Panel Angular (`frontend/`)

Navegador ↔ WebRTC/WSS ↔ `services/calls` ↔ Meta Calling API
                                ↕
                        Cloudflare Realtime TURN
```

- `src/`: servidor Express, rutas, middlewares, controladores, servicios, trabajos, validaciones y vistas.
- `frontend/`: panel Angular autenticado. Es el panel operativo principal.
- `prisma/`: schema y migraciones versionadas.
- `services/calls/`: servicio Node independiente para señalización y ciclo de llamadas. Margarita conserva usuarios, permisos, workspace, conversación, historial y auditoría. Calls no debe escribir directamente en tablas cifradas ni persistir SDP/tokens.
- `landing/`: sitio comercial estático generado por `npm run landing:build`.
- **EJS sigue activo** para `/setup`, determinadas páginas públicas/acceso y compatibilidad. No se debe retirar una vista por no aparecer en Angular; revisa sus rutas y `res.render` antes de proponer limpieza.

## Funciones de llamadas

La integración del servicio está implementada, pero solo opera cuando se despliega y configura. El webhook público sigue pasando por Margarita y debe tener la suscripción `calls`; Calls recibe eventos internos autenticados. Meta transporta el audio; Cloudflare TURN facilita conectividad cuando la ruta directa falla, no es un SFU.

La recepción entrante usa una sesión global del panel y no requiere tener abierta la conversación. Se prioriza al agente asignado si está disponible; un administrador con acceso al número puede atender como alternativa. Si no hay una sesión web conectada, se intenta Web Push y se mantiene la llamada pendiente brevemente para que el usuario abra la PWA; si nadie la abre dentro de la ventana de Meta, se rechaza y se registra como perdida. Push no garantiza contestar con la PWA cerrada. La llamada saliente requiere permiso de llamadas concedido. Las pruebas con número real, red/TURN y credenciales del negocio son necesarias antes de habilitar producción.

No hay grabación, transcripción ni recepción negociada con PWA cerrada. Revisa [`../services/calls/README.md`](../services/calls/README.md) para variables, endpoints, límites y pruebas manuales.

## IA y RAG

La IA existente permite configurar proveedor/modelo, conocimiento de negocio, instrucciones, límites, presupuesto, confianza, modo y reglas de handoff. Se recomienda iniciar en modo **Sugerencias** y probar casos anonimizados antes de habilitar respuestas automáticas. El coste del proveedor no se debe presentar como ilimitado ni como incluido fuera del límite acordado.

**RAG con embeddings/documentos no está implementado en el código actual.** Está en desarrollo y no debe venderse como capacidad disponible hasta que exista, se pruebe y se actualice esta descripción. Si la tabla de precios incluye RAG en Pro, aclara esa condición comercial antes de contratar; la fuente de precios es [`precios.md`](precios.md).

## Límites funcionales

- Meta controla aprobación/categoría de plantillas, cuotas, calidad, permisos y cargos del canal; Margarita refleja estados, no garantiza entrega final.
- La app no crea/aprueba plantillas ni sustituye Meta Business Manager.
- Los WhatsApp Flows de Meta todavía no se envían desde el compositor de conversaciones ni se procesan sus respuestas para guardarlas estructuradamente en contactos. El botón de ejemplo del panel solo completa el JSON del formulario; crear el borrador requiere una acción explícita y Meta sigue validando su contenido. Publicar hace que el Flow quede inmutable en Meta. Los flujos guiados del módulo de IA son una funcionalidad separada.
- No es CRM/ERP, facturación, pasarela de pago, agenda externa ni almacenamiento documental RAG.
- La autorización por roles se aplica al ámbito soportado por el código; no prometas permisos configurables por número si la instalación no los tiene.
- Las preferencias de sonido y avisos push/navegador son globales por usuario; aún no existe una preferencia para silenciar un número individual sin silenciar los demás.
- Algunos campos cifrados permiten búsqueda exacta, no búsqueda parcial general.
- Campañas requieren base legal/consentimiento, plantillas aprobadas, exclusiones y supervisión humana.
- WhatsApp, proveedor de IA, Meta Calling, Cloudflare TURN, hosting y almacenamiento pueden cambiar sus límites y tarifas.

## Seguridad, datos y continuidad

- El servidor autentica sesiones y aplica roles en las rutas protegidas.
- Webhook de Meta valida firma cuando la app está configurada; producción requiere el secreto correspondiente.
- Campos sensibles se cifran en reposo; la clave `ENCRYPTION_KEY` y secretos de integración deben custodiase fuera de Git y respaldarse de forma segura.
- Acceso a archivos debe conservar autorización de sesión, workspace y relación con el recurso.
- No guardar tokens, SDP, TURN credentials ni credenciales de Meta en logs, capturas o reportes.
- Respaldos requieren volumen persistente, retención acordada, control de acceso y restauración de prueba en entorno desechable.
- El negocio debe definir consentimiento, bajas, finalidad, retención, exportación, borrado, responsable de cuenta y solicitudes de privacidad.

Esta lista describe controles visibles en el código; proxy, secretos de producción, cuentas externas, permisos de proveedor, backups reales y estado del deployment deben verificarse en cada instalación.

## Precios y gastos externos

Consulta [`precios.md`](precios.md) para los importes oficiales y límites por plan. Los precios son MXN más IVA. Meta factura mensajes y llamadas por separado; Cloudflare TURN se cobra por consumo; la IA adicional/bolsa puede tener cargos separados. No se promete uso ilimitado, grabación, transcripción ni soporte 24/7.

## Despliegue e infraestructura

La configuración principal de Railway está declarada en `railway.json`; contempla build/start, migraciones predeploy y healthcheck. Cada ambiente necesita PostgreSQL, HTTPS, secretos correctos, almacenamiento persistente para medios/respaldos y supervisión. La landing se publica por separado como estático. Calls tiene Dockerfile y necesita HTTPS/WSS, secretos compartidos y variables TURN; no comparte la base de datos de Margarita.

El repositorio no demuestra qué dominios, variables, cuotas, volúmenes o versiones están activos en producción. No considerar un servicio listo solo porque existe su configuración local.

## Operación por negocio

Antes de habilitar clientes, completa [`configuracion-por-negocio.md`](configuracion-por-negocio.md): Meta/WABA/número/webhook, plantillas, horario, roles, etiquetas, consentimiento, campañas, IA, llamadas si aplican, volumen, backups, salud y responsable de incidentes. Todo punto bloqueante debe tener responsable y evidencia sin secretos.

## Pendientes conocidos

- Implementar y validar RAG antes de ofertarlo como función disponible.
- Probar llamadas entrantes/salientes por cada configuración Meta/país elegible, incluyendo TURN, estados de colgado, servicio caído y política cuando PWA/agent no está disponible.
- Definir/pactar límites de IA, llamadas/minutos y política de consumo de cada cuenta.
- Verificar backup/restore y retención en un entorno no productivo de cada cliente.
- Mantener identificadas las rutas EJS aún activas junto con las rutas Angular; no eliminar vistas por no aparecer en el router Angular.

## Criterios para vender

Vender solo si el caso encaja en atención por WhatsApp, el número/cuenta de Meta son elegibles, el cliente acepta los cargos externos y hay responsables para consentimiento, bajas, contenido, credenciales y operación. Confirmar el plan y onboarding en [`precios.md`](precios.md), y completar los puntos bloqueantes del checklist antes del arranque.

## Criterios para no vender o pausar el alta

No vender ni activar si el cliente requiere RAG operativo hoy, grabación/transcripción, soporte 24/7, uso ilimitado, permisos por número no soportados, CRM/ERP/agenda/pasarela no implementados o mensajes sin consentimiento. Pausar si Meta rechaza el número/app, no hay pago/permiso, no se puede validar webhook HTTPS, falta responsable, no existen backups verificables o los costes/proveedores no están aceptados.

## Verificación del repositorio

```bash
npm run landing:build
npm run build
npx tsc --noEmit
npm test
npm --prefix frontend test -- --watch=false
```

Las pruebas de integración requieren PostgreSQL desechable; nunca las apuntes a producción. La prueba manual de llamadas usa el número, permisos y credenciales reales del cliente y debe acordarse previamente.
