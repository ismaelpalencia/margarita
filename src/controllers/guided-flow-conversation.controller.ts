import { Request, Response } from "express";

import { AiAutoReplyService } from "../services/ai/auto-reply.service";
import { GuidedFlowService } from "../services/guided-flow.service";
import { getRequiredParam } from "../utils/request";

export class GuidedFlowConversationController {
    static finish(basePath: "/admin/conversations" | "/agent/conversations") {
        return async (req: Request, res: Response) => {
            const conversationId = getRequiredParam(req, "id");

            try {
                const ended = await GuidedFlowService.finishForConversation(
                    req.user!.workspaceId,
                    conversationId
                );

                if (ended) {
                    await AiAutoReplyService.pauseForHuman({
                        workspaceId: req.user!.workspaceId,
                        conversationId,
                        userId: req.user!.id,
                        reason: "MANUAL"
                    });
                }

                return res.redirect(
                    `${basePath}/${conversationId}?success=${ended ? "guided_flow_ended" : "guided_flow_none"}`
                );
            } catch {
                return res.redirect(
                    `${basePath}/${conversationId}?error=guided_flow_end`
                );
            }
        };
    }
}
