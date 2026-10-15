// Settings → About → Version: which Asyncat this is, its update channel, and
// checking for a new one (electron/updater.js; installing opens the update
// screen).

import { useEffect, useState } from 'react';
import { ExternalLink, Info, RefreshCw } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { PropertyRow, RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { updateApi } from './settingApi';
import { openUpdateScreen } from '../components/updateEvents.js';

const RELEASES_URL = 'https://github.com/asyncat-oss/asyncat-oss/releases';
const isPackaged = window.electronAPI?.isPackaged === true;

function publishUpdateFlag(available) {
  sessionStorage.setItem('asyncatUpdateAvailable', available ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('asyncat:update-flag', { detail: available }));
}

const UpdateSection = () => {
  const [localInfo, setLocalInfo] = useState(null);
  const [status, setStatus] = useState(null); // null|'checking'|'up-to-date'|'available'|'opening'|'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState(null);

  useEffect(() => {
    updateApi.getStatus()
      .then((data) => { if (data.success) setLocalInfo(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return undefined;

    api.getPlatform?.().then(setPlatform);
    const cleanups = [
      api.onUpdateChecking?.(() => setStatus('checking')),
      api.onUpdateAvailable?.((info) => {
        publishUpdateFlag(true);
        setStatus('available');
        setUpdateInfo(info);
      }),
      api.onUpdateNotAvailable?.((info) => {
        publishUpdateFlag(false);
        setStatus('up-to-date');
        setUpdateInfo(info);
      }),
      api.onUpdateError?.((message) => {
        setStatus('error');
        setError(message);
      }),
    ];

    // Opening Settings after the startup check should still show fresh state.
    if (isPackaged) api.checkForUpdates?.();

    return () => cleanups.forEach((cleanup) => {
      if (typeof cleanup === 'function') cleanup();
    });
  }, []);

  const checkForUpdates = async () => {
    setStatus('checking');
    setError(null);
    const result = await window.electronAPI?.checkForUpdates({ force: true });
    if (result && !result.success) {
      setStatus('error');
      setError(result.error || "Couldn't check for updates.");
    }
  };

  const openReleases = (url) => window.electronAPI?.openReleasesPage(url || RELEASES_URL);

  const beta = String(localInfo?.version || '').includes('-');

  let updateHint;
  let updateControl = null;
  if (!isPackaged) {
    updateHint = 'Update checks are in the installed app. A copy run from source updates through Git.';
  } else if (status === 'checking') {
    updateHint = 'Checking GitHub Releases…';
    updateControl = <Button icon={RefreshCw} loading>Checking…</Button>;
  } else if (status === 'available' || status === 'opening') {
    updateHint = (
      <>
        <span className="block font-medium text-fg">Version v{updateInfo?.version} is ready.</span>
        <span className="block">
          {platform === 'darwin'
            ? 'Asyncat downloads and checks it; then you drag it into Applications.'
            : 'Asyncat downloads it, checks it and installs it.'} Your settings and data stay.
        </span>
        {!updateInfo?.assetUrl ? (
          <span className="block text-amber-700 dark:text-amber-400">There is no installer for {platform || 'this computer'} in it, so Update opens the release page.</span>
        ) : null}
      </>
    );
    updateControl = (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" icon={ExternalLink} onClick={() => openReleases(updateInfo?.releaseUrl)}>Release notes</Button>
        <Button variant="primary" disabled={status === 'opening'} onClick={() => openUpdateScreen()}>Update…</Button>
      </div>
    );
  } else if (status === 'error') {
    updateHint = <span className="text-red-600 dark:text-red-400">{error || "Couldn't check for updates."}</span>;
    updateControl = (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" icon={ExternalLink} onClick={() => openReleases()}>GitHub Releases</Button>
        <Button icon={RefreshCw} onClick={checkForUpdates}>Try again</Button>
      </div>
    );
  } else {
    updateHint = status === 'up-to-date' ? 'You have the latest version.' : 'Asyncat looks for a new version when it starts.';
    updateControl = <Button icon={RefreshCw} onClick={checkForUpdates}>{status === 'up-to-date' ? 'Check again' : 'Check for updates'}</Button>;
  }

  return (
    <SettingsSection icon={Info} title="Version" data-version>
      {localInfo ? (
        <RowGroup>
          <PropertyRow
            label="Asyncat"
            value={<span className="font-mono text-[12px]">v{localInfo.version}</span>}
            meta={beta ? 'Beta channel: betas and stable releases' : 'Stable channel: stable releases only'}
          />
          <SettingsRow label="Updates" hint={updateHint}>{updateControl}</SettingsRow>
        </RowGroup>
      ) : <Skeleton className="h-[122px] rounded-xl" />}
    </SettingsSection>
  );
};

export default UpdateSection;
