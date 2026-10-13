// Settings → Background: what closing the window does, and starting Asyncat
// at login. Cats only work while Asyncat is running, so by default it stays
// in the tray while a Cat is on. Desktop app only; the rules live in
// electron/background-config.js.

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Cat, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../Models/modelPageShared.jsx';
import { catsApi } from '../CommandCenter/api/catsApi.js';

const CHOICES = [
  {
    value: 'scheduled',
    label: 'Keep running for Cats',
    description: 'Asyncat stays in the tray while at least one Cat is on, and quits when none are.',
  },
  {
    value: 'always',
    label: 'Always keep running',
    description: 'Asyncat stays in the tray until you choose Quit there.',
  },
  {
    value: 'quit',
    label: 'Quit',
    description: 'Closing the window quits Asyncat. Cats only work while it is open.',
  },
];

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-line-strong'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

Switch.propTypes = { checked: PropTypes.bool, onChange: PropTypes.func.isRequired, disabled: PropTypes.bool, label: PropTypes.string };

function closingSummary(settings, enabledTasks) {
  if (!settings) return '';
  if (settings.whenClosed === 'quit') return 'Closing the window quits Asyncat.';
  if (settings.whenClosed === 'always' || settings.platform === 'darwin') {
    return 'Closing the window leaves Asyncat running in the tray.';
  }
  if (enabledTasks === null || enabledTasks === undefined) return '';
  return enabledTasks > 0
    ? `${enabledTasks} Cat${enabledTasks === 1 ? ' is' : 's are'} on, so closing the window leaves Asyncat running in the tray.`
    : 'No Cat is on, so closing the window quits Asyncat.';
}

export default function BackgroundSection() {
  const navigate = useNavigate();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const available = Boolean(api?.getBackgroundSettings);
  const [settings, setSettings] = useState(null);
  const [enabledTasks, setEnabledTasks] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!available) return;
    try {
      setSettings(await api.getBackgroundSettings());
    } catch (err) {
      setError(err.message || "Couldn't read the background settings.");
    }
  }, [api, available]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    catsApi.list()
      .then((result) => { if (!cancelled) setEnabledTasks(Number(result.enabledCount) || 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const update = async (key, patch) => {
    setSaving(key);
    setError('');
    try {
      const result = await api.setBackgroundSettings(patch);
      if (result?.settings) setSettings(result.settings);
      if (result && !result.ok) setError(result.error || "Couldn't save that.");
    } catch (err) {
      setError(err.message || "Couldn't save that.");
    } finally {
      setSaving(null);
    }
  };

  if (!available) {
    return (
      <Panel className="p-5">
        <p className="text-[13px] text-fg-muted">
          These settings are for the Asyncat desktop app. In a browser, Cats work while the Asyncat server is running.
        </p>
      </Panel>
    );
  }

  if (!settings) {
    return <div className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const isMac = settings.platform === 'darwin';

  return (
    <div className="space-y-6">
      <Panel>
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">When the window is closed</h3>
          <p className="mt-1 text-[13px] leading-5 text-fg-muted">
            Cats only work while Asyncat is running. Closing the window always frees the memory it used.
          </p>
        </div>
        <div role="radiogroup" aria-label="When the window is closed" className="divide-y divide-line">
          {CHOICES.map((choice) => {
            const selected = settings.whenClosed === choice.value;
            return (
              <label key={choice.value} className="flex cursor-pointer items-start gap-3 px-5 py-3.5 transition-colors hover:bg-hover">
                <input
                  type="radio"
                  name="when-closed"
                  value={choice.value}
                  checked={selected}
                  disabled={saving === 'whenClosed'}
                  onChange={() => update('whenClosed', { whenClosed: choice.value })}
                  className="mt-0.5 h-4 w-4 accent-[var(--as-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">
                    {choice.label}
                    {choice.value === 'scheduled' ? <span className="ml-2 text-[12px] font-normal text-fg-subtle">Recommended</span> : null}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-fg-muted">{choice.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-5 py-3 text-[12px] text-fg-subtle">
          <Cat className="h-3.5 w-3.5" />
          <span>{closingSummary(settings, enabledTasks)}</span>
          {isMac ? <span>On a Mac, Asyncat stays in the Dock after the window closes unless you choose Quit.</span> : null}
          <button type="button" onClick={() => navigate('/cats')} className="font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
            Cats
          </button>
        </div>
      </Panel>

      <Panel className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-fg">Start Asyncat when you log in</h3>
          <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">
            {settings.loginSupported
              ? 'Opens in the tray without a window, so Cats keep working after a restart.'
              : 'Available in the installed app.'}
          </p>
        </div>
        <Switch
          checked={Boolean(settings.openAtLogin)}
          disabled={!settings.loginSupported || saving === 'openAtLogin'}
          onChange={(openAtLogin) => update('openAtLogin', { openAtLogin })}
          label="Start Asyncat when you log in"
        />
      </Panel>

      {error ? <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
