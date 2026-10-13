import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { ExternalLink, Folder, FolderPlus, Loader2, Star, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { useConfirm } from '../../components/confirmContext';
import { projectApi } from '../projectApi.js';
import eventBus from '../../utils/eventBus.js';

/**
 * Local folders a project's chats may work in. The default folder is used
 * when a chat starts from the project page.
 */
export default function ProjectFolders({ project, onChange }) {
  const [folders, setFolders] = useState(project?.folders || []);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [error, setError] = useState('');
  const [busyFolderId, setBusyFolderId] = useState(null);
  const confirm = useConfirm();

  const loadFolders = useCallback(async () => {
    if (!project?.id) return;
    try {
      const response = await projectApi.getProjectFolders(project.id);
      setFolders(response.data || []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load project folders');
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    setFolders(project?.folders || []);
    setLoading(true);
    loadFolders();
  }, [loadFolders, project?.folders]);

  const changed = useCallback(async () => {
    await loadFolders();
    eventBus.emit('projectsUpdated');
    eventBus.emit('projectFoldersUpdated', { projectId: project.id });
    onChange?.();
  }, [loadFolders, onChange, project?.id]);

  const addFolder = useCallback(async (folderPath) => {
    const selectedPath = String(folderPath || '').trim();
    if (!selectedPath || !project?.id || adding) return;
    setAdding(true);
    setError('');
    try {
      await projectApi.addProjectFolder(project.id, { path: selectedPath });
      setManualPath('');
      setShowManualEntry(false);
      await changed();
    } catch (addError) {
      setError(addError.message || 'Could not add folder');
    } finally {
      setAdding(false);
    }
  }, [adding, changed, project?.id]);

  const browseForFolder = async () => {
    if (!window.electronAPI?.openDirectory) return;
    try {
      const result = await window.electronAPI.openDirectory({
        title: `Add a folder to ${project.name}`,
        buttonLabel: 'Add Folder',
      });
      if (!result?.canceled && result?.filePaths?.[0]) await addFolder(result.filePaths[0]);
    } catch (browseError) {
      setError(browseError.message || 'Could not open the folder picker');
    }
  };

  const makePrimary = async (folder) => {
    setBusyFolderId(folder.id);
    try {
      await projectApi.updateProjectFolder(project.id, folder.id, { is_primary: true });
      await changed();
    } catch (updateError) {
      setError(updateError.message || 'Could not change the default folder');
    } finally {
      setBusyFolderId(null);
    }
  };

  const removeFolder = async (folder) => {
    const ok = await confirm({
      title: `Remove “${folder.name}”?`,
      message: 'Chats in this project stop having access to it. The folder and its files stay on your computer.',
      confirmLabel: 'Remove access',
      destructive: true,
    });
    if (!ok) return;
    setBusyFolderId(folder.id);
    try {
      await projectApi.deleteProjectFolder(project.id, folder.id);
      await changed();
    } catch (removeError) {
      setError(removeError.message || 'Could not remove folder access');
    } finally {
      setBusyFolderId(null);
    }
  };

  return (
    <div className="rounded-xl border border-line">
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] text-fg-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading folders…</div>
      ) : folders.length === 0 ? (
        <p className="px-3 py-4 text-center text-[12px] leading-5 text-fg-muted">
          No folders yet. Add one so the agent can read and edit files there.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {folders.map((folder) => (
            <li key={folder.id} className="group flex items-center gap-2.5 px-3 py-2">
              <Folder className="h-4 w-4 shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] text-fg">{folder.name}</span>
                  {folder.is_primary && <span className="rounded-full bg-hover px-1.5 py-px text-[10px] font-medium text-fg-muted">Default</span>}
                  {!folder.exists && <span className="rounded-full bg-red-50 px-1.5 py-px text-[10px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">Missing</span>}
                </span>
                <span className="block truncate font-mono text-[11px] text-fg-subtle" title={folder.path}>{folder.path}</span>
              </span>
              <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                {!folder.is_primary && (
                  <button type="button" onClick={() => makePrimary(folder)} disabled={busyFolderId === folder.id} title="Make default" aria-label="Make default" className="rounded-md p-1.5 text-fg-subtle hover:bg-hover hover:text-fg">
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                {window.electronAPI?.shellOpen && (
                  <button type="button" onClick={() => window.electronAPI.shellOpen(folder.path)} title="Open folder" aria-label="Open folder" className="rounded-md p-1.5 text-fg-subtle hover:bg-hover hover:text-fg">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => removeFolder(folder)} disabled={busyFolderId === folder.id} title="Remove access" aria-label="Remove access" className="rounded-md p-1.5 text-fg-subtle hover:bg-hover hover:text-red-600">
                  {busyFolderId === folder.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {showManualEntry && (
        <form onSubmit={(event) => { event.preventDefault(); addFolder(manualPath); }} className="flex gap-2 border-t border-line px-3 py-2">
          <Input value={manualPath} onChange={(event) => setManualPath(event.target.value)} placeholder="/path/to/folder" spellCheck={false} className="h-8 font-mono text-[12px]" autoFocus />
          <Button size="xs" type="submit" disabled={!manualPath.trim()} loading={adding}>Add</Button>
        </form>
      )}

      {error && <p className="border-t border-line px-3 py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <button type="button" onClick={() => setShowManualEntry((v) => !v)} className="text-[11px] text-fg-subtle hover:text-fg">
          {showManualEntry ? 'Hide path entry' : 'Type a path'}
        </button>
        {window.electronAPI?.openDirectory ? (
          <Button size="xs" icon={FolderPlus} onClick={browseForFolder} loading={adding}>Add folder</Button>
        ) : (
          !showManualEntry && <Button size="xs" icon={FolderPlus} onClick={() => setShowManualEntry(true)}>Add folder</Button>
        )}
      </div>
    </div>
  );
}

ProjectFolders.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    folders: PropTypes.array,
    emoji: PropTypes.string,
  }).isRequired,
  onChange: PropTypes.func,
};
