import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Trash2 } from 'lucide-react';
import Dialog from '../../components/ui/Dialog';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { useConfirm } from '../../components/confirmContext';
import { useToast, errorDetail } from '../../components/toastContext';
import { projectApi } from '../projectApi.js';
import eventBus from '../../utils/eventBus.js';

const EMOJIS = ['📁', '💼', '🚀', '🧪', '📚', '✍️', '🎨', '🏡', '🌱', '🍳', '🧳', '💡', '📈', '🛠️', '🎮', '🎵', '🧠', '❤️', '🐱', '⭐'];

/**
 * Create a project, or edit one (pass `project`). Deleting lives here too.
 */
export default function ProjectDialog({ open, project = null, onClose, onSaved, onDeleted }) {
  const editing = Boolean(project);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setName(project?.name || '');
    setEmoji(project?.emoji || '📁');
    setDescription(project?.description || '');
    setError('');
  }, [open, project]);

  const save = async (event) => {
    event?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the project a name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { name: trimmed, emoji, description: description.trim() };
      const result = editing
        ? await projectApi.updateProject(project.id, payload)
        : await projectApi.createProject(payload);
      eventBus.emit('projectsUpdated');
      onSaved?.(result?.data || null);
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
      size="sm"
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
                key={option}
                type="button"
                onClick={() => setEmoji(option)}
                aria-pressed={emoji === option}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors ${emoji === option ? 'bg-selected ring-1 ring-line-strong' : 'hover:bg-hover'}`}
              >
                {option}
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
      </div>
    </Dialog>
  );
}

ProjectDialog.propTypes = {
  open: PropTypes.bool,
  project: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
  onDeleted: PropTypes.func,
};
