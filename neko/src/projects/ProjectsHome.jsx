import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, Folder, MessageSquare, Plus, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import ProjectDialog from './components/ProjectDialog';
import { projectApi } from './projectApi.js';
import eventBus from '../utils/eventBus.js';

/** All projects, newest activity first, with a way to make a new one. */
export default function ProjectsHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await projectApi.getProjects();
      const list = [...(res?.data || [])].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      setProjects(list);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => eventBus.on('projectsUpdated', load), [load]);
  // The sidebar's "Create your first project" asks this page to open the dialog.
  useEffect(() => eventBus.on('projects:create', () => setCreating(true)), []);
  useEffect(() => {
    if (!location.state?.createProject) return;
    setCreating(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => `${p.name} ${p.description || ''}`.toLowerCase().includes(q));
  }, [projects, query]);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <PageHeader
        title="Projects"
        description="Keep related chats together, with shared instructions, knowledge files and folders."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New project</Button>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        {projects.length > 6 && (
          <div className="relative mb-5 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" className="pl-8" />
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-hover" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md text-center">
            <p className="text-[15px] font-medium text-fg">No projects yet</p>
            <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">
              A project is a home for related work: give it instructions every chat follows, files it should know about, and folders the agent may use.
            </p>
            <Button className="mt-5" variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create a project</Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="flex min-h-[8rem] flex-col rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-hover"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-xl" aria-hidden="true">
                    {project.emoji || <Folder className="h-[18px] w-[18px] text-fg-subtle" strokeWidth={1.75} />}
                  </span>
                  <span className="truncate text-[15px] font-medium text-fg">{project.name}</span>
                </span>
                <span className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-fg-muted">
                  {project.description || (project.instructions ? project.instructions : 'No description')}
                </span>
                <span className="mt-auto flex flex-wrap gap-3 pt-3 text-[12px] text-fg-subtle">
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {project.chat_count || 0}</span>
                  <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {project.file_count || 0}</span>
                  <span className="inline-flex items-center gap-1"><Folder className="h-3 w-3" /> {project.folder_count || 0}</span>
                </span>
              </button>
            ))}
            {visible.length === 0 && <p className="text-[13px] text-fg-muted">No project matches “{query}”.</p>}
          </div>
        )}
      </div>

      <ProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(created) => { if (created?.id) navigate(`/projects/${created.id}`); }}
      />
    </div>
  );
}
