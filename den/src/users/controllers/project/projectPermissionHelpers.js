// projectPermissionHelpers.js
import { verifyUser as jwtVerify } from '../../../auth/authMiddleware.js';
import { createCompatClient } from '../../../db/compat.js';

// =====================================================
// SECURE EMOJI VALIDATION
// =====================================================

/**
 * Sophisticated emoji validation that only allows single emoji characters
 * @param {string} input - The input to validate
 * @returns {boolean} - Whether the input is a valid single emoji
 */
function isValidSingleEmoji(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  // Remove any whitespace
  const trimmed = input.trim();
  
  // Must not be empty after trimming
  if (!trimmed) {
    return false;
  }

  // Check if it's exactly one emoji character using Unicode segmentation
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(trimmed));
  
  // Must be exactly one grapheme cluster
  if (segments.length !== 1) {
    return false;
  }

  const char = segments[0].segment;
  
  // Comprehensive emoji regex that covers all Unicode emoji ranges
  const emojiRegex = /^(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}])$/u;
  
  // Additional check for common emoji patterns
  const extendedEmojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)$/u;
  
  return emojiRegex.test(char) || extendedEmojiRegex.test(char);
}

/**
 * Sanitize and validate emoji input
 * @param {string} emoji - The emoji input to validate
 * @returns {string} - Valid emoji or default fallback
 */
function sanitizeEmoji(emoji) {
  const DEFAULT_EMOJI = '📁';
  
  if (!emoji) {
    return DEFAULT_EMOJI;
  }

  // Remove any potential XSS characters and trim
  const cleaned = emoji.toString().trim().replace(/[<>"'&]/g, '');
  
  if (isValidSingleEmoji(cleaned)) {
    return cleaned;
  }
  
  return DEFAULT_EMOJI;
}

/**
 * Sanitize and validate workspace emoji input
 * @param {string} emoji - The emoji input to validate
 * @returns {string} - Valid emoji or default fallback
 */
function sanitizeWorkspaceEmoji(emoji) {
  const DEFAULT_WORKSPACE_EMOJI = '💼';
  
  if (!emoji) {
    return DEFAULT_WORKSPACE_EMOJI;
  }

  // Remove any potential XSS characters and trim
  const cleaned = emoji.toString().trim().replace(/[<>"'&]/g, '');
  
  if (isValidSingleEmoji(cleaned)) {
    return cleaned;
  }
  
  return DEFAULT_WORKSPACE_EMOJI;
}

// =====================================================
// VIEW PERMISSION SYSTEM
// =====================================================

// Define valid permission levels for views
const VIEW_PERMISSION_LEVELS = {
  view: {
    label: 'View Only',
    description: 'Can only view content',
    level: 1
  },
  comment: {
    label: 'View & Comment',
    description: 'Can view content and add comments',
    level: 2
  },
  edit: {
    label: 'Full Access',
    description: 'Can view, comment, and edit content',
    level: 3
  }
};

// Valid permission levels array
const VALID_PERMISSION_LEVELS = Object.keys(VIEW_PERMISSION_LEVELS);

/**
 * Check if a permission level is valid
 * @param {string} level - The permission level to check
 * @returns {boolean} - Whether the level is valid
 */
function isValidPermissionLevel(level) {
  return VALID_PERMISSION_LEVELS.includes(level);
}

/**
 * Check if user has sufficient permission level for an action
 * @param {string} userLevel - User's permission level
 * @param {string} requiredLevel - Required permission level
 * @returns {boolean} - Whether user has sufficient permission
 */
function hasPermissionLevel(userLevel, requiredLevel) {
  if (!isValidPermissionLevel(userLevel) || !isValidPermissionLevel(requiredLevel)) {
    return false;
  }
  
  return VIEW_PERMISSION_LEVELS[userLevel].level >= VIEW_PERMISSION_LEVELS[requiredLevel].level;
}

/**
 * Validate view permissions object
 * @param {Object} viewPermissions - Object mapping view names to permission levels
 * @param {Array} allowedViews - Array of allowed view names
 * @returns {Object} - Validation result
 */
function validateViewPermissions(viewPermissions, allowedViews = []) {
  if (!viewPermissions || typeof viewPermissions !== 'object') {
    return { isValid: false, error: 'View permissions must be an object' };
  }

  // Check if all view names are valid
  const viewNames = Object.keys(viewPermissions);
  if (allowedViews.length > 0) {
    const invalidViews = viewNames.filter(view => !allowedViews.includes(view));
    if (invalidViews.length > 0) {
      return { 
        isValid: false, 
        error: `Invalid views: ${invalidViews.join(', ')}` 
      };
    }
  }

  // Check if all permission levels are valid
  const permissionLevels = Object.values(viewPermissions);
  const invalidLevels = permissionLevels.filter(level => !isValidPermissionLevel(level));
  if (invalidLevels.length > 0) {
    return { 
      isValid: false, 
      error: `Invalid permission levels: ${invalidLevels.join(', ')}. Must be one of: ${VALID_PERMISSION_LEVELS.join(', ')}` 
    };
  }

  return { isValid: true };
}

/**
 * Get default view permissions for a role
 * @param {string} role - User role
 * @param {Array} accessibleViews - Views the user has access to
 * @returns {Object} - Default view permissions
 */
function getDefaultViewPermissions(role, accessibleViews = []) {
  const defaultLevel = role === 'viewer' ? 'view' : 'edit';
  
  const permissions = {};
  accessibleViews.forEach(view => {
    permissions[view] = defaultLevel;
  });
  
  return permissions;
}

// =====================================================
// ROLE-BASED PERMISSION SYSTEM (UPDATED FOR HYBRID OWNERSHIP)
// =====================================================

// Define permissions for non-owner roles (owners get all permissions automatically)
const ROLE_PERMISSIONS = {
  member: {
    canViewProject: true,
    canEditProject: true,
    canDeleteProject: false,
    canArchiveProject: false,
    canViewMembers: true,
    canAddMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canCreateContent: true,
    canEditContent: true,
    canDeleteContent: true,
    canViewContent: true,
    canManageFeatures: false,
    canViewActivity: true,
    canManageProjectViews: true,
    canEditMembers: false,
    canManageViewPermissions: true
  },
  viewer: {
    canViewProject: true,
    canEditProject: false,
    canDeleteProject: false,
    canArchiveProject: false,
    canViewMembers: true,
    canAddMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canCreateContent: false,
    canEditContent: false,
    canDeleteContent: false,
    canViewContent: true,
    canManageFeatures: false,
    canViewActivity: true,
    canManageProjectViews: false,
    canEditMembers: false,
    canManageViewPermissions: false
  }
};

// Owner permissions - all permissions are true
const OWNER_PERMISSIONS = {
  canViewProject: true,
  canEditProject: true,
  canDeleteProject: true,
  canArchiveProject: true,
  canViewMembers: true,
  canAddMembers: true,
  canRemoveMembers: true,
  canChangeRoles: true,
  canCreateContent: true,
  canEditContent: true,
  canDeleteContent: true,
  canViewContent: true,
  canManageFeatures: true,
  canViewActivity: true,
  canManageProjectViews: true,
  canEditMembers: true,
  canManageViewPermissions: true
};

// Helper function to get default enabled views
const getDefaultEnabledViews = () => {
  return [
    'kanban', 'list', 'timeline',
    'gantt', 'network', 'notes', 'habits', 'activity', 'storage', 'gallery'
  ];
};

// Helper function to validate project-level enabled views
const validateProjectEnabledViews = (enabledViews) => {
  if (!Array.isArray(enabledViews)) {
    return { isValid: false, error: 'Enabled views must be an array' };
  }
  
  const validViewKeys = [
    'storage', 'kanban', 'list', 'timeline', 'gantt',
    'network', 'notes', 'habits', 'activity', 'gallery'
  ];
  
  const invalidViews = enabledViews.filter(view => !validViewKeys.includes(view));
  if (invalidViews.length > 0) {
    return { isValid: false, error: `Invalid views: ${invalidViews.join(', ')}` };
  }
  
  return { isValid: true };
};

// Helper function to validate member accessible views
const validateMemberAccessibleViews = (accessibleViews, projectEnabledViews) => {
  if (!Array.isArray(accessibleViews)) {
    return { isValid: false, error: 'Accessible views must be an array' };
  }
  
  if (accessibleViews.length === 0) {
    return { isValid: false, error: 'Member must have access to at least one view' };
  }
  
  // All accessible views must be in the project's enabled views
  const invalidViews = accessibleViews.filter(view => !projectEnabledViews.includes(view));
  if (invalidViews.length > 0) {
    return { isValid: false, error: `These views are not available in the project: ${invalidViews.join(', ')}` };
  }
  
  return { isValid: true };
};

// Helper function to validate member view permissions
const validateMemberViewPermissions = (viewPermissions, accessibleViews, projectEnabledViews) => {
  if (!viewPermissions) {
    return { isValid: true }; // Optional field
  }

  // Validate structure
  const structureValidation = validateViewPermissions(viewPermissions, projectEnabledViews);
  if (!structureValidation.isValid) {
    return structureValidation;
  }

  // Ensure all accessible views have permissions set
  const permissionViews = Object.keys(viewPermissions);
  const missingPermissions = accessibleViews.filter(view => !permissionViews.includes(view));
  
  if (missingPermissions.length > 0) {
    return {
      isValid: false,
      error: `Missing view permissions for accessible views: ${missingPermissions.join(', ')}`
    };
  }

  // Ensure no permissions are set for non-accessible views
  const extraPermissions = permissionViews.filter(view => !accessibleViews.includes(view));
  if (extraPermissions.length > 0) {
    return {
      isValid: false,
      error: `Permissions set for non-accessible views: ${extraPermissions.join(', ')}`
    };
  }

  return { isValid: true };
};

// Helper function to get member's effective views (intersection of accessible and preferences)
const getMemberEffectiveViews = (memberData, projectEnabledViews) => {
  const accessibleViews = memberData.accessible_views || projectEnabledViews;
  const userPreferences = memberData.view_preferences || accessibleViews;
  
  // User can only see views they have access to AND have in their preferences
  let effectiveViews = userPreferences.filter(view => accessibleViews.includes(view));
  
  return effectiveViews;
};

// Helper function to get member's effective view permissions
const getMemberEffectiveViewPermissions = (memberData, effectiveViews) => {
  const viewPermissions = memberData.view_permissions || {};
  const role = memberData.role || 'viewer';
  
  const effectivePermissions = {};
  effectiveViews.forEach(view => {
    effectivePermissions[view] = viewPermissions[view] || (role === 'viewer' ? 'view' : 'edit');
  });
  
  return effectivePermissions;
};

// Helper function to validate user view preferences
const validateUserViewPreferences = (preferences, availableViews, accessibleViews = null) => {
  if (!Array.isArray(preferences)) {
    return { isValid: false, error: 'Preferences must be an array' };
  }
  
  if (preferences.length === 0) {
    return { isValid: false, error: 'At least one view must be selected' };
  }
  
  // If accessible views are specified, use them as the constraint
  const constraintViews = accessibleViews || availableViews;
  const availableKeys = Array.isArray(constraintViews) ? constraintViews : constraintViews.map(v => v.key);
  
  // Check for invalid preferences
  const invalidPreferences = preferences.filter(pref => !availableKeys.includes(pref));
  
  if (invalidPreferences.length > 0) {
    return { 
      isValid: false, 
      error: accessibleViews 
        ? `You don't have access to these views: ${invalidPreferences.join(', ')}`
        : `These views are not available: ${invalidPreferences.join(', ')}` 
    };
  }
  
  return { isValid: true };
};

// =====================================================
// OWNERSHIP AND PERMISSION CHECKING (UPDATED)
// =====================================================

/**
 * Check if user is the owner of a project
 * @param {Object} supabase - Supabase client
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {boolean} - Whether user is the owner
 */
const isProjectOwner = async (supabase, projectId, userId) => {
  const { data: project, error } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return false;
  }

  return project.owner_id === userId;
};

/**
 * Get user's role and permissions in a project (UPDATED for hybrid ownership)
 * @param {Object} supabase - Supabase client
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Object|null} - User role data or null
 */
const getUserProjectRole = async (supabase, projectId, userId) => {
  // First check if user is the owner
  const isOwner = await isProjectOwner(supabase, projectId, userId);
  
  if (isOwner) {
    // Owner gets all permissions and all views
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('enabled_views')
      .eq('id', projectId)
      .single();

    const enabledViews = project?.enabled_views || getDefaultEnabledViews();
    
    return {
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      status: 'active',
      view_preferences: null,
      accessible_views: enabledViews,
      view_permissions: getDefaultViewPermissions('member', enabledViews) // Owners get edit on all views
    };
  }

  // Single-user mode: if not the owner, no access
  return null;
};

/**
 * Check if user has specific permission (UPDATED for hybrid ownership)
 * @param {Object} supabase - Supabase client
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {string} permission - Permission to check
 * @returns {boolean} - Whether user has permission
 */
const hasPermission = async (supabase, projectId, userId, permission) => {
  // Owners always have all permissions
  const isOwner = await isProjectOwner(supabase, projectId, userId);
  if (isOwner) {
    return true;
  }

  // Check member permissions
  const userRole = await getUserProjectRole(supabase, projectId, userId);
  
  if (!userRole) {
    return false;
  }

  return userRole.permissions[permission] === true;
};

// Helper function to check if user has permission for a specific view action
const hasViewPermission = async (supabase, projectId, userId, viewName, requiredLevel = 'view') => {
  const userRole = await getUserProjectRole(supabase, projectId, userId);
  
  if (!userRole) {
    return false;
  }

  // Owners can do anything
  if (userRole.role === 'owner') {
    return true;
  }

  // Members with canEditContent can do anything
  if (userRole.permissions.canEditContent) {
    return true;
  }

  // Check if user has access to the view
  const accessibleViews = userRole.accessible_views || [];
  if (!accessibleViews.includes(viewName)) {
    return false;
  }

  // Check view-specific permission level
  const viewPermissions = userRole.view_permissions || {};
  const userLevel = viewPermissions[viewName] || 'view';
  
  return hasPermissionLevel(userLevel, requiredLevel);
};

// =====================================================
// OWNERSHIP TRANSFER FUNCTIONS
// =====================================================

/**
 * Transfer project ownership
 * @param {Object} supabase - Supabase client
 * @param {string} projectId - Project ID
 * @param {string} newOwnerId - New owner user ID
 * @param {string} currentUserId - Current user ID (must be current owner)
 * @returns {Object} - Transfer result
 */
const transferProjectOwnership = async (supabase, projectId, newOwnerId, currentUserId) => {
  try {
    // Use the database function for atomic ownership transfer
    const { data: result, error } = await supabase
      .rpc('transfer_project_ownership', {
        p_project_id: projectId,
        p_new_owner_id: newOwnerId,
        p_current_user_id: currentUserId
      });

    if (error) {
      throw error;
    }

    return result;
  } catch (error) {
    console.error('Ownership transfer error:', error);
    return {
      success: false,
      error: error.message || 'Failed to transfer ownership'
    };
  }
};

// Internal helper: if req.supabase already set by upstream middleware, use it;
// otherwise create a compat client from the user already on the request.
const getSupabase = (req) => {
  if (req.supabase) return req.supabase;
  return createCompatClient(req.user);
};

// Middleware function to check permissions
const requirePermission = (permission) => {
  return (req, res, next) => {
    jwtVerify(req, res, async () => {
      try {
        const { id: projectId } = req.params;
        const supabase = getSupabase(req);
        req.supabase = supabase;

        const hasAccess = await hasPermission(supabase, projectId, req.user.id, permission);
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: `Insufficient permissions. Required: ${permission}` });
        }
        req.userRole = await getUserProjectRole(supabase, projectId, req.user.id);
        next();
      } catch (err) {
        return res.status(401).json({ success: false, error: 'Authentication failed' });
      }
    });
  };
};

// Middleware function to check view permissions
const requireViewPermission = (viewName, requiredLevel = 'view') => {
  return (req, res, next) => {
    jwtVerify(req, res, async () => {
      try {
        const { id: projectId } = req.params;
        const supabase = getSupabase(req);
        req.supabase = supabase;

        const hasAccess = await hasViewPermission(supabase, projectId, req.user.id, viewName, requiredLevel);
        if (!hasAccess) {
          return res.status(403).json({ success: false, error: `Insufficient permissions for ${viewName}. Required: ${requiredLevel}` });
        }
        req.userRole = await getUserProjectRole(supabase, projectId, req.user.id);
        next();
      } catch (err) {
        return res.status(401).json({ success: false, error: 'Authentication failed' });
      }
    });
  };
};


/**
 * Controller-level helper: reads req.user and req.supabase (set by auth middleware).
 * Controllers that were written to call `await verifyUser(req)` use this.
 */
export async function verifyUser(req) {
  const { user, supabase } = req;
  if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  return { user, supabase };
}

export {
  // Emoji functions
  sanitizeEmoji,
  sanitizeWorkspaceEmoji,
  isValidSingleEmoji,
  // Permission constants and functions
  ROLE_PERMISSIONS,
  OWNER_PERMISSIONS,
  getUserProjectRole,
  hasPermission,
  requirePermission,
  isProjectOwner,
  transferProjectOwnership,
  // View permission functions
  VIEW_PERMISSION_LEVELS,
  VALID_PERMISSION_LEVELS,
  isValidPermissionLevel,
  hasPermissionLevel,
  validateViewPermissions,
  getDefaultViewPermissions,
  hasViewPermission,
  requireViewPermission,
  // Default functions
  getDefaultEnabledViews,
  // Validation functions
  validateProjectEnabledViews,
  validateUserViewPreferences,
  // Accessible views functions
  validateMemberAccessibleViews,
  getMemberEffectiveViews,
  // View permissions functions
  validateMemberViewPermissions,
  getMemberEffectiveViewPermissions,
};