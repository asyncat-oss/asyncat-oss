import { useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Check, Folder, FolderKanban, Settings, ShieldOff, X } from 'lucide-react';
import Portal from '../../../components/Portal';

export function WorkingContextModal({
  isOpen,
  onClose,
  onSelect,
  fileRoots = [],
  initialRootId = 'none',
  onManageProjects,
}) {
  const projects = useMemo(() => {
    const groups = new Map();
    for (const root of fileRoots) {
      const projectId = root.projectId || `unknown:${root.id}`;
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          id: projectId,
          name: root.projectName || 'Project',
          emoji: root.projectEmoji || '📁',
          roots: [],
        });
      }
      groups.get(projectId).roots.push(root);
    }
    return [...groups.values()].map(project => ({
      ...project,
      roots: [...project.roots].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary))),
    }));
  }, [fileRoots]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 animate-in zoom-in-95 duration-150"
          onClick={event => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a Project"
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800 midnight:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-100">Choose a Project</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                This choice belongs to this chat. It does not change other conversations.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[min(480px,65vh)] space-y-1 overflow-y-auto p-2.5">
            <button
              type="button"
              onClick={() => onSelect('none')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${initialRootId === 'none' ? 'bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/70 midnight:hover:bg-slate-800/70'}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <ShieldOff className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">No project</span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">Work without access to local files</span>
              </span>
              {initialRootId === 'none' && <Check className="h-4 w-4 shrink-0 text-gray-700 dark:text-gray-200" />}
            </button>

            <div className="mx-3 my-2 h-px bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800" />

            {projects.map(project => {
              const defaultRoot = project.roots[0];
              const projectIsActive = project.roots.some(root => root.id === initialRootId);
              return (
                <div key={project.id} className={`rounded-xl border transition-colors ${projectIsActive ? 'border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/60 midnight:border-slate-700 midnight:bg-slate-800/60' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50'}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(defaultRoot.id, '.')}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-base shadow-sm ring-1 ring-gray-200/70 dark:bg-gray-900 dark:ring-gray-700">
                      {project.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">{project.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                        {project.roots.length === 1 ? defaultRoot.label : `${project.roots.length} attached folders`}
                      </span>
                    </span>
                    {projectIsActive ? <Check className="h-4 w-4 shrink-0 text-gray-700 dark:text-gray-200" /> : <FolderKanban className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />}
                  </button>

                  {project.roots.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-[3.75rem]">
                      {project.roots.map(root => (
                        <button
                          key={root.id}
                          type="button"
                          onClick={() => onSelect(root.id, '.')}
                          title={root.path}
                          className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors ${root.id === initialRootId ? 'bg-white font-medium text-gray-800 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700' : 'text-gray-500 hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100'}`}
                        >
                          <Folder className="h-3 w-3 shrink-0" />
                          <span className="truncate">{root.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {projects.length === 0 && (
              <div className="px-5 py-7 text-center">
                <FolderKanban className="mx-auto h-8 w-8 text-gray-200 dark:text-gray-700" />
                <p className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-200">No Projects with folders yet</p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Create a Project and attach a local folder to give the AI file access.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/30 midnight:border-slate-800 midnight:bg-slate-900/40">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">One Project per chat</p>
            <button type="button" onClick={onManageProjects} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100">
              <Settings className="h-3.5 w-3.5" /> Manage Projects
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

WorkingContextModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  fileRoots: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string,
    path: PropTypes.string,
    projectId: PropTypes.string,
    projectName: PropTypes.string,
    projectEmoji: PropTypes.string,
    isPrimary: PropTypes.bool,
  })),
  initialRootId: PropTypes.string,
  onManageProjects: PropTypes.func,
};

export default WorkingContextModal;
