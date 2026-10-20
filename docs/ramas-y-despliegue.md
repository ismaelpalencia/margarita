# Ramas y despliegue: `main`, `release` y staging

Cómo se publica sin actualizar a todos los clientes al mismo tiempo, y cómo se
revierte si algo sale mal. Es configuración y disciplina, no código.

> **Estado actual (19 de octubre de 2026):** el repositorio solo tiene `main`.
> `release` todavía **no existe**, así que las instalaciones nuevas se conectan
> a `main` y cada push las actualiza. Este documento describe el modelo al que
> conviene pasar antes de tener clientes reales; no lo tomes como configuración
> ya aplicada.

---

## 1. El mapa

| Rama | Qué despliega | Para qué |
| --- | --- | --- |
| `main` | **Staging** (un proyecto de Railway aparte, con su propia base) | Probar todo antes de que lo vea un cliente |
| `release` | **Los proyectos de los clientes** | La única rama que toca datos reales |

Regla de oro: **un push a `main` no debe llegar a un cliente.** Los proyectos de
clientes escuchan solo `release`.

---

## 2. Configuración (una sola vez)

1. En Railway, crea un proyecto **staging** conectado a `main`, con su propia
   base de datos y un dominio `staging.margaritaapp.org`.
2. En cada proyecto de cliente: *Settings → Source* → rama **`release`**.
3. En GitHub, protege `release`: solo se actualiza desde un pull request
   aprobado, y no se permite push directo.
4. Verifica: un push de prueba a `main` debe reiniciar **solo** staging.

---

## 3. El ciclo de una versión

1. **Desarrollo** en una rama corta → pull request a `main`.
2. CI en verde (tipos, pruebas, build, integración, auditoría de migraciones).
3. Merge a `main` → staging se actualiza solo.
4. **Prueba manual en staging**: entrar, mandar un mensaje, ver la bandeja,
   abrir Reportes → Hoy y revisar `/health`.
5. Pull request `main → release` → merge → los clientes se actualizan.

No se despliega un viernes por la tarde ni el día de un cobro masivo. Si hay que
publicar con prisa, primero a staging.

---

## 4. Migraciones: el único paso irreversible

Las migraciones corren **antes de arrancar**. El healthcheck protege de una
versión que no levanta, pero no de una migración mala: el esquema ya cambió y
volver el código atrás no lo deshace.

Por eso:

- Toda migración destructiva (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`,
  `DELETE FROM`, cambio de tipo) lleva **`-- revisado: <motivo>`** en su
  primera línea. El CI la bloquea si no lo tiene
  (`node scripts/check-migrations.mjs`).
- Antes de publicar una migración destructiva: **respaldo manual** y probar la
  migración en una copia de la base.
- Nunca se edita una migración ya aplicada: se agrega otra que corrija.

---

## 5. Si algo sale mal

### La versión nueva no arranca

Railway conserva la anterior porque el healthcheck falla. No hay nada que hacer
más que corregir y volver a publicar.

### Arranca, pero algo se rompe

1. **Revierte el código**: en Railway, *Deployments* → el despliegue anterior →
   *Redeploy*. O `git revert` en `release` y push.
2. **Si hubo migración**, el esquema **no** vuelve: hay que restaurar el
   respaldo.
3. Avisar a los clientes afectados con el tiempo estimado, no con un
   "estamos viendo".

### Restaurar una base

```bash
# 1. Traer el respaldo del servidor (o de la descarga manual)
# 2. Validar sin escribir
npm run db:restore -- --file=/ruta/al/respaldo.json --dry-run

# 3. Restaurar
npm run db:restore -- --file=/ruta/al/respaldo.json
```

La restauración necesita la **misma `ENCRYPTION_KEY`** con la que se creó el
respaldo.

---

## 6. Checklist antes de un despliegue a clientes

- [ ] CI en verde en `main` y en `release`.
- [ ] Staging probado a mano (login, bandeja, envío, reportes, `/health`).
- [ ] `npm run check-migrations` sin hallazgos, o migraciones destructivas
      marcadas y con respaldo.
- [ ] Variables nuevas documentadas en [`deploy-railway.md`](deploy-railway.md).
- [ ] Respaldo manual reciente.
- [ ] No es viernes por la tarde.
