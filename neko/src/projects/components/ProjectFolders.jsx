import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ExternalLink,
  Folder,
  FolderPlus,
  Loader2,
  Play,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { projectApi } from '../projectApi.js';
import eventBus from '../../utils/eventBus.js';

const inputClass = 'min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 midnight:border-slate-700 midnight:bg-slate-950';

export default function ProjectFolders({ project, compact = false }) {
  const navigate = useNavigate();
  const [folders, setFolders] = useState(project?.folders || []);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [error, setError] = useState('');
  const [pendingRemove, setPendingRemove] = useState(null);
  const [busyFolderId, setBusyFolderId] = useState(null);

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

  const addFolder = useCallback(async (folderPath) => {
    const selectedPath = String(folderPath || '').trim();
    if (!selectedPath || !project?.id || adding) return;
    setAdding(true);
    setError('');
    try {
      await projectApi.addProjectFolder(project.id, { path: selectedPath });
      setManualPath('');
      await loadFolders();
      eventBus.emit('projectsUpdated');
      eventBus.emit('projectFoldersUpdated', { projectId: project.id });
    } catch (addError) {
      setError(addError.message || 'Could not add folder');
    } finally {
      setAdding(false);
    }
  }, [adding, loadFolders, project?.id]);

  const browseForFolder = async () => {
    if (!window.electronAPI?.openDirectory) return;
    const result = await window.electronAPI.openDirectory({
      title: `Add a folder to ${project.name}`,
      buttonLabel: 'Add Folder',
    });
    if (!result.canceled && result.filePaths?.[0]) await addFolder(result.filePaths[0]);
  };

  const makePrimary = async (folder) => {
    setBusyFolderId(folder.id);
    try {
      await projectApi.updateProjectFolder(project.id, folder.id, { is_primary: true });
      await loadFolders();
      eventBus.emit('projectsUpdated');
      eventBus.emit('projectFoldersUpdated', { projectId: project.id });
    } catch (updateError) {
      setError(updateError.message || 'Could not update the default folder');
    } finally {
      setBusyFolderId(null);
    }
  };

  const removeFolder = async (folder) => {
    if (pendingRemove !== folder.id) {
      setPendingRemove(folder.id);
      return;
    }
    setBusyFolderId(folder.id);
    try {
      await projectApi.deleteProjectFolder(project.id, folder.id);
      setPendingRemove(null);
      await loadFolders();
      eventBus.emit('projectsUpdated');
      eventBus.emit('projectFoldersUpdated', { projectId: project.id });
    } catch (removeError) {
      setError(removeError.message || 'Could not remove folder access');
    } finally {
      setBusyFolderId(null);
    }
  };

  const startWork = (folder) => {
    navigate('/home', {
      state: {
        startProjectChat: {
          experienceMode: 'work',
          workingContext: {
            rootId: folder.root_id,
            rootLabel: folder.name,
            rootKind: 'project',
            rootPath: folder.path,
            projectId: project.id,
            projectName: project.name,
            projectEmoji: project.emoji || '📁',
            relativePath: '.',
            workingDir: folder.path,
          },
        },
      },
    });
  };

  return (
    <section className={compact ? 'space-y-3' : 'mx-auto w-full max-w-4xl space-y-5 p-5 sm:p-8'}>
      {!compact && (
        <header>
          <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 midnight:text-slate-100">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{project.emoji || '📁'} {project.name}</h2>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
            A Project is reusable context for AI chats. Attach only the local folders it may use; each Work chat selects one attached folder and cannot move above it.
          </p>
        </header>
      )}

      <div className="rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center dark:border-gray-800 midnight:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Folders with AI access</div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Removing access never deletes the folder or its files.</div>
          </div>
          {window.electronAPI?.openDirectory && (
            <button
              type="button"
              onClick={browseForFolder}
              disabled={adding}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
              Add folder
            </button>
          )}
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); addFolder(manualPath); }}
          className="flex gap-2 border-b border-gray-100 p-3 dark:border-gray-800 midnight:border-slate-800"
        >
          <input
            value={manualPath}
            onChange={(event) => setManualPath(event.target.value)}
            placeholder="Paste an absolute folder path"
            spellCheck={false}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!manualPath.trim() || adding}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Add
          </button>
        </form>

        {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-600 dark:border-red-950 dark:bg-red-950/20 dark:text-red-400">{error}</div>}

        <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading folders…</div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <Folder className="h-8 w-8 text-gray-300 dark:text-gray-700" />
              <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">No folders attached</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">Add a codebase, document folder, or any other directory before starting Work.</p>
            </div>
          ) : folders.map((folder) => (
            <div key={folder.id} className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                <Folder className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{folder.name}</span>
                  {folder.is_primary && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">Default</span>}
                  {!folder.exists && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500 dark:bg-red-950/30 dark:text-red-400">Unavailable</span>}
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400 dark:text-gray-500" title={folder.path}>{folder.path}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {!folder.is_primary && (
                  <button type="button" onClick={() => makePrimary(folder)} disabled={busyFolderId === folder.id} title="Make default" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"><Star className="h-3.5 w-3.5" /> Default</button>
                )}
                {window.electronAPI?.shellOpen && (
                  <button type="button" onClick={() => window.electronAPI.shellOpen(folder.path)} title="Open in File Explorer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"><ExternalLink className="h-3.5 w-3.5" /></button>
                )}
                <button type="button" onClick={() => startWork(folder)} disabled={!folder.exists} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"><Play className="h-3.5 w-3.5" /> New work chat</button>
                <button type="button" onClick={() => removeFolder(folder)} disabled={busyFolderId === folder.id} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors ${pendingRemove === folder.id ? 'bg-red-50 font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400' : 'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 dark:hover:text-red-400'}`}>
                  {busyFolderId === folder.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {pendingRemove === folder.id ? 'Confirm' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

ProjectFolders.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    folders: PropTypes.array,
    emoji: PropTypes.string,
  }).isRequired,
  compact: PropTypes.bool,
};
