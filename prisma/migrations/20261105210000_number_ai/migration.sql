-- Interruptor de IA por número (aditivo).
ALTER TABLE "WhatsAppNumber" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT true;
