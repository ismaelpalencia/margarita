import { Router } from "express";
import { CallsController } from "../controllers/calls.controller";
const router = Router();
router.post("/context", CallsController.context);
router.post("/events", CallsController.events);
export default router;
