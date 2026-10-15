// Settings → Desktop: what only the desktop app has. The pet, how to open
// Quick ask (its shortcut is changed in Shortcuts), and the folder Asyncat
// keeps its data in, with the uninstaller on Windows.

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, MessageCircle, Trash2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import PetSection from './PetSection.jsx';
import Keys from './Keys.jsx';
import { formatAccelerator } from './globalShortcutText.js';

function quickAskHint(entry, platform, wayland) {
  if (!entry) return '';
  const tray = platform === 'linux' ? ' It is in the tray menu too.' : '';
  if (!entry.enabled) return `Its shortcut is off.${tray}`;
  if (wayland) return `On Wayland, add the shortcut in your desktop's keyboard settings; Shortcuts shows the command.${tray}`;
  return `Press these keys in any app.${tray}`;
}

function QuickAsk({ api }) {
  const navigate = useNavigate();
  const [entry, setEntry] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [wayland, setWayland] = useState(false);

  useEffect(() => {
    api.getGlobalShortcuts?.().then((all) => setEntry(all?.quickAsk || null)).catch(() => {});
    api.getPlatform?.().then(setPlatform).catch(() => {});
    api.getQuickAskCommand?.().then((info) => setWayland(Boolean(info?.wayland))).catch(() => {});
  }, [api]);

  const keys = entry?.enabled ? formatAccelerator(entry.accelerator, platform === 'darwin') : [];
  return (
    <SettingsSection icon={MessageCircle} title="Quick ask" hint="A small window for a quick question, over whatever app you are in." data-settings-section="quick-ask" className="scroll-mt-6">
      <RowGroup>
        <SettingsRow label="Open it" hint={quickAskHint(entry, platform, wayland)}>
          <div className="flex items-center gap-3">
            <Keys keys={keys} />
            <Button size="sm" onClick={() => navigate('/settings/shortcuts')}>Change shortcut</Button>
          </div>
        </SettingsRow>
      </RowGroup>
    </SettingsSection>
  );
}

QuickAsk.propTypes = { api: PropTypes.object.isRequired };

function AppData({ api }) {
  const [platform, setPlatform] = useState(null);
  const [error, setError] = useState(null);
  const [uninstalling, setUninstalling] = useState(false);

  useEffect(() => {
    api.getPlatform?.().then(setPlatform).catch(() => {});
  }, [api]);

  const openFolder = async () => {
    setError(null);
    const result = await api.openUserDataFolder?.();
    if (result && !result.success) setError(result.error || "Couldn't open Asyncat's data folder.");
  };

  const uninstall = async () => {
    setError(null);
    setUninstalling(true);
    const result = await api.uninstallApp?.();
    if (result && !result.success) setError(result.error || "Couldn't open the Asyncat uninstaller.");
    if (!result?.launched) setUninstalling(false);
  };

  return (
    <SettingsSection icon={FolderOpen} title="App data" data-settings-section="app-data" className="scroll-mt-6">
      <RowGroup>
        <SettingsRow
          label="Asyncat's data folder"
          hint="Chats, settings, browser data, logs and engines. Project folders you added live elsewhere and are never removed with it."
        >
          <Button icon={FolderOpen} onClick={openFolder}>Open folder</Button>
        </SettingsRow>
        {platform === 'win32' && api.isPackaged === true ? (
          <SettingsRow label="Uninstall Asyncat" hint="The uninstaller asks whether to keep the data folder for a later reinstall.">
            <Button variant="danger" icon={Trash2} loading={uninstalling} onClick={uninstall}>
              {uninstalling ? 'Opening the uninstaller…' : 'Uninstall…'}
            </Button>
          </SettingsRow>
        ) : null}
      </RowGroup>
      {error ? <Notice tone="error" className="mt-3">{error}</Notice> : null}
    </SettingsSection>
  );
}

AppData.propTypes = { api: PropTypes.object.isRequired };

export default function DesktopSection() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (!api?.setPet) {
    return <Notice>These settings are for the Asyncat desktop app.</Notice>;
  }
  return (
    <div className="space-y-8" data-desktop>
      <div data-settings-section="pet" className="scroll-mt-6">
        <PetSection />
      </div>
      <QuickAsk api={api} />
      <AppData api={api} />
    </div>
  );
}
