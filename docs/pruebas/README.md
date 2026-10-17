# Volcados reales de Meta

Aquí se guardan los eventos que mandó Meta en las pruebas contra un número real,
**tal cual llegaron**. Son la evidencia de que el mapeo de botones funciona y el
dato con el que se escriben las pruebas automáticas.

Cómo obtenerlos: Admin → Logs → Webhooks recibidos → «Copiar evento»
(ver [`../pruebas-meta.md`](../pruebas-meta.md)).

Convención de nombre:

```
AAAA-MM-DD-boton-<texto-o-id>.json
```

Ejemplo: `2026-10-16-boton-quiero-que-me-llame.json`.

> Los eventos incluyen el teléfono del cliente. Antes de subirlos, cámbialo por
> un número de prueba (`5215500000000`) y quita cualquier nombre real.
