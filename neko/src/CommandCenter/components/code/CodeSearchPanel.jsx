/* eslint-disable react/prop-types */
/**
 * CodeSearchPanel — symbol/text search across the workspace.
 * Calls the backend code search endpoint and shows results with file + line.
 */

import { useCallback, useRef, useState } from 'react';
import { Search, Loader2, FileCode, Hash, Box, AlertCircle } from 'lucide-react';
import { codeApi } from '../../api';

const KIND_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'function', label: 'Function' },
  { value: 'class', label: 'Class' },
  { value: 'import', label: 'Import' },
  { value: 'text', label: 'Text' },
];

const LANG_OPTIONS = [
  '', 'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'css', 'sql',
];

function ResultRow({ result, onLocate }) {
  return (
    <button
      type="button"
      onClick={() => onLocate?.(result)}
      className="group w-full text-left rounded-md px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <FileCode className="h-3 w-3 shrink-0 text-gray-300 dark:text-slate-600" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
          {result.file}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-gray-400 dark:text-slate-600 tabular-nums">
          :{result.line}
        </span>
      </div>
      {result.text && (
        <p className="mt-0.5 pl-4 font-mono text-[10px] text-gray-500 dark:text-slate-500 truncate">
          {result.text}
        </p>
      )}
      {result.name && result.kind && (
        <p className="mt-0.5 pl-4 text-[10px] text-gray-400 dark:text-slate-600">
          <span className="rounded-sm bg-gray-100 dark:bg-slate-800 px-1 py-0.5 font-mono">{result.kind}</span>
          {' '}{result.name}
        </p>
      )}
    </button>
  );
}

export default function CodeSearchPanel({ onLocateResult }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('any');
  const [lang, setLang] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchTimer = useRef(null);

  const doSearch = useCallback(async (q, k, l) => {
    if (!q.trim()) { setResults(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await codeApi.search(q, { kind: k, language: l || undefined, limit: 40 });
      setResults(res?.results || []);
    } catch (err) {
      setError(err.message || 'Search failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(q, kind, lang), 350);
  };

  const onKindChange = (e) => {
    setKind(e.target.value);
    if (query.trim()) doSearch(query, e.target.value, lang);
  };

  const onLangChange = (e) => {
    setLang(e.target.value);
    if (query.trim()) doSearch(query, kind, e.target.value);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
      {/* Search bar */}
      <div className="shrink-0 border-b border-gray-100 dark:border-slate-800 p-2 space-y-1.5">
        <div className="relative">
          {loading
            ? <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-indigo-400" />
            : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          }
          <input
            type="text"
            value={query}
            onChange={onQueryChange}
            placeholder="Search symbols or text…"
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-600"
          />
        </div>
        <div className="flex gap-1.5">
          <select
            value={kind}
            onChange={onKindChange}
            className="flex-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 focus:outline-none"
          >
            {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={lang}
            onChange={onLangChange}
            className="flex-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All langs</option>
            {LANG_OPTIONS.filter(Boolean).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {results === null && !loading && !error && (
          <div className="py-8 text-center">
            <Hash className="mx-auto h-6 w-6 text-gray-200 dark:text-slate-700 mb-2" />
            <p className="text-xs text-gray-400 dark:text-slate-600">Search symbols, functions, classes…</p>
          </div>
        )}

        {results?.length === 0 && !loading && (
          <div className="py-8 text-center">
            <Box className="mx-auto h-6 w-6 text-gray-200 dark:text-slate-700 mb-2" />
            <p className="text-xs text-gray-400 dark:text-slate-600">No results found</p>
          </div>
        )}

        {results?.length > 0 && (
          <div className="space-y-0.5">
            <p className="mb-1.5 px-1 text-[10px] text-gray-400 dark:text-slate-600">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </p>
            {results.map((r, i) => (
              <ResultRow key={i} result={r} onLocate={onLocateResult} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
