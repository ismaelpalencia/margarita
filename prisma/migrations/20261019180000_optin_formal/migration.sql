-- Registro formal del consentimiento: canal y quién lo capturó.
ALTER TABLE "Contact" ADD COLUMN "optInSource" TEXT;
ALTER TABLE "Contact" ADD COLUMN "optInRecordedById" TEXT;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_optInRecordedById_fkey"
  FOREIGN KEY ("optInRecordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
