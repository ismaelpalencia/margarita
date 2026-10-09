import ExcelJS from "exceljs";
import {
    CampaignRecipientStatus,
    CampaignStatus,
    LogLevel,
    LogModule
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { normalizeMexicanPhone } from "../utils/phone";
import { CreateCampaignFromExcelInput } from "../validations/campaign.validation";
import { LogService } from "./log.service";

type ParsedRecipient = {
    phone: string;
    name?: string | null;
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

function normalizeHeader(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
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
            const header = normalizeHeader(cellToString(cell.value));

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

                recipients.push({
                    phone,
                    name: rawName || null
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

        const contacts = [];

        for (const recipient of parsedExcel.recipients) {
            const contact = await prisma.contact.upsert({
                where: {
                    workspaceId_phone: {
                        workspaceId: params.workspaceId,
                        phone: recipient.phone
                    }
                },
                update: {
                    customName: recipient.name || undefined,
                    isActive: true
                },
                create: {
                    workspaceId: params.workspaceId,
                    phone: recipient.phone,
                    customName: recipient.name || null,
                    isActive: true
                },
                select: {
                    id: true,
                    phone: true
                }
            });

            contacts.push(contact);
        }

        const campaign = await prisma.campaign.create({
            data: {
                workspaceId: params.workspaceId,
                createdById: params.createdById,
                templateId: template.id,
                name: params.input.name,
                status: CampaignStatus.DRAFT,
                totalRecipients: parsedExcel.totalRows,
                validRecipients: contacts.length,
                invalidRecipients: parsedExcel.invalidRows.length,
                duplicateRecipients: parsedExcel.duplicateCount,
                recipients: {
                    create: contacts.map((contact) => ({
                        contactId: contact.id,
                        phone: contact.phone,
                        status: CampaignRecipientStatus.PENDING
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