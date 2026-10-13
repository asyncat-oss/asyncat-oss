import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Dialog from './ui/Dialog';
import Button from './ui/Button';

const MAX = 20000;

/** Edit the instructions every chat in a project (or with an agent) gets. */
export default function InstructionsDialog({ open, title, description, value = '', placeholder, onClose, onSave }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(value || '');
      setError('');
    }
  }, [open, value]);

  const save = async (event) => {
    event?.preventDefault?.();
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      size="lg"
      title={title}
      description={description}
      as="form"
      onSubmit={save}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          <span className={`text-[11px] ${draft.length > MAX ? 'text-red-600' : 'text-fg-subtle'}`}>
            {draft.length.toLocaleString()} / {MAX.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving} disabled={draft.length > MAX}>Save instructions</Button>
          </div>
        </div>
      )}
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        rows={14}
        autoFocus
        className="w-full resize-y rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-[13px] leading-6 text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {error && <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </Dialog>
  );
}

InstructionsDialog.propTypes = {
  open: PropTypes.bool,
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  value: PropTypes.string,
  placeholder: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};
