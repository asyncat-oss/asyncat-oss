// cardRoutes.js - Updated to use Supabase auth
import express from "express";
import multer from "multer";
import cardController from "../controllers/cardController.js";
import { verifyUser } from "../../auth/authMiddleware.js";
import { attachDb } from "../../db/sqlite.js";

const router = express.Router();

// Configure multer for file uploads (store in memory)
const storage = multer.memoryStorage();
const upload = multer({
	storage: storage,
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB max file size
	},
	fileFilter: (req, file, cb) => {
		// Allow a wide range of file types
		const allowedMimeTypes = [
			// Images
			"image/png",
			"image/jpeg",
			"image/jpg",
			"image/gif",
			"image/webp",
			"image/svg+xml",
			"image/bmp",
			// Documents
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.ms-excel",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-powerpoint",
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			// Text files
			"text/plain",
			"text/csv",
			"text/html",
			"text/css",
			"text/javascript",
			"application/json",
			"application/xml",
			"text/xml",
			// Archives
			"application/zip",
			"application/x-zip-compressed",
			"application/x-rar-compressed",
			"application/x-7z-compressed",
			"application/x-tar",
			"application/gzip",
		];

		if (allowedMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(
				new Error(
					`Invalid file type: ${file.mimetype}. Please upload a supported file format.`
				)
			);
		}
	},
});

// Apply authentication middleware to all routes
router.use(verifyUser, attachDb);

// Basic card routes
router.get("/column/:columnId", cardController.getCards);
router.get("/calendar-data", cardController.getCalendarData);
router.get("/:id", cardController.getCard);
router.post("/", upload.array("file", 10), cardController.createCard); // Accept up to 10 files
router.put("/:id", cardController.updateCard);
router.delete("/:id", cardController.deleteCard);
router.post("/:id/move", cardController.moveCard);
router.put("/:id/checklist", cardController.updateChecklist);

// Attachment management routes
router.post(
	"/:id/attachments",
	upload.array("file", 10),
	cardController.addAttachment
);
router.post(
	"/:id/attachments/multiple",
	upload.array("file", 10),
	cardController.addMultipleAttachments
);
router.delete(
	"/:id/attachments/:attachmentId",
	cardController.removeAttachment
);

router.put(
	"/:id/subtasks/:subtaskId/duration",
	cardController.updateSubtaskDuration
);

// Dependency management routes
router.get("/:id/dependencies", cardController.getCardDependencies);
router.get("/:id/dependent-cards", cardController.getDependentCards);
router.post("/:id/dependencies", cardController.addDependency);
router.delete(
	"/:id/dependencies/:dependencyId",
	cardController.removeDependency
);
router.get("/:id/dependencies/status", cardController.checkDependenciesStatus);

export default router;
