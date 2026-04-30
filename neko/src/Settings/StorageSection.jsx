import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Database,
  Folder,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
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

      <div className={`flex items-center gap-2 text-xs ${mutedText}`}>
        <CalendarClock className="w-3.5 h-3.5" />
        Last scanned {formatDate(summary?.generatedAt)}
      </div>
    </div>
  );
}
