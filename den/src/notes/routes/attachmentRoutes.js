import express from "express";
import path from "path";
import * as attachmentController from "../controllers/attachmentController.js";
import { handleFileUpload } from "../middleware/fileUpload.js";

const router = express.Router();

// Attachments are stored flat in note-<id>/, so a name with path parts
// (e.g. an encoded ../) could only be an attempt to leave that folder.
router.param("filename", (req, res, next, filename) => {
  if (filename !== path.basename(filename) || filename === "." || filename === "..") {
    return res.status(400).json({ success: false, error: "Invalid attachment name" });
  }
  next();
});

// Upload attachment to a note
router.post(
  "/notes/:noteId/upload",
  handleFileUpload,
  attachmentController.uploadAttachment
);

// Banner management routes - Must come before /:filename routes
router.post(
  "/notes/:noteId/banner",
  attachmentController.setBanner
);

router.delete(
  "/notes/:noteId/banner",
  attachmentController.removeBanner
);

// List attachments for a note
router.get(
  "/notes/:noteId",
  attachmentController.listAttachments
);

// Get attachment metadata
router.get(
  "/notes/:noteId/:filename/metadata",
  attachmentController.getAttachmentMetadata
);

// Update attachment metadata
router.patch(
  "/notes/:noteId/:filename/metadata",
  attachmentController.updateAttachmentMetadata
);

// Download/view attachment
router.get(
  "/notes/:noteId/:filename",
  attachmentController.downloadAttachment
);

// Delete attachment
router.delete(
  "/notes/:noteId/:filename",
  attachmentController.deleteAttachment
);

export default router;
