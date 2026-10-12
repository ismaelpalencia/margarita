-- Cifrado de campos sensibles.
--
-- El teléfono del contacto pasa a guardarse cifrado y se agrega un índice
-- ciego (`phoneHash`) para conservar la unicidad y las búsquedas exactas
-- sin tener el valor en claro.
--
-- Las filas existentes reciben un marcador temporal único
-- (`legacy:<id>`), así la columna puede quedar obligatoria y con índice
-- único sin fallar por duplicados. La aplicación reemplaza esos marcadores
-- por el índice real de cada teléfono al arrancar, porque el cálculo
-- necesita la llave de cifrado y esa no está en la base de datos.

DROP INDEX "Contact_workspaceId_phone_key";

ALTER TABLE "Contact" ADD COLUMN "phoneHash" TEXT NOT NULL DEFAULT '';

UPDATE "Contact" SET "phoneHash" = 'legacy:' || "id" WHERE "phoneHash" = '';

ALTER TABLE "Contact" ALTER COLUMN "phoneHash" DROP DEFAULT;

CREATE INDEX "Contact_phoneHash_idx" ON "Contact"("phoneHash");

CREATE UNIQUE INDEX "Contact_workspaceId_phoneHash_key" ON "Contact"("workspaceId", "phoneHash");
