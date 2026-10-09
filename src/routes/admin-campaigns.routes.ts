import { Router } from "express";

import { AdminCampaignsController } from "../controllers/admin-campaigns.controller";
import { excelUpload } from "../middlewares/upload.middleware";

const router = Router();

router.get("/", AdminCampaignsController.index);
router.get("/create", AdminCampaignsController.create);
router.post("/", AdminCampaignsController.store);
router.post(
    "/excel",
    excelUpload.single("excel"),
    AdminCampaignsController.storeFromExcel
);
router.get("/:id", AdminCampaignsController.show);
router.post("/:id/send", AdminCampaignsController.send);
router.post("/:id/retry-failed", AdminCampaignsController.retryFailed);

export default router;