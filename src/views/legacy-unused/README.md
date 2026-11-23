# Vistas EJS archivadas

Las plantillas bajo `pages/` aquí se archivaron después de revisar las llamadas a `render()` en TypeScript y las rutas del panel. No tienen una llamada activa a `res.render`; no se incluyen en el flujo de ejecución. Las pantallas de operación habituales se sirven desde Angular. Algunas rutas explícitas de compatibilidad siguen renderizando otras plantillas EJS que permanecen en `src/views/pages`.

Se conservan como referencia histórica, pero no se copian a una ruta ejecutable. Las vistas activas restantes incluyen setup, páginas públicas, fallback de acceso y pantallas de compatibilidad de conversaciones/dashboard; la lista exacta de llamadas está en los controladores que usan `res.render`.
