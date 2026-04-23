// Centralized permissions system for the entire application
import { Crown, User, Eye } from 'lucide-react';

export const ROLE_PERMISSIONS = {
  owner: {
    // Project permissions
    canViewProject: true,
    canEditProject: true,
    canDeleteProject: true,
    canCreateProject: true,
    canArchiveProject: true,
    
    // Member management
    canViewMembers: true,
    canAddMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canInviteMembers: true,
    
    // Content permissions
    canCreateContent: true,
    canEditContent: true,
    canDeleteContent: true,
    canViewContent: true,
    canEditOwnContent: true,
    canEditOthersContent: true,
    
    // Feature management
    canManageFeatures: true,
    canConfigureIntegrations: true,
    canManageSettings: true,
    
    // Activity and monitoring
    canViewActivity: true,
    canViewAnalytics: true,
    canExportData: true,
    
    // Team permissions
    canCreateTeam: true,
    canEditTeam: true,
    canDeleteTeam: true,
    canManageTeamSettings: true,
    
    // Calendar permissions
    canViewCalendar: true,
    canCreateEvents: true,
    canEditEvents: true,
    canDeleteEvents: true,
    canManageCalendarSettings: true,
    
    // Notes permissions
    canViewNotes: true,
    canCreateNotes: true,
    canEditNotes: true,
    canDeleteNotes: true,
    canShareNotes: true,
    
    // AI/Command Center
    canUseAI: true,
    canConfigureAI: true,
    canViewAIHistory: true,
    
  },
  
  member: {
    // Project permissions
    canViewProject: true,
    canEditProject: true,
    canDeleteProject: false,
    canCreateProject: true,
    canArchiveProject: false,
    
    // Member management
    canViewMembers: true,
    canAddMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canInviteMembers: false,
    
    // Content permissions
    canCreateContent: true,
    canEditContent: true,
    canDeleteContent: true, // Own content
    canViewContent: true,
    canEditOwnContent: true,
    canEditOthersContent: false,
    
    // Feature management
    canManageFeatures: false,
    canConfigureIntegrations: false,
    canManageSettings: false,
    
    // Activity and monitoring
    canViewActivity: true,
    canViewAnalytics: false,
    canExportData: false,
    
    // Team permissions
    canCreateTeam: false,
    canEditTeam: false,
    canDeleteTeam: false,
    canManageTeamSettings: false,
    
    // Calendar permissions
    canViewCalendar: true,
    canCreateEvents: true,
    canEditEvents: true, // Own events
    canDeleteEvents: true, // Own events
    canManageCalendarSettings: false,
    
    // Notes permissions
    canViewNotes: true,
    canCreateNotes: true,
    canEditNotes: true, // Own notes
    canDeleteNotes: true, // Own notes
    canShareNotes: true,
    
    // AI/Command Center
    canUseAI: true,
    canConfigureAI: false,
    canViewAIHistory: true, // Own history
    
  },

  viewer: {
    // Project permissions
    canViewProject: true,
    canEditProject: false,
    canDeleteProject: false,
    canCreateProject: false,
    canArchiveProject: false,
    
    // Member management
    canViewMembers: true,
    canAddMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canInviteMembers: false,
    
    // Content permissions
    canCreateContent: false,
    canEditContent: false,
    canDeleteContent: false,
    canViewContent: true,
    canEditOwnContent: false,
    canEditOthersContent: false,
    
    // Feature management
    canManageFeatures: false,
    canConfigureIntegrations: false,
    canManageSettings: false,
    
    // Activity and monitoring
    canViewActivity: true,
    canViewAnalytics: false,
    canExportData: false,
    
    // Team permissions
    canCreateTeam: false,
    canEditTeam: false,
    canDeleteTeam: false,
    canManageTeamSettings: false,
    
    // Calendar permissions
    canViewCalendar: true,
    canCreateEvents: false,
    canEditEvents: false,
    canDeleteEvents: false,
    canManageCalendarSettings: false,
    
    // Notes permissions
    canViewNotes: true,
    canCreateNotes: false,
    canEditNotes: false,
    canDeleteNotes: false,
    canShareNotes: false,
    
    // AI/Command Center
    canUseAI: false,
    canConfigureAI: false,
    canViewAIHistory: false,
    
  }
};

// Permission categories for easier management
export const PERMISSION_CATEGORIES = {
  PROJECT: [
    'canViewProject', 'canEditProject', 'canDeleteProject', 
    'canCreateProject', 'canArchiveProject'
  ],
  MEMBERS: [
    'canViewMembers', 'canAddMembers', 'canRemoveMembers', 
    'canChangeRoles', 'canInviteMembers'
  ],
  CONTENT: [
    'canCreateContent', 'canEditContent', 'canDeleteContent', 
    'canViewContent', 'canEditOwnContent', 'canEditOthersContent'
  ],
  FEATURES: [
    'canManageFeatures', 'canConfigureIntegrations', 'canManageSettings'
  ],
  ACTIVITY: [
    'canViewActivity', 'canViewAnalytics', 'canExportData'
  ],
  TEAM: [
    'canCreateTeam', 'canEditTeam', 'canDeleteTeam', 'canManageTeamSettings'
  ],
  CALENDAR: [
    'canViewCalendar', 'canCreateEvents', 'canEditEvents', 
    'canDeleteEvents', 'canManageCalendarSettings'
  ],
  NOTES: [
    'canViewNotes', 'canCreateNotes', 'canEditNotes', 
    'canDeleteNotes', 'canShareNotes'
  ],
  AI: [
    'canUseAI', 'canConfigureAI', 'canViewAIHistory'
  ],
};

// Simple permission checker
export const hasPermission = (userRole, permission) => {
  if (!userRole || !permission) return false;
  const rolePermissions = ROLE_PERMISSIONS[userRole.toLowerCase()];
  return rolePermissions?.[permission] === true;
};

// Check multiple permissions at once
export const hasAllPermissions = (userRole, permissions) => {
  return permissions.every(permission => hasPermission(userRole, permission));
};

// Check if user has any of the specified permissions
export const hasAnyPermission = (userRole, permissions) => {
  return permissions.some(permission => hasPermission(userRole, permission));
};

// Enhanced React hook for permissions
export const usePermissions = (userRole) => {
  const checkPermission = (permission) => hasPermission(userRole, permission);
  
  return {
    hasPermission: checkPermission,
    hasAllPermissions: (permissions) => hasAllPermissions(userRole, permissions),
    hasAnyPermission: (permissions) => hasAnyPermission(userRole, permissions),
    
    // Project permissions
    canViewProject: checkPermission('canViewProject'),
    canEditProject: checkPermission('canEditProject'),
    canDeleteProject: checkPermission('canDeleteProject'),
    canCreateProject: checkPermission('canCreateProject'),
    canArchiveProject: checkPermission('canArchiveProject'),
    
    // Legacy aliases for backward compatibility
    canEdit: checkPermission('canEditProject'),
    canDelete: checkPermission('canDeleteProject'),
    
    // Member management
    canViewMembers: checkPermission('canViewMembers'),
    canAddMembers: checkPermission('canAddMembers'),
    canRemoveMembers: checkPermission('canRemoveMembers'),
    canEditMembers: checkPermission('canAddMembers'), // Alias
    canChangeRoles: checkPermission('canChangeRoles'),
    canInviteMembers: checkPermission('canInviteMembers'),
    
    // Content permissions
    canCreateContent: checkPermission('canCreateContent'),
    canEditContent: checkPermission('canEditContent'),
    canDeleteContent: checkPermission('canDeleteContent'),
    canViewContent: checkPermission('canViewContent'),
    canEditOwnContent: checkPermission('canEditOwnContent'),
    canEditOthersContent: checkPermission('canEditOthersContent'),
    
    // Feature management
    canManageFeatures: checkPermission('canManageFeatures'),
    canConfigureIntegrations: checkPermission('canConfigureIntegrations'),
    canManageSettings: checkPermission('canManageSettings'),
    
    // Activity and monitoring
    canViewActivity: checkPermission('canViewActivity'),
    canViewAnalytics: checkPermission('canViewAnalytics'),
    canExportData: checkPermission('canExportData'),
    
    // Team permissions
    canCreateTeam: checkPermission('canCreateTeam'),
    canEditTeam: checkPermission('canEditTeam'),
    canDeleteTeam: checkPermission('canDeleteTeam'),
    canManageTeamSettings: checkPermission('canManageTeamSettings'),
    
    // Calendar permissions
    canViewCalendar: checkPermission('canViewCalendar'),
    canCreateEvents: checkPermission('canCreateEvents'),
    canEditEvents: checkPermission('canEditEvents'),
    canDeleteEvents: checkPermission('canDeleteEvents'),
    canManageCalendarSettings: checkPermission('canManageCalendarSettings'),
    
    // Notes permissions
    canViewNotes: checkPermission('canViewNotes'),
    canCreateNotes: checkPermission('canCreateNotes'),
    canEditNotes: checkPermission('canEditNotes'),
    canDeleteNotes: checkPermission('canDeleteNotes'),
    canShareNotes: checkPermission('canShareNotes'),
    
    // AI/Command Center
    canUseAI: checkPermission('canUseAI'),
    canConfigureAI: checkPermission('canConfigureAI'),
    canViewAIHistory: checkPermission('canViewAIHistory'),
    
    // Role checks
    isOwner: userRole?.toLowerCase() === 'owner',
    isMember: userRole?.toLowerCase() === 'member',
    isViewer: userRole?.toLowerCase() === 'viewer' || userRole?.toLowerCase() === 'guest',
    isGuest: userRole?.toLowerCase() === 'guest' || userRole?.toLowerCase() === 'viewer'
  };
};

// Permission gate component
export const PermissionGate = ({ userRole, permission, permissions, requireAll = false, children, fallback = null }) => {
  let allowed = false;
  
  if (permission) {
    // Single permission check
    allowed = hasPermission(userRole, permission);
  } else if (permissions) {
    // Multiple permissions check
    allowed = requireAll 
      ? hasAllPermissions(userRole, permissions)
      : hasAnyPermission(userRole, permissions);
  }
  
  return allowed ? children : fallback;
};

// Role-based gate component
export const RoleGate = ({ userRole, allowedRoles, children, fallback = null }) => {
  const allowed = allowedRoles.includes(userRole?.toLowerCase());
  return allowed ? children : fallback;
};

// Get role display info
export const getRoleInfo = (role) => {
  const roleInfo = {
    owner: { 
      label: 'Owner', 
      color: 'bg-yellow-100 dark:bg-yellow-900/30 midnight:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 midnight:text-yellow-300', 
      priority: 3,
      icon: Crown
    },
    member: { 
      label: 'Member', 
      color: 'bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300', 
      priority: 2,
      icon: User
    },
    guest: { 
      label: 'Guest', 
      color: 'bg-gray-100 dark:bg-gray-700/30 midnight:bg-gray-800/20 text-gray-700 dark:text-gray-300 midnight:text-gray-400', 
      priority: 1,
      icon: Eye
    },
    viewer: { // Maintain compatibility
      label: 'Guest', 
      color: 'bg-gray-100 dark:bg-gray-700/30 midnight:bg-gray-800/20 text-gray-700 dark:text-gray-300 midnight:text-gray-400', 
      priority: 1,
      icon: Eye
    }
  };
  return roleInfo[role?.toLowerCase()] || roleInfo.guest;
};

// Get available roles
export const getAvailableRoles = () => {
  return ['owner', 'member', 'guest'];
};

// Get role hierarchy (higher number = more permissions)
export const getRoleHierarchy = (role) => {
  const hierarchy = {
    owner: 3,
    member: 2,
    viewer: 1
  };
  return hierarchy[role?.toLowerCase()] || 0;
};

// Check if user can manage another user based on role hierarchy
export const canManageUser = (currentUserRole, targetUserRole) => {
  return getRoleHierarchy(currentUserRole) > getRoleHierarchy(targetUserRole);
};

// Get permissions by category
export const getPermissionsByCategory = (category) => {
  return PERMISSION_CATEGORIES[category] || [];
};

// Get all permissions for a role
export const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role?.toLowerCase()] || {};
};
