-- Botones opcionales en las respuestas de la base de conocimiento (aditivo).
ALTER TABLE "KnowledgeEntry" ADD COLUMN "buttons" JSONB;
