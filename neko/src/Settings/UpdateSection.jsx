import { useState, useEffect, useRef } from 'react';
import { RefreshCw, GitBranch, GitCommit, ArrowUpCircle, CheckCircle2, XCircle, Loader2, Terminal, Trash2, AlertTriangle } from 'lucide-react';
import { updateApi } from './settingApi';

const soraFontBase = 'font-sora';

const UpdateSection = () => {
  const [localInfo, setLocalInfo] = useState(null);
  const [checkResult, setCheckResult] = useState(null); // { behind, latestHash }
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateDone, setUpdateDone] = useState(null); // 'success' | 'error'
  const [logs, setLogs] = useState([]);
  const [statusError, setStatusError] = useState(null);
  const [purgeInstall, setPurgeInstall] = useState(false);
  const [uninstallConfirm, setUninstallConfirm] = useState('');
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallError, setUninstallError] = useState(null);
  const [uninstallDone, setUninstallDone] = useState(null);
  const logRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    loadLocalInfo();
    return () => cleanupRef.current?.();
  }, []);

  // Auto-scroll log box
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const loadLocalInfo = async () => {
    try {
      const data = await updateApi.getStatus();
      if (data.success) setLocalInfo(data);
      else setStatusError(data.error || 'Could not read git info');
    } catch (e) {
      setStatusError(e.message || 'Could not reach backend');
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    setStatusError(null);
    try {
      const data = await updateApi.check();
      if (data.success) {
        setCheckResult(data);
      } else {
        setStatusError(data.error || 'Check failed');
      }
    } catch (e) {
      setStatusError(e.message || 'Network error during check');
    } finally {
      setChecking(false);
    }
  };

  const handleUpdate = () => {
    setUpdating(true);
    setUpdateDone(null);
    setLogs([]);

    cleanupRef.current = updateApi.apply(
      (text) => setLogs(prev => [...prev, { type: 'log', text }]),
      (text) => {
        setLogs(prev => [...prev, { type: 'done', text }]);
        setUpdating(false);
        setUpdateDone('success');
        // Refresh local info to show new hash/version
        loadLocalInfo();
      },
      (text) => {
        setLogs(prev => [...prev, { type: 'error', text }]);
        setUpdating(false);
        setUpdateDone('error');
      }
    );
  };

  const requiredUninstallText = purgeInstall ? 'delete all asyncat data' : 'uninstall asyncat';
  const canUninstall = uninstallConfirm.trim().toLowerCase() === requiredUninstallText && !uninstalling;

  const handleUninstall = async () => {
    setUninstalling(true);
    setUninstallError(null);
    setUninstallDone(null);
    try {
      const result = await updateApi.uninstall({
        purge: purgeInstall,
        confirm: uninstallConfirm.trim().toLowerCase(),
      });
      setUninstallDone(result.message || 'Uninstall started. Asyncat will shut down.');
    } catch (e) {
      setUninstallError(e.message || 'Uninstall failed');
      setUninstalling(false);
    }
  };

  const upToDate = checkResult && checkResult.behind === 0;
  const hasPending = checkResult && checkResult.behind > 0;

  return (
    <div className={`space-y-6 ${soraFontBase}`}>

      {/* Current version card */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <GitCommit size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Current Version
          </h3>
        </div>

        {statusError && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {statusError}
          </div>
        )}

        {localInfo ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/40">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Version</p>
              <p className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">v{localInfo.version}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/40">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Commit</p>
              <p className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">{localInfo.currentHash}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/40">
              <div className="flex items-center gap-1 mb-1">
                <GitBranch size={11} className="text-gray-400 dark:text-gray-500" />
                <p className="text-xs text-gray-400 dark:text-gray-500">Branch</p>
              </div>
              <p className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100 truncate">{localInfo.branch}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}
      </div>

      {/* Check for updates */}
      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Check for Updates
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Compares your local commit against the remote repository. Requires internet access.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleCheck}
            disabled={checking || updating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
              midnight:bg-gray-800 midnight:hover:bg-gray-700
              text-gray-700 dark:text-gray-200 midnight:text-gray-200
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {checking
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />
            }
            {checking ? 'Checking...' : 'Check for updates'}
          </button>

          {upToDate && (
            <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 size={15} />
              <span>You're up to date</span>
              {checkResult.latestHash && (
                <span className="text-xs font-mono text-gray-400 ml-1">({checkResult.latestHash})</span>
              )}
            </div>
          )}

          {hasPending && (
            <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
              <ArrowUpCircle size={15} />
              <span>
                <strong>{checkResult.behind}</strong> commit{checkResult.behind !== 1 ? 's' : ''} behind
              </span>
              {checkResult.latestHash && (
                <span className="text-xs font-mono text-gray-400 ml-1">→ {checkResult.latestHash}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Apply update */}
      {hasPending && (
        <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpCircle size={18} className="text-indigo-500 dark:text-indigo-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
              Apply Update
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Pulls the latest changes via git and reinstalls dependencies. Local uncommitted changes are stashed and restored automatically.
          </p>

          <button
            onClick={handleUpdate}
            disabled={updating || updateDone === 'success'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600
              text-white
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {updating
              ? <Loader2 size={14} className="animate-spin" />
              : <ArrowUpCircle size={14} />
            }
            {updating ? 'Updating...' : 'Update now'}
          </button>
        </div>
      )}

      {/* Live log output */}
      {logs.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={16} className="text-gray-500 dark:text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
              Output
            </h3>
            {updateDone === 'success' && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 ml-auto">
                <CheckCircle2 size={13} />
                Done
              </div>
            )}
            {updateDone === 'error' && (
              <div className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 ml-auto">
                <XCircle size={13} />
                Failed
              </div>
            )}
            {updating && (
              <Loader2 size={13} className="animate-spin text-indigo-500 ml-auto" />
            )}
          </div>

          <div
            ref={logRef}
            className="h-64 overflow-y-auto rounded-lg bg-gray-950 dark:bg-gray-950 midnight:bg-gray-950
              border border-gray-800 p-3 font-mono text-xs leading-relaxed"
          >
            {logs.map((entry, i) => (
              <span
                key={i}
                className={
                  entry.type === 'done'
                    ? 'text-green-400'
                    : entry.type === 'error'
                    ? 'text-red-400'
                    : 'text-gray-300'
                }
              >
                {entry.text}
              </span>
            ))}
            {updating && (
              <span className="inline-block w-2 h-3 bg-gray-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>

          {updateDone === 'success' && (
            <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
              Update applied. Run <code className="px-1 py-0.5 rounded bg-green-100 dark:bg-green-800 midnight:bg-green-800 text-xs">asyncat restart</code> in your terminal to reload.
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 size={18} className="text-red-500 dark:text-red-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Uninstall
          </h3>
        </div>

        <div className="rounded-lg border border-red-200/70 dark:border-red-900/50 midnight:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 midnight:bg-red-950/20 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-800 dark:text-red-300 midnight:text-red-300">
                Remove Asyncat from this machine
              </p>
              <p className="text-xs text-red-700/80 dark:text-red-300/80 midnight:text-red-300/80 mt-1 leading-5">
                This stops the local services and removes launchers, icons, and the global npm wrapper.
                Local data is kept unless full cleanup is enabled.
              </p>
              {localInfo?.installDir && (
                <p className="text-xs font-mono text-red-700/70 dark:text-red-300/70 midnight:text-red-300/70 mt-2 truncate">
                  {localInfo.installDir}
                </p>
              )}
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm text-red-800 dark:text-red-300 midnight:text-red-300">
            <input
              type="checkbox"
              checked={purgeInstall}
              onChange={(e) => {
                setPurgeInstall(e.target.checked);
                setUninstallConfirm('');
                setUninstallError(null);
              }}
              disabled={uninstalling || Boolean(uninstallDone)}
              className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
            />
            <span>
              Also delete local data, database, downloaded models, managed engines, and sessions.
            </span>
          </label>

          <div>
            <label className="block text-xs font-medium text-red-800 dark:text-red-300 midnight:text-red-300 mb-1">
              Type <span className="font-mono">{requiredUninstallText}</span>
            </label>
            <input
              value={uninstallConfirm}
              onChange={(e) => {
                setUninstallConfirm(e.target.value);
                setUninstallError(null);
              }}
              disabled={uninstalling || Boolean(uninstallDone)}
              className="w-full rounded-lg border border-red-200 dark:border-red-900/60 midnight:border-red-900/60 bg-white dark:bg-gray-950 midnight:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {uninstallError && (
            <div className="text-sm text-red-700 dark:text-red-300 midnight:text-red-300">
              {uninstallError}
            </div>
          )}

          {uninstallDone && (
            <div className="text-sm text-green-700 dark:text-green-300 midnight:text-green-300">
              {uninstallDone}
            </div>
          )}

          <button
            onClick={handleUninstall}
            disabled={!canUninstall || Boolean(uninstallDone)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {uninstalling ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {uninstalling ? 'Uninstalling...' : purgeInstall ? 'Uninstall and delete data' : 'Uninstall Asyncat'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateSection;
