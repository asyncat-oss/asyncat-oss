/* eslint-disable react/prop-types */
/**
 * SymbolOutlinePanel — shows the symbol outline for the currently open file.
 * Calls list_definitions backend and groups by kind.
 */

import { useEffect, useState } from 'react';
import { Loader2, Box, RefreshCw } from 'lucide-react';
import { codeApi } from '../../api';

const KIND_ICON = {
  function: '𝑓',
  method: '𝑚',
  class: '◆',
  interface: '◇',
  type: '⊤',
  export: '↗',
  import: '↙',
  decorator: '@',
  constant: 'K',
  variable: 'x',
  selector: '#',
  table: '⊞',
  default: '•',
};

const KIND_COLOR = {
  function: 'text-blue-500 dark:text-blue-400 midnight:text-blue-400',
  method: 'text-blue-400 dark:text-blue-300 midnight:text-blue-300',
  class: 'text-amber-500 dark:text-amber-400 midnight:text-amber-400',
  interface: 'text-teal-500 dark:text-teal-400 midnight:text-teal-400',
  type: 'text-purple-500 dark:text-purple-400 midnight:text-purple-400',
  export: 'text-emerald-500 dark:text-emerald-400 midnight:text-emerald-400',
  import: 'text-gray-400 dark:text-slate-500 midnight:text-slate-500',
  constant: 'text-orange-500 dark:text-orange-400 midnight:text-orange-400',
  default: 'text-gray-400 dark:text-slate-500 midnight:text-slate-500',
};

function kindColor(kind) {
  return KIND_COLOR[kind] || KIND_COLOR.default;
}

function kindIcon(kind) {
  return KIND_ICON[kind] || KIND_ICON.default;
}

export default function SymbolOutlinePanel({ filePath }) {
  const [symbols, setSymbols] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async (fp) => {
    if (!fp) { setSymbols(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await codeApi.listDefinitions(fp);
      if (!res?.success) throw new Error(res?.error || 'Failed to load outline');
      // Flatten grouped definitions into a flat array sorted by line number
      const groups = res?.definitions || {};
      const kindMap = {
        functions: 'function', classes: 'class', interfaces: 'interface',
        types: 'type', imports: 'import', exports: 'export', other: 'variable',
      };
      const flat = [];
      for (const [group, items] of Object.entries(groups)) {
        const kind = kindMap[group] || group;
        for (const item of (items || [])) {
          flat.push({ ...item, kind });
        }
      }
      flat.sort((a, b) => a.line - b.line);
      setSymbols(flat);
    } catch (err) {
      setError(err.message || 'Failed to load outline');
      setSymbols(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(filePath); }, [filePath]);

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-400 dark:text-slate-600 midnight:text-slate-600">
        Open a file to see its outline
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950 midnight:bg-slate-950">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 midnight:border-slate-800 px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[10px] text-gray-500 dark:text-slate-500 midnight:text-slate-500">{filePath}</span>
        <button
          type="button"
          onClick={() => load(filePath)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 midnight:hover:bg-slate-800 midnight:hover:text-slate-200"
          title="Refresh"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error && (
          <p className="px-3 py-2 text-xs text-red-500 dark:text-red-400 midnight:text-red-400">{error}</p>
        )}
        {!loading && symbols?.length === 0 && (
          <div className="flex h-full items-center justify-center flex-col gap-2 py-8">
            <Box className="h-5 w-5 text-gray-200 dark:text-slate-700 midnight:text-slate-700" />
            <p className="text-xs text-gray-400 dark:text-slate-600 midnight:text-slate-600">No symbols found</p>
          </div>
        )}
        {symbols?.map((sym, i) => (
          <div key={i} className="flex items-baseline gap-2 px-3 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800/60 midnight:hover:bg-slate-800/60">
            <span className={`shrink-0 font-mono text-[11px] select-none ${kindColor(sym.kind)}`} title={sym.kind}>
              {kindIcon(sym.kind)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-800 dark:text-slate-200 midnight:text-slate-200">
              {sym.name}
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-gray-300 dark:text-slate-700 midnight:text-slate-700">
              {sym.line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
