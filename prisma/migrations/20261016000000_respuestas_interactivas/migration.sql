-- Respuestas de botones y listas (fase 1 de las interacciones).
--
-- Hasta ahora un toque del cliente se guardaba como "[Mensaje interactivo]" y
-- el dato se perdía: no se sabía qué opción eligió. Con estas columnas la
-- respuesta queda completa.
--
-- `replyId` va en claro a propósito: es una llave (no contenido) y sirve para
-- mapearla a un resultado de gestión y para filtrar. `replyTitle`, que es lo
-- que la persona vio, se guarda **cifrado** por la extensión de cifrado en
-- reposo, como el cuerpo de cualquier mensaje.
--
-- Migración aditiva: no toca datos existentes ni columnas anteriores.

ALTER TABLE "Message"
ADD COLUMN     "interactiveType" TEXT,
ADD COLUMN     "replyId" TEXT,
ADD COLUMN     "replyTitle" TEXT;
