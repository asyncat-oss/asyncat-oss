import express from 'express';

import {
  getProjects,
  getTeamProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/project/projectController.js';

const router = express.Router();

router.get('/', getProjects);
router.get('/teams/:teamId/projects', getTeamProjects);
router.post('/', createProject);
router.patch('/:id/update', updateProject);
router.delete('/:id/delete', deleteProject);

export default router;
