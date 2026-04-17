// routes/dashboardRoutes.js

import express from 'express';
import { verifyUser, auth } from '../middleware/auth.js';
import { 
  getDashboardProjects,
  getDashboardEvents, 
  getDashboardTeam,
  getDashboardData,
  getUserSpecificTasks,
  getDashboardHabits
} from '../controllers/dashboardController.js';

const router = express.Router();

// Individual dashboard data routes (fallback endpoints)
router.get('/projects', auth, getDashboardProjects);
router.get('/events', auth, getDashboardEvents); 
router.get('/team', auth, getDashboardTeam);
router.get('/user-tasks', auth, getUserSpecificTasks);
router.get('/habits', auth, getDashboardHabits);

// Main consolidated dashboard data route
router.get('/', auth, getDashboardData);

export default router;