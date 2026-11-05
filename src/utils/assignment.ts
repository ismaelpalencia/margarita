/**
 * Decisión pura de a quién se asigna una conversación.
 *
 * Cadena de fallback para una entrega (handoff) o un mensaje entrante:
 *   1. Agente AVAILABLE con menos carga.
 *   2. Agente BUSY con menos carga (está trabajando; verá el aviso).
 *   3. Administrador con menos carga (solo si autoAssignToAdmin).
 *   4. Nadie: queda sin asignar.
 *
 * La función no lee la base ni el estado de sesión: recibe candidatos ya
 * filtrados y su carga calculada. Así se puede probar entera.
 */

export type AssigneeRole = "AGENT" | "ADMIN";

export type AssigneeCandidate = {
    id: string;
    name: string;
    role: AssigneeRole;
    status: string;
    load: number;
};

export type AssignmentStep =
    | "AVAILABLE_LEAST_BUSY"
    | "BUSY_LEAST_BUSY"
    | "ADMIN_LEAST_BUSY"
    | "UNASSIGNED";

export type AssignmentDecision =
    | { kind: "assign"; userId: string; step: AssignmentStep }
    | { kind: "unassigned"; step: "UNASSIGNED" };

function leastLoaded(candidates: AssigneeCandidate[]): AssigneeCandidate | null {
    if (candidates.length === 0) {
        return null;
    }

    return [...candidates].sort((a, b) => {
        if (a.load !== b.load) {
            return a.load - b.load;
        }

        return a.name.localeCompare(b.name);
    })[0];
}

export function pickAssignee(
    candidates: AssigneeCandidate[],
    autoAssignToAdmin: boolean
): AssignmentDecision {
    const available = candidates.filter(
        (candidate) => candidate.role === "AGENT" && candidate.status === "AVAILABLE"
    );
    const busy = candidates.filter(
        (candidate) => candidate.role === "AGENT" && candidate.status === "BUSY"
    );
    const admins = candidates.filter((candidate) => candidate.role === "ADMIN");

    const fromAvailable = leastLoaded(available);

    if (fromAvailable) {
        return { kind: "assign", userId: fromAvailable.id, step: "AVAILABLE_LEAST_BUSY" };
    }

    const fromBusy = leastLoaded(busy);

    if (fromBusy) {
        return { kind: "assign", userId: fromBusy.id, step: "BUSY_LEAST_BUSY" };
    }

    if (autoAssignToAdmin) {
        const fromAdmins = leastLoaded(admins);

        if (fromAdmins) {
            return { kind: "assign", userId: fromAdmins.id, step: "ADMIN_LEAST_BUSY" };
        }
    }

    return { kind: "unassigned", step: "UNASSIGNED" };
}