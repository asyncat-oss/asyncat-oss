import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { FileText, Folder, FolderOpen, Paperclip, Trash2, X } from 'lucide-react';
import Dialog from '../../components/ui/Dialog';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useConfirm } from '../../components/confirmContext';
import { useToast, errorDetail } from '../../components/toastContext';
import { projectApi } from '../projectApi.js';
import eventBus from '../../utils/eventBus.js';

// '' is no emoji: the project shows a plain folder glyph.
const EMOJIS = ['', '📁', '💼', '🚀', '🧪', '📚', '✍️', '🎨', '🏡', '🌱', '🍳', '🧳', '💡', '📈', '🛠️', '🎮', '🎵', '🧠', '❤️', '🐱', '⭐'];
const MAX_INSTRUCTIONS = 20000;
const MAX_FILES = 20;

const folderName = (value) => String(value || '').split(/[\\/]+/).filter(Boolean).pop() || value;

const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

function OptionalSection({ icon: Icon, title, hint, children }) {
  return (
    <section className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">{title}</p>
          <p className="text-[12px] leading-5 text-fg-subtle">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

OptionalSection.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
  hint: PropTypes.string.isRequired,
  children: PropTypes.node,
};

/**
 * Create a project, or edit one (pass `project`). Deleting lives here too.
 * A new project can get its folder, instructions and files right away;
 * `initialFolder` pre-fills the folder (a folder dropped onto the app).
 */
export default function ProjectDialog({ open, project = null, initialFolder = '', onClose, onSaved, onDeleted }) {
  const editing = Boolean(project);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [description, setDescription] = useState('');
  const [folder, setFolder] = useState('');
  const [instructions, setInstructions] = useState('');
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const confirm = useConfirm();
  const toast = useToast();
  const canBrowse = Boolean(window.electronAPI?.openDirectory);

  useEffect(() => {
    if (!open) return;
    setName(project?.name || (initialFolder ? folderName(initialFolder) : ''));
    setEmoji(project?.emoji || '');
    setDescription(project?.description || '');
    setFolder(editing ? '' : initialFolder || '');
    setInstructions('');
    setFiles([]);
    setError('');
  }, [open, project, initialFolder, editing]);

  const chooseFolder = async () => {
    try {
      const result = await window.electronAPI.openDirectory({ title: 'Choose the project folder', buttonLabel: 'Use Folder' });
      const chosen = !result?.canceled && result?.filePaths?.[0];
      if (!chosen) return;
      setFolder(chosen);
      if (!name.trim()) setName(folderName(chosen));
    } catch (err) {
      toast.error("Couldn't open the folder picker", { detail: errorDetail(err) });
    }
  };

  const addFiles = (list) => {
    const chosen = Array.from(list || []).filter((file) => file && file.size >= 0);
    if (!chosen.length) return;
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
      const merged = [...current, ...chosen.filter((file) => !seen.has(`${file.name}:${file.size}`))];
      if (merged.length > MAX_FILES) toast.error(`Add up to ${MAX_FILES} files here; add more on the project page.`);
      return merged.slice(0, MAX_FILES);
    });
  };

  const save = async (event) => {
    event?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the project a name.');
      return;
    }
    if (instructions.length > MAX_INSTRUCTIONS) {
      setError(`Instructions can be ${MAX_INSTRUCTIONS.toLocaleString()} characters at most.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { name: trimmed, emoji, description: description.trim() };
      if (editing) {
        const result = await projectApi.updateProject(project.id, payload);
        eventBus.emit('projectsUpdated');
        onSaved?.(result?.data || null);
        onClose();
        return;
      }

      const result = await projectApi.createProject(payload);
      const created = result?.data || null;
      // The project exists now; the extras are added one by one, and any that
      // fail are reported without losing the project.
      const problems = [];
      if (created?.id && folder.trim()) {
        try {
          await projectApi.addProjectFolder(created.id, { path: folder.trim() });
        } catch (err) {
          problems.push(`The folder wasn't added: ${errorDetail(err)}`);
        }
      }
      if (created?.id && instructions.trim()) {
        try {
          await projectApi.updateInstructions(created.id, instructions.trim());
        } catch (err) {
          problems.push(`The instructions weren't saved: ${errorDetail(err)}`);
        }
      }
      if (created?.id && files.length) {
        try {
          const upload = await projectApi.uploadKnowledge(created.id, files);
          for (const failure of upload.errors || []) problems.push(`${failure.name}: ${failure.error}`);
        } catch (err) {
          problems.push(`The files weren't added: ${errorDetail(err)}`);
        }
      }
      eventBus.emit('projectsUpdated');
      if (problems.length) {
        toast.error(`“${trimmed}” was created, but not everything was added`, { detail: problems.slice(0, 3).join(' · ') });
      }
      onSaved?.(created);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save the project.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${project.name}”?`,
      message: 'Its instructions and knowledge files are deleted. Its chats stay and move to Recents. Your folders on disk are not touched.',
      confirmLabel: 'Delete project',
      destructive: true,
    });
    if (!ok) return;
    try {
      await projectApi.deleteProject(project.id);
      eventBus.emit('projectsUpdated');
      onClose();
      onDeleted?.(project);
    } catch (err) {
      toast.error("Couldn't delete the project", { detail: errorDetail(err) });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      size={editing ? 'sm' : 'md'}
      title={editing ? 'Project settings' : 'New project'}
      description={editing ? null : 'A project keeps related chats together and gives them shared instructions, knowledge and folders.'}
      as="form"
      onSubmit={save}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          {editing ? (
            <Button variant="danger" size="sm" icon={Trash2} onClick={remove}>Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving}>{editing ? 'Save' : 'Create project'}</Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <Field label="Icon">
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((option) => (
              <button
                key={option || 'none'}
                type="button"
                onClick={() => setEmoji(option)}
                aria-pressed={emoji === option}
                aria-label={option ? undefined : 'No emoji'}
                title={option ? undefined : 'No emoji'}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors ${emoji === option ? 'bg-selected ring-1 ring-line-strong' : 'hover:bg-hover'}`}
              >
                {option || <Folder className="h-4 w-4 text-fg-subtle" strokeWidth={1.75} />}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Name" htmlFor="project-name" error={error}>
          <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen renovation" maxLength={120} autoFocus />
        </Field>
        <Field label="Description" htmlFor="project-description" hint="Shown on the project page. Optional.">
          <Input id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this project is about" maxLength={300} />
        </Field>

        {!editing && (
          <div className="space-y-2.5">
            <p className="text-[12px] font-medium text-fg-muted">Optional, or add them later on the project page</p>

            <OptionalSection icon={Folder} title="Folder" hint="Chats in the project can read and edit files here.">
              {folder ? (
                <div className="flex items-center gap-2 rounded-lg bg-hover px-2.5 py-1.5">
                  <FolderOpen className="h-4 w-4 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{folderName(folder)}</span>
                    <span className="block truncate text-[11px] text-fg-subtle" title={folder}>{folder}</span>
                  </span>
                  <button type="button" onClick={() => setFolder('')} aria-label="Don't add this folder" className="rounded-md p-1 text-fg-subtle hover:bg-selected hover:text-fg">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : canBrowse ? (
                <Button size="sm" icon={FolderOpen} onClick={chooseFolder}>Choose folder…</Button>
              ) : (
                <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="/path/to/folder" aria-label="Folder path" />
              )}
            </OptionalSection>

            <OptionalSection icon={FileText} title="Instructions" hint="Every chat in the project follows them.">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Answer in metric units. Keep replies short."
                rows={3}
                aria-label="Project instructions"
                className="w-full resize-y rounded-lg border border-line-strong bg-canvas px-3 py-2 text-[13px] leading-6 text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </OptionalSection>

            <OptionalSection icon={Paperclip} title="Files" hint="Documents, notes, code, PDFs or images every chat can use.">
              <div
                className={`rounded-lg border border-dashed px-3 py-2 transition-colors ${dragging ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); addFiles(e.dataTransfer.files); }}
              >
                {files.length > 0 && (
                  <ul className="mb-2 divide-y divide-line">
                    {files.map((file) => (
                      <li key={`${file.name}:${file.size}`} className="flex items-center gap-2 py-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-fg" title={file.name}>{file.name}</span>
                        <span className="shrink-0 text-[11px] text-fg-subtle">{formatSize(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                          aria-label={`Don't add ${file.name}`}
                          className="rounded-md p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-fg-subtle">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'Drop files here, or'}</span>
                  <Button size="xs" icon={Paperclip} onClick={() => fileInputRef.current?.click()}>Add files</Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                />
              </div>
            </OptionalSection>
          </div>
        )}
      </div>
    </Dialog>
  );
}

ProjectDialog.propTypes = {
  open: PropTypes.bool,
  project: PropTypes.object,
  initialFolder: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
  onDeleted: PropTypes.func,
};
