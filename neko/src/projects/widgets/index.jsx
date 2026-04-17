// projects/widgets/index.js - Simplified without widget configuration system
import React from 'react';
import { 
  TrendingUp, Clock, Users, Activity, ListChecks, 
  Info, GitBranch, Calendar, Shield, Briefcase,
  AlertTriangle, CheckCircle, ChevronDown, Plus, Minus
} from 'lucide-react';

// Import default profile pictures
import catDP from '../../assets/dp/CAT.webp';
import dogDP from '../../assets/dp/DOG.webp';
import dolphinDP from '../../assets/dp/DOLPHIN.webp';
import dragonDP from '../../assets/dp/DRAGON.webp';
import elephantDP from '../../assets/dp/ELEPHANT.webp';
import foxDP from '../../assets/dp/FOX.webp';
import lionDP from '../../assets/dp/LION.webp';
import owlDP from '../../assets/dp/OWL.webp';
import penguinDP from '../../assets/dp/PENGUIN.webp';
import wolfDP from '../../assets/dp/WOLF.webp';

// Create a mapping object for easier lookup
const profilePictureMapping = {
  'CAT': catDP,
  'DOG': dogDP,
  'DOLPHIN': dolphinDP,
  'DRAGON': dragonDP,
  'ELEPHANT': elephantDP,
  'FOX': foxDP,
  'LION': lionDP,
  'OWL': owlDP, 
  'PENGUIN': penguinDP,
  'WOLF': wolfDP
};

// Format date helper function
const formatDate = (dateString) => {
  if (!dateString) return 'Not set';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return 'Invalid date';
  }
};

// Get team name helper function
const getTeamName = (project) => {
  if (project?.teams?.name) {
    return project.teams.name;
  }
  if (project?.team?.name) {
    return project.team.name;
  }
  return 'Team Project';
};

// Simple Member Avatar Component with Profile Picture Support
const MemberAvatar = ({ member, size = 'w-8 h-8', className = '' }) => {
  const getInitials = () => {
    const name = member.name || '';
    if (name) return name.charAt(0).toUpperCase();
    
    const email = member.email || '';
    if (!email) return 'U';
    return email.charAt(0).toUpperCase();
  };

  // Get profile picture source using the same logic as team components
  const getProfilePicture = () => {
    const profilePicId = member.profile_picture;
    if (!profilePicId) return null;
    
    // Check if it's a custom uploaded image (URL starts with https://)
    if (profilePicId.startsWith('https://')) {
      return profilePicId;
    }
    
    // Return the actual imported image from our mapping for predefined avatars
    return profilePictureMapping[profilePicId] || null;
  };

  const profilePictureSrc = getProfilePicture();
  const hasProfilePicture = profilePictureSrc !== null;

  return (
    <div 
      className={`${size} rounded-full flex items-center justify-center overflow-hidden ${
        hasProfilePicture ? 'bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700' : 'bg-gradient-to-br from-indigo-400 to-purple-500'
      } text-white font-medium text-xs ${className}`}
      title={`${member.name || member.email || 'Unknown User'} (${member.role || 'Member'})`}
    >
      {hasProfilePicture ? (
        <img 
          src={profilePictureSrc} 
          alt={member.name || 'User'}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to letter avatar if image fails to load
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
      ) : null}
      <div 
        className={`w-full h-full flex items-center justify-center text-white bg-gradient-to-br from-indigo-400 to-purple-500 ${hasProfilePicture ? 'hidden' : ''}`}
      >
        {getInitials()}
      </div>
    </div>
  );
};

// Widget wrapper component - UPDATED with dark backgrounds
const WidgetContainer = ({ title, icon, children, className = '' }) => (
  <div className={`bg-white/70 dark:bg-gray-900/50 midnight:bg-slate-950/50 rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30 ${className}`}>
    {title && (
      <div className="flex items-center gap-2 mb-3">
        {icon && <div className="text-blue-600 dark:text-blue-400 midnight:text-blue-400">{icon}</div>}
        <h3 className="font-medium text-gray-900 dark:text-white midnight:text-slate-100">{title}</h3>
      </div>
    )}
    {children}
  </div>
);

// Modern Compact Metric Card - UPDATED with dark backgrounds
const MetricCard = ({ icon, label, value, detail, iconColor }) => (
  <div className="bg-white/70 dark:bg-gray-900/50 midnight:bg-slate-950/50 rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30">
    <div className="flex items-center justify-between mb-3">
      <div className={`${iconColor}`}>
        {icon}
      </div>
    </div>
    <div className="space-y-1">
      <div className="text-xl font-bold text-gray-900 dark:text-white midnight:text-slate-100">{value}</div>
      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 midnight:text-slate-400 uppercase tracking-wide">{label}</div>
      {detail && (
        <div className="text-xs text-gray-500 dark:text-gray-500 midnight:text-slate-500">{detail}</div>
      )}
    </div>
  </div>
);

// Metrics Widget - Always shown
export const MetricsWidget = ({ metrics }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <MetricCard 
      icon={<TrendingUp className="w-5 h-5" />}
      label="Progress"
      value={`${metrics.progressPercent}%`}
      detail={`${metrics.tasksCompleted}/${metrics.tasksTotal}`}
      iconColor="text-emerald-600 dark:text-emerald-400"
    />
    
    <MetricCard 
      icon={<Clock className="w-5 h-5" />}
      label="Deadlines"
      value={metrics.upcomingDeadlines}
      detail="this week"
      iconColor="text-amber-600 dark:text-amber-400"
    />
    
    <MetricCard 
      icon={<Users className="w-5 h-5" />}
      label="Team"
      value={metrics.teamSize}
      detail="members"
      iconColor="text-blue-600 dark:text-blue-400"
    />
    
    <MetricCard 
      icon={<Activity className="w-5 h-5" />}
      label="Activity"
      value={metrics.lastActivity}
      detail=""
      iconColor="text-purple-600 dark:text-purple-400"
    />
  </div>
);

// Progress Widget - Always shown
export const ProgressWidget = ({ metrics }) => (
  <WidgetContainer 
    title="Subtasks" 
    icon={<ListChecks className="w-5 h-5" />}
  >
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-bold text-gray-900 dark:text-white midnight:text-slate-100">
        {metrics.totalChecklists > 0 
          ? Math.round((metrics.completedChecklists / metrics.totalChecklists) * 100) 
          : 0}%
      </span>
    </div>
    <div className="w-full bg-gray-200/60 dark:bg-gray-700/60 midnight:bg-slate-700/60 rounded-full h-2.5 shadow-inner">
      <div 
        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all duration-500 shadow-sm" 
        style={{ 
          width: `${metrics.totalChecklists > 0 
            ? Math.round((metrics.completedChecklists / metrics.totalChecklists) * 100) 
            : 0}%` 
        }}
      />
    </div>
    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
      {metrics.completedChecklists} of {metrics.totalChecklists} completed
    </div>
  </WidgetContainer>
);

// Description Widget - Only shown if project has description
export const DescriptionWidget = ({ project }) => {
  if (!project?.description) return null;
  
  return (
    <WidgetContainer title="About">
      <p className="text-sm text-gray-600 dark:text-gray-300 midnight:text-slate-300 leading-relaxed">
        {project.description}
      </p>
    </WidgetContainer>
  );
};


// Deadlines Widget - Only shown if there are deadlines
export const DeadlinesWidget = ({ deadlines }) => {
  if (!deadlines || deadlines.length === 0) return null;
  
  return (
    <WidgetContainer title="Deadlines">
      <div className="space-y-3">
        {deadlines.slice(0, 3).map((deadline) => (
          <div 
            key={deadline.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 hover:shadow-sm
              ${deadline.status === 'urgent' 
                ? 'border-red-200/60 bg-red-50/60 dark:border-red-800/40 dark:bg-red-900/20' 
                : deadline.status === 'imminent'
                  ? 'border-amber-200/60 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/20'
                  : 'border-gray-200/60 bg-gray-50/60 dark:border-gray-700/40 dark:bg-gray-700/20'
              }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
              ${deadline.status === 'urgent' 
                ? 'bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/30' 
                : deadline.status === 'imminent'
                  ? 'bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/30'
                  : 'bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-700/50'
              }`}
            >
              {deadline.status === 'urgent' ? (
                <AlertTriangle className={`w-5 h-5 ${
                  deadline.status === 'urgent' 
                    ? 'text-red-600 dark:text-red-400 midnight:text-red-400' 
                    : deadline.status === 'imminent'
                      ? 'text-amber-600 dark:text-amber-400 midnight:text-amber-400'
                      : 'text-gray-600 dark:text-gray-400 midnight:text-slate-400'
                }`} />
              ) : (
                <Calendar className={`w-5 h-5 ${
                  deadline.status === 'urgent' 
                    ? 'text-red-600 dark:text-red-400 midnight:text-red-400' 
                    : deadline.status === 'imminent'
                      ? 'text-amber-600 dark:text-amber-400 midnight:text-amber-400'
                      : 'text-gray-600 dark:text-gray-400 midnight:text-slate-400'
                }`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className={`font-medium text-sm truncate
                ${deadline.status === 'urgent' 
                  ? 'text-red-700 dark:text-red-300' 
                  : deadline.status === 'imminent'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-gray-800 dark:text-white'
                }`}
              >
                {deadline.title}
              </h4>
              <div className="flex justify-between items-center mt-1">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {deadline.formattedDate}
                </div>
                <div className={`text-xs font-medium 
                  ${deadline.status === 'urgent' 
                    ? 'text-red-600 dark:text-red-400' 
                    : deadline.status === 'imminent'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-blue-600 dark:text-blue-400'
                }`}
                >
                  {deadline.daysUntil === 0 
                    ? 'Today' 
                    : deadline.daysUntil === 1 
                      ? 'Tomorrow' 
                      : `${deadline.daysUntil}d`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </WidgetContainer>
  );
};

// Project Details Widget - Always shown
export const ProjectDetailsWidget = ({ project, userRole, getRoleInfo, currentUserId }) => {
  // Compute an effective role: prefer explicit `userRole` prop, then
  // if `currentUserId` is provided check `project.owner_id` (new canonical owner),
  // then fall back to `project.user_role` (legacy convenience), finally 'viewer'.
  const effectiveUserRole = userRole || ((project?.owner_id && currentUserId && project.owner_id === currentUserId) ? 'owner' : (project?.user_role || 'viewer'));
  const roleInfo = getRoleInfo(effectiveUserRole);
  
  return (
    <WidgetContainer title="Project Details">
      <div className="space-y-3">
        {/* User's Role */}
        <div className="flex items-center gap-3">
          <Shield className={`w-4 h-4 ${
            effectiveUserRole === 'owner' ? 'text-yellow-600 dark:text-yellow-400 midnight:text-yellow-300' :
            effectiveUserRole === 'member' ? 'text-blue-600 dark:text-blue-400 midnight:text-blue-300' :
            'text-gray-600 dark:text-gray-400 midnight:text-gray-400'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
              Your Role
            </div>
            <div className={`text-xs font-medium ${
              effectiveUserRole === 'owner' ? 'text-yellow-600 dark:text-yellow-400 midnight:text-yellow-300' :
              effectiveUserRole === 'member' ? 'text-blue-600 dark:text-blue-400 midnight:text-blue-300' :
              'text-gray-600 dark:text-gray-400 midnight:text-gray-400'
            }`}>
              {roleInfo.label}
            </div>
          </div>
        </div>

        {/* Due Date */}
        {project?.due_date && (
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 midnight:text-amber-400" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                Due Date
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                {formatDate(project.due_date)}
              </div>
            </div>
          </div>
        )}

        {/* Created Date */}
        {project?.created_at && (
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-slate-400" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                Created
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                {formatDate(project.created_at)}
              </div>
            </div>
          </div>
        )}
        
        {/* Team Information */}
        <div className="flex items-center gap-3">
          <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400 midnight:text-blue-400" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
              Team
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {getTeamName(project)}
            </div>
          </div>
        </div>
      </div>
    </WidgetContainer>
  );
};