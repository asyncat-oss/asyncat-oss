// columnRoutes.js - Updated to use Supabase auth
import express from "express";
import columnController from "../controllers/columnController.js";
import { verifyUser } from "../auth.js";
import { attachCompat } from "../../db/compat.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyUser, attachCompat);

// Column routes
router.get("/", columnController.getColumns);
router.post("/", columnController.createColumn);
router.put("/order", columnController.updateColumnOrder);
router.get("/my-columns", columnController.getUserColumns);
router.put("/:id", columnController.updateColumn);
router.delete("/:id", columnController.deleteColumn);

// New route for updating column completion status
router.put(
  "/:id/completion-status",
  columnController.updateColumnCompletionStatus
);

export default router;