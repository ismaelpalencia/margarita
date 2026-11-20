# Leads a Google Sheets

Margarita puede enviar cada lead nuevo a una hoja de Google sin OAuth ni
extensiones: se usa un Web App de Google Apps Script.

## 1. Crear la hoja

Crea una hoja de cálculo con una pestaña llamada exactamente:

```text
Leads
```

No uses "leads", "LEADS" ni "Hoja 1": el script busca el nombre exacto. Si no
existe, el script intenta crearla, pero es mejor crearla tú con estos
encabezados en la fila 1:

```text
Fecha | Nombre | Teléfono | Correo | Origen
```

> El botón **Exportar CSV** descarga un archivo; no manda nada a Google
> Sheets. La integración con Sheets solo se dispara cuando se crea un lead
> nuevo. Los leads anteriores no se reenvían solos.

## 2. Apps Script

En la hoja:

```text
Extensiones → Apps Script
```

Pega:

```javascript
const SECRET = "cambia-este-secreto";

function doPost(e) {
  const data = JSON.parse(e.postData.contents);

  if (SECRET && data.secret !== SECRET) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: "secret" })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads") ||
    SpreadsheetApp.getActiveSpreadsheet().insertSheet("Leads");

  sheet.appendRow([
    new Date(),
    data.name || "",
    data.phone || "",
    data.email || "",
    data.source || ""
  ]);

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}
```

## 3. Publicar

```text
Implementar → Nueva implementación → Tipo: Aplicación web
Ejecutar como: Yo
Quién tiene acceso: Cualquier persona con el enlace
```

Copia la URL que termina en:

```text
/exec
```

No uses la URL de `/dev`: esa solo funciona mientras estás probando dentro
de Apps Script y con tu sesión de Google.

Cada vez que cambies el script, crea una **nueva implementación** y vuelve a
copiar la URL. Guardar el script no actualiza el Web App publicado.

## Probar el Web App sin Margarita

```bash
curl -L -X POST "https://script.google.com/macros/s/TU_ID/exec" \
  -H "content-type: application/json" \
  -d '{"secret":"TU_SECRETO","name":"Prueba","phone":"2221234567","email":"prueba@example.com"}'
```

Debe responder:

```json
{"ok":true}
```

Si responde `{"ok":false,"error":"secret"}`, el secreto no coincide.

## 4. Configurar en Margarita

```text
Admin → Leads → Google Sheets
```

Pega:

- URL del Web App,
- secreto de la hoja.

Guarda.

Cada lead nuevo envía:

```json
{
  "secret": "...",
  "name": "Ana Torres",
  "phone": "+52...",
  "email": "ana@example.com",
  "interest": "...",
  "source": "MANUAL_CHAT",
  "status": "NUEVO",
  "createdAt": "..."
}
```

## Notas

- El envío es independiente del webhook CRM.
- No bloquea el guardado si Google falla.
- La hoja no recibe campos del flujo, solo nombre, teléfono, correo, origen y fecha.
- El secreto no es autenticación fuerte; protege contra envíos accidentales, no contra alguien que tenga la URL completa.
- Para producción seria, usa una cuenta de servicio de Google o un endpoint propio con HMAC.

## CSV

En **Leads → Exportar CSV** puedes elegir columnas:

- nombre,
- teléfono,
- correo,
- interés,
- origen,
- estado,
- creado,
- ID.

Los campos del flujo son opcionales y solo se agregan al marcar
**Incluir campos capturados por el flujo**.
