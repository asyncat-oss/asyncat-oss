// components/TopMenuBar.jsx - OS-style top menu bar
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpCircle, ServerCrash, Wifi, WifiOff, RotateCw } from "lucide-react";
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

// Network Status Component
const NetworkStatus = () => {
  const network = useNetworkStatus({ pollMs: 6000 });
  const [isRestarting, setIsRestarting] = useState(false);
  const isElectron = !!window.electronAPI?.isElectron;

  const handleRestart = async () => {
    if (!window.electronAPI || isRestarting) return;
    setIsRestarting(true);
    try {
      await window.electronAPI.restartBackend();
    } catch {
      // status will update via polling
    } finally {
      setTimeout(() => setIsRestarting(false), 5000);
    }
  };

  // Only offer restart when the local backend process is unreachable
  const canRestart = isElectron && !network.backendOnline && !isRestarting;

  const status = !network.online
    ? {
        label: "No internet",
        detail: "This device is offline.",
        Icon: WifiOff,
        dotClassName: "bg-red-500",
        iconClassName: "text-red-500 dark:text-red-400 midnight:text-red-400",
        textClassName: "text-red-600 dark:text-red-400 midnight:text-red-400",
      }
    : !network.backendOnline
      ? {
          label: isRestarting ? "Restarting…" : "Backend offline",
          detail: isElectron
            ? (isRestarting ? "Restarting Asyncat backend…" : "Click to restart the backend.")
            : "Local Asyncat services are unreachable.",
          Icon: isRestarting ? RotateCw : ServerCrash,
          dotClassName: isRestarting ? "bg-amber-500 animate-pulse" : "bg-amber-500",
          iconClassName: "text-amber-500 dark:text-amber-400 midnight:text-amber-400",
          textClassName: "text-amber-600 dark:text-amber-400 midnight:text-amber-400",
        }
      : {
          label: "Online",
          detail: "Browser and backend are reachable.",
          Icon: Wifi,
          dotClassName: "bg-emerald-500",
          iconClassName: "text-emerald-500 dark:text-emerald-400 midnight:text-emerald-400",
          textClassName: "text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400",
        };

  const Icon = status.Icon;

  return (
    <div
      className={`relative group flex items-center gap-1.5 rounded-md transition-colors ${
        canRestart
          ? "cursor-pointer px-1.5 py-0.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 midnight:hover:bg-amber-900/20"
          : ""
      }`}
      onClick={canRestart ? handleRestart : undefined}
      role={canRestart ? "button" : undefined}
      title={canRestart ? "Click to restart backend" : undefined}
    >
      <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} />
      <Icon
        className={`h-3.5 w-3.5 ${status.iconClassName} ${isRestarting ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span className={`text-xs font-medium hidden sm:inline ${status.textClassName}`}>
        {status.label}
      </span>
      {/* Tooltip */}
      <div className="pointer-events-none absolute right-0 top-full mt-2 w-max max-w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 dark:bg-gray-800 midnight:bg-gray-800 z-50">
        {status.detail}
      </div>
    </div>
  );
};

// Listens for update events sent from the Electron main process via IPC.
const useElectronUpdates = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.onUpdateAvailable((info) => setUpdateInfo(info));
    api.onUpdateDownloaded((info) => { setUpdateInfo(info); setDownloaded(true); });
  }, []);

  return { updateInfo, downloaded };
};

// Shown when the Electron auto-updater reports a new version is available.
const UpdateIndicator = ({ navigate }) => {
  const { updateInfo, downloaded } = useElectronUpdates();
  if (!updateInfo) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/settings/updates')}
      className="relative flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300 midnight:text-indigo-400 midnight:hover:bg-indigo-900/20 midnight:hover:text-indigo-300"
      title={downloaded ? "Update downloaded — click to install" : `Update available: v${updateInfo.version}`}
    >
      <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">
        {downloaded ? "Restart to update" : `v${updateInfo.version}`}
      </span>
      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-gray-900 midnight:ring-slate-950 animate-pulse" />
    </button>
  );
};

// Main TopMenuBar Component
const TopMenuBar = () => {
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState('');
  const [isVisible, setIsVisible] = useState(() => {
    return localStorage.getItem('topMenuBarVisibility') !== 'hidden';
  });

  useEffect(() => {
    const checkVisibility = () => {
      const visibility = localStorage.getItem('topMenuBarVisibility');
      setIsVisible(visibility !== 'hidden');
    };

    const interval = setInterval(checkVisibility, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    window.electronAPI?.getAppVersion()
      .then(v => setAppVersion(v))
      .catch(() => {});
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[70] h-10 bg-white/90 dark:bg-gray-900/90 midnight:bg-slate-950/95 backdrop-blur-xl">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left side - App Name */}
        <div className="flex items-center gap-4">
          <span
            className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200 select-none"
            title={appVersion ? `Asyncat v${appVersion}` : 'Asyncat'}
          >
            Asyncat
          </span>
        </div>

        {/* Right side - Actions and Status */}
        <div className="flex items-center gap-3">
          {/* Update available indicator (Electron only) */}
          <UpdateIndicator navigate={navigate} />

          <NetworkStatus />
        </div>
      </div>
    </div>
  );
};

export default TopMenuBar;
