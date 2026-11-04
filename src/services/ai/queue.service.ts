import { AiMode, MessageType } from "@prisma/client";

import { appConfig } from "../../config/app.config";
import { prisma } from "../../config/prisma";
import { isAiConfigured } from "./provider";
import { AiSettingsService } from "./settings.service";

/**
 * Encola una respuesta de IA para un mensaje entrante.
 *
 * En modo `SUGGEST` produce un borrador; en `AUTO` produce un candidato que la
 * política puede enviar o entregar a una persona. Se llama después de guardar
 * el mensaje y de aplicar la baja. Nunca antes: a quien pidió baja no se le
 * responde, ni siquiera con un borrador.
 *
 * Devuelve `false` cuando no hay nada que hacer (IA apagada, workspace
 * apagado, mensaje sin texto). No lanza por configuración: el webhook no
 * debe fallar porque la IA esté apagada.
 */
export async function enqueueSuggestion(params: {
    workspaceId: string;
    conversationId: string;
    inboundMessageId: string;
    type: MessageType;
    body: string | null;
    replyTitle: string | null;
}): Promise<boolean> {
    if (!isAiConfigured()) {
        return false;
    }

    const hasText =
        params.type === MessageType.TEXT ||
        (params.type === MessageType.INTERACTIVE &&
            Boolean(params.body || params.replyTitle));

    if (!hasText) {
        return false;
    }

    const settings = await AiSettingsService.get(params.workspaceId);

    /**
     * En `AUTO` también se encola: el worker genera la respuesta y su propia
     * política decide si se envía o se entrega a una persona. `OFF` no
     * encola nada.
     */
    if (!settings.enabled || settings.mode === AiMode.OFF) {
        return false;
    }

    const runAfter = new Date(
        Date.now() + appConfig.ai.debounceSeconds * 1000
    );

    await prisma.aiSuggestionJob.upsert({
        where: { inboundMessageId: params.inboundMessageId },
        create: {
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            inboundMessageId: params.inboundMessageId,
            runAfter
        },
        /**
         * Si el webhook reintenta el mismo mensaje, no se duplica el trabajo
         * ni se reinicia el que ya está en curso.
         */
        update: { updatedAt: new Date() }
    });

    return true;
}
