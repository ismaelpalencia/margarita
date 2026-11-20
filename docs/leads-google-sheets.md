# Leads a Google Sheets

Margarita puede enviar cada lead nuevo a una hoja de Google sin OAuth ni
extensiones: se usa un Web App de Google Apps Script.

## 1. Crear la hoja

Crea una hoja de cálculo con una pestaña llamada `Leads` y encabezados:

```text
Fecha | Nombre | Teléfono | Correo | Origen
```

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
