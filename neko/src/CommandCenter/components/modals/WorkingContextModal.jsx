// "Choose a project" for the composer's project chip: no project, or a
// project and (when it has several) which of its folders.
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Check, Folder, FolderKanban, Settings, ShieldOff } from 'lucide-react';
import Dialog from '../../../components/ui/Dialog';
import Button from '../../../components/ui/Button';
import { chosenProjectEmoji } from '../../utils/projectEmoji.js';

/**
 * Choose the project a chat belongs to. A project gives the chat its
 * instructions and knowledge; choosing one of its folders also lets the
 * agent work with local files there.
 *
 * onSelect(rootId, relativePath) for a folder, onSelect('none') for no
 * project, and onSelect({ projectOnly: true, project }) for a project used
 * without a folder.
 */
export function WorkingContextModal({
  isOpen,
  onClose,
  onSelect,
  fileRoots = [],
  projects = [],
  initialRootId = 'none',
  activeProjectId = null,
  onManageProjects,
}) {
  const rows = useMemo(() => {
    const rootsByProject = new Map();
    for (const root of fileRoots) {
      if (!root.projectId) continue;
      if (!rootsByProject.has(root.projectId)) rootsByProject.set(root.projectId, []);
      rootsByProject.get(root.projectId).push(root);
    }
    const known = new Map(projects.map((project) => [project.id, project]));
    // Projects that only appear through their folders still get a row.
    for (const [projectId, roots] of rootsByProject) {
      if (!known.has(projectId)) known.set(projectId, { id: projectId, name: roots[0].projectName || 'Project', emoji: roots[0].projectEmoji || null });
    }
    return [...known.values()].map((project) => ({
      ...project,
      roots: [...(rootsByProject.get(project.id) || [])].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary))),
    }));
  }, [fileRoots, projects]);

  const noProjectActive = initialRootId === 'none' && !activeProjectId;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="sm"
      title="Choose a project"
      description="The chat gets the project's instructions and knowledge. With a folder, it can also work with your files there."
      footer={(
        <div className="flex w-full items-center justify-between">
          <span className="text-[11px] text-fg-subtle">One project per chat</span>
          <Button variant="ghost" size="xs" icon={Settings} onClick={onManageProjects}>Manage projects</Button>
        </div>
      )}
    >
      <div className="-mx-2 max-h-[min(460px,60vh)] space-y-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => onSelect('none')}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${noProjectActive ? 'bg-selected' : 'hover:bg-hover'}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg-subtle">
            <ShieldOff className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg">No project</span>
            <span className="mt-0.5 block text-xs text-fg-muted">A plain chat with no files or project knowledge</span>
          </span>
          {noProjectActive && <Check className="h-4 w-4 shrink-0 text-fg" />}
        </button>

        <div className="mx-3 my-1.5 h-px bg-line" />

        {rows.map((project) => {
          const defaultRoot = project.roots[0];
          const projectIsActive = activeProjectId === project.id || project.roots.some((root) => root.id === initialRootId);
          const subtitle = project.roots.length === 0
            ? 'Instructions and knowledge only (no folder)'
            : project.roots.length === 1
              ? defaultRoot.label
              : `${project.roots.length} folders`;
          return (
            <div key={project.id} className={`rounded-xl transition-colors ${projectIsActive ? 'bg-selected' : 'hover:bg-hover'}`}>
              <button
                type="button"
                onClick={() => (defaultRoot
                  ? onSelect(defaultRoot.id, '.')
                  : onSelect({ projectOnly: true, project }))}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-base text-fg-subtle">
                  {chosenProjectEmoji(project.emoji) || <Folder className="h-4 w-4" strokeWidth={1.75} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{project.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">{subtitle}</span>
                </span>
                {projectIsActive ? <Check className="h-4 w-4 shrink-0 text-fg" /> : <FolderKanban className="h-4 w-4 shrink-0 text-fg-subtle" />}
              </button>

              {project.roots.length > 1 && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-[3.75rem]">
                  {project.roots.map((root) => (
                    <button
                      key={root.id}
                      type="button"
                      onClick={() => onSelect(root.id, '.')}
                      title={root.path}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors ${root.id === initialRootId ? 'bg-surface font-medium text-fg ring-1 ring-line' : 'text-fg-muted hover:bg-surface hover:text-fg'}`}
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

        {rows.length === 0 && (
          <div className="px-5 py-7 text-center">
            <FolderKanban className="mx-auto h-8 w-8 text-fg-subtle" />
            <p className="mt-3 text-sm font-medium text-fg">No projects yet</p>
            <p className="mt-1 text-xs leading-5 text-fg-muted">Create a project to give chats shared instructions, knowledge files and folders.</p>
          </div>
        )}
      </div>
    </Dialog>
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
  projects: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    emoji: PropTypes.string,
  })),
  initialRootId: PropTypes.string,
  activeProjectId: PropTypes.string,
  onManageProjects: PropTypes.func,
};

export default WorkingContextModal;
