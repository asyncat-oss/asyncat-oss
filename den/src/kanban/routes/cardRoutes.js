import express from "express";
import multer from "multer";
import cardController from "../controllers/cardController.js";
import { verifyUser } from "../../auth/authMiddleware.js";
import { attachDb } from "../../db/sqlite.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/png","image/jpeg","image/jpg","image/gif","image/webp","image/svg+xml","image/bmp",
      "application/pdf","application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain","text/csv","text/html","text/css","text/javascript",
      "application/json","application/xml","text/xml",
      "application/zip","application/x-zip-compressed","application/x-rar-compressed",
      "application/x-7z-compressed","application/x-tar","application/gzip",
    ];
    cb(allowed.includes(file.mimetype) ? null : new Error(`Invalid file type: ${file.mimetype}`), allowed.includes(file.mimetype));
  },
});

router.use(verifyUser, attachDb);

router.get("/column/:columnId", cardController.getCards);
router.get("/:id", cardController.getCard);
router.post("/", upload.array("file", 10), cardController.createCard);
router.put("/:id", cardController.updateCard);
router.delete("/:id", cardController.deleteCard);
router.post("/:id/move", cardController.moveCard);
router.put("/:id/checklist", cardController.updateChecklist);
router.post("/:id/attachments", upload.array("file", 10), cardController.addAttachment);
router.post("/:id/attachments/multiple", upload.array("file", 10), cardController.addAttachment);
router.delete("/:id/attachments/:attachmentId", cardController.removeAttachment);

export default router;
