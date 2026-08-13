// columnRoutes.js - local column routes
import express from "express";
import columnController from "../controllers/columnController.js";

const router = express.Router();

// Column routes
router.get("/", columnController.getColumns);
router.post("/", columnController.createColumn);
router.put("/order", columnController.updateColumnOrder);
router.put("/:id", columnController.updateColumn);
router.delete("/:id", columnController.deleteColumn);

export default router;
