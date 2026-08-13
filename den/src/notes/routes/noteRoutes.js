// noteRoutes.js - local note routes
import express from "express";
import * as noteController from "../controllers/noteController.js";
import * as exportController from "../controllers/exportController.js";
import {
  sanitizeNoteInput,
  sanitizeChangesetInput,
  securityMiddleware
} from "../middleware/sanitization.js";

const router = express.Router();

// Apply request sanitization to all routes.
router.use(securityMiddleware);

// Note routes with sanitization
router.get("/", noteController.getNotes);
router.post("/:id/delta", sanitizeChangesetInput, noteController.applyDeltaChanges);
router.get("/:id", noteController.getNoteById);
router.post("/", sanitizeNoteInput, noteController.createNote);
router.delete("/:id", noteController.deleteNote);
router.post("/link-preview", noteController.getLinkPreview);

// Export routes
router.post("/:id/export/docx", exportController.exportDocx);
router.post("/:id/export/pdf", exportController.exportPdf);

export default router;
