// First-run setup, step 4: how careful Asyncat is. Where new chats start,
// and the command sandbox with its network: the same settings as Settings →
// Privacy & safety, one sentence each.

import { useCallback, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
import Switch from '../components/ui/Switch.jsx';
import { RowGroup, SettingsRow } from '../components/ui/Rows.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import privacyApi from '../services/privacyApi.js';
import { newChatMode, setNewChatMode } from '../services/chatDefaults.js';
import { NETWORK_CHOICES } from '../Settings/sandboxText.js';
import { CHAT_MODE_CHOICES, NETWORK_DESCRIPTIONS, networkPendingNote, sandboxSentence } from './setupFlow.js';

export default function SafetyStep() {
  const confirm = useConfirm();
  const toast = useToast();
  const [mode, setMode] = useState(() => newChatMode());
  const [sandbox, setSandbox] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback((recheck = false) => {
    setBusy(recheck ? 'recheck' : null);
    return privacyApi.sandbox(recheck)
      .then((res) => setSandbox(res.sandbox))
      .catch((err) => toast.error("Couldn't check the sandbox", { detail: errorDetail(err) }))
      .finally(() => setBusy(null));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async (changes, key) => {
    setBusy(key);
    try {
      const res = await privacyApi.setSandbox(changes);
      setSandbox(res.sandbox);
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
        message: 'Commands Asyncat runs will be able to read and change any file your account can, not just files in the project.',
        confirmLabel: 'Turn off',
        destructive: true,
      });
      if (!ok) return;
    }
    save({ enabled: value }, 'enabled');
  };

  const changeMode = (value) => {
    setMode(value);
    setNewChatMode(value);
  };

  const supported = sandbox?.state !== 'unsupported';
  const network = sandbox?.network?.mode || 'open';
  const pending = networkPendingNote(sandbox);
  return (
    <div className="space-y-6" data-safety-step>
      <section className="space-y-2">
        <h2 className="text-[13px] font-medium text-fg">New chats start in</h2>
        <RadioGroup value={mode} onChange={changeMode} label="New chats start in" options={CHAT_MODE_CHOICES} />
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-medium text-fg">Commands Asyncat runs</h2>
        <RowGroup>
          <SettingsRow
            label="Keep them in a sandbox"
            stack={false}
            hint={(
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-sandbox-state={sandbox?.state || 'loading'}>
                <span className={sandbox?.state === 'unavailable' ? 'text-amber-700 dark:text-amber-400' : ''}>{sandboxSentence(sandbox)}</span>
                {sandbox?.state === 'unavailable' ? (
                  <Button size="xs" variant="ghost" icon={RotateCw} loading={busy === 'recheck'} onClick={() => load(true)}>Check again</Button>
                ) : null}
              </span>
            )}
          >
            {supported ? (
              <Switch
                checked={sandbox ? sandbox.enabled : true}
                onChange={changeEnabled}
                disabled={!sandbox || busy === 'enabled'}
                label="Keep commands in a sandbox"
              />
            ) : null}
          </SettingsRow>
        </RowGroup>
        {sandbox?.enabled && supported ? (
          <div className="space-y-2 pt-2">
            <h3 className="text-[13px] font-medium text-fg">Network for commands</h3>
            <RadioGroup
              value={network}
              onChange={(value) => save({ network: value }, 'network')}
              disabled={busy === 'network'}
              label="Network for commands"
              options={NETWORK_CHOICES.map((choice) => ({ ...choice, description: NETWORK_DESCRIPTIONS[choice.value] }))}
            />
            {pending ? <p className="text-[12px] leading-5 text-fg-subtle" data-sandbox-pending>{pending}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
