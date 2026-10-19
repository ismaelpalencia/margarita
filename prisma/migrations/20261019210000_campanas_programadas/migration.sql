-- Campañas programadas: fecha de salida y estado propio.
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TABLE "Campaign" ADD COLUMN "scheduledFor" TIMESTAMP(3);
