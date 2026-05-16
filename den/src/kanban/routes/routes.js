// routes.js - Updated to include all route modules
import express from "express";
import cardRoutes from "./cardRoutes.js";
import columnRoutes from "./columnRoutes.js";

const router = express.Router();

// Register route modules
router.use("/cards", cardRoutes);
router.use("/columns", columnRoutes);

export default router;
