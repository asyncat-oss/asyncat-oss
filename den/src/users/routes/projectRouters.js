import express from 'express';

import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectFolders,
  addProjectFolder,
  updateProjectFolder,
  deleteProjectFolder,
} from '../controllers/project/projectController.js';
import {
  addProjectKnowledge,
  deleteProjectKnowledge,
  getProjectChats,
  getProjectContextFit,
  getProjectKnowledge,
  knowledgeUpload,
  updateProjectInstructions,
} from '../controllers/project/projectContextController.js';

const router = express.Router();

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id/folders', getProjectFolders);
router.post('/:id/folders', addProjectFolder);
router.patch('/:id/folders/:folderId', updateProjectFolder);
router.delete('/:id/folders/:folderId', deleteProjectFolder);
router.get('/:id/chats', getProjectChats);
router.patch('/:id/instructions', updateProjectInstructions);
router.get('/:id/knowledge', getProjectKnowledge);
router.post('/:id/knowledge', (req, res, next) => knowledgeUpload(req, res, (err) => {
  if (!err) return next();
  const tooBig = err.code === 'LIMIT_FILE_SIZE';
  return res.status(tooBig ? 413 : 400).json({ success: false, error: tooBig ? 'Files can be up to 25 MB each.' : err.message });
}), addProjectKnowledge);
router.delete('/:id/knowledge/:fileId', deleteProjectKnowledge);
router.get('/:id/context', getProjectContextFit);
router.patch('/:id/update', updateProject);
router.delete('/:id/delete', deleteProject);

export default router;
