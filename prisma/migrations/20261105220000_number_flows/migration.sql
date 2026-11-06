-- Interruptor de flujos por número (aditivo).
ALTER TABLE "WhatsAppNumber" ADD COLUMN "flowsEnabled" BOOLEAN NOT NULL DEFAULT true;
