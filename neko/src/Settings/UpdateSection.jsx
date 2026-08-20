import { useEffect, useState } from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Loader2,
  Package,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { updateApi } from './settingApi';

const RELEASES_URL = 'https://github.com/asyncat-oss/asyncat-oss/releases';
const isPackaged = window.electronAPI?.isPackaged === true;
const settingsFontBase = 'font-sans';

function publishUpdateFlag(available) {
  sessionStorage.setItem('asyncatUpdateAvailable', available ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('asyncat:update-flag', { detail: available }));
}

function installInstructions(platform) {
  if (platform === 'darwin') {
    return 'Quit Asyncat, open the downloaded DMG, drag Asyncat to Applications, choose Replace, and relaunch.';
  }
  if (platform === 'linux') {
    return 'Quit Asyncat, then replace your AppImage or install the downloaded DEB over the current version.';
  }
  return 'Quit Asyncat and run the downloaded installer over your current installation.';
}

const UpdateSection = () => {
  const [localInfo, setLocalInfo] = useState(null);
  const [status, setStatus] = useState(null); // null|'checking'|'up-to-date'|'available'|'opening'|'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [maintenanceError, setMaintenanceError] = useState(null);
  const [uninstalling, setUninstalling] = useState(false);

  useEffect(() => {
    updateApi.getStatus()
      .then((data) => { if (data.success) setLocalInfo(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return undefined;

    api.getPlatform().then(setPlatform);
    const cleanups = [
      api.onUpdateChecking(() => setStatus('checking')),
      api.onUpdateAvailable((info) => {
        publishUpdateFlag(true);
        setStatus('available');
        setUpdateInfo(info);
      }),
      api.onUpdateNotAvailable((info) => {
        publishUpdateFlag(false);
        setStatus('up-to-date');
        setUpdateInfo(info);
      }),
      api.onUpdateError((message) => {
        setStatus('error');
        setError(message);
      }),
    ];

    // Opening Settings after the startup check should still show fresh state.
    if (isPackaged) api.checkForUpdates();

    return () => cleanups.forEach((cleanup) => {
      if (typeof cleanup === 'function') cleanup();
    });
  }, []);

  const handleCheckForUpdates = async () => {
    setStatus('checking');
    setError(null);
    const result = await window.electronAPI?.checkForUpdates();
    if (result && !result.success) {
      setStatus('error');
      setError(result.error || 'Update check failed.');
    }
  };

  const handleDownloadUpdate = async () => {
    setStatus('opening');
    setError(null);
    const result = await window.electronAPI?.downloadUpdate();
    if (result && !result.success) {
      setStatus('error');
      setError(result.error || 'Could not open the installer download.');
      return;
    }
    setStatus('available');
  };

  const openReleaseNotes = () => {
    window.electronAPI?.openReleasesPage(updateInfo?.releaseUrl || RELEASES_URL);
  };

  const handleOpenUserData = async () => {
    setMaintenanceError(null);
    const result = await window.electronAPI?.openUserDataFolder();
    if (result && !result.success) setMaintenanceError(result.error || 'Could not open the Asyncat data folder.');
  };

  const handleUninstall = async () => {
    setMaintenanceError(null);
    setUninstalling(true);
    const result = await window.electronAPI?.uninstallApp();
    if (result && !result.success) setMaintenanceError(result.error || 'Could not launch the Asyncat uninstaller.');
    if (!result?.launched) setUninstalling(false);
  };

  return (
    <div className={`space-y-6 ${settingsFontBase}`}>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Package size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Current Version
          </h3>
        </div>
        {localInfo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-900/60 border border-gray-200/60 dark:border-gray-700/40 midnight:border-slate-700/40">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Version</p>
              <p className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">v{localInfo.version}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-900/60 border border-gray-200/60 dark:border-gray-700/40 midnight:border-slate-700/40">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Update channel</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Public beta</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2].map((item) => (
              <div key={item} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 animate-pulse" />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpCircle size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Updates
          </h3>
        </div>

        {!isPackaged && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Update checks are available in packaged builds. Development installs update through Git.
          </p>
        )}

        {isPackaged && (!status || status === 'up-to-date') && (
          <div className="space-y-3">
            {status === 'up-to-date' && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 size={15} />
                <span>You are on the latest version</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleCheckForUpdates}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 midnight:bg-slate-800 midnight:hover:bg-slate-700 text-gray-700 dark:text-gray-200 midnight:text-slate-200 transition-colors"
            >
              <RefreshCw size={14} />
              {status === 'up-to-date' ? 'Check again' : 'Check for updates'}
            </button>
          </div>
        )}

        {isPackaged && status === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 size={15} className="animate-spin" />
            <span>Checking GitHub Releases…</span>
          </div>
        )}

        {isPackaged && (status === 'available' || status === 'opening') && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <ArrowUpCircle size={15} />
              <span>Version <strong>v{updateInfo?.version}</strong> is available</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {installInstructions(platform)} Your settings and local data are kept.
            </p>
            {!updateInfo?.assetUrl && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                The exact {platform || 'platform'} installer was not found, so the button will open the release page.
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                disabled={status === 'opening'}
                onClick={handleDownloadUpdate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white transition-colors"
              >
                {status === 'opening' ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                {status === 'opening' ? 'Opening download…' : 'Download installer'}
              </button>
              <button
                type="button"
                onClick={openReleaseNotes}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                <ExternalLink size={12} />
                View release notes
              </button>
            </div>
          </div>
        )}

        {isPackaged && status === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <XCircle size={15} />
              <span>{error || 'Update check failed.'}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleCheckForUpdates}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 midnight:bg-slate-800 midnight:hover:bg-slate-700 text-gray-700 dark:text-gray-200 midnight:text-slate-200 transition-colors"
              >
                <RefreshCw size={14} />
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.electronAPI?.openReleasesPage(RELEASES_URL)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                <ExternalLink size={12} />
                Open GitHub Releases
              </button>
            </div>
          </div>
        )}
      </div>

      {isPackaged && (
        <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen size={18} className="text-gray-500 dark:text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
              Installation &amp; local data
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
            Asyncat keeps conversations, settings, browser data, logs, and local runtime files in your OS user-data folder.
            Uninstalling can preserve that folder for a later reinstall or remove it for a clean uninstall. Attached
            Project folders stored outside this location are not removed.
          </p>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleOpenUserData}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 midnight:bg-slate-800 midnight:hover:bg-slate-700 text-gray-700 dark:text-gray-200 midnight:text-slate-200 transition-colors"
            >
              <FolderOpen size={14} />
              Open data folder
            </button>
            {platform === 'win32' && (
              <button
                type="button"
                disabled={uninstalling}
                onClick={handleUninstall}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
              >
                {uninstalling ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {uninstalling ? 'Opening uninstaller…' : 'Uninstall Asyncat'}
              </button>
            )}
          </div>
          {maintenanceError && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <XCircle size={14} />
              <span>{maintenanceError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UpdateSection;
