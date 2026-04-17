// ProjectSelectorV2.jsx - Using EXISTING Workspace System (like ProjectExplorer)
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Folders, Check, X } from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import eventBus from '../../utils/eventBus.js';

// Use the SAME approach as ProjectExplorer - reuse existing workspace system
const useProjectsV2 = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentWorkspace, getWorkspaceProjects } = useWorkspace();
  
  const fetchProjects = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setProjects([]);
      setLoading(false);
      setError('No workspace selected');
      return [];
    }

    setLoading(true);
    setError(null);
    
    try {
      // Use the EXISTING workspace method - same as ProjectExplorer
      const workspaceProjects = await getWorkspaceProjects();
      
      const enhancedProjects = workspaceProjects.map(project => ({
        ...project,
        workspaceName: currentWorkspace.name || 'Current Workspace',
        workspaceEmoji: currentWorkspace.emoji || '📁',
        displayName: project.name?.length > 25 ? `${project.name.slice(0, 25)}...` : project.name,
        isOverdue: project.due_date && new Date(project.due_date) < new Date(),
        isDueSoon: project.due_date && 
          new Date(project.due_date) > new Date() && 
          new Date(project.due_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }));
      
      setProjects(enhancedProjects);
      return enhancedProjects;
      
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id, currentWorkspace?.name, currentWorkspace?.emoji, getWorkspaceProjects]);
  
  return { projects, loading, error, fetchProjects };
};

// Simple project item component
const ProjectItem = ({ project, isSelected, onToggle }) => {
  const getStatusIndicator = () => {
    if (project.isOverdue) {
      return <div className="w-2 h-2 bg-red-500 rounded-full" title="Overdue" />;
    }
    if (project.isDueSoon) {
      return <div className="w-2 h-2 bg-amber-500 rounded-full" title="Due soon" />;
    }
    return null;
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        isSelected
          ? 'bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 text-gray-700 dark:text-gray-300 midnight:text-slate-300'
      }`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(project.id);
      }}
    >
      {/* Icon */}
      <div className="flex-shrink-0 text-sm">
        {project.emoji || '📁'}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium truncate">
            {project.displayName}
          </div>
          {getStatusIndicator()}
        </div>
      </div>
      
      {/* Selection */}
      <div className="flex-shrink-0">
        {isSelected ? (
          <div className="w-4 h-4 bg-black dark:bg-white midnight:bg-indigo-600 rounded flex items-center justify-center">
            <Check className="w-3 h-3 text-white dark:text-black midnight:text-white" />
          </div>
        ) : (
          <div className="w-4 h-4 border border-gray-300 dark:border-gray-600 midnight:border-slate-600 rounded"></div>
        )}
      </div>
    </div>
  );
};

// Main component
export const ProjectSelectorV2 = ({ 
  selectedProjects = [], 
  onProjectsChange, 
  disabled = false,
  placeholder = "Select projects",
  variant = "default",
  inline = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 320 });
  
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  
  const { projects, loading, error, fetchProjects } = useProjectsV2();
  const { currentWorkspace } = useWorkspace();
  
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Refetch when workspace changes (same as ProjectExplorer)
  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchProjects();
    }
  }, [currentWorkspace?.id, fetchProjects]);

  // Listen for project updates (same as ProjectExplorer)
  useEffect(() => {
    const handleProjectsUpdated = () => {
      fetchProjects();
    };

    const handleProjectInviteAccepted = (event) => {
      setTimeout(() => {
        fetchProjects();
      }, 500);
    };

    const handleWorkspaceInviteAccepted = (event) => {
      setTimeout(() => {
        fetchProjects();
      }, 1000);
    };

    const unsubUpdated = eventBus.on('projectsUpdated', handleProjectsUpdated);
    const unsubInvite = eventBus.on('projectInviteAccepted', handleProjectInviteAccepted);
    const unsubWorkspace = eventBus.on('workspaceInviteAccepted', handleWorkspaceInviteAccepted);

    return () => {
      unsubUpdated();
      unsubInvite();
      unsubWorkspace();
    };
  }, [fetchProjects]);
  
  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dropdownWidth = 320;
    const dropdownHeight = 400; // max height from the dropdown style
    
    let top, left;
    
    // Check if there's enough space below
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    
    // Always prefer showing above when input is at bottom (common case)
    // or when there's more space above than below
    if (spaceAbove > spaceBelow || spaceBelow < dropdownHeight) {
      // Show above
      top = buttonRect.top + window.scrollY - dropdownHeight - 8;
    } else {
      // Show below
      top = buttonRect.bottom + window.scrollY + 8;
    }
    
    // Horizontal positioning
    left = buttonRect.left + window.scrollX;
    
    // Ensure dropdown doesn't go off screen horizontally
    if (left + dropdownWidth > viewportWidth - 20) {
      left = buttonRect.right + window.scrollX - dropdownWidth;
    }
    if (left < 20) left = 20;
    
    // Ensure dropdown doesn't go off screen vertically
    if (top < 20) {
      top = 20;
    } else if (top + dropdownHeight > viewportHeight + window.scrollY - 20) {
      top = viewportHeight + window.scrollY - dropdownHeight - 20;
    }
    
    setDropdownPosition({ top, left, width: dropdownWidth });
  }, []);
  
  const handleToggle = useCallback(() => {
    if (disabled) return;
    
    if (!isOpen) {
      calculatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setSearchTerm('');
    }
  }, [disabled, isOpen, calculatePosition]);
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (dropdownRef.current?.contains(event.target)) return;
      setIsOpen(false);
      setSearchTerm('');
    };
    
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      window.addEventListener('resize', calculatePosition);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', calculatePosition);
    };
  }, [isOpen, calculatePosition]);
  
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);
  
  const filteredProjects = useMemo(() => {
    let filtered = projects;
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(project =>
        project.name?.toLowerCase().includes(searchLower) ||
        project.description?.toLowerCase().includes(searchLower)
      );
    }
    
    filtered.sort((a, b) => {
      const aSelected = selectedProjects.includes(a.id);
      const bSelected = selectedProjects.includes(b.id);
      if (aSelected !== bSelected) return bSelected ? 1 : -1;
      
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (a.isDueSoon !== b.isDueSoon) return a.isDueSoon ? -1 : 1;
      
      return a.name?.localeCompare(b.name) || 0;
    });
    
    return filtered;
  }, [projects, searchTerm, selectedProjects]);
  
  const selectedProjectObjects = projects.filter(p => selectedProjects.includes(p.id));
  
  const toggleProject = useCallback((projectId) => {
    if (disabled) return;
    
    const newSelection = selectedProjects.includes(projectId)
      ? selectedProjects.filter(id => id !== projectId)
      : [...selectedProjects, projectId];
        onProjectsChange?.(newSelection);
  }, [disabled, selectedProjects, onProjectsChange]);
  
  const getDisplayText = () => {
    if (!currentWorkspace?.id) {
      return "No workspace selected";
    }

    if (selectedProjectObjects.length === 0) {
      return placeholder;
    }
    
    if (variant === 'compact' && selectedProjectObjects.length === 1) {
      const project = selectedProjectObjects[0];
      const emoji = project.emoji || '';
      return `${emoji ? emoji + ' ' : ''}${project.displayName}`;
    }
    
    if (selectedProjectObjects.length === 1) {
      return selectedProjectObjects[0].name;
    }
    
    return `${selectedProjectObjects.length} projects`;
  };
  
  const dropdownContent = isOpen && (
    <div 
      ref={dropdownRef}
      data-project-selector="true"
      className={`bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg shadow-lg flex flex-col ${inline ? 'relative mt-2' : 'z-[99999]'}`}
      style={inline ? {
        width: '100%',
        maxHeight: '300px'
      } : {
        position: 'absolute',
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        width: `${dropdownPosition.width}px`,
        maxHeight: '400px'
      }}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
            Select Projects
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 midnight:bg-slate-700 border border-gray-200 dark:border-gray-600 midnight:border-slate-600 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 midnight:focus:border-slate-500 text-gray-900 dark:text-gray-100 midnight:text-slate-100"
          />
        </div>
      </div>
      
      {/* Projects list */}
      <div className="flex-1 p-3">
        {!currentWorkspace?.id ? (
          <div className={`text-center ${inline ? 'py-4' : 'py-8'}`}>
            <div className="text-sm text-orange-600 dark:text-orange-400 midnight:text-orange-300">No workspace selected</div>
          </div>
        ) : loading ? (
          <div className={`text-center ${inline ? 'py-4' : 'py-8'}`}>
            <div className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">Loading projects...</div>
          </div>
        ) : error && error !== 'No workspace selected' ? (
          <div className={`text-center ${inline ? 'py-4' : 'py-8'}`}>
            <p className="text-sm text-red-600 dark:text-red-400 midnight:text-red-300 mb-3">{error}</p>
            <button
              onClick={fetchProjects}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-700 dark:text-gray-300 midnight:text-slate-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-slate-600"
            >
              Try again
            </button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className={`text-center ${inline ? 'py-4' : 'py-8'}`}>
            <div className={`${inline ? 'text-lg' : 'text-2xl'} mb-2`}>📁</div>
            <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {searchTerm ? 'No projects found' : 'No projects in this workspace'}
            </p>
          </div>
        ) : (
          <div className={`space-y-1 overflow-y-auto ${inline ? 'max-h-40' : 'max-h-60'}`}>
            {filteredProjects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isSelected={selectedProjects.includes(project.id)}
                onToggle={toggleProject}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Footer */}
      {selectedProjects.length > 0 && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50 dark:bg-gray-700 midnight:bg-slate-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400 midnight:text-slate-400">
              {selectedProjects.length} selected
            </span>
            <button
              onClick={() => onProjectsChange?.([])}
              className="text-gray-500 hover:text-red-600 dark:hover:text-red-400 midnight:hover:text-red-300"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
  
  if (inline) {
    return (
      <div className="w-full">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleToggle}
          disabled={disabled || !currentWorkspace?.id}
          className={`w-full inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
            disabled || !currentWorkspace?.id
              ? 'opacity-50 cursor-not-allowed' 
              : 'cursor-pointer'
          } ${
            selectedProjectObjects.length > 0
              ? 'bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 border-gray-300 dark:border-gray-600 midnight:border-slate-600'
              : 'bg-white dark:bg-gray-800 midnight:bg-slate-800 text-gray-600 dark:text-gray-400 midnight:text-slate-400 border-gray-200 dark:border-gray-700 midnight:border-slate-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-slate-700'
          }`}
        >
          <Folders className="w-4 h-4" />
          <span className="truncate flex-1 text-left">
            {getDisplayText()}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {dropdownContent}
      </div>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled || !currentWorkspace?.id}
        className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
          disabled || !currentWorkspace?.id
            ? 'opacity-50 cursor-not-allowed' 
            : 'cursor-pointer'
        } ${
          selectedProjectObjects.length > 0
            ? 'bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 border-gray-300 dark:border-gray-600 midnight:border-slate-600'
            : 'bg-white dark:bg-gray-800 midnight:bg-slate-800 text-gray-600 dark:text-gray-400 midnight:text-slate-400 border-gray-200 dark:border-gray-700 midnight:border-slate-700 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-slate-700'
        }`}
      >
        <Folders className="w-4 h-4" />
        <span className={`truncate ${variant === 'compact' ? 'max-w-32' : 'max-w-48'}`}>
          {getDisplayText()}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </>
  );
};

export default ProjectSelectorV2;