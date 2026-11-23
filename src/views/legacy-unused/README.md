# Vistas EJS archivadas

Las plantillas bajo `pages/` aquí se archivaron después de revisar las llamadas estáticas a `render()` en TypeScript y las rutas del panel. No tienen una llamada activa a `res.render`; las pantallas equivalentes se sirven desde Angular o sus controladores redirigen al panel Angular. También se archivan parciales que dejaron de tener referencias, como el panel de resultado de gestión de conversaciones.

Se conservan como referencia histórica, pero no se copian a una ruta ejecutable. Las demás vistas EJS permanecen en `src/views/pages` y `src/views/partials` porque todavía se renderizan como fallback del servidor o para errores de validación.
