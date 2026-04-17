// versionRoutes.js - Version History Routes (temporarily disabled)
import express from "express";
// import * as versionController from "../controllers/versionController.js";
// import * as versionGroupController from "../controllers/versionGroupController.js";
// import { verifyUserMiddleware } from "../middleware/auth.js";
// import { securityMiddleware } from "../middleware/sanitization.js";

const router = express.Router();

/*
// Apply authentication and security middleware to all routes
router.use(verifyUserMiddleware);
router.use(securityMiddleware);

// Version history routes
// Note: More specific routes (with fixed path segments) must come before dynamic parameter routes
router.get("/:noteId/versions", versionController.getVersionHistory);
router.get("/:noteId/operations", versionController.getOperationHistory);
router.post(
  "/:noteId/versions/checkpoint",
  versionController.createNamedVersion
);
router.post("/:noteId/versions/auto", versionController.createAutoVersion);
router.post("/:noteId/versions/compare", versionController.compareVersions);
router.post("/:noteId/versions/cleanup", versionController.cleanupVersions);
router.post(
  "/:noteId/versions/:versionId/restore",
  versionController.restoreVersion
);
router.put(
  "/:noteId/versions/:versionId/name",
  versionController.updateVersionName
);
router.get("/:noteId/versions/:versionId", versionController.getVersion);

// Version group routes (for naming time-based groups)
router.get("/:noteId/version-groups", versionGroupController.getGroupNames);
router.put(
  "/:noteId/version-groups/:groupKey/name",
  versionGroupController.updateGroupName
);
router.delete(
  "/:noteId/version-groups/:groupKey",
  versionGroupController.deleteGroupName
);
*/

export default router;
