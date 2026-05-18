import express from 'express';
import { auth } from '../middleware/auth.js';

import {
  getProjects,
  getTeamProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/project/projectController.js';

const router = express.Router();

router.get('/', auth, getProjects);
router.get('/teams/:teamId/projects', auth, getTeamProjects);
router.post('/', auth, createProject);
router.patch('/:id/update', auth, updateProject);
router.delete('/:id/delete', auth, deleteProject);

export default router;
