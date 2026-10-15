import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { LogLevel, LogModule } from "@prisma/client";

import { appConfig } from "../config/app.config";
import {
    BACKUP_FORMAT,
    SnapshotPayload,
    decodeSnapshot,
    encodeSnapshot,
    humanSize,
    snapshotFilename
} from "../utils/backup-format";
import { LogService } from "./log.service";

/**
 * Respaldo automático de la base.
 *
 * Se lee con un cliente **sin** la extensión de cifrado a propósito: así el
 * archivo guarda los valores tal como están en la base (los sensibles siguen
 * cifrados) y la restauración es una copia fiel, sin volver a cifrar nada.
 *
 * Lo que **no** entra:
 *
 * - `WebhookEvent`: es una cola de trabajo transitoria.
 * - `UserSession`: restaurar sesiones resucitaría accesos ya cerrados.
 *
 * Los archivos adjuntos (fotos, audios, documentos) tampoco van aquí: viven en
 * el Volume, no en la base. El respaldo cubre la base de datos.
 */

/**
 * Orden de inserción: primero los padres, al final los hijos.
 *
 * El orden importa y no es obvio: `Message` apunta a `Campaign`, así que la
 * campaña tiene que entrar antes que el mensaje. Se descubrió en la prueba de
 * restauración (Postgres lo rechazó con una violación de llave foránea).
 */
const TABLES = [
    "Workspace",
    "WorkspaceSettings",
    "WhatsAppAccount",
    "WhatsAppNumber",
    "User",
    "Tag",
    "Contact",
    "ContactTag",
    "Template",
    "QuickReply",
    "Campaign",
    "Conversation",
    "Message",
    "AssignmentHistory",
    "CampaignRecipient",
    "ContactOutcome",
    "Log"
] as const;

export type TableName = (typeof TABLES)[number];

/**
 * Campos de fecha por tabla. Existe porque un respaldo es JSON: las fechas
 * viajan como texto y hay que devolverlas a `Date` antes de insertarlas.
 *
 * Se declaran a mano en lugar de adivinar por el formato del texto: un
 * mensaje que por casualidad diga "2026-10-15T10:00:00.000Z" es contenido del
 * cliente, no una fecha, y adivinando se corrompería.
 */
export const DATE_FIELDS: Record<TableName, string[]> = {
    Workspace: ["createdAt", "updatedAt"],
    WorkspaceSettings: ["createdAt", "updatedAt"],
    WhatsAppAccount: ["createdAt", "updatedAt"],
    WhatsAppNumber: ["createdAt", "updatedAt"],
    User: ["lastLoginAt", "lockedUntil", "createdAt", "updatedAt"],
    Tag: ["createdAt", "updatedAt"],
    Contact: [
        "optInAt",
        "optOutAt",
        "outcomeAt",
        "outcomeDueAt",
        "outcomePaidAt",
        "lastSeenAt",
        "createdAt",
        "updatedAt"
    ],
    ContactTag: ["createdAt"],
    Template: ["lastSyncedAt", "createdAt", "updatedAt"],
    QuickReply: ["createdAt", "updatedAt"],
    Conversation: [
        "lastMessageAt",
        "lastIncomingMessageAt",
        "closedAt",
        "createdAt",
        "updatedAt"
    ],
    Message: ["mediaDownloadedAt", "deletedAt", "createdAt", "updatedAt"],
    AssignmentHistory: ["createdAt"],
    Campaign: ["startedAt", "finishedAt", "createdAt", "updatedAt"],
    CampaignRecipient: ["createdAt", "updatedAt"],
    ContactOutcome: ["dueAt", "paidAt", "createdAt"],
    Log: ["createdAt"]
};

export type SnapshotInfo = {
    file: string;
    path: string;
    createdAt: Date;
    size: number;
    sizeLabel: string;
};

export type BackupStatus = {
    enabled: boolean;
    dir: string;
    intervalHours: number;
    keep: number;
    maxAgeHours: number;
    count: number;
    totalSize: number;
    totalSizeLabel: string;
    lastAt: Date | null;
    lastFile: string | null;
    ageHours: number | null;
    stale: boolean;
};

let raw: PrismaClient | null = null;

/** Cliente sin la extensión de cifrado: lee y escribe valores tal cual. */
function rawClient(): PrismaClient {
    if (!raw) {
        const connectionString = process.env.DATABASE_URL;

        if (!connectionString) {
            throw new Error("DATABASE_URL no está definido.");
        }

        raw = new PrismaClient({
            adapter: new PrismaPg({ connectionString })
        });
    }

    return raw;
}

export class BackupFileService {
    static tables(): readonly TableName[] {
        return TABLES;
    }

    static dir(): string {
        return path.resolve(appConfig.backupDir);
    }

    private static ensureDir(): void {
        fs.mkdirSync(this.dir(), { recursive: true });
    }

    static list(): SnapshotInfo[] {
        try {
            return fs
                .readdirSync(this.dir())
                .filter((name) => name.endsWith(".mgb"))
                .map((name) => {
                    const full = path.join(this.dir(), name);
                    const stats = fs.statSync(full);

                    return {
                        file: name,
                        path: full,
                        createdAt: stats.mtime,
                        size: stats.size,
                        sizeLabel: humanSize(stats.size)
                    };
                })
                .sort(
                    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
                );
        } catch {
            return [];
        }
    }

    static async status(): Promise<BackupStatus> {
        const snapshots = this.list();
        const last = snapshots[0] ?? null;
        const ageHours = last
            ? (Date.now() - last.createdAt.getTime()) / 3600000
            : null;

        return {
            enabled: appConfig.backupEnabled,
            dir: this.dir(),
            intervalHours: appConfig.backupIntervalHours,
            keep: appConfig.backupKeep,
            maxAgeHours: appConfig.backupMaxAgeHours,
            count: snapshots.length,
            totalSize: snapshots.reduce((sum, item) => sum + item.size, 0),
            totalSizeLabel: humanSize(
                snapshots.reduce((sum, item) => sum + item.size, 0)
            ),
            lastAt: last?.createdAt ?? null,
            lastFile: last?.file ?? null,
            ageHours,
            stale: ageHours === null || ageHours > appConfig.backupMaxAgeHours
        };
    }

    /**
     * ¿Toca crear respaldo? Se usa al arrancar y en cada vuelta del job: así
     * el calendario se reanuda solo después de un reinicio.
     */
    static needsBackup(status?: BackupStatus): boolean {
        if (!appConfig.backupEnabled) {
            return false;
        }

        const current = status ?? { lastAt: this.list()[0]?.createdAt ?? null };

        if (!current.lastAt) {
            return true;
        }

        const elapsedHours =
            (Date.now() - current.lastAt.getTime()) / 3600000;

        return elapsedHours >= appConfig.backupIntervalHours;
    }

    /** Crea el respaldo, lo verifica releyéndolo y aplica la retención. */
    static async create(
        reason: "AUTO" | "MANUAL" = "AUTO"
    ): Promise<{ info: SnapshotInfo; counts: Record<string, number> }> {
        this.ensureDir();

        const client = rawClient();
        const tables: Record<string, unknown[]> = {};
        const counts: Record<string, number> = {};

        for (const table of TABLES) {
            const delegate = (client as unknown as Record<string, {
                findMany: (args?: unknown) => Promise<unknown[]>;
            }>)[table.charAt(0).toLowerCase() + table.slice(1)];

            const rows = await delegate.findMany();

            if (rows.length > appConfig.backupMaxRowsPerTable) {
                throw new Error(
                    `La tabla ${table} tiene ${rows.length} filas, más del tope de ` +
                        `${appConfig.backupMaxRowsPerTable}. El respaldo se detuvo en lugar de ` +
                        "guardar una copia incompleta: sube BACKUP_MAX_ROWS_PER_TABLE o pasa a un " +
                        "respaldo con pg_dump."
                );
            }

            tables[table] = rows;
            counts[table] = rows.length;
        }

        const payload: SnapshotPayload = {
            format: BACKUP_FORMAT,
            createdAt: new Date().toISOString(),
            app: appConfig.name,
            version: appConfig.version,
            counts,
            tables
        };

        const encoded = encodeSnapshot(payload);
        const file = snapshotFilename(new Date(), appConfig.timezone);
        const target = path.join(this.dir(), file);
        const temporary = `${target}.tmp`;

        /** Se escribe en temporal y se renombra: nunca queda un archivo a medias. */
        fs.writeFileSync(temporary, encoded, "utf8");
        fs.renameSync(temporary, target);

        /** Verificación inmediata: si no se puede leer, el respaldo no sirve. */
        const verified = this.read(target);
        const totalRows = Object.values(verified.counts).reduce(
            (sum, value) => sum + value,
            0
        );

        const pruned = this.prune();
        const stats = fs.statSync(target);

        const info: SnapshotInfo = {
            file,
            path: target,
            createdAt: stats.mtime,
            size: stats.size,
            sizeLabel: humanSize(stats.size)
        };

        await LogService.create({
            level: LogLevel.INFO,
            module: LogModule.SYSTEM,
            action: "BACKUP_CREATED",
            message: `Respaldo ${reason === "AUTO" ? "automático" : "manual"} creado y verificado.`,
            payload: {
                file,
                reason,
                size: info.sizeLabel,
                rows: totalRows,
                counts,
                pruned
            }
        });

        return { info, counts };
    }

    /** Lee y valida un respaldo del disco. */
    static read(fileOrPath: string): SnapshotPayload {
        const full = path.isAbsolute(fileOrPath)
            ? fileOrPath
            : path.join(this.dir(), fileOrPath);

        if (!fs.existsSync(full)) {
            throw new Error(`No existe el respaldo ${full}.`);
        }

        return decodeSnapshot(fs.readFileSync(full, "utf8"));
    }

    /** Deja solo los `BACKUP_KEEP` respaldos más recientes. */
    static prune(): number {
        const snapshots = this.list();
        const keep = Math.max(1, appConfig.backupKeep);
        const excess = snapshots.slice(keep);

        for (const snapshot of excess) {
            try {
                fs.unlinkSync(snapshot.path);
            } catch {
                /** Si no se puede borrar, se queda: no es crítico. */
            }
        }

        return excess.length;
    }

    static async disconnect(): Promise<void> {
        if (raw) {
            await raw.$disconnect();
            raw = null;
        }
    }
}
