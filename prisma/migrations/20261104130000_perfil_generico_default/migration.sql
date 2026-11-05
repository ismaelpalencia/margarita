-- Perfil por defecto para instalaciones nuevas.
--
-- Solo cambia el DEFAULT de la columna: no reescribe ninguna fila y no
-- toca instalaciones existentes. Cambiar el default no altera el valor que
-- ya tiene un workspace; COBRANZA sigue disponible para quien ya lo usa.

ALTER TABLE "Workspace" ALTER COLUMN "profile" SET DEFAULT 'GENERICO';
