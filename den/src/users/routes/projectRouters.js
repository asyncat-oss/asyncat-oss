// projectRoutes.js — single-user OSS version
// Removed: member management routes, invitation routes, guest routes
import express from 'express';
import { auth } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

import {
  getProjects,
  getTeamProjects,
  createProject,
  updateProject,
  deleteProject,
  transferOwnership,
} from '../controllers/project/projectController.js';

import {
  updateUserViewPreferences,
  resetUserViewPreferences,
  toggleProjectStarred,
} from '../controllers/project/projectPreferencesController.js';

const router = express.Router();

// ─── Project CRUD ─────────────────────────────────────────────────────────────

router.get('/', auth, getProjects);
router.get('/teams/:teamId/projects', auth, getTeamProjects);
router.post('/', auth, createProject);
router.patch('/:id/update', auth, updateProject);
router.delete('/:id/delete', auth, deleteProject);
router.post('/:id/transfer-ownership', auth, transferOwnership);

// ─── User view preferences ────────────────────────────────────────────────────

// Get user's personal view preferences for a project
router.get('/:id/user/view-preferences', auth, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { user, db } = req;

    // In single-user mode, just return all enabled views as preferences
    const { data: project, error } = await db
      .from('projects')
      .select('enabled_views, owner_id')
      .eq('id', projectId)
      .single();

    if (error || !project || project.owner_id !== user.id) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    res.json({ success: true, data: { view_preferences: project.enabled_views || [] } });
  } catch (error) {
    console.error('Get user view preferences error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get view preferences' });
  }
});

router.patch('/:id/user/view-preferences', auth, updateUserViewPreferences);
router.delete('/:id/user/view-preferences', auth, resetUserViewPreferences);
router.patch('/:id/user/starred', auth, toggleProjectStarred);

// ─── Member routes (stubs — single-user mode) ─────────────────────────────────

const memberNotAvailable = (_req, res) =>
  res.status(400).json({ success: false, error: 'Member management is not available in single-user mode' });

router.get('/:id/members', auth, memberNotAvailable);
router.patch('/:id/members/:memberId/role', auth, memberNotAvailable);
router.post('/:id/members/invite', auth, memberNotAvailable);
router.patch('/:id/members/:memberId/accessible-views', auth, memberNotAvailable);
router.delete('/:id/members/:memberId', auth, memberNotAvailable);
router.post('/:id/leave', auth, memberNotAvailable);
router.get('/teams/:teamId/members', auth, memberNotAvailable);
router.put('/:id/members', auth, memberNotAvailable);
router.get('/members/batch', auth, memberNotAvailable);
router.get('/invites', auth, memberNotAvailable);
router.post('/:id/respond', auth, memberNotAvailable);

// ─── Project folders ──────────────────────────────────────────────────────────

router.get('/folders', auth, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const { data: folders, error } = await req.db
      .from('project_folders')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    const folderIds = (folders || []).map(f => f.id);
    let itemsByFolder = {};
    if (folderIds.length > 0) {
      const { data: items } = await req.db
        .from('project_folder_items')
        .select('folder_id, project_id')
        .in('folder_id', folderIds);
      (items || []).forEach(item => {
        if (!itemsByFolder[item.folder_id]) itemsByFolder[item.folder_id] = [];
        itemsByFolder[item.folder_id].push({ project_id: item.project_id });
      });
    }

    const data = (folders || []).map(f => ({
      ...f,
      project_folder_items: itemsByFolder[f.id] || [],
    }));

    res.json({ success: true, folders: data });
  } catch (error) {
    console.error('List project folders error:', error);
    res.status(500).json({ success: false, error: 'Failed to list folders' });
  }
});

router.post('/folders', auth, async (req, res) => {
  try {
    const { name, color, workspaceId } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

    const { data, error } = await req.db
      .from('project_folders')
      .insert({ id: randomUUID(), user_id: req.user.id, workspace_id: workspaceId, name: name.trim(), color: color || null })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, folder: { ...data, project_folder_items: [] } });
  } catch (error) {
    console.error('Create project folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to create folder' });
  }
});

router.patch('/folders/:folderId', auth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, color, sort_order } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await req.db
      .from('project_folders')
      .update(updates)
      .eq('id', folderId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Folder not found' });
    res.json({ success: true, folder: data });
  } catch (error) {
    console.error('Update project folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to update folder' });
  }
});

router.delete('/folders/:folderId', auth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { error } = await req.db
      .from('project_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Delete project folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete folder' });
  }
});

router.post('/folders/:folderId/items', auth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });

    const { data: folder, error: folderError } = await req.db
      .from('project_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', req.user.id)
      .single();

    if (folderError || !folder) return res.status(404).json({ success: false, error: 'Folder not found' });

    // Remove project from any existing folder first
    await req.db
      .from('project_folder_items')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', req.user.id);

    const { data, error } = await req.db
      .from('project_folder_items')
      .insert({ id: randomUUID(), folder_id: folderId, project_id: projectId, user_id: req.user.id })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, item: data });
  } catch (error) {
    console.error('Add project to folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to add project to folder' });
  }
});

router.delete('/folders/:folderId/items/:projectId', auth, async (req, res) => {
  try {
    const { folderId, projectId } = req.params;
    const { error } = await req.db
      .from('project_folder_items')
      .delete()
      .eq('folder_id', folderId)
      .eq('project_id', projectId)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Remove project from folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove project from folder' });
  }
});

export default router;
