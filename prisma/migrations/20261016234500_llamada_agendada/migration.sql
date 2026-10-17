-- Llamada agendada: fecha y hora elegidas por el equipo (en UTC).
ALTER TABLE "Contact" ADD COLUMN "scheduledCallAt" TIMESTAMP(3);
