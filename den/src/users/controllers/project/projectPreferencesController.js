// projectPreferencesController.js — single-user OSS version
// Removed: project_members queries (no membership table in single-user mode)
// Access check: project.owner_id === user.id

import {
  verifyUser,
  getDefaultEnabledViews,
  getDefaultViewPermissions,
  getMemberEffectiveViews,
  getMemberEffectiveViewPermissions,
  validateUserViewPreferences,
} from './projectPermissionHelpers.js';

// Helper: get project and verify ownership
async function getOwnedProject(supabase, projectId, userId) {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, owner_id, enabled_views')
    .eq('id', projectId)
    .single();

  if (error || !project || project.owner_id !== userId) {
    return null;
  }
  return project;
}

// Update user's view preferences for a project
// In single-user mode this is a no-op (owner always sees all views), but kept for API compat.
async function updateUserViewPreferences(req, res) {
  try {
    const { id: projectId } = req.params;
    const { view_preferences } = req.body;
    const { user, supabase } = await verifyUser(req);

    const project = await getOwnedProject(supabase, projectId, user.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const availableViews = project.enabled_views || getDefaultEnabledViews();

    const validation = validateUserViewPreferences(view_preferences, availableViews, availableViews);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const effectiveViewPermissions = getDefaultViewPermissions('owner', view_preferences);

    res.json({
      success: true,
      data: {
        view_preferences,
        available_views: availableViews,
        accessible_views: availableViews,
        effective_view_permissions: effectiveViewPermissions,
      },
    });
  } catch (error) {
    console.error('Update view preferences error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update view preferences' });
  }
}

// Reset user's view preferences to default
async function resetUserViewPreferences(req, res) {
  try {
    const { id: projectId } = req.params;
    const { user, supabase } = await verifyUser(req);

    const project = await getOwnedProject(supabase, projectId, user.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const availableViews = project.enabled_views || getDefaultEnabledViews();
    const effectiveViewPermissions = getDefaultViewPermissions('owner', availableViews);

    res.json({
      success: true,
      message: 'View preferences reset to default',
      data: {
        accessible_views: availableViews,
        effective_view_permissions: effectiveViewPermissions,
      },
    });
  } catch (error) {
    console.error('Reset view preferences error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to reset view preferences' });
  }
}

// Toggle user's starred status for a project
// In single-user mode, starred is stored on the project itself (or just returned as-is).
async function toggleProjectStarred(req, res) {
  try {
    const { id: projectId } = req.params;
    const { starred } = req.body;
    const { user, supabase } = await verifyUser(req);

    if (typeof starred !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Starred must be a boolean value' });
    }

    const project = await getOwnedProject(supabase, projectId, user.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // In single-user mode there's no project_members row — just acknowledge the request
    res.json({
      success: true,
      data: {
        starred,
        message: `Project ${starred ? 'starred' : 'unstarred'} successfully`,
      },
    });
  } catch (error) {
    console.error('Toggle starred error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update starred status' });
  }
}

// Get user's starred projects
async function getUserStarredProjects(req, res) {
  try {
    const { user, supabase } = await verifyUser(req);

    // In single-user mode, return all owned projects (no starred concept without project_members)
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, description, emoji, created_at, updated_at, due_date, enabled_views, team_id')
      .eq('owner_id', user.id)
      .eq('is_archived', false);

    if (error) throw error;

    const result = (projects || []).map(p => {
      const availableViews = p.enabled_views || getDefaultEnabledViews();
      return {
        ...p,
        user_role: 'owner',
        accessible_views: availableViews,
        effective_view_permissions: getDefaultViewPermissions('owner', availableViews),
        starred: false,
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get starred projects error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get starred projects' });
  }
}

// Get user's effective view permissions for a project
async function getUserViewPermissions(req, res) {
  try {
    const { id: projectId } = req.params;
    const { user, supabase } = await verifyUser(req);

    const project = await getOwnedProject(supabase, projectId, user.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const availableViews = project.enabled_views || getDefaultEnabledViews();
    const effectiveViewPermissions = getDefaultViewPermissions('owner', availableViews);

    res.json({
      success: true,
      data: {
        user_role: 'owner',
        project_enabled_views: availableViews,
        accessible_views: availableViews,
        user_view_preferences: null,
        effective_views: availableViews,
        view_permissions: effectiveViewPermissions,
        effective_view_permissions: effectiveViewPermissions,
      },
    });
  } catch (error) {
    console.error('Get user view permissions error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to get user view permissions' });
  }
}

export {
  updateUserViewPreferences,
  resetUserViewPreferences,
  toggleProjectStarred,
  getUserStarredProjects,
  getUserViewPermissions,
};
