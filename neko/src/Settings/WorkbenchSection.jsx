// Settings → Workbench: the terminal and built-in browser that open beside a
// chat, where they dock, and the browser's own history and data.

import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { AppWindow, Globe2, SquareTerminal } from 'lucide-react';
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import Select from '../components/ui/Select.jsx';
import Switch from '../components/ui/Switch.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';

const POSITION_HINTS = {
  bottom: 'Gives commands and logs more width.',
  right: 'Keeps every tool in one column.',
};

const FOLDER_HINTS = {
  working: 'The folder of the project the chat is in.',
  home: 'Your home folder.',
};

const MODE_HINTS = {
  incognito: 'Keeps no history, and forgets cookies when you leave. You can switch from the browser toolbar too.',
  persistent: 'Remembers sign-ins and cookies. Tabs agents open always use this.',
};

const LINK_HINTS = {
  internal: 'Links in chats, source cards and browser pages open in the built-in browser.',
  system: "Links in chats and source cards open in your computer's default browser.",
};

const FONT_SIZES = [11, 12, 13, 14, 15, 16].map((size) => ({ value: String(size), label: `${size} px` }));

function Toggle({ label, hint, checked, onChange }) {
  return (
    <SettingsRow label={label} hint={hint} stack={false}>
      <Switch checked={Boolean(checked)} onChange={onChange} label={label} />
    </SettingsRow>
  );
}

export default function WorkbenchSection() {
  const { workbenchPreferences: prefs, setWorkbenchPreference: setPreference, resetWorkbenchLayout } = useUiPreferences();
  const confirm = useConfirm();
  const toast = useToast();
  const [clearing, setClearing] = useState(false);
  // The terminal runs on the backend host (the same machine in the desktop
  // app), so offer only the shells that exist there instead of every shell on
  // every OS. Default to the browser's guess until Electron reports the real
  // platform.
  const [platform, setPlatform] = useState(() => (
    typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) ? 'win32'
      : typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent) ? 'darwin'
        : 'linux'
  ));
  useEffect(() => {
    let active = true;
    window.electronAPI?.getPlatform?.()
      .then((p) => { if (active && p) setPlatform(p); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const shellOptions = useMemo(() => {
    const auto = { value: 'auto', label: 'Auto' };
    if (platform === 'win32') {
      return [auto, { value: 'pwsh', label: 'PS 7' }, { value: 'powershell', label: 'PS 5' }, { value: 'cmd', label: 'CMD' }];
    }
    // macOS and Linux: POSIX shells, plus PowerShell 7 if the user installed it.
    return [auto, { value: 'bash', label: 'bash' }, { value: 'zsh', label: 'zsh' }, { value: 'pwsh', label: 'PS 7' }];
  }, [platform]);

  const clearBrowserData = async () => {
    const ok = await confirm({
      title: 'Clear browsing data?',
      message: "Cookies, history and saved site data for Asyncat's built-in browser will be cleared, so you'll be signed out of sites there. Your system browser is not affected.",
      confirmLabel: 'Clear data',
      destructive: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      if (window.electronAPI?.clearBrowserData) {
        await window.electronAPI.clearBrowserData({ profile: prefs.browserProfile });
      }
      sessionStorage.removeItem('asyncat_web_tabs');
      sessionStorage.removeItem('asyncat_web_recently_closed');
      const mainUrl = import.meta.env.VITE_MAIN_URL || 'http://127.0.0.1:8716';
      const response = await fetch(`${mainUrl}/api/browser/history`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error("Couldn't clear the browser history.");
      toast.success('Browsing data cleared', { detail: 'Open pages may need to be reloaded.' });
    } catch (error) {
      toast.error("Couldn't clear browsing data", { detail: errorDetail(error) });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-8" data-workbench>
      <SettingsSection icon={AppWindow} title="Layout" hint="Drag a dock's edge to resize it; Asyncat remembers the size.">
        <RowGroup>
          <SettingsRow label="Terminal position" hint={`${POSITION_HINTS[prefs.terminalPosition] || ''} Small windows always use the bottom.`}>
            <Segmented
              value={prefs.terminalPosition}
              onChange={(value) => setPreference('terminalPosition', value)}
              items={[{ value: 'bottom', label: 'Bottom' }, { value: 'right', label: 'Right' }]}
              label="Terminal position"
              role="radiogroup"
            />
          </SettingsRow>
          <Toggle label="Reopen panels" hint="Bring back the browser and terminal you had open when you return to a chat." checked={prefs.restoreOpenPanels} onChange={(value) => setPreference('restoreOpenPanels', value)} />
          <SettingsRow label="Panel sizes" hint="Put the right and bottom docks back to their first size.">
            <Button onClick={resetWorkbenchLayout}>Reset</Button>
          </SettingsRow>
        </RowGroup>
      </SettingsSection>

      <SettingsSection icon={SquareTerminal} title="Terminal" hint="For new terminals. Open ones keep what they started with.">
        <RowGroup>
          <SettingsRow label="Shell" hint={prefs.terminalShell === 'auto' && platform !== 'win32' ? "Auto uses your account's usual shell." : null}>
            <Segmented value={prefs.terminalShell} onChange={(value) => setPreference('terminalShell', value)} items={shellOptions} label="Shell" role="radiogroup" />
          </SettingsRow>
          <SettingsRow label="Starts in" hint={FOLDER_HINTS[prefs.terminalStartDirectory]}>
            <Segmented
              value={prefs.terminalStartDirectory}
              onChange={(value) => setPreference('terminalStartDirectory', value)}
              items={[{ value: 'working', label: 'Project folder' }, { value: 'home', label: 'Home folder' }]}
              label="Terminal starts in"
              role="radiogroup"
            />
          </SettingsRow>
          <SettingsRow label="Text size">
            <Select
              value={String(prefs.terminalFontSize)}
              onChange={(value) => setPreference('terminalFontSize', Number(value))}
              options={FONT_SIZES}
              fullWidth={false}
              className="w-28"
              aria-label="Terminal text size"
            />
          </SettingsRow>
          <Toggle label="Ask before closing a running terminal" hint="When a terminal may still be running a command." checked={prefs.terminalConfirmClose} onChange={(value) => setPreference('terminalConfirmClose', value)} />
        </RowGroup>
      </SettingsSection>

      <SettingsSection icon={Globe2} title="Browser" hint="The built-in browser keeps its sign-ins apart from Asyncat and your usual browser. Its tabs stay open while Asyncat runs, even with the panel closed.">
        <div className="space-y-3">
          <RowGroup>
            <SettingsRow label="Browsing mode" hint={MODE_HINTS[prefs.browserProfile]}>
              <Segmented
                value={prefs.browserProfile}
                onChange={(value) => setPreference('browserProfile', value)}
                items={[{ value: 'incognito', label: 'Incognito' }, { value: 'persistent', label: 'Standard' }]}
                label="Browsing mode"
                role="radiogroup"
              />
            </SettingsRow>
            <SettingsRow label="Search engine" hint="For what you type in the address bar that isn't an address.">
              <Segmented
                value={prefs.browserSearchEngine}
                onChange={(value) => setPreference('browserSearchEngine', value)}
                items={[{ value: 'brave', label: 'Brave' }, { value: 'google', label: 'Google' }, { value: 'duckduckgo', label: 'DuckDuckGo' }, { value: 'bing', label: 'Bing' }]}
                label="Search engine"
                role="radiogroup"
              />
            </SettingsRow>
            <SettingsRow label="Open web links in" hint={LINK_HINTS[prefs.browserOpenLinks]}>
              <Segmented
                value={prefs.browserOpenLinks}
                onChange={(value) => setPreference('browserOpenLinks', value)}
                items={[{ value: 'internal', label: 'Asyncat' }, { value: 'system', label: 'Your browser' }]}
                label="Open web links in"
                role="radiogroup"
              />
            </SettingsRow>
            <Toggle label="Save browsing history" hint="Titles and addresses of Standard pages, kept on this computer. Incognito saves none." checked={prefs.browserHistoryEnabled} onChange={(value) => setPreference('browserHistoryEnabled', value)} />
            <Toggle label="Reopen tabs at start" hint="Standard tabs come back after a restart and load when you first show them. Incognito and agent tabs never do." checked={prefs.browserRestoreTabs} onChange={(value) => setPreference('browserRestoreTabs', value)} />
            <Toggle label="Developer tools" hint="Inspect pages from the browser's menu." checked={prefs.browserDeveloperTools} onChange={(value) => setPreference('browserDeveloperTools', value)} />
            <SettingsRow label="Browsing data" hint="Clear history, cache, cookies and site data. Incognito clears its own when you leave it or close its last tab.">
              <Button variant="danger" loading={clearing} onClick={clearBrowserData}>{clearing ? 'Clearing…' : 'Clear data…'}</Button>
            </SettingsRow>
          </RowGroup>
          <Notice>Sites get no permissions, such as the camera, by default; you are asked when a page requests one. Files downloaded in Incognito stay in your Downloads folder.</Notice>
        </div>
      </SettingsSection>
    </div>
  );
}

Toggle.propTypes = {
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  checked: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
};
