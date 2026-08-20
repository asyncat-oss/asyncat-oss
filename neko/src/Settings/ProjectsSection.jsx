import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, FolderOpen, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';
import { projectApi } from '../projects/projectApi.js';
import eventBus from '../utils/eventBus.js';

export default function ProjectsSection() {
  const navigate = useNavigate();
  const { getWorkspaceProjects, bustProjectsCache } = useWorkspace();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getWorkspaceProjects();
      setProjects(data || []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load projects');
    } finally {
      setLoading(false);
    }
  }, [getWorkspaceProjects]);

  useEffect(() => {
    load();
    return eventBus.on('projectsUpdated', () => {
      bustProjectsCache();
      load();
    });
  }, [bustProjectsCache, load]);

  const createProject = async (event) => {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName || creating) return;
    setCreating(true);
    setError('');
    try {
      const response = await projectApi.createProject({ name: projectName });
      bustProjectsCache();
      eventBus.emit('projectsUpdated');
      navigate(`/projects/${response.data.id}/folders`);
    } catch (createError) {
      setError(createError.message || 'Could not create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800 midnight:border-slate-800">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gray-500" /><h3 className="text-sm font-semibold">Project access</h3></div>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Projects organize tasks and define which local folders Work mode can access.</p>
        </div>
        <form onSubmit={createProject} className="flex gap-2 border-b border-gray-100 p-4 dark:border-gray-800 midnight:border-slate-800">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New project name" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950" />
          <button type="submit" disabled={!name.trim() || creating} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
          </button>
        </form>
        {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-950 dark:bg-red-950/20 dark:text-red-400">{error}</div>}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading projects…</div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Create your first Project, then attach the folders it should use.</div>
          ) : projects.map((project) => (
            <button key={project.id} type="button" onClick={() => navigate(`/projects/${project.id}/folders`)} className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg dark:bg-gray-800">{project.emoji || '📁'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">{project.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  <FolderOpen className="h-3 w-3" />
                  {project.folder_count > 0 ? `${project.folder_count} folder${project.folder_count === 1 ? '' : 's'} · ${project.primary_folder?.path || ''}` : 'No folders attached'}
                </span>
              </span>
              {project.folder_count > 0 ? <Check className="h-4 w-4 text-emerald-500" /> : <Plus className="h-4 w-4 text-gray-400" />}
              <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
