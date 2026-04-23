// GlossaryGallery.jsx — Full-screen modal: all annotated terms from the conversation
import { useState, useEffect, useMemo } from 'react';
import { X, BookOpen, Search, ChevronRight, ArrowUpDown } from 'lucide-react';

// Extract all [[term|definition]] annotations from a string
const extractAnnotations = (text) => {
  if (!text) return [];
  const results = [];
  const regex = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    results.push({ term: m[1].trim(), definition: m[2].trim() });
  }
  return results;
};

const GlossaryGallery = ({ messages = [], onClose, onTermClick }) => {
  const [search, setSearch] = useState('');
  const [sortAZ, setSortAZ] = useState(true);
  const [selected, setSelected] = useState(null);

  // ESC to close or go back to list
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = 'unset';
    };
  }, [selected, onClose]);

  // Extract + deduplicate all terms from assistant messages
  const allTerms = useMemo(() => {
    const seen = new Map(); // term.toLowerCase() → { term, definition }
    messages
      .filter(m => m.type === 'assistant' && m.content)
      .forEach(msg => {
        const annotations = extractAnnotations(msg.content);
        annotations.forEach(({ term, definition }) => {
          const key = term.toLowerCase();
          if (!seen.has(key)) {
            seen.set(key, { term, definition });
          }
        });
      });
    return Array.from(seen.values());
  }, [messages]);

  // Filter + sort
  const displayed = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? allTerms.filter(t => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q))
      : allTerms;
    return [...filtered].sort((a, b) =>
      sortAZ
        ? a.term.localeCompare(b.term)
        : b.term.localeCompare(a.term)
    );
  }, [allTerms, search, sortAZ]);

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 midnight:bg-slate-950 flex flex-col">
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 midnight:bg-slate-950/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setSelected(null)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center gap-1"
          >
            ← Glossary
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100 truncate">
            {selected.term}
          </span>
          <button
            onClick={onClose}
            className="ml-auto p-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
              {selected.term}
            </h1>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-800/60 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50 midnight:border-slate-700/50">
            <p className="text-[15px] text-gray-700 dark:text-gray-300 midnight:text-slate-300 leading-relaxed">
              {selected.definition}
            </p>
          </div>

          {onTermClick && (
            <button
              onClick={() => { onTermClick(selected.term, selected.definition); onClose(); }}
              className="mt-4 text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              Open in side panel <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Gallery list ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 midnight:bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-slate-950 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
              Glossary
            </h2>
            <span className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 midnight:text-indigo-300 rounded-full">
              {allTerms.length} {allTerms.length === 1 ? 'term' : 'terms'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortAZ(a => !a)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={sortAZ ? 'Currently A→Z' : 'Currently Z→A'}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortAZ ? 'A → Z' : 'Z → A'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-slate-400" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search terms…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {displayed.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-12 h-12 mx-auto text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {search ? 'No terms match your search' : 'No annotated terms in this conversation yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-7xl mx-auto">
            {displayed.map(({ term, definition }) => (
              <button
                key={term}
                onClick={() => setSelected({ term, definition })}
                className="group text-left bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl p-4 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 midnight:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100 leading-snug">
                    {term}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 leading-relaxed line-clamp-3 pl-10">
                  {definition}
                </p>
                <div className="mt-2 pl-10 flex items-center gap-1 text-[11px] text-indigo-400 dark:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  Read more <ChevronRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GlossaryGallery;
