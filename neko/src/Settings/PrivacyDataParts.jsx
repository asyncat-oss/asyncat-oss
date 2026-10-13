// Settings → Privacy & safety → Your data: "Export everything" (one zip in
// Downloads) and "Delete everything" (done by the server's next start, which
// follows right away).

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, Check, Download, Trash2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { formatBytes } from '../Models/engineProgress.js';
import privacyApi from '../services/privacyApi.js';
import { updateApi } from './settingApi.js';

const PHRASE = 'delete everything';

export function ExportEverything() {
  const toast = useToast();
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    privacyApi.exportEstimate().then((res) => setEstimate(res.estimate)).catch(() => setEstimate(null));
  }, []);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await privacyApi.exportEverything();
      setResult(res.export);
    } catch (err) {
      toast.error("Couldn't export", { detail: errorDetail(err) });
    } finally {
      setBusy(false);
    }
  };

  const fileName = result?.path ? result.path.split(/[\\/]/).pop() : '';
  const canShow = Boolean(window.electronAPI?.shellShowInFolder);
  return (
    <div className="rounded-xl border border-line px-4 py-3" data-export>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">Export everything</p>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">
            One zip file in your Downloads folder with your chats, projects, notes, agents, Cats, memories, settings, uploads, generated pictures and skills.
            {estimate ? ` About ${formatBytes(estimate.bytes)} before zipping.` : ''}
            {estimate?.leftOut?.modelsBytes ? ` Downloaded models (${formatBytes(estimate.leftOut.modelsBytes)}) are left out.` : ' Downloaded models are left out.'}
            {' '}Saved keys stay encrypted in it.
          </p>
        </div>
        <Button icon={Download} loading={busy} onClick={run}>{busy ? 'Exporting…' : 'Export'}</Button>
      </div>
      {result ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-300" role="status">
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span>Saved &ldquo;{fileName}&rdquo; ({formatBytes(result.bytes)}).</span>
          {canShow ? (
            <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => Promise.resolve(window.electronAPI.shellShowInFolder(result.path)).catch(() => {})}>Show in folder</button>
          ) : <span className="break-all font-mono">{result.path}</span>}
        </div>
      ) : null}
    </div>
  );
}

/** Asyncat's own saved choices in this window (theme, layout, drafts…). */
function forgetLocalChoices() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of Object.keys(store)) {
        if (key.startsWith('asyncat')) store.removeItem(key);
      }
    } catch { /* storage may be unavailable */ }
  }
}

function restartAndReload(onTimeout) {
  updateApi.restart(null, () => window.location.assign('/'), onTimeout);
}

export function DeleteEverything({ pending, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [includeModels, setIncludeModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stuck, setStuck] = useState(false);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPhrase('');
    setError('');
  };

  const confirmDelete = async (event) => {
    event.preventDefault();
    if (phrase.trim().toLowerCase() !== PHRASE) {
      setError(`Type “${PHRASE}” to confirm.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await privacyApi.requestReset(includeModels);
      forgetLocalChoices();
      restartAndReload(() => { setBusy(false); setOpen(false); setStuck(true); onChanged?.(); });
    } catch (err) {
      setBusy(false);
      setError(errorDetail(err) || "Couldn't do that.");
    }
  };

  const callOff = async () => {
    try {
      await privacyApi.cancelReset();
      setStuck(false);
      onChanged?.();
    } catch (err) {
      toast.error("Couldn't call it off", { detail: errorDetail(err) });
    }
  };

  if (pending) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3" data-reset-pending>
        <p className="flex items-center gap-2 text-[13px] font-medium text-fg"><AlertTriangle className="h-4 w-4 text-amber-500" /> Everything will be deleted when Asyncat next starts</p>
        <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">
          {stuck ? "The server didn't restart by itself. Quit and reopen Asyncat to finish, or call it off. " : ''}
          Asked for {new Date(pending.requestedAt).toLocaleString()}{pending.includeModels ? ', with models and engines' : ''}.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => restartAndReload(() => setStuck(true))}>Restart and delete now</Button>
          <Button size="sm" variant="ghost" onClick={callOff}>Call it off</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/30 px-4 py-3" data-delete-everything>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">Delete everything</p>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">
            Start over as if Asyncat were new: your chats, projects, notes, agents, Cats, memories, settings, saved keys and sign-ins, uploads, generated pictures and skills go, and the built-in browser forgets its sign-ins and tabs. Project folders elsewhere on your computer are left alone.
          </p>
        </div>
        <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>Delete everything…</Button>
      </div>
      {open ? (
        <Dialog
          as="form"
          onSubmit={confirmDelete}
          size="sm"
          title="Delete everything?"
          description="This can't be undone. Export first if you might want any of it back."
          onClose={close}
          footer={(
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
              <Button variant="danger" type="submit" icon={Trash2} loading={busy} disabled={phrase.trim().toLowerCase() !== PHRASE}>{busy ? 'Restarting…' : 'Delete everything'}</Button>
            </>
          )}
        >
          <div className="space-y-4">
            <label className="flex items-start gap-2.5 text-[13px] text-fg">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--as-accent)]" checked={includeModels} onChange={(event) => setIncludeModels(event.target.checked)} disabled={busy} />
              <span>
                Also delete downloaded models and engines
                <span className="block text-[12px] text-fg-muted">Otherwise they stay, so you don&apos;t have to download them again.</span>
              </span>
            </label>
            <Field label={`Type “${PHRASE}” to confirm`} htmlFor="delete-everything-phrase">
              <Input id="delete-everything-phrase" autoFocus autoComplete="off" spellCheck={false} value={phrase} onChange={(event) => setPhrase(event.target.value)} disabled={busy} />
            </Field>
            <p className="text-[12px] leading-5 text-fg-muted">Asyncat&apos;s server restarts to do it, then this window starts fresh.</p>
            {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

DeleteEverything.propTypes = {
  pending: PropTypes.shape({ requestedAt: PropTypes.string, includeModels: PropTypes.bool }),
  onChanged: PropTypes.func,
};
