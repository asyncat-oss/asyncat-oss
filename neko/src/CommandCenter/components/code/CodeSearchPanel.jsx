/**
 * CodeSearchPanel — symbol/text search across the workspace.
 * Calls the backend code search endpoint and shows results with file + line.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, FileCode } from 'lucide-react';
import { codeApi } from '../../api';
import Select from '../../../components/ui/Select.jsx';
import SearchField from '../../../components/ui/SearchField.jsx';
import Notice from '../../../components/ui/Notice.jsx';

const KIND_OPTIONS = [
  { value: 'any', label: 'Any kind' },
  { value: 'function', label: 'Function' },
  { value: 'class', label: 'Class' },
  { value: 'import', label: 'Import' },
  { value: 'text', label: 'Text' },
];

const LANG_OPTIONS = [
  { value: '', label: 'All languages' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
];

function ResultRow({ result, onLocate }) {
  return (
    <button
      type="button"
      onClick={() => onLocate?.(result)}
      className="group w-full rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <FileCode className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
          {result.file}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">
          :{result.line}
        </span>
      </div>
      {result.text && (
        <p className="mt-0.5 truncate pl-5 font-mono text-[11px] text-fg-muted">
          {result.text}
        </p>
      )}
      {result.name && result.kind && (
        <p className="mt-0.5 pl-5 text-[11px] text-fg-subtle">
          <span className="rounded-md bg-hover px-1 py-px font-mono">{result.kind}</span>
          {' '}{result.name}
        </p>
      )}
    </button>
  );
}

export default function CodeSearchPanel({ onLocateResult, workingDir = null, disabled = false }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('any');
  const [lang, setLang] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchTimer = useRef(null);

  const doSearch = useCallback(async (q, k, l, wd = workingDir) => {
    if (!q.trim() || disabled) { setResults(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await codeApi.search(q, { kind: k, language: l || undefined, limit: 40, path: wd || undefined });
      setResults(res?.results || []);
    } catch (err) {
      setError(err.message || 'Search failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [disabled, workingDir]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!query.trim() || disabled) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    searchTimer.current = setTimeout(() => doSearch(query, kind, lang, workingDir), 350);
    return () => clearTimeout(searchTimer.current);
  }, [disabled, doSearch, kind, lang, query, workingDir]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search bar */}
      <div className="shrink-0 space-y-1.5 border-b border-line p-3">
        <SearchField
          size="sm"
          value={query}
          onChange={setQuery}
          disabled={disabled}
          placeholder="Search symbols or text"
        />
        <div className="flex gap-1.5">
          <Select size="sm" className="min-w-0 flex-1" value={kind} onChange={setKind} options={KIND_OPTIONS} aria-label="Kind" />
          <Select size="sm" className="min-w-0 flex-1" value={lang} onChange={setLang} options={LANG_OPTIONS} aria-label="Language" />
        </div>
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {error && <Notice tone="error">{error}</Notice>}

        {loading && !(results?.length > 0) && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-fg-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </div>
        )}

        {results === null && !loading && !error && (
          <p className="px-4 py-8 text-center text-[12px] text-fg-subtle">
            {disabled ? 'Choose a working folder to search code.' : 'Find functions, classes, imports or any text in this folder.'}
          </p>
        )}

        {results?.length === 0 && !loading && (
          <p className="px-4 py-8 text-center text-[12px] text-fg-subtle">No results.</p>
        )}

        {/* A new search over old results: they dim, and the count line says it's searching. */}
        {results?.length > 0 && (
          <div className="space-y-px" aria-busy={loading}>
            <p className="mb-1 flex items-center gap-1.5 px-2.5 text-[12px] tabular-nums text-fg-subtle">
              {results.length} result{results.length !== 1 ? 's' : ''}
              {loading ? <span className="ml-1 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</span> : null}
            </p>
            <div className={`space-y-px transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {results.map((r, i) => (
                <ResultRow key={i} result={r} onLocate={onLocateResult} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
