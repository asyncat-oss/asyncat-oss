import express from "express";
import * as attachmentController from "../controllers/attachmentController.js";
import { verifyUserMiddleware, auth } from "../middleware/auth.js";
import { verifyAttachmentAccess } from "../middleware/attachmentAuth.js";
import { handleFileUpload, checkStorageService } from "../middleware/fileUpload.js";

const router = express.Router();

// Check storage service availability for all routes
router.use(checkStorageService);

// Upload attachment to a note (requires full auth)
router.post(
  "/notes/:noteId/upload", auth,
  handleFileUpload,
  attachmentController.uploadAttachment
);

// Banner management routes - Must come before /:filename routes (requires full auth)
router.post(
  "/notes/:noteId/banner", auth,
  attachmentController.setBanner
);

router.delete(
  "/notes/:noteId/banner", auth,
  attachmentController.removeBanner
);

// List attachments for a note (requires full auth)
router.get(
  "/notes/:noteId", auth,
  attachmentController.listAttachments
);

// Get attachment metadata (requires full auth)
router.get(
  "/notes/:noteId/:filename/metadata", auth,
  attachmentController.getAttachmentMetadata
);

// Update attachment metadata (requires full auth)
router.patch(
  "/notes/:noteId/:filename/metadata", auth,
  attachmentController.updateAttachmentMetadata
);

// Download/view attachment (uses flexible auth for images)
router.get(
  "/notes/:noteId/:filename",
  verifyAttachmentAccess,
  attachmentController.downloadAttachment
);

// Delete attachment (requires full auth)
router.delete(
  "/notes/:noteId/:filename", auth,
  attachmentController.deleteAttachment
);

export default router;