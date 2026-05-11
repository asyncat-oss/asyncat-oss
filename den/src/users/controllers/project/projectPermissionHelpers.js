// projectPermissionHelpers.js — single-user OSS version

// =====================================================
// SECURE EMOJI VALIDATION
// =====================================================

function isValidSingleEmoji(input) {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed) return false;

  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(trimmed));
  if (segments.length !== 1) return false;

  const char = segments[0].segment;
  const emojiRegex = /^(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}])$/u;
  const extendedEmojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)$/u;
  return emojiRegex.test(char) || extendedEmojiRegex.test(char);
}

function sanitizeEmoji(emoji) {
  const DEFAULT_EMOJI = '📁';
  if (!emoji) return DEFAULT_EMOJI;
  const cleaned = emoji.toString().trim().replace(/[<>"'&]/g, '');
  if (isValidSingleEmoji(cleaned)) return cleaned;
  return DEFAULT_EMOJI;
}

function sanitizeWorkspaceEmoji(emoji) {
  const DEFAULT_WORKSPACE_EMOJI = '💼';
  if (!emoji) return DEFAULT_WORKSPACE_EMOJI;
  const cleaned = emoji.toString().trim().replace(/[<>"'&]/g, '');
  if (isValidSingleEmoji(cleaned)) return cleaned;
  return DEFAULT_WORKSPACE_EMOJI;
}

// =====================================================
// VIEW PERMISSION HELPERS
// =====================================================

function getDefaultViewPermissions(role, accessibleViews = []) {
  const defaultLevel = role === 'viewer' ? 'view' : 'edit';
  const permissions = {};
  accessibleViews.forEach(view => { permissions[view] = defaultLevel; });
  return permissions;
}

// Owner permissions — all true in single-user mode
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
  canManageViewPermissions: true,
};

// =====================================================
// PROJECT VIEW VALIDATION
// =====================================================

const VALID_PROJECT_VIEW_KEYS = [
  'storage', 'kanban', 'list', 'gantt',
  'network', 'notes', 'activity',
];

const getDefaultEnabledViews = () => {
  return [
    'kanban', 'list',
    'gantt', 'network', 'notes', 'activity', 'storage',
  ];
};

const normalizeProjectViews = (views) => {
  if (!Array.isArray(views)) return getDefaultEnabledViews();
  const cleanedViews = views.filter(view => VALID_PROJECT_VIEW_KEYS.includes(view));
  return cleanedViews.length > 0 ? cleanedViews : getDefaultEnabledViews();
};

const validateProjectEnabledViews = (enabledViews) => {
  if (!Array.isArray(enabledViews)) {
    return { isValid: false, error: 'Enabled views must be an array' };
  }
  const invalidViews = enabledViews.filter(view => !VALID_PROJECT_VIEW_KEYS.includes(view));
  if (invalidViews.length > 0) {
    return { isValid: false, error: `Invalid views: ${invalidViews.join(', ')}` };
  }
  return { isValid: true };
};

const validateUserViewPreferences = (preferences, availableViews, accessibleViews = null) => {
  if (!Array.isArray(preferences)) {
    return { isValid: false, error: 'Preferences must be an array' };
  }
  if (preferences.length === 0) {
    return { isValid: false, error: 'At least one view must be selected' };
  }
  const constraintViews = accessibleViews || availableViews;
  const availableKeys = Array.isArray(constraintViews) ? constraintViews : constraintViews.map(v => v.key);
  const invalidPreferences = preferences.filter(pref => !availableKeys.includes(pref));
  if (invalidPreferences.length > 0) {
    return {
      isValid: false,
      error: accessibleViews
        ? `You don't have access to these views: ${invalidPreferences.join(', ')}`
        : `These views are not available: ${invalidPreferences.join(', ')}`,
    };
  }
  return { isValid: true };
};

// =====================================================
// AUTH HELPER
// =====================================================

export async function verifyUser(req) {
  const { user, db } = req;
  if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  return { user, db };
}

export {
  sanitizeEmoji,
  sanitizeWorkspaceEmoji,
  isValidSingleEmoji,
  OWNER_PERMISSIONS,
  getDefaultViewPermissions,
  getDefaultEnabledViews,
  normalizeProjectViews,
  validateProjectEnabledViews,
  validateUserViewPreferences,
};
