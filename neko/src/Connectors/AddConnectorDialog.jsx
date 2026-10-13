// "Add connector": pick one from the catalog, or add a remote server by its
// address or a program on this computer by its command. Programs that
// download first show what and how much before anything downloads; remote
// services that need a sign-in open their page in the browser right away.

import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeft, ExternalLink, Globe, KeyRound, TerminalSquare } from 'lucide-react';
import Dialog from '../components/ui/Dialog.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { useToast } from '../components/toastContext.js';
import { openWebLink } from '../utils/openWebLink.js';
import { connectorsApi } from './connectorsApi.js';
import { localFormFrom, localPayload, remoteFormFrom, remotePayload } from './connectorFormat.js';
import { LocalFields, RemoteFields } from './ConnectorFields.jsx';
import DownloadNotice from './DownloadNotice.jsx';
import { ConnectorIcon } from './ConnectorParts.jsx';

const VIEWS = [
  { value: 'catalog', label: 'Catalog' },
  { value: 'remote', label: 'Remote server', icon: Globe },
  { value: 'local', label: 'Program on this computer', icon: TerminalSquare },
];

function kindLine(entry) {
  if (entry.kind === 'local') return `Program on this computer${entry.needs ? ` · needs ${entry.needs}` : ''}`;
  if (entry.auth === 'oauth') return 'Runs on their servers · sign in';
  if (entry.auth === 'token') return entry.optionalToken ? 'Runs on their servers · key optional' : 'Runs on their servers · needs a key';
  return 'Runs on their servers · no account needed';
}

function CatalogGrid({ catalog, added, onPick }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {catalog.map((entry) => {
        const already = added.has(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onPick(entry)}
            className="flex items-start gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-line-strong hover:bg-hover"
            data-catalog-entry={entry.id}
          >
            <ConnectorIcon title={entry.title} kind={entry.kind} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                {entry.title}
                {already ? <span className="rounded-full bg-hover px-1.5 text-[10px] font-medium text-fg-subtle">Added</span> : null}
              </span>
              <span className="mt-0.5 block text-[12px] leading-5 text-fg-muted">{entry.description}</span>
              <span className="mt-1 block text-[11px] text-fg-subtle">{kindLine(entry)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

CatalogGrid.propTypes = { catalog: PropTypes.array.isRequired, added: PropTypes.instanceOf(Set).isRequired, onPick: PropTypes.func.isRequired };

export default function AddConnectorDialog({ catalog, connectors = [], initialEntry = null, onClose, onAdded }) {
  const toast = useToast();
  const [view, setView] = useState('catalog');
  const [entry, setEntry] = useState(initialEntry);
  const [token, setToken] = useState('');
  const [remote, setRemote] = useState(() => remoteFormFrom(null));
  const [local, setLocal] = useState(() => localFormFrom(null));
  // A program whose command downloads first, waiting for the OK.
  const [pendingLocal, setPendingLocal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const added = new Set(connectors.map((item) => item.catalogId).filter(Boolean));

  const finish = async (connector) => {
    if (connector?.status === 'needs_sign_in') {
      try {
        const res = await connectorsApi.signIn(connector.name);
        if (res.authorizationUrl) {
          openWebLink(res.authorizationUrl, 'system');
          toast.info(`Finish signing in to ${connector.title} in your browser`);
        }
      } catch {
        // The connector's row offers "Sign in" again.
      }
    } else if (connector?.status === 'connected') {
      toast.success(`${connector.title} is connected`);
    }
    onAdded(connector);
  };

  const add = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const res = await connectorsApi.add(payload);
      await finish(res.connector);
    } catch (err) {
      setError(err.message || "Couldn't add it.");
      setBusy(false);
    }
  };

  const checkCatalog = useCallback((opts) => connectorsApi.checkDownload({ catalogId: entry?.id, ...opts }), [entry]);
  const checkPending = useCallback((opts) => connectorsApi.checkDownload({ command: pendingLocal?.command, args: pendingLocal?.args, ...opts }), [pendingLocal]);

  const submitLocal = async () => {
    const payload = localPayload(local);
    if (!payload.command) {
      setError('Type the command that starts it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await connectorsApi.checkDownload({ command: payload.command, args: payload.args });
      setBusy(false);
      if (res.download?.needed) {
        setPendingLocal(payload);
        return;
      }
      await add(payload);
    } catch (err) {
      setBusy(false);
      setError(err.message || "Couldn't check the command.");
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (view === 'remote') add(remotePayload(remote));
    else if (view === 'local' && !pendingLocal) submitLocal();
    else if (view === 'catalog' && entry && !(entry.kind === 'local')) add({ catalogId: entry.id, token });
  };

  const back = () => {
    setEntry(null);
    setToken('');
    setError('');
  };

  const footerButton = () => {
    if (view === 'catalog') {
      if (!entry || entry.kind === 'local') return null;
      const label = entry.auth === 'oauth' ? 'Add and sign in' : 'Add';
      return <Button variant="primary" type="submit" loading={busy}>{label}</Button>;
    }
    if (view === 'local' && pendingLocal) return null;
    return <Button variant="primary" type="submit" loading={busy}>Add</Button>;
  };

  return (
    <Dialog
      as="form"
      onSubmit={submit}
      size="lg"
      title="Add connector"
      description="Connectors give your agents and Cats tools from other apps and services, using MCP (Model Context Protocol)."
      onClose={() => !busy && onClose()}
      footer={(
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[12px] text-fg-subtle">Keys and sign-ins are saved encrypted on this computer.</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            {footerButton()}
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <Segmented
          value={view}
          onChange={(value) => { setView(value); setError(''); setPendingLocal(null); }}
          items={VIEWS}
          label="How to add it"
        />

        {view === 'catalog' && !entry ? <CatalogGrid catalog={catalog} added={added} onPick={(picked) => { setEntry(picked); setError(''); }} /> : null}

        {view === 'catalog' && entry ? (
          <div className="space-y-4">
            <button type="button" onClick={back} className="flex items-center gap-1 text-[12px] font-medium text-fg-muted hover:text-fg">
              <ArrowLeft className="h-3.5 w-3.5" /> All connectors
            </button>
            <div className="flex items-start gap-3">
              <ConnectorIcon title={entry.title} kind={entry.kind} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-fg">{entry.title}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">{entry.description}</p>
                <p className="mt-1 text-[12px] text-fg-subtle">
                  {kindLine(entry)}
                  {entry.docs ? (
                    <>
                      {' · '}
                      <button type="button" onClick={() => openWebLink(entry.docs, 'system')} className="inline-flex items-center gap-0.5 text-accent hover:underline">
                        About it <ExternalLink className="h-3 w-3" />
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            {entry.kind === 'remote' && entry.auth === 'oauth' ? (
              <p className="rounded-xl bg-hover/60 px-3 py-2.5 text-[13px] leading-5 text-fg-muted">
                Adding it opens {entry.title}&apos;s sign-in page in your browser. You choose there what Asyncat may reach.
              </p>
            ) : null}
            {entry.kind === 'remote' && entry.auth === 'token' ? (
              <Field
                label={entry.token.label}
                htmlFor="connector-token"
                hint={(
                  <>
                    Saved encrypted.{' '}
                    <button type="button" onClick={() => openWebLink(entry.token.help, 'system')} className="text-accent hover:underline">Make one</button>
                  </>
                )}
              >
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
                  <Input id="connector-token" type="password" className="pl-8" value={token} onChange={(event) => setToken(event.target.value)} placeholder={entry.token.placeholder} autoComplete="off" required={!entry.optionalToken} />
                </div>
              </Field>
            ) : null}
            {entry.kind === 'local' ? (
              <DownloadNotice check={checkCatalog} busy={busy} approveLabel="Download and add" onApprove={(version) => add({ catalogId: entry.id, approveDownload: { version } })}>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => add({ catalogId: entry.id })}>Add, but don&apos;t download yet</Button>
              </DownloadNotice>
            ) : null}
          </div>
        ) : null}

        {view === 'remote' ? <RemoteFields form={remote} set={(patch) => setRemote((current) => ({ ...current, ...patch }))} autoFocus /> : null}

        {view === 'local' && !pendingLocal ? <LocalFields form={local} set={(patch) => setLocal((current) => ({ ...current, ...patch }))} autoFocus /> : null}
        {view === 'local' && pendingLocal ? (
          <div className="space-y-3">
            <button type="button" onClick={() => setPendingLocal(null)} className="flex items-center gap-1 text-[12px] font-medium text-fg-muted hover:text-fg">
              <ArrowLeft className="h-3.5 w-3.5" /> Change the command
            </button>
            <p className="font-mono text-[12px] text-fg-muted">{[pendingLocal.command, ...pendingLocal.args].join(' ')}</p>
            <DownloadNotice check={checkPending} busy={busy} approveLabel="Download and add" onApprove={(version) => add({ ...pendingLocal, approveDownload: { version } })}>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => add(pendingLocal)}>Add, but don&apos;t download yet</Button>
            </DownloadNotice>
          </div>
        ) : null}

        {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}
      </div>
    </Dialog>
  );
}

AddConnectorDialog.propTypes = {
  catalog: PropTypes.array.isRequired,
  connectors: PropTypes.array,
  initialEntry: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onAdded: PropTypes.func.isRequired,
};
