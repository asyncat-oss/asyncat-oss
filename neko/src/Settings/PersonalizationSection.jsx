// Settings → Personalization: what Asyncat should know about you and how it
// should answer (saved on your profile, read in every chat, Cat and Quick
// ask), and the instructions file its agent starts from, edited in a dialog.
// The rules behind both are in personalizationText.js.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { FileText, MessageSquareText, Wrench } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import { CONTROL_CLASS } from '../components/ui/Field.jsx';
import Notice from '../components/ui/Notice.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { useConfirm } from '../components/confirmContext.js';
import { agentApi } from '../CommandCenter/api/agentApi.js';
import { personalizationApi } from './settingApi';
import {
  INSTRUCTIONS_LIMIT, PREFERENCE_LIMIT, cleanPreference, countLabel, instructionsStatus, nearLimit, preferencesChanged,
} from './personalizationText.js';

const isSaveKey = (event) => event.key === 'Enter' && (event.metaKey || event.ctrlKey);

function Count({ id, length, limit }) {
  return (
    <span id={id} className={`shrink-0 whitespace-nowrap text-[11px] tabular-nums ${nearLimit(length, limit) ? 'text-amber-700 dark:text-amber-400' : 'text-fg-subtle'}`}>
      {countLabel(length, limit)}
    </span>
  );
}

Count.propTypes = { id: PropTypes.string, length: PropTypes.number.isRequired, limit: PropTypes.number.isRequired };

function PreferenceField({ id, label, hint, placeholder, value, limit, onChange, onSave }) {
  return (
    <div className="px-4 py-3.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-fg">{label}</label>
      <p id={`${id}-hint`} className="mt-0.5 text-[12px] leading-5 text-fg-muted">{hint}</p>
      <textarea
        id={id}
        value={value}
        rows={4}
        maxLength={limit}
        placeholder={placeholder}
        aria-describedby={`${id}-hint ${id}-count`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (!isSaveKey(event)) return;
          event.preventDefault();
          onSave();
        }}
        className={`mt-2.5 block min-h-[104px] resize-y py-2 leading-6 ${CONTROL_CLASS}`}
      />
      <div className="mt-1.5 flex justify-end">
        <Count id={`${id}-count`} length={value.length} limit={limit} />
      </div>
    </div>
  );
}

PreferenceField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  value: PropTypes.string.isRequired,
  limit: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

function PreferencesSection() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState({ about: '', answerStyle: '' });
  const [limit, setLimit] = useState(PREFERENCE_LIMIT);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    personalizationApi.fetch()
      .then((res) => {
        const values = { about: res.data?.about || '', answerStyle: res.data?.answerStyle || '' };
        setSaved(values);
        setDraft(values);
        if (res.data?.limit) setLimit(res.data.limit);
      })
      .catch((err) => setError(errorDetail(err)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = Boolean(saved) && preferencesChanged(saved, draft);

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    try {
      const res = await personalizationApi.save({ about: cleanPreference(draft.about), answerStyle: cleanPreference(draft.answerStyle) });
      const values = { about: res.data.about, answerStyle: res.data.answerStyle };
      setSaved(values);
      setDraft(values);
      toast.success('Preferences saved');
    } catch (err) {
      toast.error("Couldn't save your preferences", { detail: errorDetail(err) });
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (value) => setDraft((current) => ({ ...current, [field]: value }));

  let body;
  if (error) {
    body = <Notice tone="error" action={<Button size="xs" onClick={load}>Try again</Button>}>Couldn&apos;t load your preferences: {error}</Notice>;
  } else if (!saved) {
    body = <Skeleton className="h-[372px] rounded-xl" />;
  } else {
    body = (
      <>
        <RowGroup>
          <PreferenceField
            id="pref-about"
            label="What should Asyncat know about you?"
            hint="Your work, what you're learning, the tools you use."
            placeholder="For example: I'm a nurse learning Python. I use Linux at home and Windows at work."
            value={draft.about}
            limit={limit}
            onChange={set('about')}
            onSave={save}
          />
          <PreferenceField
            id="pref-answer"
            label="How should Asyncat answer?"
            hint="Length, tone, format, the language and spelling you want."
            placeholder="For example: Keep answers short and plain. Use British spelling. Show one example."
            value={draft.answerStyle}
            limit={limit}
            onChange={set('answerStyle')}
            onSave={save}
          />
        </RowGroup>
        <div className="mt-3 flex items-center justify-end gap-2">
          {changed ? <Button variant="ghost" onClick={() => setDraft(saved)} disabled={saving}>Discard</Button> : null}
          <Button variant={changed ? 'primary' : 'secondary'} disabled={!changed} loading={saving} onClick={save}>Save</Button>
        </div>
      </>
    );
  }

  return (
    <SettingsSection
      icon={MessageSquareText}
      title="Your preferences"
      hint="Asyncat reads these in every chat, Cat and Quick ask. Claude Code, Codex and other coding agents don't get them."
    >
      {body}
    </SettingsSection>
  );
}

// Mounted while open, so each opening starts from the file as it is.
function InstructionsDialog({ info, onClose, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState(info?.content || '');
  const [busy, setBusy] = useState(null); // 'save' | 'reset'

  const changed = draft !== (info?.content || '');

  const close = async () => {
    if (busy) return;
    if (changed && !(await confirm({
      title: 'Discard your changes?',
      message: "Your edits to the instructions file aren't saved.",
      confirmLabel: 'Discard',
      destructive: true,
    }))) return;
    onClose();
  };

  const save = async (event) => {
    event?.preventDefault();
    if (!changed || busy) return;
    setBusy('save');
    try {
      onChange(await agentApi.updateSoul(draft));
      toast.success('Instructions file saved');
      onClose();
    } catch (err) {
      toast.error("Couldn't save the instructions file", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!(await confirm({
      title: 'Reset the instructions file?',
      message: 'Your edits are deleted and Asyncat goes back to the instructions it came with.',
      confirmLabel: 'Reset',
      destructive: true,
    }))) return;
    setBusy('reset');
    try {
      const res = await agentApi.resetSoul();
      onChange(res);
      setDraft(res.content || '');
      toast.success('Instructions file reset');
    } catch (err) {
      toast.error("Couldn't reset the instructions file", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      title="Instructions file"
      description="Who Asyncat's agent is, how it works and the rules it keeps, in Markdown. It starts every chat and Cat; your preferences come after it."
      size="lg"
      as="form"
      onSubmit={save}
      onClose={close}
      footer={(
        <>
          {info?.edited && info?.hasDefault ? (
            <Button variant="danger" className="mr-auto" loading={busy === 'reset'} disabled={busy === 'save'} onClick={reset}>Reset to default</Button>
          ) : null}
          <Button variant="ghost" onClick={close} disabled={Boolean(busy)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!changed || busy === 'reset'} loading={busy === 'save'}>Save</Button>
        </>
      )}
    >
      <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-subtle">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate font-mono text-[11.5px]" title={info?.path}>{info?.displayPath}</span>
        <span className="shrink-0">· {instructionsStatus(info)}</span>
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (isSaveKey(event)) save(event);
        }}
        maxLength={INSTRUCTIONS_LIMIT}
        spellCheck={false}
        aria-label="Instructions file"
        aria-describedby="instructions-count"
        className={`block h-[min(52vh,460px)] resize-none py-2.5 font-mono text-[12px] leading-[1.6] ${CONTROL_CLASS}`}
      />
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <p className="text-[11px] leading-4 text-fg-subtle">Saved as your own copy. The file Asyncat came with stays as it is.</p>
        <Count id="instructions-count" length={draft.length} limit={INSTRUCTIONS_LIMIT} />
      </div>
    </Dialog>
  );
}

InstructionsDialog.propTypes = {
  info: PropTypes.shape({
    content: PropTypes.string,
    path: PropTypes.string,
    displayPath: PropTypes.string,
    edited: PropTypes.bool,
    hasDefault: PropTypes.bool,
  }),
  onClose: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

function InstructionsFileSection() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return agentApi.getSoul()
      .then((res) => { setInfo(res); return res; })
      .catch((err) => { setError(errorDetail(err)); return null; });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read it again on opening, in case it changed since this page loaded.
  const edit = async () => {
    if (await load()) setOpen(true);
  };

  return (
    <SettingsSection icon={Wrench} title="Advanced" data-settings-section="instructions" className="scroll-mt-6">
      <RowGroup>
        <SettingsRow
          label="Instructions file"
          hint={(
            <>
              <p>Who Asyncat&apos;s agent is, how it works and the rules it keeps. Most people never change it.</p>
              {info ? (
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-fg-subtle">
                  <span className="min-w-0 truncate font-mono text-[11.5px]" title={info.path}>{info.displayPath}</span>
                  <span className="shrink-0">· {instructionsStatus(info)}</span>
                </p>
              ) : null}
              {error ? <Notice tone="error" className="mt-2">Couldn&apos;t read it: {error}</Notice> : null}
            </>
          )}
        >
          <Button onClick={edit} disabled={!info && !error}>Edit…</Button>
        </SettingsRow>
      </RowGroup>
      {open ? <InstructionsDialog info={info} onClose={() => setOpen(false)} onChange={setInfo} /> : null}
    </SettingsSection>
  );
}

export default function PersonalizationSection() {
  return (
    <div className="space-y-8">
      <PreferencesSection />
      <InstructionsFileSection />
    </div>
  );
}
