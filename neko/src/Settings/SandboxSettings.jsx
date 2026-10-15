// Settings → Privacy & safety → the command sandbox: whether it is on and
// working (or on but unable to start, and why), the network commands get,
// and the folders they can't read, with a way to allow one back. Rows for
// the RowGroup PrivacySection puts them in.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { RefreshCw } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import Switch from '../components/ui/Switch.jsx';
import { SettingsRow } from '../components/ui/Rows.jsx';
import { Chips } from '../Cats/CatForm.jsx';
import privacyApi from '../services/privacyApi.js';
import { NETWORK_CHOICES, networkHint, pendingNote, sandboxStatusLine, shortPath, toggleAllowed } from './sandboxText.js';

const TONES = {
  ok: 'text-fg-muted',
  warn: 'text-amber-700 dark:text-amber-400',
  off: 'text-fg-muted',
};

function HiddenFolders({ folders, home, busy, onToggle }) {
  return (
    <div className="px-4 py-3" data-sandbox-folders>
      <p className="text-[13px] font-medium text-fg">Folders commands can&apos;t read</p>
      <p className="mb-2 mt-0.5 text-[12px] leading-5 text-fg-muted">
        Sign-ins, keys, browser profiles and Asyncat&apos;s own data. Allow one back if a tool needs it, such as ~/.ssh for Git over SSH.
      </p>
      {folders.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {folders.map((item) => (
            <li key={item.path} className="flex items-center gap-3 px-3 py-2" data-folder={item.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-fg">
                  {item.label}
                  {item.allowed ? <span className="text-fg-subtle"> · commands can read it</span> : null}
                </p>
                <p className="truncate font-mono text-[11px] text-fg-subtle" title={item.path}>{shortPath(item.path, home)}</p>
              </div>
              <Button size="xs" variant="ghost" loading={busy === item.path} onClick={() => onToggle(item)}>
                {item.allowed ? 'Hide again' : 'Allow'}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-fg-subtle">None of them are on this computer.</p>
      )}
    </div>
  );
}

HiddenFolders.propTypes = {
  folders: PropTypes.array.isRequired,
  home: PropTypes.string,
  busy: PropTypes.string,
  onToggle: PropTypes.func.isRequired,
};

export default function SandboxSettings() {
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback((recheck = false) => {
    setBusy(recheck ? 'recheck' : null);
    return privacyApi.sandbox(recheck)
      .then((res) => setStatus(res.sandbox))
      .catch((err) => toast.error("Couldn't check the sandbox", { detail: errorDetail(err) }))
      .finally(() => setBusy(null));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async (changes, key) => {
    setBusy(key);
    try {
      const res = await privacyApi.setSandbox(changes);
      setStatus(res.sandbox);
    } catch (err) {
      toast.error("Couldn't save that", { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const changeEnabled = async (value) => {
    if (!value) {
      const ok = await confirm({
        title: 'Turn off the command sandbox?',
        message: "Commands the agent runs will be able to read and change any file your account can, not just files in the project. Only do this if a tool you need can't work in the sandbox.",
        confirmLabel: 'Turn off',
        destructive: true,
      });
      if (!ok) return;
    }
    save({ enabled: value }, 'enabled');
  };

  const toggleFolder = async (item) => {
    if (!item.allowed) {
      const ok = await confirm({
        title: `Let commands read ${item.label}?`,
        message: `Commands the agent runs will be able to read ${shortPath(item.path, status?.home)}, and with the network on, send what they read anywhere.`,
        confirmLabel: 'Allow',
      });
      if (!ok) return;
    }
    save({ allowRead: toggleAllowed(status.hiddenFolders, item.path, !item.allowed) }, item.path);
  };

  const line = sandboxStatusLine(status);
  const statusHint = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-sandbox-state={status?.state || 'loading'}>
      <span className={TONES[line.tone]}>{line.text}</span>
      {status?.state === 'unavailable' ? (
        <Button size="xs" variant="ghost" icon={RefreshCw} loading={busy === 'recheck'} onClick={() => load(true)}>Check again</Button>
      ) : null}
    </span>
  );

  if (status?.state === 'unsupported') return <SettingsRow label="Sandbox the agent's commands" hint={statusHint} />;

  const mode = status?.network?.mode || 'open';
  const pending = pendingNote(status);
  return (
    <>
      <SettingsRow label="Sandbox the agent's commands" hint={statusHint} stack={false}>
        <Switch checked={status ? status.enabled : true} onChange={changeEnabled} disabled={!status || busy === 'enabled'} label="Sandbox the agent's commands" />
      </SettingsRow>
      {status?.enabled ? (
        <>
          {pending ? <p className="px-4 py-2.5 text-[12px] leading-5 text-fg-subtle" data-sandbox-pending>{pending}</p> : null}
          <div className="px-4 py-3" data-sandbox-network>
            <p className="text-[13px] font-medium text-fg">Network for commands</p>
            <RadioGroup
              className="mt-2"
              value={mode}
              onChange={(value) => save({ network: value }, 'network')}
              label="Network for the agent's commands"
              options={NETWORK_CHOICES.map((choice) => ({ ...choice, description: networkHint(choice.value) }))}
              disabled={busy === 'network'}
            />
            {status.network?.note ? <Notice tone="warning" className="mt-2">{status.network.note}</Notice> : null}
          </div>
          {mode === 'registries' ? (
            <div className="px-4 py-3" data-sandbox-registries>
              <p className="text-[13px] font-medium text-fg">Other registries</p>
              <p className="mb-2 mt-0.5 text-[12px] leading-5 text-fg-muted">
                Besides npm, PyPI, crates.io, the Go proxy, RubyGems, Maven, NuGet and GitHub downloads. &ldquo;pkgs.example.com&rdquo; covers its subdomains too.
              </p>
              <Chips
                value={status.registries?.added || []}
                onChange={(hosts) => save({ registries: hosts }, 'registries')}
                placeholder="pkgs.example.com"
                label="Add a registry commands may reach"
                mono
              />
            </div>
          ) : null}
          <HiddenFolders folders={status.hiddenFolders || []} home={status.home} busy={busy} onToggle={toggleFolder} />
        </>
      ) : null}
    </>
  );
}
