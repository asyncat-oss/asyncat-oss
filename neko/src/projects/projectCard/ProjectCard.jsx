import React, { useState } from 'react';
import { Users, Calendar, X, CheckCircle, Star, Crown, Eye, User } from 'lucide-react';
import { getRoleInfo } from '../../utils/permissions';

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

const soraFontBase = "font-sora";

const ProjectCard = ({ 
  project, 
  members = [], // Accept members as props instead of fetching
  isSelected, 
  onOpenDetail,
  session,
}) => {
  const [error, setError] = useState(null);
  

  // Early return with placeholder if project is null/undefined
  if (!project) {
    return (
      <div className={`bg-white/70 dark:bg-gray-800/50 midnight:bg-slate-800/50 border rounded-2xl p-6 
        border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30 flex items-center justify-center ${soraFontBase}`}>
        <p className="text-gray-500 dark:text-gray-400 midnight:text-slate-400">Project data unavailable</p>
      </div>
    );
  }

  const { 
    name, 
    description, 
    due_date, 
    starred,
    created_at,
    updated_at,
    teams,
    has_repository,
    user_role: apiUserRole,
    owner_id,
    available_views = [],
    user_visible_views = [],
    user_view_preferences = null,
    emoji = '📁'
  } = project;
  
  // Derive current user's role - prefer `owner_id` as single source of truth
  const currentUserId = session?.user?.id;
  const derivedUserRole = (owner_id && currentUserId && owner_id === currentUserId) ? 'owner' : (apiUserRole || 'viewer');
  const user_role = derivedUserRole;
  const roleInfo = getRoleInfo(user_role);

  // Check if user has customized their view preferences
  const hasCustomViewPreferences = user_view_preferences && user_view_preferences.length < available_views.length;

  // Get team color based on team name for visual distinction
  const getTeamColor = () => {
    if (!teams?.name) return 'bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-indigo-300';
    
    // Generate consistent color based on team name - simple hash function
    const hash = teams.name.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0) % 6;
    
    switch (hash) {
      case 0: return 'bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-800 dark:text-blue-400 midnight:text-blue-300';
      case 1: return 'bg-purple-100 dark:bg-purple-900/30 midnight:bg-purple-900/20 text-purple-800 dark:text-purple-400 midnight:text-purple-300';
      case 2: return 'bg-pink-100 dark:bg-pink-900/30 midnight:bg-pink-900/20 text-pink-800 dark:text-pink-400 midnight:text-pink-300';
      case 3: return 'bg-cyan-100 dark:bg-cyan-900/30 midnight:bg-cyan-900/20 text-cyan-800 dark:text-cyan-400 midnight:text-cyan-300';
      case 4: return 'bg-amber-100 dark:bg-amber-900/30 midnight:bg-amber-900/20 text-amber-800 dark:text-amber-400 midnight:text-amber-300';
      case 5: return 'bg-emerald-100 dark:bg-emerald-900/30 midnight:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 midnight:text-emerald-300';
      default: return 'bg-indigo-100 dark:bg-indigo-900/30 midnight:bg-indigo-900/20 text-indigo-800 dark:text-indigo-400 midnight:text-indigo-300';
    }
  };

  // Get role badge color and icon
  const getRoleBadgeStyle = () => {
    switch (user_role?.toLowerCase()) {
      case 'owner':
        return {
          className: 'bg-yellow-100 dark:bg-yellow-900/30 midnight:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 midnight:text-yellow-300',
          icon: Crown
        };
      case 'member':
        return {
          className: 'bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/20 text-blue-800 dark:text-blue-400 midnight:text-blue-300',
          icon: User
        };
      case 'viewer':
        return {
          className: 'bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-800 dark:text-gray-300 midnight:text-gray-300',
          icon: Eye
        };
      default:
        return {
          className: 'bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-800 dark:text-gray-300 midnight:text-gray-300',
          icon: User
        };
    }
  };

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

  // Get team name from project object
  const getTeamName = () => {
    if (teams?.name) {
      return teams.name;
    }
    return 'Team Project';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900/30 midnight:bg-green-900/20 text-green-800 dark:text-green-400 midnight:text-green-300';
      case 'pending': return 'bg-yellow-100 dark:bg-yellow-900/30 midnight:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 midnight:text-yellow-300';
      case 'inactive': return 'bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-800 dark:text-gray-300 midnight:text-indigo-200';
      default: return 'bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-800 dark:text-gray-300 midnight:text-indigo-200';
    }
  };

  // Handle card click to open project details
  const handleCardClick = () => {
    onOpenDetail(project);
  };
  
  const roleBadgeStyle = getRoleBadgeStyle();
  const RoleIcon = roleBadgeStyle.icon;

  return (
    <div 
      className={`relative bg-white/70 dark:bg-gray-800/50 midnight:bg-slate-800/50 border rounded-2xl p-6
        transition-all duration-200 hover:shadow-sm cursor-pointer
        border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-slate-500 ${soraFontBase}`}
      onClick={handleCardClick}
    >
      {/* Role badge in top left corner */}
      {user_role && (
        <div 
          className={`absolute top-0 left-0 px-2.5 py-1 text-xs font-medium rounded-br-md rounded-tl-lg 
          ${roleBadgeStyle.className}`}
          title={`Your role: ${roleInfo.label}`}
        >
          <div className="flex items-center">
            <RoleIcon className="w-3 h-3 mr-1" />
            <span>{roleInfo.label}</span>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-2 right-2 left-2 p-2 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 text-red-600 dark:text-red-400 midnight:text-red-300 text-sm rounded animate-fadeIn">
          {error}
          <button 
            onClick={(e) => {
              e.stopPropagation(); // Prevent card click
              setError(null);
            }}
            className="absolute right-2 top-2 hover:bg-red-100 dark:hover:bg-red-800/30 midnight:hover:bg-red-900/20 rounded transition-colors duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      <div className="space-y-4 mt-6"> {/* Add margin-top to account for role badge */}
        <div className="flex items-start">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              {isSelected && (
                <CheckCircle className="w-4 h-4 text-gray-900 dark:text-white midnight:text-slate-100" />
              )}
              {starred && (
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              )}
              {/* Project emoji */}
              <span className="text-lg mr-2 flex-shrink-0" role="img" aria-label="Project icon">
                {emoji}
              </span>
              <h3 className="font-medium text-lg text-gray-900 dark:text-white midnight:text-slate-100">{name || 'Untitled Project'}</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 midnight:text-slate-400 mt-1.5 line-clamp-2">
              {description || 'No description provided'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 midnight:text-slate-400">
          {due_date && (
            <div className="flex items-center space-x-1.5">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(due_date)}</span>
            </div>
          )}
          <div className="flex items-center space-x-1.5">
            <Users className="w-4 h-4" />
            <span>{members.length} members</span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200/50 dark:border-gray-700/30 midnight:border-slate-600/30">
          <div className="flex items-center justify-between">
            <div className="flex -space-x-2">
              {/* Show members */}
              {members.length > 0 ? (
                <>
                  {members.slice(0, 3).map((member, index) => {
                    const memberName = member.name || member.email?.split('@')[0] || 'Unknown';
                    const memberRole = member.role || 'Member';
                    
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
                        key={member.id || index} 
                        className={`w-8 h-8 rounded-full border-2 border-white/70 dark:border-gray-800/50 midnight:border-slate-800/50
                          flex items-center justify-center text-xs font-medium
                          transition-transform duration-200 hover:scale-110 overflow-hidden
                          ${hasProfilePicture ? 'bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700' : 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white'}`}
                        title={`${memberName} (${memberRole})`}
                      >
                        {hasProfilePicture ? (
                          <img 
                            src={profilePictureSrc} 
                            alt={memberName}
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
                          {memberName.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    );
                  })}
                  {members.length > 3 && (
                    <div className="w-8 h-8 rounded-full bg-gray-100/70 dark:bg-gray-700/50 midnight:bg-slate-700/50 border-2 border-white/70 dark:border-gray-800/50 midnight:border-slate-800/50
                                  flex items-center justify-center text-xs text-gray-600 dark:text-gray-400 midnight:text-slate-400 font-medium
                                  transition-transform duration-200 hover:scale-110"
                      title={`+${members.length - 3} more members`}
                    >
                      +{members.length - 3}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                  No members yet
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {updated_at && updated_at !== created_at 
                ? `Updated ${formatDate(updated_at)}`
                : created_at ? `Created ${formatDate(created_at)}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;