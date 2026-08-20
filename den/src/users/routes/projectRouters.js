import express from 'express';

import {
  getProjects,
  getTeamProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectFolders,
  addProjectFolder,
  updateProjectFolder,
  deleteProjectFolder,
} from '../controllers/project/projectController.js';

const router = express.Router();

router.get('/', getProjects);
router.get('/teams/:teamId/projects', getTeamProjects);
router.post('/', createProject);
router.get('/:id/folders', getProjectFolders);
router.post('/:id/folders', addProjectFolder);
router.patch('/:id/folders/:folderId', updateProjectFolder);
router.delete('/:id/folders/:folderId', deleteProjectFolder);
router.patch('/:id/update', updateProject);
router.delete('/:id/delete', deleteProject);

export default router;
