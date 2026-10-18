# Runbook de operación

Lo que hay que hacer para conectar a un cliente, sostener el servicio y cerrar
un contrato sin improvisar. Es el documento interno del operador.

---

## 1. Conexión con Meta (paquete A, 75-90 minutos)

| Paso | Qué se hace | Tiempo | Quién |
| --- | --- | --- | --- |
| 1 | Portafolio de Meta Business y verificación del negocio | 20 min | Cliente |
| 2 | App de tipo Business y producto WhatsApp; App ID y App Secret | 10 min | Operador |
| 3 | Cuenta de WhatsApp Business (WABA) y número registrado con PIN | 20 min | Cliente |
| 4 | Token permanente del usuario de sistema y método de pago | 10 min | Cliente |
| 5 | Credenciales en Admin → WhatsApp y webhook firmado en Meta | 10 min | Operador |
| 6 | Prueba de punta a punta: enviar plantilla, tocar botón, ver el resultado | 10 min | Operador |

**Si el cliente ya tiene Meta (paquete B)**: se salta 1–4; solo se cargan
credenciales, se registra el webhook y se prueba.

**Señales de que algo falta**:

- El webhook responde 401 → el App Secret no coincide.
- Los envíos fallan con `131042` → no hay método de pago en Meta.
- La plantilla no aparece → no está aprobada o falta sincronizar.

---

## 2. SLA realista (lo que se promete por escrito)

| Concepto | Compromiso |
| --- | --- |
| Horario de soporte | Lunes a viernes, 9:00 a 18:00 (hora de Ciudad de México) |
| Canal | WhatsApp y correo |
| Respuesta | 4 horas hábiles para dudas; 2 horas hábiles para el servicio caído |
| Mantenimiento | Avisado con 24 horas, fuera del horario de cobranza |
| Disponibilidad | No se promete 99.9%. Se promete: monitoreo, respaldos y aviso cuando algo falla |
| Incidentes de Meta | Se informan con lo que Meta reporte; no dependen de nosotros |

Lo que **no** se promete: atención 24/7, tiempos de resolución de Meta,
disponibilidad de la red del cliente ni recuperación de mensajes que Meta no
entregó.

---

## 3. Respaldos: quién, cuándo y dónde

| Actividad | Frecuencia | Quién |
| --- | --- | --- |
| Respaldo automático (cifrado) | Cada 24 horas | La app |
| Verificar que el último respaldo sea reciente (`/health` y Admin → Respaldos) | Semanal | Operador |
| Descargar una copia fuera del servidor | Semanal | Operador |
| Probar una restauración (`--dry-run`) | Mensual | Operador |
| Respaldo manual antes de una migración destructiva | Cada vez | Operador |

La copia descargada se guarda en un almacenamiento distinto al de Railway
(almacenamiento en la nube del operador). Sin la `ENCRYPTION_KEY`, el respaldo no
se puede leer: la llave vive en el gestor de contraseñas, no en el mismo lugar
que la copia.

---

## 4. Alta de un cliente: checklist mínimo

- [ ] Contrato firmado (paquete A o B y modalidad de mensualidad).
- [ ] **Dos administradores** dados de alta, con contraseñas distintas.
- [ ] Verificación en dos pasos activada en las cuentas de administrador.
- [ ] Volumen de archivos montado y `MEDIA_STORAGE_DIR` apuntando ahí.
- [ ] `APP_URL` con el dominio del cliente, sin barra al final.
- [ ] Webhook registrado en Meta y `/health` con `webhooksArriving` en verde.
- [ ] Plantilla de cobranza aprobada y sincronizada.
- [ ] Prueba de punta a punta hecha (plantilla → botón → resultado).
- [ ] Sesión de arranque de 2 horas agendada.
- [ ] Aviso de privacidad con el domicilio y el plazo de 7 días hábiles.

---

## 5. Cierre de contrato

1. Aviso por escrito con 15 días (después del piloto).
2. Generar y **verificar** el respaldo final.
3. Entregar el respaldo al cliente.
4. Borrar la instalación con la confirmación del identificador.
5. Guardar la constancia de la bitácora y cerrar el acceso del equipo.
