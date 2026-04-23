import express from "express";
import {
  streamSharedAudio,
  streamSharedVideo,
} from "../controllers/sharedAttachmentController.js";
import { checkStorageService } from "../middleware/fileUpload.js";

const router = express.Router();

router.use(checkStorageService);

router.get("/videos/:shareId", streamSharedVideo);
router.get("/audios/:shareId", streamSharedAudio);

export default router;

