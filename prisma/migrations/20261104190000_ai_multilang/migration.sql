-- Respuestas de IA en el idioma del cliente (inglés/portugués).
-- Aditivo y apagado por defecto: arreglo vacío = solo español, comportamiento
-- idéntico al actual.

ALTER TABLE "Workspace"
    ADD COLUMN "aiMultilangLanguages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
