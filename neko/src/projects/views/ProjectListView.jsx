import React from 'react';
import { Calendar, Users, Star, LayoutGrid, CheckCircle, Crown, Shield, User } from 'lucide-react';
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

// Component for displaying member avatars - optimized version that doesn't fetch data
const MemberAvatars = ({ members = [] }) => {
  const getProfilePicture = (member) => {
    const profilePicId = member.profile_picture;
    if (!profilePicId) return null;
    
    // Check if it's a custom uploaded image (URL starts with https://)
    if (profilePicId.startsWith('https://')) {
      return profilePicId;
    }
    
    // Return the actual imported image from our mapping for predefined avatars
    return profilePictureMapping[profilePicId] || null;
  };

  if (members.length === 0) {
    return (
      <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500 midnight:text-indigo-400">
        <Users className="w-3 h-3" />
        <span className="text-xs">0</span>
      </div>
    );
  }

  return (
    <div className="flex -space-x-1">
      {members.slice(0, 3).map((member, index) => {
        const memberName = member.name || member.email?.split('@')[0] || 'Unknown';
        const memberRole = member.role || 'Member';
        const profilePictureSrc = getProfilePicture(member);
        const hasProfilePicture = profilePictureSrc !== null;
        
        return (
          <div 
            key={member.id || index} 
            className={`w-6 h-6 rounded-full border border-white dark:border-gray-800 midnight:border-gray-900
              flex items-center justify-center text-xs font-medium
              transition-transform duration-200 hover:scale-110 hover:z-10 overflow-hidden cursor-pointer
              ${hasProfilePicture ? 'bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700' : 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white'}`}
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
              className={`w-full h-full flex items-center justify-center text-white bg-gradient-to-br from-indigo-400 to-purple-500 text-xs ${hasProfilePicture ? 'hidden' : ''}`}
            >
              {memberName.charAt(0).toUpperCase()}
            </div>
          </div>
        );
      })}
      {members.length > 3 && (
        <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 border border-white dark:border-gray-800 midnight:border-gray-900
                      flex items-center justify-center text-xs text-gray-600 dark:text-gray-400 midnight:text-indigo-300 font-medium
                      transition-transform duration-200 hover:scale-110 hover:z-10 cursor-pointer"
          title={`+${members.length - 3} more members`}
        >
          +{members.length - 3}
        </div>
      )}
    </div>
  );
};

// Skeleton loading component for the modern table view
export const ProjectListSkeleton = () => {
  const skeletonRows = Array(6).fill(0);
  
  return (
    <div className={`${soraFontBase} animate-pulse`}>
      {skeletonRows.map((_, index) => (
        <div key={index} className="flex items-center py-4 px-6 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/20">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="w-48 h-5 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded"></div>
              <div className="w-64 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm">
            <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
            <div className="w-20 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
            <div className="w-16 h-4 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-900 rounded"></div>
            <div className="flex gap-1">
              <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
              <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ProjectListView = ({
  projects,
  projectMembers = {}, // Accept projectMembers as props
  selectedProject,
  onOpenProjectDetail,
  loading = false,
}) => {
  // Show skeleton if loading
  if (loading) {
    return <ProjectListSkeleton />;
  }
  
  // Early return if there are no projects
  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 mx-auto mb-3 opacity-40">
          <LayoutGrid className="w-full h-full text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 midnight:text-indigo-300">No projects to display</p>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
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

  // Get role badge color and icon
  const getRoleBadgeStyle = (userRole) => {
    switch (userRole?.toLowerCase()) {
      case 'owner':
        return {
          className: 'bg-yellow-100 dark:bg-yellow-900/20 midnight:bg-yellow-900/10 text-yellow-700 dark:text-yellow-400 midnight:text-yellow-300',
          icon: Crown
        };
      case 'member':
        return {
          className: 'bg-blue-100 dark:bg-blue-900/20 midnight:bg-blue-900/10 text-blue-700 dark:text-blue-400 midnight:text-blue-300',
          icon: User
        };
      case 'viewer':
        return {
          className: 'bg-gray-100 dark:bg-gray-700/30 midnight:bg-gray-800/20 text-gray-600 dark:text-gray-400 midnight:text-gray-300',
          icon: Shield
        };
      default:
        return {
          className: 'bg-gray-100 dark:bg-gray-700/30 midnight:bg-gray-800/20 text-gray-600 dark:text-gray-400 midnight:text-gray-300',
          icon: Shield
        };
    }
  };

  return (
    <div className={`${soraFontBase}`}>
      {/* Table Header */}
      <div className="flex items-center py-3 px-6 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-indigo-300 bg-gray-50/30 dark:bg-gray-800/20 midnight:bg-gray-900/10 border-b border-gray-200/30 dark:border-gray-700/20 midnight:border-gray-800/15">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-1"></div> {/* Space for selection indicator */}
          <div className="w-8"></div> {/* Space for emoji */}
          <div className="flex-1">Name</div>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs">
          <div className="w-20">Ownership</div>
          <div className="w-24">Due Date</div>
          <div className="w-24">Team</div>
        </div>
      </div>

      {/* Project Rows */}
      <div className="divide-y divide-gray-100/50 dark:divide-gray-700/30 midnight:divide-gray-800/20">
        {projects.map((project) => {
          const members = projectMembers[project.id] || []; // Get members for this project
          
          return (
            <div 
              key={project.id} 
              className={`group flex items-center py-4 px-6 cursor-pointer transition-all duration-200 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-gray-900/20 ${
                selectedProject?.id === project.id 
                  ? 'bg-gray-50/70 dark:bg-gray-800/40 midnight:bg-gray-900/25' 
                  : ''
              }`}
              onClick={() => onOpenProjectDetail(project)}
            >
              {/* Left side - Project info */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Selection indicator */}
                {selectedProject?.id === project.id && (
                  <div className="w-1 h-8 bg-indigo-500 dark:bg-indigo-400 midnight:bg-indigo-300 rounded-full flex-shrink-0"></div>
                )}
                {/* Project emoji/icon */}
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-lg">
                  <span role="img" aria-label="Project icon">
                    {project.emoji || '📁'}
                  </span>
                </div>
                {/* Project details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {project.starred && (
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-400 flex-shrink-0" />
                    )}
                    <h3 className="font-medium text-gray-900 dark:text-white midnight:text-indigo-50 truncate">
                      {project.name || 'Untitled Project'}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-indigo-300 truncate">
                    {project.description || 'No description provided'}
                  </p>
                </div>
              </div>
              {/* Right side - Meta information (hidden on mobile) */}
              <div className="hidden md:flex items-center gap-8 text-sm">
                {/* Role */}
                <div className="w-20">
                  {project.user_role && (
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeStyle(project.user_role).className}`}>
                      {React.createElement(getRoleBadgeStyle(project.user_role).icon, { className: "w-3 h-3 mr-1" })}
                      <span className="hidden lg:inline">{getRoleInfo(project.user_role).label}</span>
                    </div>
                  )}
                </div>
                {/* Due date */}
                <div className="w-24 flex items-center gap-1.5 text-gray-600 dark:text-gray-300 midnight:text-indigo-200">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 midnight:text-indigo-400" />
                  <span className="truncate">{formatDate(project.due_date)}</span>
                </div>
                {/* Members with avatars */}
                <div className="w-24 flex items-center">
                  <MemberAvatars members={members} />
                </div>
              </div>
              {/* Mobile view - Show essential info */}
              <div className="md:hidden flex items-center gap-2">
                {project.user_role && (
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${getRoleBadgeStyle(project.user_role).className}`}>
                    {React.createElement(getRoleBadgeStyle(project.user_role).icon, { className: "w-3 h-3" })}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <MemberAvatars members={members} />
                </div>
                <CheckCircle className={`w-4 h-4 ${selectedProject?.id === project.id ? 'text-indigo-500 dark:text-indigo-400' : 'text-transparent'}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectListView;