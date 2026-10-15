-- Verificación en dos pasos (TOTP) para las cuentas.
--
-- `twoFactorSecret` se guarda cifrado con la misma llave que el resto de los
-- datos sensibles: si alguien obtiene un volcado de la base, no puede generar
-- los códigos de nadie.
--
-- `twoFactorEnabledAt` marca que la persona ya confirmó un código. Mientras
-- esté vacío, el secreto no cuenta (así una activación a medias no deja a
-- nadie fuera de su propia cuenta).

-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "twoFactorSecret" TEXT,
ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3);
