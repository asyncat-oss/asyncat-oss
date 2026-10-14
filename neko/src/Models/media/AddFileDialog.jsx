// "Add a file": a model file already on this computer, picked with the
// desktop's file picker (or typed as a path in a browser), and a name for
// it. What it is used for follows from the kind of file; Asyncat uses it
// where it is and copies nothing.

import { useEffect, useId, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import Notice from '../../components/ui/Notice.jsx';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { audioApi, visualModelsApi } from '../../Settings/settingApi.js';
import { defaultFileName, fileFilters, fileUse } from './filesFormat.js';
import { notifyImagesChanged, notifyVoiceChanged } from './notify.js';

/**
 *   <AddFileDialog open={open} onClose={close} scope="voice" onAdded={reload} />
 *
 * `scope`: 'voice' (a listening model or a voice), 'listening', 'speaking'
 * or 'images'.
 */
export default function AddFileDialog({ open, onClose, scope = 'voice', onAdded }) {
  const toast = useToast();
  const pathId = useId();
  const nameId = useId();
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [named, setNamed] = useState(false); // the name was typed, not taken from the file
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canPick = typeof window !== 'undefined' && Boolean(window.electronAPI?.openFilesDialog);

  useEffect(() => {
    if (!open) return;
    setPath('');
    setName('');
    setNamed(false);
    setError('');
  }, [open]);

  const changePath = (next) => {
    setPath(next);
    setError('');
    if (!named) setName(defaultFileName(next));
  };

  const choose = async () => {
    try {
      const result = await window.electronAPI.openFilesDialog({ title: 'Choose a model file', buttonLabel: 'Choose', filters: fileFilters(scope) });
      const picked = !result?.canceled && result?.filePaths?.[0];
      if (picked) changePath(picked);
    } catch (err) {
      setError(errorDetail(err) || "Couldn't open the file picker.");
    }
  };

  const use = fileUse(path, scope);
  const ready = Boolean(path.trim() && name.trim() && use.type);

  const add = async (event) => {
    event?.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    try {
      if (use.type === 'image') {
        await visualModelsApi.addCustomPath(name.trim(), path.trim(), 'image');
        notifyImagesChanged();
      } else {
        await audioApi.addCustomPath(name.trim(), path.trim(), use.type);
        notifyVoiceChanged();
      }
      toast.success(`Added ${name.trim()}`);
      await onAdded?.();
      onClose();
    } catch (err) {
      setError(errorDetail(err) || "Couldn't add it.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      size="sm"
      title="Add a file"
      as="form"
      onSubmit={add}
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!ready}>Add</Button>
        </>
      )}
    >
      <div className="space-y-3" data-add-file={scope}>
        <Field label="File" htmlFor={pathId}>
          <div className="flex gap-2">
            <Input
              id={pathId}
              value={path}
              onChange={(event) => changePath(event.target.value)}
              placeholder={canPick ? 'Choose a file, or type its path' : 'The full path of the file'}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 font-mono text-[12px]"
            />
            {canPick ? <Button onClick={choose}>Choose…</Button> : null}
          </div>
        </Field>
        <Field label="Name" htmlFor={nameId}>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => { setName(event.target.value); setNamed(true); }}
            autoComplete="off"
          />
        </Field>
        {use.error ? <Notice tone="warning">{use.error}</Notice> : use.text ? <p className="text-[12px] leading-5 text-fg-subtle">{use.text}</p> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Dialog>
  );
}

AddFileDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  scope: PropTypes.oneOf(['voice', 'listening', 'speaking', 'images']),
  onAdded: PropTypes.func,
};
