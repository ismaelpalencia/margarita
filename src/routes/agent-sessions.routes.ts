import { Router } from "express";

import { SessionsController } from "../controllers/sessions.controller";

const router = Router();

router.get("/", SessionsController.agentIndex);
router.post("/revoke", SessionsController.revoke);
router.post("/revoke-others", SessionsController.revokeOthers);

export default router;
