-- Interruptor de flujos guiados por número (aditivo).
ALTER TABLE "WhatsAppNumber" ADD COLUMN "guidedFlowsEnabled" BOOLEAN NOT NULL DEFAULT true;
