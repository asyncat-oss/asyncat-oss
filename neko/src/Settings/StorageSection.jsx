import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Database,
  Eye,
  FileText,
  Folder,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { storageApi, apiUtils } from './settingApi';

const soraFontBase = 'font-sora';

const panelCls =
  'rounded-lg border border-gray-200 dark:border-gray-800 midnight:border-gray-800 ' +
  'bg-white dark:bg-gray-900 midnight:bg-gray-950';

const mutedText = 'text-gray-500 dark:text-gray-400 midnight:text-gray-400';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = index === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className={`${panelCls} p-4`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 text-gray-500 dark:text-gray-400">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className={`text-xs ${mutedText}`}>{label}</div>
          <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {value}
          </div>
          {hint ? <div className={`mt-0.5 text-xs truncate ${mutedText}`}>{hint}</div> : null}
        </div>
      </div>
    </div>
  );
}

function DiskBar({ disk }) {
  if (!disk) {
    return (
      <div className={`${panelCls} p-4 text-sm ${mutedText}`}>
        Disk details are unavailable on this platform.
      </div>
    );
  }

  const usedPercent = Math.min(100, Math.max(0, disk.usedPercent || 0));

  return (
    <div className={`${panelCls} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Machine Disk
          </div>
          <div className={`mt-0.5 text-xs truncate ${mutedText}`}>{disk.path}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {usedPercent}%
          </div>
          <div className={`text-xs ${mutedText}`}>used</div>
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100"
          style={{ width: `${usedPercent}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className={mutedText}>Used</div>
          <div className="font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {disk.usedFormatted || formatBytes(disk.usedBytes)}
          </div>
        </div>
        <div>
          <div className={mutedText}>Available</div>
          <div className="font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {disk.availableFormatted || formatBytes(disk.availableBytes)}
          </div>
        </div>
        <div>
          <div className={mutedText}>Total</div>
          <div className="font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {disk.totalFormatted || formatBytes(disk.totalBytes)}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppPathRow({ item, totalBytes }) {
  const percent = totalBytes > 0 ? Math.round((item.bytes / totalBytes) * 1000) / 10 : 0;

  return (
    <div className="py-3 border-b last:border-b-0 border-gray-100 dark:border-gray-800 midnight:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
              {item.label}
            </span>
            {!item.exists ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-500">
                missing
              </span>
            ) : null}
            {item.truncated ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/20 text-amber-700 dark:text-amber-300">
                partial
              </span>
            ) : null}
          </div>
          <div className={`mt-1 text-xs ${mutedText}`}>{item.description}</div>
          <div className={`mt-1 text-xs truncate ${mutedText}`}>{item.path}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            {item.formatted || formatBytes(item.bytes)}
          </div>
          <div className={`text-xs ${mutedText}`}>{percent}%</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <div className={`mt-1 text-[11px] ${mutedText}`}>
        {item.files} files · {item.directories} folders
      </div>
    </div>
  );
}

function DatabaseFileRow({ file }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-gray-100 dark:border-gray-800 midnight:border-gray-800">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
          {file.label}
        </div>
        <div className={`text-xs truncate ${mutedText}`}>{file.path}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
          {file.formatted || formatBytes(file.bytes)}
        </div>
        <div className={`text-xs ${mutedText}`}>{file.exists ? formatDate(file.modifiedAt) : 'missing'}</div>
      </div>
    </div>
  );
}

const importantTableOrder = [
  'notes',
  'conversations',
  'agent_memory',
  'projects',
  'cards',
  'events',
  'users',
];

function useTopTables(tables = []) {
  return useMemo(() => {
    const byName = new Map(tables.map(table => [table.name, table]));
    const picked = importantTableOrder
      .map(name => byName.get(name))
      .filter(Boolean);
    const rest = tables
      .filter(table => !importantTableOrder.includes(table.name))
      .sort((a, b) => (b.rows || 0) - (a.rows || 0));
    const result = [...picked, ...rest].slice(0, 12);
    const maxRows = result.length > 0 ? Math.max(...result.map(t => t.rows || 0)) : 0;
    return { tables: result, maxRows };
  }, [tables]);
}

export default function StorageSection() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [confirmClearUploads, setConfirmClearUploads] = useState(false);
  const [clearingUploads, setClearingUploads] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Logs state
  const [logsSummary, setLogsSummary] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [viewingLog, setViewingLog] = useState(null);
  const [logContentLoading, setLogContentLoading] = useState(false);

  const loadSummary = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await storageApi.getSummary();
      setSummary(res);
    } catch (err) {
      setError(apiUtils.handleError(err, 'Failed to load storage summary'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const clearUploads = useCallback(async () => {
    if (!confirmClearUploads) {
      setActionMessage(null);
      setConfirmClearUploads(true);
      return;
    }

    setClearingUploads(true);
    setActionMessage(null);
    try {
      const res = await storageApi.clearUploads();
      setActionMessage({
        type: 'success',
        text: `Cleared ${res.deletedFormatted || formatBytes(res.deletedBytes)} across ${res.deletedFiles || 0} files.`,
      });
      setConfirmClearUploads(false);
      await loadSummary({ silent: true });
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: apiUtils.handleError(err, 'Failed to clear uploads'),
      });
    } finally {
      setClearingUploads(false);
    }
  }, [confirmClearUploads, loadSummary]);

  // Logs handlers
  const loadLogs = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await storageApi.getLogsSummary();
      setLogsSummary(res);
    } catch (err) {
      setLogsError(apiUtils.handleError(err, 'Failed to load logs summary'));
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const clearLogsAction = useCallback(async () => {
    if (!confirmClearLogs) {
      setActionMessage(null);
      setConfirmClearLogs(true);
      return;
    }

    setClearingLogs(true);
    setActionMessage(null);
    try {
      const res = await storageApi.clearLogs();
      setActionMessage({
        type: 'success',
        text: `Cleared ${res.deletedFormatted || formatBytes(res.deletedBytes)} across ${res.deletedFiles || 0} log files.`,
      });
      setConfirmClearLogs(false);
      await loadLogs({ silent: true });
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: apiUtils.handleError(err, 'Failed to clear logs'),
      });
    } finally {
      setClearingLogs(false);
    }
  }, [confirmClearLogs, loadLogs]);

  const viewLog = useCallback(async (category, filename) => {
    if (viewingLog?.category === category && viewingLog?.filename === filename) {
      setViewingLog(null);
      return;
    }

    setLogContentLoading(true);
    try {
      const res = await storageApi.readLogFile(category, filename);
      setViewingLog({ category, filename, content: res.content });
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: apiUtils.handleError(err, 'Failed to read log file'),
      });
    } finally {
      setLogContentLoading(false);
    }
  }, [viewingLog]);

  const { tables: topTables, maxRows } = useTopTables(summary?.database?.tables || []);

  if (loading) {
    return (
      <div className={`space-y-3 ${soraFontBase}`}>
        {[1, 2, 3].map(item => (
          <div key={item} className="h-24 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${soraFontBase} ${panelCls} p-5`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
              Storage summary failed
            </div>
            <div className={`mt-1 text-sm ${mutedText}`}>{error}</div>
            <button
              onClick={() => loadSummary()}
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 midnight:bg-gray-100 midnight:text-gray-900"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const disk = summary?.machine?.disk;
  const appData = summary?.appData;
  const database = summary?.database;

  return (
    <div className={`space-y-6 ${soraFontBase}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Storage
          </h3>
          <p className={`mt-1 text-xs ${mutedText}`}>
            Machine capacity and Asyncat local data usage.
          </p>
        </div>
        <button
          onClick={() => loadSummary({ silent: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-800 midnight:border-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          icon={HardDrive}
          label="Asyncat data"
          value={appData?.totalFormatted || formatBytes(appData?.totalBytes)}
          hint="Tracked local app paths"
        />
        <StatTile
          icon={Database}
          label="SQLite database"
          value={database?.totalFormatted || formatBytes(database?.totalBytes)}
          hint={`${database?.tableCount || 0} tables`}
        />
        <StatTile
          icon={Server}
          label="Machine"
          value={summary?.machine?.hostname || 'Local'}
          hint={summary?.machine?.platform ? `${summary.machine.platform} ${summary.machine.release}` : ''}
        />
      </div>

      <DiskBar disk={disk} />

      <div className={`${panelCls} p-4`}>
        <div className="flex items-center gap-2 mb-2">
          <Folder className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Asyncat Data Breakdown
          </h4>
        </div>
        <div>
          {(appData?.paths || []).map(item => (
            <AppPathRow key={item.id} item={item} totalBytes={appData?.totalBytes || 0} />
          ))}
        </div>
      </div>

      <div className={`${panelCls} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Local Database
          </h4>
        </div>

        <div className="space-y-1">
          {(database?.files || []).map(file => (
            <DatabaseFileRow key={file.id} file={file} />
          ))}
        </div>

        <div className="mt-4 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
              Table Rows
            </div>
            <div className={`text-xs ${mutedText}`}>
              Top {topTables.length} of {database?.tableCount || 0}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {topTables.map(table => {
              const percent = maxRows > 0 ? Math.round(((table.rows || 0) / maxRows) * 100) : 0;
              return (
                <div
                  key={table.name}
                  className="py-1.5"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300 midnight:text-gray-300 truncate">
                      {table.name}
                    </span>
                    <span className={`text-xs tabular-nums flex-shrink-0 ${mutedText}`}>
                      {table.rows == null ? 'n/a' : table.rows.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`${panelCls} p-4 border-red-200 dark:border-red-900/60 midnight:border-red-900/60`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                Storage Maintenance
              </h4>
            </div>
            <p className={`mt-1 text-xs ${mutedText}`}>
              Clear local upload files from notes and kanban attachments. Database rows stay intact.
            </p>
            {actionMessage ? (
              <div
                className={`mt-3 text-xs ${
                  actionMessage.type === 'error'
                    ? 'text-red-600 dark:text-red-400 midnight:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400'
                }`}
              >
                {actionMessage.text}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <button
              onClick={clearUploads}
              disabled={clearingUploads}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50 ${
                confirmClearUploads
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-red-200 dark:border-red-900/60 midnight:border-red-900/60 text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 midnight:hover:bg-red-950/30'
              }`}
            >
              {clearingUploads ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {confirmClearUploads ? 'Confirm Clear' : 'Clear Uploads'}
            </button>
            {confirmClearUploads ? (
              <button
                onClick={() => setConfirmClearUploads(false)}
                disabled={clearingUploads}
                className={`text-xs ${mutedText} hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 disabled:opacity-50`}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`${panelCls} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Logs
          </h4>
          <button
            onClick={() => loadLogs({ silent: true })}
            disabled={logsLoading}
            className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-800 midnight:border-gray-800 text-[11px] font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 disabled:opacity-50"
          >
            {logsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>

        {logsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : logsError ? (
          <div className={`text-sm ${mutedText}`}>{logsError}</div>
        ) : (
          <>
            <div className="space-y-1">
              {(logsSummary?.categories || []).map(cat => (
                <div key={cat.id} className="py-2 border-b last:border-b-0 border-gray-100 dark:border-gray-800 midnight:border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                          {cat.label}
                        </span>
                        {!cat.exists ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 text-gray-500">
                            missing
                          </span>
                        ) : null}
                      </div>
                      <div className={`mt-0.5 text-xs ${mutedText}`}>
                        {cat.files} files · {cat.formatted}
                        {cat.latestModifiedAt ? ` · last ${formatDate(cat.latestModifiedAt)}` : ''}
                      </div>
                    </div>
                  </div>

                  {cat.recentFiles && cat.recentFiles.length > 0 && (
                    <div className="mt-2 ml-6 space-y-1">
                      {cat.recentFiles.map(file => (
                        <div key={file.name} className="flex items-center justify-between gap-2 py-1">
                          <span className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 truncate">
                            {file.name}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs ${mutedText}`}>{file.formatted}</span>
                            <button
                              onClick={() => viewLog(cat.id, file.name)}
                              className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded border ${
                                viewingLog?.category === cat.id && viewingLog?.filename === file.name
                                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 midnight:bg-gray-100 midnight:text-gray-900 border-transparent'
                                  : 'border-gray-200 dark:border-gray-800 midnight:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                              }`}
                            >
                              {viewingLog?.category === cat.id && viewingLog?.filename === file.name ? (
                                <>
                                  <X className="w-3 h-3" /> Close
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" /> View
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {viewingLog && (
              <div className="mt-3 border border-gray-200 dark:border-gray-800 midnight:border-gray-800 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 border-b border-gray-200 dark:border-gray-800 midnight:border-gray-800">
                  <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                    {viewingLog.filename}
                  </span>
                  <button
                    onClick={() => setViewingLog(null)}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-3 bg-white dark:bg-gray-900 midnight:bg-gray-950">
                  {logContentLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                    </div>
                  ) : (
                    <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 midnight:text-gray-300 whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                      {viewingLog.content || 'No content'}
                    </pre>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                      Log Maintenance
                    </h4>
                  </div>
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    Delete all log files. Active processes may recreate logs immediately.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <button
                    onClick={clearLogsAction}
                    disabled={clearingLogs}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50 ${
                      confirmClearLogs
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'border border-red-200 dark:border-red-900/60 midnight:border-red-900/60 text-red-600 dark:text-red-400 midnight:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 midnight:hover:bg-red-950/30'
                    }`}
                  >
                    {clearingLogs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {confirmClearLogs ? 'Confirm Clear' : 'Clear Logs'}
                  </button>
                  {confirmClearLogs ? (
                    <button
                      onClick={() => setConfirmClearLogs(false)}
                      disabled={clearingLogs}
                      className={`text-xs ${mutedText} hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 disabled:opacity-50`}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`flex items-center gap-2 text-xs ${mutedText}`}>
        <CalendarClock className="w-3.5 h-3.5" />
        Last scanned {formatDate(summary?.generatedAt)}
      </div>
    </div>
  );
}
