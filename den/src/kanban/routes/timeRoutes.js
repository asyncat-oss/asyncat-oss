// timeRoutes.js - Updated to use Supabase auth
import express from "express";
import timeController from "../controllers/timeController.js";
import { verifyUser } from "../auth.js";
import { attachDb } from "../../db/sqlite.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyUser, attachDb);

// Time tracking routes
router.post("/cards/:id/time/start", timeController.startTimer);
router.post("/cards/:id/time/stop", timeController.stopTimer);
router.get("/cards/:id/time", timeController.getTimeEntries);
router.delete("/time/:id", timeController.deleteTimeEntry);
router.put("/time/:id", timeController.updateTimeEntry);

export default router;