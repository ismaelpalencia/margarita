-- Cifrado de los correos de acceso.
--
-- El correo es un dato personal y hasta ahora era de los pocos que quedaba
-- en claro: un volcado de la base mostraba quiénes entran al panel y con
-- qué correo. Pasa a guardarse cifrado y se agrega un índice ciego
-- (`emailHash`) que conserva la unicidad y permite resolver el inicio de
-- sesión sin el valor en claro.
--
-- El índice ciego depende de la llave de cifrado, que nunca está en la
-- base: por eso las filas existentes reciben un marcador temporal único
-- (`legacy:<id>`) y la aplicación las recalcula al arrancar. Mientras el
-- marcador siga ahí, ese usuario no puede entrar; el recálculo corre antes
-- de empezar a escuchar peticiones y tarda milisegundos.

DROP INDEX "User_email_key";

ALTER TABLE "User" ADD COLUMN "emailHash" TEXT NOT NULL DEFAULT '';

UPDATE "User" SET "emailHash" = 'legacy:' || "id" WHERE "emailHash" = '';

ALTER TABLE "User" ALTER COLUMN "emailHash" DROP DEFAULT;

CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");
