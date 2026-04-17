import React, { useState } from 'react';
import {
  ChevronRight, ChevronDown, FolderGit2, LayoutGrid, FileText, Settings,
  Info, KanbanSquare, List, Clock, GanttChartSquare, Link2, Target,
  Star, Users, PanelLeftClose, PanelLeft, Circle, Plus, User, Shield
} from 'lucide-react';

const FolderTreeNavigation = ({
  features,
  currentTab,
  onTabChange,
  projectInfo,
  projectMembers,
  totalViewers,
  sidebarCollapsed,
  setSidebarCollapsed,
  isViewer,
  setShowSettingsModal,
  setSettingsInitialTab,
  onlineUserIds,
  // Additional props for consistency with SidebarNavigation
  showAddDropdown,
  setShowAddDropdown,
  setShowTeamInviteModal,
  renderTeamMember
}) => {
  const [expandedFolders, setExpandedFolders] = useState(['core', 'views', 'content']);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  // If collapsed, render simplified view
  if (sidebarCollapsed) {
    return (
      <div className="w-16 bg-white dark:bg-gray-900 midnight:bg-gray-950 border-r border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex flex-col items-center py-4 space-y-3">
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-colors"
          title="Expand Sidebar (Ctrl+G)"
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        <div className="text-2xl mb-4">{projectInfo?.emoji}</div>

        <div className="flex-1 space-y-2 w-full px-2 overflow-y-auto">
          {features.map(feature => {
            const IconComponent = feature.icon;
            const isActive = currentTab === feature.key;
            return (
              <button
                key={feature.key}
                onClick={() => onTabChange(feature.key)}
                className={`w-full p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30 text-blue-600 dark:text-blue-400 midnight:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800'
                }`}
                title={feature.label}
              >
                <IconComponent className="w-5 h-5 mx-auto" />
              </button>
            );
          })}
        </div>

        {!isViewer && (
          <button
            onClick={() => {
              setSettingsInitialTab('general');
              setShowSettingsModal(true);
            }}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-colors"
            title="Project Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>
    );
  }

  // Organize features into categories
  const categoryStructure = {
    core: {
      label: 'Project Core',
      icon: FolderGit2,
      items: features.filter(f => ['storage'].includes(f.key))
    },
    views: {
      label: 'Task Views', 
      icon: LayoutGrid,
      items: features.filter(f => ['kanban', 'list', 'timeline', 'gantt', 'network', 'gallery'].includes(f.key))
    },
    content: {
      label: 'Content & Tools',
      icon: FileText,
      items: features.filter(f => ['notes', 'habits'].includes(f.key))
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col border-r border-gray-200 dark:border-gray-800 midnight:border-gray-800 w-80 min-w-64 max-w-80">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
        {/* Project Info with Collapse Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="text-3xl">{projectInfo?.emoji}</div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-white truncate">
              {projectInfo?.name}
            </h1>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-colors flex-shrink-0"
            title="Collapse Sidebar (Ctrl+G)"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Team Section */}
        {projectMembers.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 midnight:text-gray-400 uppercase tracking-wide">
                Team ({projectMembers.length})
              </h3>
              {!isViewer && (
                <div className="relative add-dropdown-container">
                  <button
                    onClick={() => setShowAddDropdown(!showAddDropdown)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-colors"
                    title="Add team members"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  {showAddDropdown && (
                    <div
                      className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg z-[9999] min-w-48"
                      style={{ pointerEvents: 'auto' }}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowTeamInviteModal && setShowTeamInviteModal(true);
                          setShowAddDropdown && setShowAddDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 transition-colors flex items-center rounded-lg"
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
            </div>
            <div className="flex -space-x-2 overflow-hidden p-1">
              {projectMembers.slice(0, 8).map((member, index) => renderTeamMember(member, index))}
              {projectMembers.length > 8 && (
                <div className="w-8 h-8 rounded-full border-2 border-white/70 dark:border-gray-800/50 midnight:border-slate-800/50 bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  +{projectMembers.length - 8}
                </div>
              )}
            </div>
            {totalViewers > 0 && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                {totalViewers} online now
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tree Navigation */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {Object.entries(categoryStructure).map(([key, category]) => {
          const isExpanded = expandedFolders.includes(key);
          const hasActiveItem = category.items.some(item => item.key === currentTab);
          
          return (
            <div key={key}>
              <button
                onClick={() => toggleFolder(key)}
                className={`w-full flex items-center px-3 py-1.5 text-sm rounded-lg transition-all duration-150 group ${
                  hasActiveItem
                    ? 'bg-transparent text-gray-900 dark:text-gray-100 midnight:text-gray-200'
                    : 'text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 active:scale-[0.98]'
                }`}
              >
                {isExpanded ? (
                  <ChevronDown className="flex-shrink-0 w-3.5 h-3.5 mr-2 text-gray-400 dark:text-gray-500" />
                ) : (
                  <ChevronRight className="flex-shrink-0 w-3.5 h-3.5 mr-2 text-gray-400 dark:text-gray-500" />
                )}
                <category.icon className="flex-shrink-0 w-4 h-4 mr-2.5 text-gray-400 dark:text-gray-500" />
                <span className={`text-sm font-medium flex-1 min-w-0 text-left ${
                  hasActiveItem
                    ? 'text-gray-900 dark:text-gray-100 midnight:text-gray-100'
                    : 'text-gray-700 dark:text-gray-300 midnight:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100'
                }`}>
                  {category.label}
                </span>
                <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                  {category.items.length}
                </span>
              </button>
              
              {isExpanded && (
                <div className="ml-[1.75rem] space-y-0.5 mt-0.5">
                  {category.items.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => onTabChange(item.key)}
                      className={`w-full flex items-center px-3 py-1.5 text-sm rounded-lg transition-all duration-150 group ${
                        currentTab === item.key
                          ? 'bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-200 shadow-sm ring-1 ring-gray-200/50 dark:ring-gray-700/50'
                          : 'text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 active:scale-[0.98]'
                      }`}
                    >
                      <item.icon className={`flex-shrink-0 w-4 h-4 mr-2.5 ${currentTab === item.key ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'}`} />
                      <span className="font-medium text-left truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: Settings */}
      {!isViewer && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <div className="flex justify-center">
            <button
              onClick={() => {
              setSettingsInitialTab('general');
              setShowSettingsModal(true);
            }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 text-gray-600 dark:text-gray-300 midnight:text-indigo-300"
              title="Project settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FolderTreeNavigation;