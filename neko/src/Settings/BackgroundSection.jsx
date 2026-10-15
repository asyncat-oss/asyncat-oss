// Settings → General → Closing the window: what closing the window does, and
// starting Asyncat at login. Cats only work while Asyncat is running, so by
// default it stays in the tray while a Cat is on. Desktop app only; the rules
// live in electron/background-config.js.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Power } from 'lucide-react';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import Notice from '../components/ui/Notice.jsx';
import RadioGroup from '../components/ui/RadioGroup.jsx';
import Switch from '../components/ui/Switch.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';

const CHOICES = [
  {
    value: 'scheduled',
    label: 'Keep running for Cats',
    aside: 'Recommended',
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

const TITLE = 'When you close the window';
const HINT = 'Cats only work while Asyncat is running. Closing the window always frees the memory it used.';

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
      <SettingsSection icon={Power} title={TITLE}>
        <Notice>These settings are for the Asyncat desktop app. In a browser, Cats work while the Asyncat server is running.</Notice>
      </SettingsSection>
    );
  }

  if (!settings) {
    return (
      <SettingsSection icon={Power} title={TITLE} hint={HINT}>
        {error ? <Notice tone="error">{error}</Notice> : (
          <p className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        )}
      </SettingsSection>
    );
  }

  const isMac = settings.platform === 'darwin';
  const summary = closingSummary(settings, enabledTasks);

  return (
    <SettingsSection icon={Power} title={TITLE} hint={HINT} data-background>
      <div className="space-y-3">
        <RadioGroup
          value={settings.whenClosed}
          onChange={(whenClosed) => update('whenClosed', { whenClosed })}
          label={TITLE}
          options={CHOICES}
          disabled={saving === 'whenClosed'}
        />
        {summary || isMac ? (
          <p className="text-[12px] leading-5 text-fg-subtle">
            {summary}
            {isMac ? ' On a Mac, Asyncat stays in the Dock after the window closes unless you choose Quit.' : ''}
            {' '}
            <button type="button" onClick={() => navigate('/cats')} className="text-accent hover:underline">Open Cats</button>
          </p>
        ) : null}
        <RowGroup>
          <SettingsRow
            label="Start Asyncat when you log in"
            hint={settings.loginSupported ? 'Opens in the tray without a window, so Cats keep working after a restart.' : 'Available in the installed app.'}
            stack={false}
          >
            <Switch
              checked={Boolean(settings.openAtLogin)}
              disabled={!settings.loginSupported || saving === 'openAtLogin'}
              onChange={(openAtLogin) => update('openAtLogin', { openAtLogin })}
              label="Start Asyncat when you log in"
            />
          </SettingsRow>
        </RowGroup>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </SettingsSection>
  );
}
