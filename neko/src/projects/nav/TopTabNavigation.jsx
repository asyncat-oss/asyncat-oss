import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, MoreHorizontal, Info, KanbanSquare, List, Clock,
  GanttChartSquare, FileText, FolderGit2, Activity, Link2, LayoutGrid,
  Target, Star, Timer, Heart, Settings, Users, Plus, User, Shield, Circle
} from 'lucide-react';

const TopTabNavigation = ({
  features,
  currentTab,
  onTabChange,
  projectInfo,
  sidebarCollapsed,
  setSidebarCollapsed,
  isViewer,
  setShowSettingsModal,
  setSettingsInitialTab,
  projectMembers = [],
  totalViewers = 0,
  onlineUserIds = new Set(),
  showAddDropdown,
  setShowAddDropdown,
  setShowTeamInviteModal,
  renderTeamMember,
  topNavCollapsed = false,
  setTopNavCollapsed
}) => {
  // State to manage local collapse if not provided
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const isCollapsed = setTopNavCollapsed ? topNavCollapsed : localCollapsed;
  const toggleCollapsed = setTopNavCollapsed ? () => setTopNavCollapsed(!topNavCollapsed) : () => setLocalCollapsed(!localCollapsed);

  // Add keyboard shortcut for Ctrl/Cmd+G
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'g') {
        event.preventDefault();
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);
  const allTabs = features;

  const TabButton = ({ feature, isActive, className = "" }) => (
    <button
      key={feature.key}
      onClick={() => onTabChange(feature.key)}
      className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm transition-all duration-150 whitespace-nowrap active:scale-[0.98] ${
        isActive
          ? 'bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-200 shadow-sm ring-1 ring-gray-200/50 dark:ring-gray-700/50'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80'
      } ${className}`}
    >
      <feature.icon className={`flex-shrink-0 w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 group-hover:text-gray-600'}`} />
      <span className={`hidden sm:block font-medium ${isActive ? '' : ''}`}>{feature.label}</span>
    </button>
  );

  // If collapsed, show minimal header with tabs
  if (isCollapsed) {
    return (
      <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 transition-all duration-200">
        {/* Collapsed Header */}
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <span className="text-xl">{projectInfo?.emoji || '📁'}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100 truncate">
                {projectInfo?.name || 'Project Details'}
              </h1>
            </div>
          </div>

          {/* Expand button - positioned consistently */}
          <button
            onClick={toggleCollapsed}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded-lg flex-shrink-0"
            title="Expand Navigation (Click to show full header)"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Collapsed Navigation Tabs */}
        <div className="px-6 py-2">
          <div className="flex items-center justify-between">
            <div className="flex space-x-1 overflow-x-auto">
              {allTabs.map((feature) => (
                <TabButton
                  key={feature.key}
                  feature={feature}
                  isActive={currentTab === feature.key}
                  className="flex-shrink-0"
                />
              ))}
            </div>

            {/* Settings Button in collapsed view */}
            {!isViewer && (
              <div className="ml-4 flex-shrink-0">
                <button
                  onClick={() => {
                    setSettingsInitialTab('general');
                    setShowSettingsModal(true);
                  }}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
                  title="Project Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 transition-all duration-200 z-40">
      {/* Project Header */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <span className="text-2xl">{projectInfo?.emoji || '📁'}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 truncate">
                {projectInfo?.name || 'Project Details'}
              </h1>
            </div>
          </div>

          {/* Project Stats and Collapse Button */}
          <div className="flex items-center space-x-4">
            {/* Project Stats */}
            <div className="hidden md:flex items-center space-x-6 text-sm">
              <div className="text-center">
                <div className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
                  {projectInfo?.progress_percent || 0}%
                </div>
                <div className="text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  Progress
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
                  {projectMembers.length || 1}
                </div>
                <div className="text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  Members
                </div>
              </div>
            </div>

            {/* Team Members with Add Button */}
            <div className="hidden lg:flex items-center space-x-3">
              {/* Team Members */}
              {projectMembers.length > 0 && (
                <div className="flex -space-x-2">
                  {projectMembers.slice(0, 3).map((member, index) =>
                    renderTeamMember ? renderTeamMember(member, index) : (
                      <div
                        key={member.id || index}
                        className="w-8 h-8 rounded-full border-2 border-white/70 dark:border-gray-800/50 midnight:border-slate-800/50 bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-medium text-white"
                        title={member.name || member.email || 'Unknown'}
                      >
                        {(member.name || member.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )
                  )}
                  {projectMembers.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white/70 dark:border-gray-800/50 midnight:border-slate-800/50 bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                      +{projectMembers.length - 3}
                    </div>
                  )}
                </div>
              )}

              {/* Add member button - positioned with team members */}
              {!isViewer && (
                <div className="relative add-dropdown-container">
                  <button
                    onClick={() => setShowAddDropdown && setShowAddDropdown(!showAddDropdown)}
                    className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 midnight:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500 midnight:hover:border-indigo-500 flex items-center justify-center text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-400 transition-colors"
                    title="Invite team members"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {/* Dropdown menu */}
                  {showAddDropdown && (
                    <div
                      className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg z-[9999] min-w-48"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowTeamInviteModal && setShowTeamInviteModal(true);
                          setShowAddDropdown && setShowAddDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors flex items-center rounded-lg"
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      >
                        <Users className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white midnight:text-gray-100">Team Member</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Full access to project</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Online indicator */}
              {totalViewers > 0 && (
                <div className="flex items-center space-x-1 text-green-600 dark:text-green-400 midnight:text-green-300">
                  <Circle className="w-2 h-2 fill-current animate-pulse" />
                  <span className="text-xs">{totalViewers}</span>
                </div>
              )}
            </div>

            {/* Collapse Button - positioned at the far right */}
            <button
              onClick={toggleCollapsed}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 rounded-lg flex-shrink-0"
              title="Collapse Navigation (Click to minimize header)"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 py-3">
        <div className="flex items-center">
          <div className="flex-1 flex items-center justify-between">
            <div className="flex space-x-1 overflow-x-auto">
              {allTabs.map((feature) => (
                <TabButton
                  key={feature.key}
                  feature={feature}
                  isActive={currentTab === feature.key}
                  className="flex-shrink-0"
                />
              ))}
            </div>

            {/* Settings Button */}
            {!isViewer && (
              <div className="ml-4 flex-shrink-0">
                <button
                  onClick={() => {
                    setSettingsInitialTab('general');
                    setShowSettingsModal(true);
                  }}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800"
                  title="Project Settings"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden lg:block">Settings</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopTabNavigation;
