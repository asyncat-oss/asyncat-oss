// The "Key" row of a service: the saved key by its last four characters and
// Replace, or a field to add one (saved encrypted), with where to get a key
// and a way to remove it.

import { useEffect, useId, useState } from 'react';
import PropTypes from 'prop-types';
import { ExternalLink } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { PropertyRow } from '../../components/ui/Rows.jsx';
import { useConfirm } from '../../components/confirmContext.js';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { configApi } from '../../Settings/settingApi.js';
import { keyEnding, keyUrl, sharedKeyNote } from './providers.js';

/**
 *   <KeyRow service="openai" title="OpenAI" keyName="OPENAI_API_KEY" hasKey={false}
 *     tab="voice" draft onSaved={useIt} onRemoved={reload} />
 *
 * With no key the field shows at once. `draft` (the service is picked but
 * not in use yet) makes the button "Save and use"; `onSaved` then does the
 * using, and the button spins until it is done. `tab` ('voice' or 'images')
 * says which other tab a shared key also serves.
 */
export default function KeyRow({ service, title, keyName, hasKey, tab, draft = false, onSaved, onRemoved, highlight }) {
  const toast = useToast();
  const confirm = useConfirm();
  const fieldId = useId();
  const [masked, setMasked] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'remove'
  const [error, setError] = useState('');
  // Saved or removed here, until the page's own status catches up.
  const [known, setKnown] = useState(null);
  const [version, setVersion] = useState(0);
  const saved = known ?? Boolean(hasKey);

  useEffect(() => {
    setKnown(null);
  }, [hasKey, keyName]);

  useEffect(() => {
    let cancelled = false;
    if (!saved) {
      setMasked('');
      return undefined;
    }
    configApi.getSecrets()
      .then((res) => { if (!cancelled) setMasked(res?.secrets?.[keyName] || ''); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [saved, keyName, version]);

  // A new service starts fresh.
  useEffect(() => {
    setReplacing(false);
    setValue('');
    setError('');
  }, [keyName]);

  const open = !saved || replacing;
  const shared = sharedKeyNote(keyName, tab);
  const link = keyUrl(service);

  const save = async () => {
    const key = value.trim();
    if (!key || busy) return;
    setBusy('save');
    setError('');
    try {
      await configApi.updateSecret(keyName, key);
    } catch (err) {
      setError(errorDetail(err) || "Couldn't save the key.");
      setBusy(null);
      return;
    }
    setValue('');
    setReplacing(false);
    setKnown(true);
    setVersion((current) => current + 1);
    toast.success('Key saved');
    try {
      await onSaved?.(keyName);
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove your ${title} key?`,
      message: shared
        ? `Asyncat forgets it, here and on the ${tab === 'voice' ? 'Images' : 'Voice'} tab. You'll need the key again to use ${title}.`
        : `Asyncat forgets it. You'll need the key again to use ${title}.`,
      confirmLabel: 'Remove key',
      destructive: true,
    });
    if (!ok) return;
    setBusy('remove');
    setError('');
    try {
      await configApi.updateSecret(keyName, '');
      setReplacing(false);
      setKnown(false);
      setMasked('');
      toast.success('Key removed');
      await onRemoved?.(keyName);
    } catch (err) {
      setError(errorDetail(err) || "Couldn't remove the key.");
    } finally {
      setBusy(null);
    }
  };

  const field = (
    <form
      className="flex min-w-0 gap-2"
      onSubmit={(event) => { event.preventDefault(); save(); }}
    >
      <Input
        id={fieldId}
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && replacing) {
            event.preventDefault();
            setReplacing(false);
            setValue('');
          }
        }}
        placeholder={`Your ${title} API key`}
        autoComplete="off"
        spellCheck={false}
        aria-label={`${title} API key`}
        className="h-8 min-w-0 flex-1"
        // Replace was just pressed: the field is what comes next.
        autoFocus={replacing}
      />
      <Button type="submit" variant="primary" size="sm" loading={busy === 'save'} disabled={!value.trim() || busy === 'remove'}>
        {draft ? 'Save and use' : 'Save key'}
      </Button>
    </form>
  );

  return (
    <PropertyRow
      label="Key"
      highlight={highlight}
      data-key-row={keyName}
      value={open ? field : keyEnding(masked)}
      meta={open ? null : shared}
      control={!open ? <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>Replace</Button> : null}
      open={open || Boolean(error)}
    >
      <div className="-mt-1.5 sm:pl-36">
        {error ? <p role="alert" className="mb-1 text-[12px] leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
        {open ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-5 text-fg-subtle">
            <span>Saved encrypted on this computer.</span>
            {shared ? <span>{shared}.</span> : null}
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg hover:decoration-fg-subtle">
                Get a key <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              {replacing ? <Button variant="ghost" size="xs" onClick={() => { setReplacing(false); setValue(''); setError(''); }}>Cancel</Button> : null}
              {saved ? <Button variant="ghost" size="xs" loading={busy === 'remove'} disabled={busy === 'save'} onClick={remove}>Remove key</Button> : null}
            </span>
          </div>
        ) : null}
      </div>
    </PropertyRow>
  );
}

KeyRow.propTypes = {
  service: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  keyName: PropTypes.string.isRequired,
  hasKey: PropTypes.bool,
  tab: PropTypes.oneOf(['voice', 'images']).isRequired,
  draft: PropTypes.bool,
  onSaved: PropTypes.func,
  onRemoved: PropTypes.func,
  highlight: PropTypes.any,
};
