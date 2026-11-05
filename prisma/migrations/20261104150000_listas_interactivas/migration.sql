-- Listas interactivas (hasta 10 opciones en una sección).
-- Aditivo y apagado por defecto: sin interactiveListsEnabled la herramienta
-- se comporta exactamente igual que antes.

ALTER TABLE "Workspace"
    ADD COLUMN "interactiveListsEnabled" BOOLEAN NOT NULL DEFAULT false;
