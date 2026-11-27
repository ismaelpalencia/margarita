# Alta y configuración por negocio

Checklist reutilizable para incorporar una instalación/cliente de Margarita. Completa una copia por negocio y conserva la evidencia en el espacio autorizado del proyecto; no guardes secretos ni datos personales en Git.

## Cómo usar el checklist

- En cada fila registra a la persona que ejecuta o valida el punto, el estado, la referencia de evidencia, la fecha y si bloquea el alta.
- Estados sugeridos: **Pendiente**, **En curso**, **Validado** o **No aplica**. “No aplica” también requiere responsable y justificación como evidencia.
- Evidencia: identificador o ubicación protegida, nunca el valor de un token, contraseña, API key, PIN ni secreto.
- Un punto bloqueante debe estar validado antes de habilitar producción o el flujo que depende de él.
- No actives campañas ni respuestas automáticas hasta confirmar consentimiento, bajas, límites y responsables.

## Identidad del negocio

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Nombre comercial y nombre que verá el equipo |  | ☐ Pendiente |  |  | Sí / No |
| Razón social |  | ☐ Pendiente |  |  | Sí / No |
| RFC y datos fiscales |  | ☐ Pendiente |  |  | Sí / No |
| Domicilio fiscal y domicilio de operación, si difieren |  | ☐ Pendiente |  |  | Sí / No |
| Logo en formato y resolución acordados |  | ☐ Pendiente |  |  | Sí / No |
| Tono de atención, palabras preferidas y expresiones que deben evitarse |  | ☐ Pendiente |  |  | Sí / No |
| Horarios, zona horaria, días festivos y mensaje fuera de horario |  | ☐ Pendiente |  |  | Sí / No |
| Sitio web y dominio oficial |  | ☐ Pendiente |  |  | Sí / No |
| Correo de contacto y correo de privacidad/soporte |  | ☐ Pendiente |  |  | Sí / No |
| Teléfono de contacto del negocio |  | ☐ Pendiente |  |  | Sí / No |

## Meta y WhatsApp Business

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Business Manager/portafolio empresarial correcto |  | ☐ Pendiente | ID o vínculo interno protegido |  | Sí |
| Verificación de empresa y estado de revisión |  | ☐ Pendiente | Estado visible en Meta Business |  | Sí / No |
| WABA asociada al negocio |  | ☐ Pendiente | WABA ID protegido |  | Sí |
| Número empresarial registrado y activo |  | ☐ Pendiente | Últimos 4 dígitos e ID protegido |  | Sí |
| PIN de verificación configurado y custodiado por el responsable |  | ☐ Pendiente | Confirmar configuración; no copiar PIN |  | Sí |
| Método de pago activo en Meta |  | ☐ Pendiente | Estado de facturación, sin datos bancarios |  | Sí |
| Callback webhook apunta al dominio de Margarita |  | ☐ Pendiente | URL y resultado de verificación |  | Sí |
| Verify token cargado en ambas configuraciones |  | ☐ Pendiente | Confirmación de coincidencia; nunca registrar el valor |  | Sí |
| App Secret cargado en el gestor de secretos de la instalación |  | ☐ Pendiente | Nombre de variable y prueba de firma; no copiar secreto |  | Sí |
| App suscrita al campo `messages` de la WABA |  | ☐ Pendiente | Captura/registro de suscripción |  | Sí |
| App suscrita al campo `calls` si se habilitarán llamadas |  | ☐ Pendiente | Captura/registro de suscripción o No aplica justificado |  | Sí / No |
| Categoría de cuenta/negocio y casos de uso revisados |  | ☐ Pendiente | Categoría registrada en Meta |  | Sí / No |
| Límite de mensajería y nivel actual confirmados |  | ☐ Pendiente | Estado y límite visibles en Meta |  | Sí |
| Calidad del número y alertas/restricciones revisadas |  | ☐ Pendiente | Calidad reportada y fecha |  | Sí |
| Cargos, moneda y facturación de Meta explicados al cliente |  | ☐ Pendiente | Aceptación o material comercial compartido |  | Sí |

## Plantillas

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Idioma aprobado por el negocio |  | ☐ Pendiente | Lista de idiomas acordados |  | Sí / No |
| Categoría de cada plantilla elegida según su uso |  | ☐ Pendiente | Nombre, categoría y caso de uso |  | Sí / No |
| Variables documentadas con tipo y origen del dato |  | ☐ Pendiente | Ejemplos ficticios, sin datos reales |  | Sí / No |
| Ejemplos de encabezado y cuerpo revisados |  | ☐ Pendiente | Copia aprobada por negocio |  | Sí / No |
| Botones, URLs y respuestas rápidas revisados |  | ☐ Pendiente | Prueba con URL no sensible |  | Sí / No |
| Aprobación/estado de Meta confirmado antes del uso |  | ☐ Pendiente | Estado de plantilla en Meta |  | Sí |
| Plantillas sincronizadas en Margarita y prueba de envío completada |  | ☐ Pendiente | Plantilla visible y resultado de prueba |  | Sí |

## Llamadas de WhatsApp

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Confirmar si el plan/alcance contratado habilita llamadas |  | ☐ Pendiente | Plan y alcance aprobado |  | Sí |
| Calling API habilitada para el número empresarial en Meta |  | ☐ Pendiente | Estado en WhatsApp Manager |  | Sí |
| País de destino/origen permitido para la cuenta y el caso de uso |  | ☐ Pendiente | Países/limitaciones confirmados en Meta |  | Sí |
| Tier o nivel de llamadas y límites confirmados |  | ☐ Pendiente | Estado visible en Meta |  | Sí |
| Permiso de llamada requerido concedido por el usuario/cliente |  | ☐ Pendiente | Registro permitido por las reglas de Meta |  | Sí |
| Cloudflare TURN Key ID configurado en Call Service |  | ☐ Pendiente | Identificador en gestor de secretos |  | Sí |
| API token de TURN configurado solo en Call Service |  | ☐ Pendiente | Nombre/estado del secreto; nunca copiar el token |  | Sí |
| Dominio del Call Service con HTTPS/WSS y origen correcto |  | ☐ Pendiente | URL y healthcheck HTTPS |  | Sí |
| Prueba entrante: timbrado, aceptación, audio bidireccional y colgado |  | ☐ Pendiente | Fecha, número de prueba y resultado; sin grabar audio |  | Sí |
| Prueba saliente: permiso, timbrado, audio bidireccional y colgado |  | ☐ Pendiente | Fecha, número de prueba y resultado; sin grabar audio |  | Sí |
| Política fuera de horario definida (rechazo/aviso/seguimiento) |  | ☐ Pendiente | Decisión del negocio y responsable |  | Sí |
| Política de agente desconectado/no disponible definida |  | ☐ Pendiente | Comportamiento acordado; confirmar que PWA debe estar abierta |  | Sí |
| Costos de Meta y Cloudflare TURN explicados por separado |  | ☐ Pendiente | Estimación/aceptación comercial |  | Sí |

## IA

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Proveedor de IA autorizado y región/retención revisadas |  | ☐ Pendiente | Proveedor y condiciones aprobados |  | Sí / No |
| API key guardada en variables/gestor de secretos |  | ☐ Pendiente | Nombre de variable y prueba; no copiar la key |  | Sí si IA aplica |
| Modelo seleccionado y disponibilidad confirmada |  | ☐ Pendiente | Identificador de modelo |  | Sí si IA aplica |
| Presupuesto mensual aprobado |  | ☐ Pendiente | Monto y responsable que recibe alertas |  | Sí si IA aplica |
| Límites por conversación/día y límites de respuesta configurados |  | ☐ Pendiente | Valores aprobados, sin prometer uso ilimitado |  | Sí si IA aplica |
| Conocimiento revisado por el negocio y dueño del contenido nombrado |  | ☐ Pendiente | Fuentes y fecha de revisión |  | Sí si IA aplica |
| Prompt de negocio: giro, tono, alcance y prohibiciones revisados |  | ☐ Pendiente | Versión aprobada |  | Sí si IA aplica |
| Palabras/temas de handoff definidos y probados |  | ☐ Pendiente | Lista de prueba y resultado |  | Sí si IA aplica |
| Modo inicial configurado en **Sugerencias** |  | ☐ Pendiente | Captura/registro de configuración |  | Sí si IA aplica |
| Prueba con preguntas reales anonimizadas y respuestas esperadas aprobadas |  | ☐ Pendiente | Casos anonimizados, evaluación y aprobación |  | Sí si IA aplica |
| Costos de proveedor y bolsa/consumo adicional explicados |  | ☐ Pendiente | Aceptación comercial |  | Sí si IA aplica |

## Operación

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Lista de usuarios, correos de acceso y estado laboral confirmados |  | ☐ Pendiente | Lista aprobada en repositorio seguro |  | Sí |
| Rol de cada usuario (administrador/agente) aprobado |  | ☐ Pendiente | Matriz de usuarios y roles |  | Sí |
| Números activos del workspace confirmados |  | ☐ Pendiente | Lista de números con IDs parcialmente ocultos |  | Sí |
| Alcance de acceso por número explicado; no prometer separación no soportada |  | ☐ Pendiente | Confirmación del responsable del negocio |  | Sí |
| Etiquetas y significado acordados |  | ☐ Pendiente | Catálogo inicial aprobado |  | Sí / No |
| Respuestas rápidas revisadas y probadas |  | ☐ Pendiente | Lista aprobada y prueba |  | Sí / No |
| Horarios, zona horaria y comportamiento fuera de horario configurados |  | ☐ Pendiente | Captura/registro y prueba |  | Sí |
| Respuesta por ausencia, mensaje e intervalo definidos; activación manual probada si se usa |  | ☐ Pendiente | Captura/registro y prueba entrante sin personal disponible |  | No |
| Campañas: audiencias, plantillas aprobadas, consentimiento, exclusiones y responsable |  | ☐ Pendiente | Checklist de autorización y prueba controlada |  | Sí si campañas aplican |
| Leads: campos, etapas, responsable y acceso acordados |  | ☐ Pendiente | Flujo aprobado |  | Sí / No |
| Google Sheets configurado solo si aplica y con permisos mínimos |  | ☐ Pendiente | Hoja/cuenta de prueba y propietario |  | Sí / No |

## Infraestructura

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Dominio de la instalación validado y asociado al negocio |  | ☐ Pendiente | DNS/hostname visible |  | Sí |
| HTTPS válido en el dominio público |  | ☐ Pendiente | Certificado y navegación HTTPS |  | Sí |
| PostgreSQL accesible por la instalación y con backups definidos |  | ☐ Pendiente | Healthcheck de DB sin credenciales |  | Sí |
| Volumen persistente de medios montado y ruta configurada |  | ☐ Pendiente | Ruta y prueba de persistencia |  | Sí si media aplica |
| Respaldos automáticos y manuales verificados |  | ☐ Pendiente | Último resultado y restauración en entorno de prueba |  | Sí |
| Retención y borrado de medios/datos acordados |  | ☐ Pendiente | Política aprobada con responsable |  | Sí |
| Cloudflare R2 configurado si aplica; credenciales y permisos mínimos |  | ☐ Pendiente | Estado de conexión, sin secretos |  | Sí / No |
| Logs, alertas y responsable de incidentes definidos |  | ☐ Pendiente | Canal y prueba de alerta |  | Sí |
| `/health` responde desde el entorno y el resultado se entiende |  | ☐ Pendiente | Estado/fecha, sin exponer token |  | Sí |
| Variables de entorno comparadas con `.env.example` y secretos rotables |  | ☐ Pendiente | Lista de nombres presentes, nunca valores |  | Sí |

## Legal y privacidad

| Punto | Responsable | Estado | Evidencia (sin secretos/datos innecesarios) | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Aviso de privacidad aplicable compartido con el negocio |  | ☐ Pendiente | Versión y constancia de entrega |  | Sí |
| Contrato y anexos revisados y firmados por responsables autorizados |  | ☐ Pendiente | Referencia protegida y fecha de firma |  | Sí |
| Consentimiento para contactar y base legal definidos por el negocio |  | ☐ Pendiente | Procedimiento y evidencia de prueba |  | Sí |
| Procedimiento para bajas y solicitudes de no contacto probado |  | ☐ Pendiente | Caso de prueba y responsable |  | Sí |
| Política de datos: finalidad, acceso, retención, exportación y borrado acordada |  | ☐ Pendiente | Documento aprobado |  | Sí |
| Responsable de la cuenta de Meta y contacto de emergencia nombrados |  | ☐ Pendiente | Nombre/rol y canal de contacto protegido |  | Sí |
| Encargados/proveedores externos y sus cobros comunicados |  | ☐ Pendiente | Confirmación de proveedores y aceptación |  | Sí |

## Aprobación de salida

| Puerta | Responsable | Estado | Evidencia | Fecha | Bloqueante |
| --- | --- | --- | --- | --- | --- |
| Todas las filas bloqueantes están validadas o tienen excepción escrita aprobada |  | ☐ Pendiente | Lista de excepciones con dueño y plazo |  | Sí |
| Admin del negocio acepta el alcance, límites, cargos externos y proceso de soporte |  | ☐ Pendiente | Aprobación identificable |  | Sí |
| Responsable técnico confirma monitoreo, backups y recuperación |  | ☐ Pendiente | Revisión final y prueba de recuperación |  | Sí |
| Fecha y responsable de habilitación de producción |  | ☐ Pendiente | Aprobación de salida |  | Sí |
