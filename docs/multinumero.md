# Multinúmero (varios números de la misma WABA)

Cómo quedó implementado y qué falta. Última revisión: 2026-10-11.

## La idea

Una cuenta de WhatsApp Business (WABA) puede tener **varios números**. La operación los usa para cosas distintas: uno para primer contacto, dos para seguimientos, etc.

El panel funciona **desde un número activo**: el usuario lo elige en el encabezado y todo lo que hace —bandeja, conversaciones nuevas y campañas— sale de ese número. No se elige número por mensaje.

## Qué es de la cuenta y qué es del número

| De la WABA (se comparte) | De cada número (individual) |
| --- | --- |
| Access token | `phone_number_id` |
| Business account ID | Nombre visible |
| Verify token del webhook | **Calidad** |
| Versión de API | Estado y límite de mensajería |
| Plantillas | Sus propios hilos |

Esto es lo que hace que valga la pena: un número con problemas de calidad **no arrastra a los demás**.

## Modelo

| Entidad | Cambio |
| --- | --- |
| `WhatsAppAccount` | Se queda solo con las credenciales de la WABA |
| `WhatsAppNumber` | Nueva: `phoneNumberId` único, nombre, calidad, estado y `isActive` |
| `Conversation` | Gana `whatsappNumberId`; su unicidad pasa de `(workspace, contacto)` a `(número, contacto)` |
| `Campaign` | Gana `whatsappNumberId` |
| `Message` | Sin cambios: hereda el número de su conversación |

**Esa es la consecuencia que hay que entender**: si un cliente escribe a dos números, aparecen **dos hilos**, uno por número. Es correcto —WhatsApp los trata como conversaciones distintas y la ventana de 24 horas es por par número-cliente— pero hay que explicárselo al equipo.

## Migración de datos existentes

La migración `20261011000200_multinumero` **conserva todo**: el número que ya estaba configurado en la cuenta se copia como el primero de la tabla nueva, y las conversaciones y campañas existentes se reasignan a él antes de que la columna pase a obligatoria.

Si algo no se pudiera asignar (porque la cuenta no tuviera número configurado), la migración **falla con un mensaje explícito** en lugar de romperse con un error genérico de columna nula.

## Cómo se usa

1. **Admin → WhatsApp**: la pantalla lista los números con su calidad y estado. Ahí se agregan, se editan, se activan o desactivan y se prueba la conexión de cada uno.
2. **Encabezado**: si hay más de un número activo aparece un selector. Al cambiarlo, la bandeja y las campañas pasan a ser las de ese número.
3. **Campañas**: se crean y se envían desde el número activo.
4. **Conversaciones**: cada hilo pertenece a un número; las respuestas salen de ese número, sin importar cuál esté activo después.

Las credenciales (token, verify token, business account) se editan una sola vez para toda la cuenta.

## Pendiente

### Asignar números a agentes

Cuando el equipo crezca, conviene que el admin decida qué números ve cada agente. El diseño es una tabla intermedia `UserNumber` (usuario ↔ número) y tres cambios:

- El selector del agente muestra solo sus números.
- La bandeja del agente filtra por número activo y por los números que le tocan.
- El admin asigna desde la pantalla del agente, con selección múltiple.

Mientras no exista, **todos los agentes ven todos los números**, que es lo correcto para un equipo pequeño.

### Otras mejoras que habilita el multinúmero

- **Repartir una campaña entre varios números** (por ejemplo, mitad y mitad) para no cargar la calidad de uno solo.
- **Métricas por número**: volumen enviado, fallos y calidad en el tiempo.
- **Reglas de enrutamiento**: que un número se use solo para primer contacto y otro solo para seguimiento, automáticamente.

## Riesgos que conviene tener presentes

- Cada número nuevo arranca en el nivel mínimo de mensajería y necesita su nombre visible aprobado por Meta.
- El cobro de conversaciones es por número y por cliente.
- La política de WhatsApp no cambia por tener más números: el consentimiento y las bajas siguen siendo responsabilidad de la operación. Un número usado para contacto en frío es el que pierde calidad primero, y Meta evalúa la WABA además de cada número.
