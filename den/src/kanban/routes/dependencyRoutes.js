// dependencyRoutes.js - Updated to use Supabase auth
import express from "express";
import dependencyController from "../controllers/dependencyController.js";
import { verifyUser } from "../auth.js";
import { attachDb } from "../../db/sqlite.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyUser, attachDb);

// Dependency routes
router.get(
  "/card/:cardId/dependencies",
  dependencyController.getCardDependencies
);
router.get("/card/:cardId/dependents", dependencyController.getDependentCards);
router.post(
  "/card/:cardId/dependencies",
  dependencyController.createDependency
);
router.delete(
  "/card/:cardId/dependencies/:targetCardId",
  dependencyController.deleteDependency
);
router.get(
  "/card/:cardId/dependencies/status",
  dependencyController.checkDependenciesStatus
);
router.get(
  "/card/:cardId/dependencies/unlocked",
  dependencyController.getUnlockedCards
);

export default router;