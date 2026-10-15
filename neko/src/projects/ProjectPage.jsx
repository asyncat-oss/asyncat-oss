import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUp, FileText, Folder, MessageSquare, Pencil, Settings2 } from 'lucide-react';
import Button from '../components/ui/Button';
import ContextMeter from '../components/ContextMeter';
import KnowledgeFiles from '../components/KnowledgeFiles';
import InstructionsDialog from '../components/InstructionsDialog';
import { useConfirm } from '../components/confirmContext';
import { useToast, errorDetail } from '../components/toastContext';
import ProjectDialog from './components/ProjectDialog';
import ProjectFolders from './components/ProjectFolders';
import { projectApi } from './projectApi.js';
import eventBus from '../utils/eventBus.js';
import { chosenProjectEmoji } from '../CommandCenter/utils/projectEmoji.js';
import { getRelativeTime } from '../CommandCenter/utils/conversationUtils.js';

function SectionTitle({ icon: Icon, title, action }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
        <Icon className="h-3.5 w-3.5 text-fg-subtle" /> {title}
      </h2>
      {action}
    </div>
  );
}

SectionTitle.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.node.isRequired,
  action: PropTypes.node,
};

/**
 * A project's home, like a Claude/ChatGPT project: start a chat, see the
 * project's chats, and manage the instructions, knowledge and folders every
 * chat in it gets.
 */
export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [missing, setMissing] = useState(false);
  const [chats, setChats] = useState([]);
  const [files, setFiles] = useState([]);
  const [fit, setFit] = useState(null);
  const [fitLoading, setFitLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [draft, setDraft] = useState('');
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textareaRef = useRef(null);

  const loadProject = useCallback(async () => {
    try {
      const res = await projectApi.getProjects();
      const found = (res?.data || []).find((p) => p.id === projectId) || null;
      setProject(found);
      setMissing(!found);
    } catch {
      setMissing(true);
    }
  }, [projectId]);

  const loadFit = useCallback(async () => {
    setFitLoading(true);
    try {
      const res = await projectApi.getContextFit(projectId);
      setFit(res?.data || null);
    } catch {
      setFit(null);
    } finally {
      setFitLoading(false);
    }
  }, [projectId]);

  const loadRest = useCallback(async () => {
    const [chatRes, fileRes] = await Promise.allSettled([
      projectApi.getProjectChats(projectId),
      projectApi.listKnowledge(projectId),
    ]);
    if (chatRes.status === 'fulfilled') setChats(chatRes.value?.data || []);
    if (fileRes.status === 'fulfilled') setFiles(fileRes.value?.data || []);
  }, [projectId]);

  useEffect(() => {
    setProject(null);
    setMissing(false);
    setChats([]);
    setFiles([]);
    setUploadErrors([]);
    setDraft('');
    loadProject();
    loadRest();
    loadFit();
  }, [loadFit, loadProject, loadRest]);

  useEffect(() => eventBus.on('projectsUpdated', () => { loadProject(); }), [loadProject]);

  const primaryFolder = useMemo(() => {
    const folders = project?.folders || [];
    return folders.find((f) => f.is_primary && f.exists) || folders.find((f) => f.exists) || null;
  }, [project?.folders]);

  const startChat = useCallback((text = '') => {
    if (!project) return;
    const workingContext = primaryFolder
      ? {
        rootId: primaryFolder.root_id,
        rootLabel: primaryFolder.name,
        rootKind: 'project',
        rootPath: primaryFolder.path,
        projectId: project.id,
        projectName: project.name,
        projectEmoji: project.emoji || null,
        relativePath: '.',
        workingDir: primaryFolder.path,
      }
      : { rootId: null, projectId: project.id, projectName: project.name, projectEmoji: project.emoji || null };
    navigate('/home', {
      state: { startProjectChat: { experienceMode: 'work', workingContext, initialMessage: text.trim() } },
    });
  }, [navigate, primaryFolder, project]);

  const submitDraft = (event) => {
    event?.preventDefault?.();
    if (!draft.trim()) {
      textareaRef.current?.focus();
      return;
    }
    startChat(draft);
  };

  const upload = async (list) => {
    setUploading(true);
    setUploadErrors([]);
    try {
      const { data, errors } = await projectApi.uploadKnowledge(projectId, list);
      if (data.length) setFiles((prev) => [...prev, ...data]);
      setUploadErrors(errors);
      loadFit();
    } catch (err) {
      setUploadErrors([{ name: 'Upload', error: err.message }]);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (file) => {
    const ok = await confirm({ title: `Remove “${file.name}”?`, message: 'Chats in this project will no longer use it.', confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    try {
      await projectApi.deleteKnowledge(projectId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      loadFit();
    } catch (err) {
      toast.error("Couldn't remove the file", { detail: errorDetail(err) });
    }
  };

  const saveInstructions = async (text) => {
    await projectApi.updateInstructions(projectId, text);
    setProject((prev) => (prev ? { ...prev, instructions: text } : prev));
    loadFit();
  };

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas p-8 text-center">
        <p className="text-sm text-fg-muted">This project doesn&apos;t exist any more.</p>
        <Button onClick={() => navigate('/projects')}>All projects</Button>
      </div>
    );
  }

  if (!project) {
    return <div className="h-full bg-canvas" aria-busy="true" />;
  }

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0">
          <button type="button" onClick={() => navigate('/projects')} className="mb-3 text-[12px] text-fg-subtle hover:text-fg">
            ← All projects
          </button>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-2xl" aria-hidden="true">
              {chosenProjectEmoji(project.emoji) || <Folder className="h-5 w-5 text-fg-subtle" strokeWidth={1.75} />}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-fg">{project.name}</h1>
              {project.description ? <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">{project.description}</p> : null}
            </div>
            <Button variant="ghost" size="icon" icon={Settings2} onClick={() => setSettingsOpen(true)} aria-label="Project settings" title="Project settings" />
          </div>

          <form onSubmit={submitDraft} className="mt-6 rounded-2xl border border-line-strong bg-surface shadow-sm focus-within:border-accent">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submitDraft(e);
              }}
              rows={3}
              placeholder={`Start a chat in ${project.name}…`}
              className="block w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-6 text-fg outline-none placeholder:text-fg-subtle"
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-fg-subtle">
                <Folder className="h-3.5 w-3.5 shrink-0" />
                {primaryFolder ? `Works in ${primaryFolder.name}` : 'No folder: instructions and knowledge only'}
              </span>
              <button
                type="submit"
                aria-label="Start chat"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${draft.trim() ? 'bg-fg text-canvas hover:opacity-90' : 'bg-hover text-fg-subtle'}`}
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>
          </form>

          <section className="mt-8">
            <SectionTitle icon={MessageSquare} title="Chats" action={chats.length ? <span className="text-[12px] text-fg-subtle">{chats.length}</span> : null} />
            {chats.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-fg-muted">
                No chats yet. Start one above; it will use this project&apos;s instructions and knowledge.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {chats.map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/conversations/${chat.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-fg">{chat.title || 'Untitled chat'}</span>
                        <span className="mt-0.5 block text-[12px] text-fg-subtle">
                          {getRelativeTime(chat.last_message_at)}
                          {chat.engine && chat.engine !== 'asyncat' ? ` · ${chat.engine === 'claude-code' ? 'Claude Code' : 'Codex'}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className="min-w-0 space-y-7 lg:pt-9">
          <section>
            <SectionTitle
              icon={Pencil}
              title="Instructions"
              action={<Button variant="ghost" size="xs" onClick={() => setEditingInstructions(true)}>{project.instructions ? 'Edit' : 'Add'}</Button>}
            />
            {project.instructions ? (
              <button
                type="button"
                onClick={() => setEditingInstructions(true)}
                className="block w-full rounded-xl border border-line px-3 py-2.5 text-left text-[13px] leading-5 text-fg-muted hover:bg-hover"
              >
                <span className="line-clamp-6 whitespace-pre-wrap">{project.instructions}</span>
              </button>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-3 py-3 text-[12px] leading-5 text-fg-muted">
                Tell every chat in this project how to answer: tone, format, things to always or never do.
              </p>
            )}
          </section>

          <section>
            <SectionTitle icon={FileText} title="Knowledge" />
            <div className="space-y-2.5">
              <ContextMeter report={fit} loading={fitLoading} />
              <KnowledgeFiles files={files} onUpload={upload} onDelete={removeFile} uploading={uploading} errors={uploadErrors} />
            </div>
          </section>

          <section>
            <SectionTitle icon={Folder} title="Folders" />
            <ProjectFolders project={project} onChange={loadProject} />
          </section>
        </aside>
      </div>

      <InstructionsDialog
        open={editingInstructions}
        title={`Instructions for ${project.name}`}
        description="Every chat in this project gets these, with any chat you start here or pick this project for."
        value={project.instructions || ''}
        placeholder={'For example:\n- Answer in British English.\n- Use metric units.\n- Keep answers short and list sources.'}
        onClose={() => setEditingInstructions(false)}
        onSave={saveInstructions}
      />
      <ProjectDialog
        open={settingsOpen}
        project={project}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => loadProject()}
        onDeleted={() => navigate('/projects')}
      />
    </div>
  );
}
