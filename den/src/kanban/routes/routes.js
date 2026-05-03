// routes.js - Updated to include all route modules
import express from "express";
import cardRoutes from "./cardRoutes.js";
import columnRoutes from "./columnRoutes.js";
import dependencyRoutes from "./dependencyRoutes.js";

const router = express.Router();

// Register route modules
router.use("/cards", cardRoutes);
router.use("/columns", columnRoutes);
router.use("/dependencies", dependencyRoutes);

export default router;
