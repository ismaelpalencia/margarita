import { Request, Response } from "express";

interface ShellNumber {
    id: string;
    displayName: string | null;
    phoneNumber: string;
    isActive: boolean;
}

/**
 * Datos mínimos del armazón Angular: número activo, números disponibles y
 * contadores de la bandeja. Los calcula `activeNumberMiddleware`, que ya se
 * encarga de respetar el workspace y los números permitidos al agente.
 */
export class PanelShellController {
    static data(req: Request, res: Response) {
        const numbers = (res.locals.activeNumbers || []) as ShellNumber[];
        const active = res.locals.activeNumber as ShellNumber | null;
        const activeNumbers = numbers.filter((number) => number.isActive);
        const unreadByNumber = (res.locals.unreadByNumber || {}) as Record<string, number>;

        return res.json({
            role: req.user!.role,
            userName: req.user!.name,
            collectionsEnabled: Boolean(res.locals.collectionsEnabled),
            activeNumberId: active?.id || null,
            numbers: activeNumbers
                .map(({ id, displayName, phoneNumber }) => ({
                    id,
                    displayName,
                    phoneNumber,
                    unreadCount: unreadByNumber[id] || 0
                })),
            unreadTotal: Number(res.locals.unreadTotal) || 0,
            unassignedCount: Number(res.locals.unassignedCount) || 0
        });
    }
}
