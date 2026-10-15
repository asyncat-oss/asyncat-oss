/**
 * SymbolOutlinePanel — shows the symbol outline for the currently open file.
 * Calls list_definitions backend and groups by kind.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { codeApi } from '../../api';
import IconButton from '../../../components/ui/IconButton.jsx';

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

function kindIcon(kind) {
  return KIND_ICON[kind] || KIND_ICON.default;
}

export default function SymbolOutlinePanel({ filePath, workingDir = null, disabled = false }) {
  const [symbols, setSymbols] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (fp) => {
    if (!fp || disabled) { setSymbols(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await codeApi.listDefinitions(fp, { path: workingDir || undefined });
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
  }, [disabled, workingDir]);

  useEffect(() => { load(filePath); }, [filePath, load]);

  if (!filePath || disabled) {
    return (
      <p className="flex h-full items-center justify-center px-6 text-center text-[12px] text-fg-subtle">
        {disabled ? 'Choose a working folder to see outlines' : 'Open a file to see its outline'}
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line py-1.5 pl-3 pr-1.5">
        <span className="min-w-0 truncate font-mono text-[12px] text-fg-muted">{filePath}</span>
        <IconButton size="sm" icon={RefreshCw} label="Refresh" loading={loading} onClick={() => load(filePath)} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {error && (
          <p className="px-2 py-2 text-[12px] text-red-600 dark:text-red-400">{error}</p>
        )}
        {!loading && symbols?.length === 0 && (
          <p className="py-8 text-center text-[12px] text-fg-subtle">No symbols found</p>
        )}
        {symbols?.map((sym, i) => (
          <div key={i} className="flex items-baseline gap-2 rounded-md px-2 py-0.5 hover:bg-hover">
            <span className="w-3 shrink-0 select-none text-center font-mono text-[11px] text-fg-subtle" title={sym.kind}>
              {kindIcon(sym.kind)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
              {sym.name}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">
              {sym.line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
