import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { FolderPlus, Loader2, X } from 'lucide-react';
import Portal from '../../components/Portal.jsx';

export default function ProjectCreateModal({ isOpen, onClose, onCreate, isCreating = false, error = '' }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const isCreatingRef = useRef(isCreating);
  onCloseRef.current = onClose;
  isCreatingRef.current = isCreating;

  useEffect(() => {
    if (!isOpen) return undefined;
    setName('');
    setDescription('');
    const focusTimer = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isCreatingRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = (event) => {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName || isCreating) return;
    onCreate({ name: projectName, description: description.trim() });
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 dark:bg-black/60"
        onMouseDown={(event) => event.target === event.currentTarget && !isCreating && onClose()}
      >
        <form
          onSubmit={submit}
          className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-950"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <FolderPlus className="h-4 w-4" />
              </span>
              <div>
                <h2 id="create-project-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">Create project</h2>
                <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">Group related tasks and control which folders they can use.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="-mr-1 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Name</span>
              <input
                ref={nameInputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Website redesign"
                disabled={isCreating}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Description <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A short note about this project"
                rows={3}
                disabled={isCreating}
                className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-500"
              />
            </label>
            {error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5 dark:border-gray-800 midnight:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isCreating ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

ProjectCreateModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
  isCreating: PropTypes.bool,
  error: PropTypes.string,
};
