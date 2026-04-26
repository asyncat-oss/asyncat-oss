import { useState, useEffect, useCallback, memo, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  FolderOpen,
  AlertCircle,
  ChevronRight,
  MoreHorizontal,
  FolderPlus,
  Pencil,
  Trash2,
  FolderMinus,
  Check,
  X,
  Info,
  KanbanSquare,
  List,
  Clock,
  GanttChartSquare,
  Link2,
  LayoutGrid,
  FileText,
  Target,
  Settings
} from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { projectFoldersApi } from '../CommandCenter/commandCenterApi';
import eventBus from '../utils/eventBus.js';

// ─── project view definitions ─────────────────────────────────────────────────

const PROJECT_VIEWS = [
  { key: 'kanban',         label: 'Kanban',   icon: KanbanSquare },
  { key: 'list',           label: 'List',     icon: List },
  { key: 'timeline',       label: 'Timeline', icon: Clock },
  { key: 'gantt',          label: 'Gantt',    icon: GanttChartSquare },
  { key: 'network',        label: 'Network',  icon: Link2 },
  { key: 'gallery',        label: 'Gallery',  icon: LayoutGrid },
  { key: 'notes',          label: 'Notes',    icon: FileText },
  { key: 'habits',         label: 'Habits',   icon: Target },
  { key: 'settings',       label: 'Settings', icon: Settings },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

const getRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffH = Math.floor((now - date) / 3_600_000);
  if (diffH < 1) return 'now';
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const groupProjectsByTime = (projects) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastWeek = new Date(today - 7 * 86_400_000);
  const lastMonth = new Date(today - 30 * 86_400_000);

  const g = { pinned: [], recent: [], lastMonth: [], older: [] };
  projects.forEach(p => {
    const d = new Date(p.updated_at || p.created_at);
    if (p.is_pinned) g.pinned.push(p);
    else if (d >= lastWeek) g.recent.push(p);
    else if (d >= lastMonth) g.lastMonth.push(p);
    else g.older.push(p);
  });
  return g;
};

// ─── skeleton ─────────────────────────────────────────────────────────────────

const ProjectSkeleton = () => (
  <div className="flex items-center py-2 px-3 space-x-3 animate-pulse">
    <div className="flex-1">
      <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-3/4 mb-2" />
      <div className="h-2 bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded w-1/2" />
    </div>
  </div>
);

// ─── project context menu ─────────────────────────────────────────────────────

const ProjectMenu = memo(({ project, folders, onAssign, onUnassign, onClose, anchorRef }) => {
  const menuRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const currentFolderId = project._folderId;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg py-1 text-sm"
    >
      {currentFolderId && (
        <button
          onClick={() => { onUnassign(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
        >
          <FolderMinus className="w-3.5 h-3.5 text-gray-400" />
          Remove from folder
        </button>
      )}
      {folders.length > 0 && (
        <>
          {currentFolderId && <div className="my-1 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800" />}
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-600 midnight:text-gray-600 font-semibold">
            Move to folder
          </div>
          {folders.map(f => (
            <button
              key={f.id}
              onClick={() => { onAssign(f.id); onClose(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                f.id === currentFolderId
                  ? 'text-blue-600 dark:text-blue-400 midnight:text-blue-400 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20'
                  : 'text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800'
              }`}
            >
              {f.id === currentFolderId
                ? <Check className="w-3.5 h-3.5" />
                : <Folder className="w-3.5 h-3.5 text-gray-400" />
              }
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </>
      )}
      {folders.length === 0 && !currentFolderId && (
        <div className="px-3 py-2 text-gray-400 dark:text-gray-600 midnight:text-gray-600 text-xs">No folders yet</div>
      )}
    </div>
  );
});

ProjectMenu.displayName = 'ProjectMenu';

// ─── project item ──────────────────────────────────────────────────────────────

const ProjectItem = memo(({ project, isSelected, onSelect, isLoading, folders, onAssign, onUnassign, currentTab, onTabChange }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(isSelected);
  const btnRef = useRef(null);

  useEffect(() => {
    if (isSelected) setExpanded(true);
  }, [isSelected]);

  return (
    <div>
      <div
        className={`group relative flex items-center gap-2 py-1.5 px-3 cursor-pointer rounded-lg transition-all duration-150 ${
          isSelected
            ? 'bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800'
        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => { if (menuOpen) return; if (expanded) setExpanded(false); else if (isSelected) setExpanded(true); else onSelect(project); }}
      >
        {isLoading ? (
          <div className="w-3.5 h-3.5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin flex-shrink-0" />
        ) : (
          <span className="text-base flex-shrink-0 leading-none">{project.emoji || '📁'}</span>
        )}
        <span className="flex-1 truncate text-sm" title={project.name || 'Untitled Project'}>
          {project.name || 'Untitled Project'}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-gray-500 flex-shrink-0 group-hover:hidden">
          {getRelativeTime(project.updated_at || project.created_at)}
        </span>
        {/* ⋯ button on hover */}
        <div className="hidden group-hover:flex items-center flex-shrink-0 relative">
          <button
            ref={btnRef}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <ProjectMenu
              project={project}
              folders={folders}
              onAssign={(fid) => onAssign(project.id, fid)}
              onUnassign={() => onUnassign(project.id, project._folderId)}
              onClose={() => setMenuOpen(false)}
              anchorRef={btnRef}
            />
          )}
        </div>
      </div>

      {/* Inline view navigation when this project is selected */}
      {expanded && (
        <div className="ml-5 mt-0.5 mb-1">
          <div className="space-y-0.5">
            {PROJECT_VIEWS.map(view => {
              if (view.key === 'divider') {
                return <div key="divider" className="my-1 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800" />;
              }
              // Always show settings; filter content views by project prefs
              const isUtilityView = view.key === 'settings';
              if (!isUtilityView) {
                // Hide if owner disabled it at project level
                const enabledViews = project.enabled_views;
                if (enabledViews && enabledViews.length > 0 && !enabledViews.includes(view.key)) return null;
                // Hide if user hid it in their personal preferences
                const userPrefs = project.user_view_preferences || project.user_visible_views;
                if (userPrefs && userPrefs.length > 0 && !userPrefs.includes(view.key)) return null;
              }
              const ViewIcon = view.icon;
              const isActive = isSelected && currentTab === view.key;
              return (
                <button
                  key={view.key}
                  onClick={(e) => { e.stopPropagation(); onTabChange(view.key, project.id); }}
                  className={`w-full flex items-center gap-2 px-3 py-1 rounded-md text-xs transition-colors ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/20'
                      : 'text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800'
                  }`}
                >
                  <ViewIcon className="w-3 h-3 flex-shrink-0" />
                  <span>{view.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

ProjectItem.displayName = 'ProjectItem';

// ─── time group ───────────────────────────────────────────────────────────────

const TimeGroup = memo(({ title, projects, isSelected, onSelect, loadingProjectId, folders, onAssign, onUnassign, currentTab, onTabChange, showTitle = true }) => {
  if (projects.length === 0) return null;
  return (
    <div className="mb-4">
      {showTitle && (
        <div className="px-3 pb-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 midnight:text-gray-500 uppercase tracking-widest">
            {title}
          </span>
        </div>
      )}
      <div className="space-y-0.5">
        {projects.map(p => (
          <ProjectItem
            key={p.id}
            project={p}
            isSelected={isSelected(p)}
            onSelect={onSelect}
            isLoading={loadingProjectId === p.id}
            folders={folders}
            onAssign={onAssign}
            onUnassign={onUnassign}
            currentTab={currentTab}
            onTabChange={onTabChange}
          />
        ))}
      </div>
    </div>
  );
});

TimeGroup.displayName = 'TimeGroup';

// ─── folder item ───────────────────────────────────────────────────────────────

const ProjectFolderItem = memo(({ folder, projects, isExpanded, onToggle, isSelected, onSelect, loadingProjectId, folders, onAssign, onUnassign, onRename, onDelete, currentTab, onTabChange }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const commitRename = () => {
    const v = renameValue.trim();
    if (v && v !== folder.name) onRename(folder.id, v);
    setRenaming(false);
  };

  return (
    <div className="mb-1">
      <div
        className="group flex items-center gap-1.5 py-1.5 px-3 rounded-lg cursor-pointer text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
        onClick={() => !menuOpen && !renaming && onToggle(folder.id)}
      >
        <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
        {isExpanded
          ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
          : <Folder className="w-3.5 h-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
        }

        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(folder.name); }
            }}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 text-sm bg-transparent border-0 border-b border-gray-400 dark:border-gray-500 outline-none text-gray-800 dark:text-gray-200 py-0"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm font-medium">{folder.name}</span>
        )}

        <span className="text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0 group-hover:hidden">
          {projects.length}
        </span>

        <div className="hidden group-hover:flex items-center flex-shrink-0 relative">
          <button
            ref={btnRef}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-white dark:bg-gray-900 midnight:bg-gray-950 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg shadow-lg py-1 text-sm"
            >
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenaming(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-400" />
                Rename
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(folder.id); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete folder
              </button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="pl-4 space-y-0.5 mt-0.5">
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600">Empty folder</div>
          ) : (
            projects.map(p => (
              <ProjectItem
                key={p.id}
                project={p}
                isSelected={isSelected(p)}
                onSelect={onSelect}
                isLoading={loadingProjectId === p.id}
                folders={folders}
                onAssign={onAssign}
                onUnassign={onUnassign}
                currentTab={currentTab}
                onTabChange={onTabChange}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
});

ProjectFolderItem.displayName = 'ProjectFolderItem';

// ─── new folder input ──────────────────────────────────────────────────────────

const NewFolderInput = memo(({ onSubmit, onCancel }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const v = value.trim();
    if (v) onSubmit(v);
    else onCancel();
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 mb-1">
      <Folder className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Folder name…"
        className="flex-1 min-w-0 text-sm bg-transparent border-0 outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600"
      />
      <button onClick={submit} className="text-gray-400 hover:text-blue-500 transition-colors">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-red-500 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

NewFolderInput.displayName = 'NewFolderInput';

// ─── main component ────────────────────────────────────────────────────────────

const ProjectExplorer = ({ isCollapsed = false, onCreateProject, currentProjectId, currentTab = 'kanban' }) => {
  const navigate = useNavigate();

  const handleTabChange = useCallback((tab, projectId) => {
    const pid = projectId || currentProjectId;
    if (pid) navigate(`/workspace/${pid}/${tab}`);
  }, [navigate, currentProjectId]);
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingProjectId, setLoadingProjectId] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);

  const { currentWorkspace, getWorkspaceProjects, bustProjectsCache } = useWorkspace();

  // ── data loading ────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (showLoading = true) => {
    if (!currentWorkspace?.id) {
      setProjects([]);
      setFolders([]);
      if (showLoading) setLoading(false);
      setError('No workspace selected');
      return;
    }

    try {
      if (showLoading) setLoading(true);
      setError(null);

      const [projectsData, foldersRes] = await Promise.all([
        getWorkspaceProjects(),
        projectFoldersApi.getFolders()
      ]);

      if (projectsData) {
        const sorted = [...projectsData].sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        });
        setProjects(sorted);
      } else {
        setProjects([]);
      }

      const rawFolders = foldersRes?.folders || [];

      // Build a map: projectId → folderId from the project_folder_items embedded in the folders response
      const projectToFolder = {};
      rawFolders.forEach(f => {
        (f.project_folder_items || []).forEach(item => {
          projectToFolder[item.project_id] = f.id;
        });
      });

      setFolders(rawFolders);
      // Store the map so we can annotate projects
      setProjectFolderMap(projectToFolder);
    } catch (err) {
      console.error('Failed to load project explorer data:', err);
      setError('Failed to load projects');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [currentWorkspace?.id, getWorkspaceProjects]);

  const [projectFolderMap, setProjectFolderMap] = useState({});

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (currentWorkspace?.id) loadAll();
  }, [currentWorkspace?.id, loadAll]);

  useEffect(() => {
    const unsub = eventBus.on('projectsUpdated', () => {
      bustProjectsCache();
      loadAll(false);
    });
    return () => unsub();
  }, [loadAll, bustProjectsCache]);

  // ── folder state helpers ────────────────────────────────────────────────────

  const toggleFolder = useCallback((fid) => {
    setExpandedFolders(prev => ({ ...prev, [fid]: !prev[fid] }));
  }, []);

  const handleCreateFolder = useCallback(async (name) => {
    setShowNewFolder(false);
    try {
      const res = await projectFoldersApi.createFolder(name);
      if (res?.folder) {
        setFolders(prev => [...prev, res.folder]);
        setExpandedFolders(prev => ({ ...prev, [res.folder.id]: true }));
      }
    } catch (err) {
      console.error('Create project folder error:', err);
    }
  }, []);

  const handleRenameFolder = useCallback(async (folderId, name) => {
    try {
      const res = await projectFoldersApi.updateFolder(folderId, { name });
      if (res?.folder) setFolders(prev => prev.map(f => f.id === folderId ? { ...f, ...res.folder } : f));
    } catch (err) {
      console.error('Rename project folder error:', err);
    }
  }, []);

  const handleDeleteFolder = useCallback(async (folderId) => {
    try {
      await projectFoldersApi.deleteFolder(folderId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      setProjectFolderMap(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (next[k] === folderId) delete next[k]; });
        return next;
      });
    } catch (err) {
      console.error('Delete project folder error:', err);
    }
  }, []);

  const handleAssign = useCallback(async (projectId, folderId) => {
    const oldFolderId = projectFolderMap[projectId];
    setProjectFolderMap(prev => ({ ...prev, [projectId]: folderId }));
    try {
      await projectFoldersApi.addProject(folderId, projectId);
    } catch (err) {
      console.error('Assign project folder error:', err);
      setProjectFolderMap(prev => ({ ...prev, [projectId]: oldFolderId }));
    }
  }, [projectFolderMap]);

  const handleUnassign = useCallback(async (projectId, folderId) => {
    setProjectFolderMap(prev => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    try {
      await projectFoldersApi.removeProject(folderId, projectId);
    } catch (err) {
      console.error('Unassign project folder error:', err);
      setProjectFolderMap(prev => ({ ...prev, [projectId]: folderId }));
    }
  }, []);

  // ── project selection ────────────────────────────────────────────────────────

  const handleSelectProject = useCallback(async (project) => {
    if (loadingProjectId) return;
    if (String(project.id) === String(currentProjectId)) return;
    try {
      setLoadingProjectId(project.id);
      navigate(`/workspace/${project.id}`);
    } catch (err) {
      console.error('Failed to navigate to project:', err);
      navigate('/workspace');
    } finally {
      setTimeout(() => setLoadingProjectId(null), 800);
    }
  }, [navigate, loadingProjectId, currentProjectId]);

  // ── derived data ─────────────────────────────────────────────────────────────

  const annotatedProjects = useMemo(
    () => projects.map(p => ({ ...p, _folderId: projectFolderMap[p.id] || null })),
    [projects, projectFolderMap]
  );

  const folderProjects = useMemo(() => {
    const map = {};
    folders.forEach(f => { map[f.id] = []; });
    annotatedProjects.forEach(p => {
      if (p._folderId && map[p._folderId]) map[p._folderId].push(p);
    });
    return map;
  }, [folders, annotatedProjects]);

  const unfiledProjects = useMemo(
    () => annotatedProjects.filter(p => !p._folderId),
    [annotatedProjects]
  );

  const timeGroups = useMemo(() => groupProjectsByTime(unfiledProjects), [unfiledProjects]);

  const isSelected = useCallback(
    (p) => String(p.id) === String(currentProjectId),
    [currentProjectId]
  );

  // ── collapsed view ────────────────────────────────────────────────────────────

  if (isCollapsed) {
    return (
      <div className="px-2">
        <button
          onClick={onCreateProject}
          className="w-full p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
          title="Create Project"
        >
          <Folder className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
        </button>
      </div>
    );
  }

  // ── main render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {loading ? (
        <div className="space-y-1 px-1">
          {[...Array(4)].map((_, i) => <ProjectSkeleton key={i} />)}
        </div>
      ) : error && error !== 'No workspace selected' ? (
        <div className="py-8 text-center px-3">
          <div className="flex items-center justify-center gap-2 text-sm text-red-500 dark:text-red-400 mb-3">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button onClick={() => loadAll()} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 underline">
            Try again
          </button>
        </div>
      ) : currentWorkspace?.id ? (
        <div>
          {/* ── Folders section ── */}
          {(folders.length > 0 || projects.length > 0) && (
            <div className="mb-2">
              <div className="flex items-center justify-between px-3 py-1.5 mb-1">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Folders
                </span>
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 transition-colors"
                  title="New folder"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>

              {showNewFolder && (
                <NewFolderInput
                  onSubmit={handleCreateFolder}
                  onCancel={() => setShowNewFolder(false)}
                />
              )}

              {folders.length === 0 && !showNewFolder ? (
                <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-600">No folders yet</div>
              ) : (
                <div className="space-y-0.5">
                  {folders.map(folder => (
                    <ProjectFolderItem
                      key={folder.id}
                      folder={folder}
                      projects={folderProjects[folder.id] || []}
                      isExpanded={!!expandedFolders[folder.id]}
                      onToggle={toggleFolder}
                      isSelected={isSelected}
                      onSelect={handleSelectProject}
                      loadingProjectId={loadingProjectId}
                      folders={folders}
                      onAssign={handleAssign}
                      onUnassign={handleUnassign}
                      onRename={handleRenameFolder}
                      onDelete={handleDeleteFolder}
                      currentTab={currentTab}
                      onTabChange={handleTabChange}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Unfiled projects ── */}
          {unfiledProjects.length > 0 && (
            <div className="mt-1">
              {folders.length > 0 && (
                <div className="px-3 py-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Unfiled
                  </span>
                </div>
              )}
              {timeGroups.pinned?.length > 0 && (
                <TimeGroup title="Pinned" projects={timeGroups.pinned} isSelected={isSelected} onSelect={handleSelectProject} loadingProjectId={loadingProjectId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} currentTab={currentTab} onTabChange={handleTabChange} />
              )}
              {timeGroups.recent?.length > 0 && (
                <TimeGroup title="Recent" projects={timeGroups.recent} isSelected={isSelected} onSelect={handleSelectProject} loadingProjectId={loadingProjectId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} currentTab={currentTab} onTabChange={handleTabChange} />
              )}
              {timeGroups.lastMonth?.length > 0 && (
                <TimeGroup title="This month" projects={timeGroups.lastMonth} isSelected={isSelected} onSelect={handleSelectProject} loadingProjectId={loadingProjectId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} currentTab={currentTab} onTabChange={handleTabChange} />
              )}
              {timeGroups.older?.length > 0 && (
                <TimeGroup title="Older" projects={timeGroups.older} isSelected={isSelected} onSelect={handleSelectProject} loadingProjectId={loadingProjectId} folders={folders} onAssign={handleAssign} onUnassign={handleUnassign} currentTab={currentTab} onTabChange={handleTabChange} />
              )}
            </div>
          )}

          {/* Empty state */}
          {projects.length === 0 && (
            <div className="py-10 text-center px-4">
              <Folder className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">No projects yet</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default memo(ProjectExplorer);
