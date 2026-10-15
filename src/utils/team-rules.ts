import { UserRole } from "@prisma/client";

export type TeamMember = {
    id: string;
    name: string;
    role: UserRole;
    isActive: boolean;
};

export type RuleResult = {
    allowed: boolean;
    reason: string | null;
};

const ALLOWED: RuleResult = { allowed: true, reason: null };

/**
 * Reglas del equipo.
 *
 * La única trampa real: dejar la instalación sin ningún administrador activo.
 * Eso no se puede deshacer desde el panel (habría que entrar a la base), así
 * que se bloquea antes de que pase — da igual si es degradar a un admin o
 * desactivarlo, y también si es tu propia cuenta.
 *
 * Vive aquí, sin tocar la base, para poder probarlo.
 */
export function checkAdminRemoval(params: {
    target: TeamMember;
    activeAdmins: number;
}): RuleResult {
    const { target, activeAdmins } = params;

    /** Quitar el rol a un admin ya desactivado no cambia nada. */
    if (target.role !== UserRole.ADMIN || !target.isActive) {
        return ALLOWED;
    }

    if (activeAdmins <= 1) {
        return {
            allowed: false,
            reason:
                `«${target.name}» es el único administrador activo. ` +
                "Crea otro administrador (o actívalo) antes de cambiarle el rol o desactivarlo."
        };
    }

    return ALLOWED;
}

/**
 * Cambiar el rol a administrador siempre se permite; quitar el rol, no
 * cuando es el último.
 */
export function checkRoleChange(params: {
    target: TeamMember;
    newRole: UserRole;
    activeAdmins: number;
}): RuleResult {
    if (params.newRole === UserRole.ADMIN) {
        return ALLOWED;
    }

    return checkAdminRemoval({
        target: params.target,
        activeAdmins: params.activeAdmins
    });
}

/** Alfabeto sin caracteres que se confunden al dictarlos (0/O, 1/l/I). */
const SAFE_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Contraseña temporal legible: se dicta por teléfono sin equivocarse y
 * cumple la política (letras y números, 14 caracteres).
 */
export function generatePassword(
    generateByte: (index: number) => number
): string {
    let password = "";

    for (let index = 0; index < 14; index += 1) {
        password += SAFE_ALPHABET[generateByte(index) % SAFE_ALPHABET.length];
    }

    /** Se garantiza que tenga número y letra, sin depender del azar. */
    const letters = password.replace(/[^A-Za-z]/g, "").length;

    if (letters === 0) {
        password = `7${password.slice(1)}`;
    }

    if (!/\d/.test(password)) {
        password = `${password.slice(0, -1)}3`;
    }

    return password;
}
