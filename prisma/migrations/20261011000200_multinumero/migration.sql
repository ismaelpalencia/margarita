-- revisado: los datos de la cuenta se copiaron al número en la misma migración; respaldo previo tomado.
-- Multinúmero: la WABA guarda las credenciales y cada número su identidad.
--
-- Esta migración conserva los datos existentes: el número actual de cada
-- cuenta pasa a ser el primero de la nueva tabla, y las conversaciones y
-- campañas se reasignan a él antes de pasar la columna a obligatoria.

-- 1. Tabla de números
CREATE TABLE "WhatsAppNumber" (
    "id" TEXT NOT NULL,
    "whatsappAccountId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayName" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "status" TEXT,
    "qualityRating" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppNumber_pkey" PRIMARY KEY ("id")
);

-- 2. El número que ya estaba configurado se convierte en el primero
INSERT INTO "WhatsAppNumber" (
    "id",
    "whatsappAccountId",
    "phoneNumberId",
    "displayName",
    "phoneNumber",
    "status",
    "qualityRating",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    account."id",
    account."phoneNumberId",
    account."displayName",
    account."phoneNumber",
    account."status",
    account."qualityRating",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "WhatsAppAccount" AS account
WHERE account."phoneNumberId" IS NOT NULL
  AND btrim(account."phoneNumberId") <> ''
  AND account."phoneNumber" IS NOT NULL
  AND btrim(account."phoneNumber") <> '';

-- 3. Índices y llave foránea de la tabla nueva
CREATE UNIQUE INDEX "WhatsAppNumber_phoneNumberId_key" ON "WhatsAppNumber"("phoneNumberId");
CREATE INDEX "WhatsAppNumber_whatsappAccountId_idx" ON "WhatsAppNumber"("whatsappAccountId");
CREATE INDEX "WhatsAppNumber_isActive_idx" ON "WhatsAppNumber"("isActive");

ALTER TABLE "WhatsAppNumber"
    ADD CONSTRAINT "WhatsAppNumber_whatsappAccountId_fkey"
    FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Columnas nuevas, primero opcionales para poder rellenarlas
ALTER TABLE "Conversation" ADD COLUMN "whatsappNumberId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "whatsappNumberId" TEXT;

-- 5. Reasignación de los datos existentes al número de su workspace
UPDATE "Conversation" AS conversation
SET "whatsappNumberId" = number."id"
FROM "WhatsAppNumber" AS number
JOIN "WhatsAppAccount" AS account ON account."id" = number."whatsappAccountId"
WHERE conversation."workspaceId" = account."workspaceId"
  AND conversation."whatsappNumberId" IS NULL;

UPDATE "Campaign" AS campaign
SET "whatsappNumberId" = number."id"
FROM "WhatsAppNumber" AS number
JOIN "WhatsAppAccount" AS account ON account."id" = number."whatsappAccountId"
WHERE campaign."workspaceId" = account."workspaceId"
  AND campaign."whatsappNumberId" IS NULL;

-- 6. Si algo quedó sin número, se avisa con claridad en lugar de romper
--    la migración con un error genérico de columna nula.
DO $$
DECLARE
    pending_conversations integer;
    pending_campaigns integer;
BEGIN
    SELECT count(*) INTO pending_conversations FROM "Conversation" WHERE "whatsappNumberId" IS NULL;
    SELECT count(*) INTO pending_campaigns FROM "Campaign" WHERE "whatsappNumberId" IS NULL;

    IF pending_conversations > 0 OR pending_campaigns > 0 THEN
        RAISE EXCEPTION
            'No se puede migrar a multinúmero: % conversación(es) y % campaña(s) no tienen número asignado. Revisa que la cuenta de WhatsApp tenga phoneNumberId y phoneNumber configurados antes de migrar.',
            pending_conversations,
            pending_campaigns;
    END IF;
END $$;

ALTER TABLE "Conversation" ALTER COLUMN "whatsappNumberId" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "whatsappNumberId" SET NOT NULL;

-- 7. La unicidad pasa de (workspace, contacto) a (número, contacto)
DROP INDEX "Conversation_workspaceId_contactId_key";

CREATE INDEX "Conversation_whatsappNumberId_idx" ON "Conversation"("whatsappNumberId");
CREATE UNIQUE INDEX "Conversation_whatsappNumberId_contactId_key" ON "Conversation"("whatsappNumberId", "contactId");
CREATE INDEX "Campaign_whatsappNumberId_idx" ON "Campaign"("whatsappNumberId");

ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_whatsappNumberId_fkey"
    FOREIGN KEY ("whatsappNumberId") REFERENCES "WhatsAppNumber"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_whatsappNumberId_fkey"
    FOREIGN KEY ("whatsappNumberId") REFERENCES "WhatsAppNumber"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Ya con los datos copiados, se retiran los campos de número de la cuenta
ALTER TABLE "WhatsAppAccount" DROP COLUMN "displayName",
DROP COLUMN "phoneNumber",
DROP COLUMN "phoneNumberId",
DROP COLUMN "qualityRating",
DROP COLUMN "status";
