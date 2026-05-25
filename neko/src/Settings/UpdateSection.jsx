import { useState, useEffect } from 'react';
import { RefreshCw, ArrowUpCircle, CheckCircle2, XCircle, Loader2, ExternalLink, Package } from 'lucide-react';
import { updateApi } from './settingApi';

const RELEASES_URL = 'https://github.com/asyncat-oss/asyncat-oss/releases';

const isPackaged = window.electronAPI?.isPackaged === true;

const soraFontBase = 'font-sora';

const UpdateSection = () => {
  const [localInfo, setLocalInfo] = useState(null);

  // ─── Packaged build: electron-updater state ──────────────────────────────
  const [pkgStatus, setPkgStatus] = useState(null); // null|'checking'|'up-to-date'|'available'|'downloading'|'downloaded'|'error'
  const [pkgUpdateInfo, setPkgUpdateInfo] = useState(null);
  const [pkgProgress, setPkgProgress] = useState(null);
  const [pkgError, setPkgError] = useState(null);
  const [platform, setPlatform] = useState(null);

  useEffect(() => {
    loadLocalInfo();
  }, []);

  // Register electron-updater listeners
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getPlatform().then(p => setPlatform(p));
    window.electronAPI.onUpdateChecking(() => setPkgStatus('checking'));
    window.electronAPI.onUpdateAvailable((info) => { setPkgStatus('available'); setPkgUpdateInfo(info); });
    window.electronAPI.onUpdateNotAvailable((info) => { setPkgStatus('up-to-date'); setPkgUpdateInfo(info); });
    window.electronAPI.onUpdateProgress((p) => { setPkgStatus('downloading'); setPkgProgress(p); });
    window.electronAPI.onUpdateDownloaded((info) => { setPkgStatus('downloaded'); setPkgUpdateInfo(info); });
    window.electronAPI.onUpdateError((msg) => { setPkgStatus('error'); setPkgError(msg); });
    return () => {
      ['update:checking', 'update:available', 'update:not-available', 'update:progress', 'update:downloaded', 'update:error']
        .forEach(ch => window.electronAPI.removeAllListeners(ch));
    };
  }, []);

  const loadLocalInfo = async () => {
    try {
      const data = await updateApi.getStatus();
      if (data.success) setLocalInfo(data);
    } catch {
      // Version info is optional — fail silently
    }
  };

  const handleCheckForUpdates = async () => {
    setPkgStatus('checking');
    setPkgError(null);
    const result = await window.electronAPI?.checkForUpdates();
    if (result && !result.success) {
      setPkgStatus('error');
      setPkgError(result.error || 'Check failed');
    }
  };

  const handleDownloadUpdate = async () => {
    const result = await window.electronAPI?.downloadUpdate();
    if (result && !result.success) {
      setPkgStatus('error');
      setPkgError(result.error || 'Download failed');
    }
  };

  const isMac = platform === 'darwin';

  return (
    <div className={`space-y-6 ${soraFontBase}`}>

      {/* Current version */}
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
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Install type</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Desktop app</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2].map(i => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 animate-pulse" />
            ))}
          </div>
        )}
      </div>

      {/* Auto-update */}
      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpCircle size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Updates
          </h3>
        </div>

        {/* dev-mode notice */}
        {!isPackaged && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Update checks are only available in packaged builds. Run{' '}
            <code className="font-mono px-1 rounded bg-gray-100 dark:bg-gray-800">npm run electron:build</code>{' '}
            to produce a distributable, or visit{' '}
            <a href={RELEASES_URL} target="_blank" rel="noreferrer"
              className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              GitHub Releases
            </a>{' '}
            to download the latest version.
          </p>
        )}

        {/* idle or up-to-date */}
        {isPackaged && (!pkgStatus || pkgStatus === 'up-to-date') && (
          <div className="space-y-3">
            {pkgStatus === 'up-to-date' && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 size={15} />
                <span>You're on the latest version</span>
                {pkgUpdateInfo?.version && (
                  <span className="text-xs text-gray-400 ml-1">v{pkgUpdateInfo.version}</span>
                )}
              </div>
            )}
            <button
              onClick={handleCheckForUpdates}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
                midnight:bg-slate-800 midnight:hover:bg-slate-700
                text-gray-700 dark:text-gray-200 midnight:text-slate-200 transition-colors"
            >
              <RefreshCw size={14} />
              {pkgStatus === 'up-to-date' ? 'Check again' : 'Check for updates'}
            </button>
          </div>
        )}

        {/* checking */}
        {isPackaged && pkgStatus === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 size={15} className="animate-spin" />
            <span>Checking for updates…</span>
          </div>
        )}

        {/* update available */}
        {isPackaged && pkgStatus === 'available' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <ArrowUpCircle size={15} />
              <span>
                Version <strong>v{pkgUpdateInfo?.version}</strong> is available
              </span>
            </div>
            {pkgUpdateInfo?.releaseDate && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Released {new Date(pkgUpdateInfo.releaseDate).toLocaleDateString()}.
                {' '}Download and install to get the latest features and fixes.
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleDownloadUpdate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600
                  text-white transition-colors"
              >
                <ArrowUpCircle size={14} />
                Download update
              </button>
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                <ExternalLink size={12} />
                View release notes
              </a>
            </div>
          </div>
        )}

        {/* downloading */}
        {isPackaged && pkgStatus === 'downloading' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
              <Loader2 size={15} className="animate-spin" />
              <span>Downloading v{pkgUpdateInfo?.version}…</span>
              {pkgProgress?.percent != null && (
                <span className="text-xs text-gray-400 ml-1">
                  {Math.round(pkgProgress.percent)}%
                </span>
              )}
            </div>
            {pkgProgress?.percent != null && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(pkgProgress.percent)}%` }}
                />
              </div>
            )}
            {pkgProgress?.bytesPerSecond != null && (
              <p className="text-xs text-gray-400 tabular-nums">
                {(pkgProgress.transferred / 1048576).toFixed(1)} MB
                {' / '}
                {(pkgProgress.total / 1048576).toFixed(1)} MB
                {'  ·  '}
                {(pkgProgress.bytesPerSecond / 1024).toFixed(0)} KB/s
              </p>
            )}
          </div>
        )}

        {/* downloaded — ready to install */}
        {isPackaged && pkgStatus === 'downloaded' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 size={15} />
              <span>v{pkgUpdateInfo?.version} is ready to install</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isMac
                ? 'Download the latest DMG from GitHub Releases, drag it to Applications, and relaunch.'
                : 'The app will quit and restart automatically to apply the update.'}
            </p>
            <button
              onClick={() => window.electronAPI?.installUpdate()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600
                text-white transition-colors"
            >
              {isMac ? <ExternalLink size={14} /> : <ArrowUpCircle size={14} />}
              {isMac ? 'Open Releases Page' : 'Install and Restart'}
            </button>
          </div>
        )}

        {/* error */}
        {isPackaged && pkgStatus === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <XCircle size={15} />
              <span>{pkgError || 'Update check failed'}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleCheckForUpdates}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
                  midnight:bg-slate-800 midnight:hover:bg-slate-700
                  text-gray-700 dark:text-gray-200 midnight:text-slate-200 transition-colors"
              >
                <RefreshCw size={14} />
                Try again
              </button>
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                <ExternalLink size={12} />
                View releases manually
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateSection;
