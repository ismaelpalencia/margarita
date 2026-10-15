-- Varios administradores por instalación y cambio obligatorio de contraseña.
--
-- `mustChangePassword` se activa cuando un administrador restablece la
-- contraseña de otra persona: al siguiente inicio de sesión, el sistema solo
-- deja cambiarla antes de entrar a operar.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
