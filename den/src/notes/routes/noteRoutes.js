// noteRoutes.js - Clean routes with authentication middleware
import express from "express";
import * as noteController from "../controllers/noteController.js";
import * as exportController from "../controllers/exportController.js";
import { verifyUserMiddleware, auth } from "../middleware/auth.js";
import {
  sanitizeNoteInput,
  sanitizeChangesetInput,
  securityMiddleware
} from "../middleware/sanitization.js";

const router = express.Router();

// Apply authentication and security middleware to all routes
router.use(auth);
router.use(securityMiddleware);

// Protected routes with sanitization
router.get("/", noteController.getNotes);
router.get("/project/:projectId", noteController.getNotesByProject);
router.post("/:id/delta", sanitizeChangesetInput, noteController.applyDeltaChanges);
router.get("/:id", noteController.getNoteById);
router.post("/", sanitizeNoteInput, noteController.createNote);
router.delete("/:id", noteController.deleteNote);
router.post("/link-preview", noteController.getLinkPreview);

// Export routes
router.post("/:id/export/docx", exportController.exportDocx);
router.post("/:id/export/pdf", exportController.exportPdf);

export default router;