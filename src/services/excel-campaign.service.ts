import ExcelJS from "exceljs";
import {
    CampaignRecipientStatus,
    CampaignStatus,
    LogLevel,
    LogModule,
    Prisma
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { contactPhoneFields, normalizeMexicanPhone } from "../utils/phone";
import {
    normalizeHeaderKey,
    resolveVariableSpecs
} from "../utils/campaign-variables";
import { CreateCampaignFromExcelInput } from "../validations/campaign.validation";
import { countTemplateVariables } from "../utils/template";
import { LogService } from "./log.service";

type ParsedRecipient = {
    phone: string;
    name?: string | null;
    /** Todas las columnas de la fila, indexadas por encabezado normalizado. */
    columns: Record<string, string>;
};

function cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "object") {
        if ("text" in value && value.text) {
            return String(value.text).trim();
        }

        if ("result" in value && value.result !== undefined) {
            return String(value.result).trim();
        }

        if ("richText" in value && Array.isArray(value.richText)) {
            return value.richText
                .map((item) => item.text)
                .join("")
                .trim();
        }
    }

    return String(value).trim();
}

export class ExcelCampaignService {
    static async parseExcel(filePath: string) {
        const workbook = new ExcelJS.Workbook();

        if (filePath.toLowerCase().endsWith(".csv")) {
            await workbook.csv.readFile(filePath);
        } else {
            await workbook.xlsx.readFile(filePath);
        }

        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
            throw new Error("El archivo no tiene hojas.");
        }

        const headerRow = worksheet.getRow(1);
        const headerMap = new Map<string, number>();

        headerRow.eachCell((cell, colNumber) => {
            const header = normalizeHeaderKey(cellToString(cell.value));

            if (header) {
                headerMap.set(header, colNumber);
            }
        });

        const phoneColumn =
            headerMap.get("phone") ??
            headerMap.get("telefono") ??
            headerMap.get("whatsapp") ??
            headerMap.get("number") ??
            headerMap.get("numero");

        const nameColumn =
            headerMap.get("name") ??
            headerMap.get("nombre") ??
            headerMap.get("cliente");

        if (!phoneColumn) {
            throw new Error("El archivo debe tener una columna phone.");
        }

        const recipients: ParsedRecipient[] = [];
        const invalidRows: Array<{ row: number; reason: string }> = [];
        const seenPhones = new Set<string>();
        let duplicateCount = 0;

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                return;
            }

            const rawPhone = cellToString(row.getCell(phoneColumn).value);
            const rawName = nameColumn
                ? cellToString(row.getCell(nameColumn).value)
                : "";

            if (!rawPhone && !rawName) {
                return;
            }

            try {
                const phone = normalizeMexicanPhone(rawPhone);

                if (seenPhones.has(phone)) {
                    duplicateCount++;
                    return;
                }

                seenPhones.add(phone);

                const columns: Record<string, string> = {};

                headerMap.forEach((columnNumber, header) => {
                    columns[header] = cellToString(
                        row.getCell(columnNumber).value
                    );
                });

                recipients.push({
                    phone,
                    name: rawName || null,
                    columns
                });
            } catch {
                invalidRows.push({
                    row: rowNumber,
                    reason: "Teléfono inválido o vacío."
                });
            }
        });

        return {
            recipients,
            invalidRows,
            duplicateCount,
            totalRows: Math.max(worksheet.rowCount - 1, 0)
        };
    }

    static async createCampaignFromExcel(params: {
        workspaceId: string;
        createdById: string;
        input: CreateCampaignFromExcelInput;
        filePath: string;
        whatsappNumberId: string;
    }) {
        const parsedExcel = await this.parseExcel(params.filePath);

        if (parsedExcel.recipients.length === 0) {
            throw new Error("El Excel no tiene teléfonos válidos.");
        }

        const template = await prisma.template.findFirst({
            where: {
                id: params.input.templateId,
                workspaceId: params.workspaceId,
                status: "APPROVED"
            }
        });

        if (!template) {
            throw new Error("Plantilla no encontrada o no aprobada.");
        }

        const requiredVariables = countTemplateVariables(template.components);
        const specs = [
            params.input.variable1 || "",
            params.input.variable2 || "",
            params.input.variable3 || ""
        ].slice(0, requiredVariables);

        if (requiredVariables > 0 && specs.some((spec) => spec.trim() === "")) {
            throw new Error(
                `Esta plantilla necesita ${requiredVariables} variable(s). Complétalas para continuar.`
            );
        }

        /**
         * Los valores se resuelven antes de crear nada: si falta una
         * columna, es mejor decirlo que dejar la campaña a medias.
         */
        const resolvedRows = parsedExcel.recipients.map((recipient) => {
            const resolved = resolveVariableSpecs(
                requiredVariables > 0 ? specs : [],
                {
                    name: recipient.name || null,
                    phone: recipient.phone,
                    columns: recipient.columns
                }
            );

            return {
                ...recipient,
                values: resolved.values,
                missingColumns: resolved.missingColumns
            };
        });

        const missingColumns = [
            ...new Set(resolvedRows.flatMap((row) => row.missingColumns))
        ];

        if (missingColumns.length > 0) {
            const available = Object.keys(
                parsedExcel.recipients[0]?.columns || {}
            );

            throw new Error(
                `El archivo no tiene la(s) columna(s): ${missingColumns.join(", ")}. ` +
                    `Columnas disponibles: ${available.join(", ") || "ninguna"}.`
            );
        }

        const rowsWithoutValue = resolvedRows.filter((row) =>
            requiredVariables > 0 && row.values.some((value) => value === "")
        ).length;

        if (rowsWithoutValue > 0) {
            throw new Error(
                `${rowsWithoutValue} fila(s) quedaron sin el dato que pide una variable. ` +
                    "Revisa que las columnas referenciadas tengan valor en todas las filas."
            );
        }

        const contacts = [];
        let skippedRecipients = 0;

        for (const recipient of resolvedRows) {
            const phoneFields = contactPhoneFields(recipient.phone);

            const contact = await prisma.contact.upsert({
                where: {
                    workspaceId_phoneHash: {
                        workspaceId: params.workspaceId,
                        phoneHash: phoneFields.phoneHash
                    }
                },
                update: {
                    customName: recipient.name || undefined,
                    isActive: true
                },
                create: {
                    workspaceId: params.workspaceId,
                    ...phoneFields,
                    customName: recipient.name || null,
                    isActive: true
                },
                select: {
                    id: true,
                    phone: true,
                    optOutAt: true
                }
            });

            /**
             * Quien pidió la baja no entra en la campaña: se cuenta como
             * omitido en lugar de enviarle algo que no quiere recibir.
             */
            if (contact.optOutAt) {
                skippedRecipients += 1;
                continue;
            }

            contacts.push(contact);
        }

        if (contacts.length === 0) {
            throw new Error(
                "Todos los contactos del archivo pidieron la baja (STOP). No hay a quién enviar."
            );
        }

        const campaign = await prisma.campaign.create({
            data: {
                workspaceId: params.workspaceId,
                createdById: params.createdById,
                templateId: template.id,
                whatsappNumberId: params.whatsappNumberId,
                name: params.input.name,
                status: CampaignStatus.DRAFT,
                totalRecipients: parsedExcel.totalRows,
                validRecipients: contacts.length,
                invalidRecipients: parsedExcel.invalidRows.length,
                duplicateRecipients: parsedExcel.duplicateCount,
                skippedRecipients,
                recipients: {
                    create: contacts.map((contact, index) => ({
                        contactId: contact.id,
                        phone: contact.phone,
                        status: CampaignRecipientStatus.PENDING,
                        variables:
                            requiredVariables > 0
                                ? (resolvedRows[index]
                                      .values as Prisma.InputJsonValue)
                                : undefined
                    }))
                }
            },
            include: {
                recipients: true
            }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CAMPAIGN,
            action: "CAMPAIGN_CREATED_FROM_EXCEL",
            message: "Campaña creada desde Excel correctamente.",
            payload: {
                campaignId: campaign.id,
                name: campaign.name,
                totalRows: parsedExcel.totalRows,
                validRecipients: contacts.length,
                invalidRows: parsedExcel.invalidRows,
                duplicateCount: parsedExcel.duplicateCount
            }
        });

        return campaign;
    }
}
