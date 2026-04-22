// ResourcesSection.jsx — AI-suggested search resources (safe: no hallucinated URLs)
import { useState, useMemo } from 'react';
import {
  Search, ChevronDown, ChevronUp, Wrench, BookOpen,
  FileText, Video, Code2, Users, Newspaper, ExternalLink, AlertTriangle
} from 'lucide-react';

// ── Parser ────────────────────────────────────────────────────────────────────

export const parseResources = (content) => {
  if (!content) return [];
  const match = content.match(/<resources>([\s\S]*?)<\/resources>/i);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(r => r.title && r.search)
      .slice(0, 6); // cap at 6
  } catch {
    return [];
  }
};

export const stripResources = (content) => {
  if (!content) return content;
  return content.replace(/<resources>[\s\S]*?<\/resources>/gi, '').trim();
};

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  tool:          { label: 'Tool',          color: 'violet',  Icon: Wrench },
  guide:         { label: 'Guide',         color: 'blue',    Icon: BookOpen },
  tutorial:      { label: 'Tutorial',      color: 'blue',    Icon: BookOpen },
  docs:          { label: 'Docs',          color: 'gray',    Icon: FileText },
  documentation: { label: 'Docs',         color: 'gray',    Icon: FileText },
  video:         { label: 'Video',         color: 'red',     Icon: Video },
  article:       { label: 'Article',       color: 'green',   Icon: Newspaper },
  github:        { label: 'GitHub',        color: 'gray',    Icon: Code2 },
  community:     { label: 'Community',     color: 'orange',  Icon: Users },
  forum:         { label: 'Forum',         color: 'orange',  Icon: Users },
  benchmark:     { label: 'Benchmark',     color: 'violet',  Icon: Wrench },
};

const DEFAULT_TYPE = { label: 'Resource', color: 'gray', Icon: Search };

const COLOR_CLASSES = {
  violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-100 dark:border-violet-800',
  blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
  gray:   'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  red:    'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800',
  green:  'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800',
  orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800',
};

// ── Component ─────────────────────────────────────────────────────────────────

const ResourcesSection = ({ resources }) => {
  const [open, setOpen] = useState(false);
  const [warned, setWarned] = useState(false);

  if (!resources || resources.length === 0) return null;

  const handleSearch = (query) => {
    if (!warned) {
      setWarned(true);
    }
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mt-4 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 midnight:text-slate-400 uppercase tracking-wider">
            Explore Further
          </span>
          <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 text-gray-500 dark:text-gray-400 midnight:text-slate-400 rounded-full font-medium">
            {resources.length}
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3">
          {/* Disclaimer */}
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/20 border border-amber-200 dark:border-amber-800 midnight:border-amber-800 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 midnight:text-amber-300 leading-relaxed">
              These are <strong>AI-suggested search queries</strong>, not verified links. Results are from DuckDuckGo — always verify sources before use. AI knowledge has a cutoff and may be outdated.
            </p>
          </div>

          {/* Resource cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {resources.map((resource, i) => {
              const type = resource.type?.toLowerCase() || 'resource';
              const { label, color, Icon } = TYPE_CONFIG[type] || DEFAULT_TYPE;
              const colorCls = COLOR_CLASSES[color] || COLOR_CLASSES.gray;

              return (
                <button
                  key={i}
                  onClick={() => handleSearch(resource.search)}
                  className={`group flex items-start gap-3 p-3 border rounded-lg text-left transition-all hover:shadow-sm ${colorCls}`}
                  title={`Search: ${resource.search}`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 opacity-70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                        {label}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-snug truncate">
                      {resource.title}
                    </p>
                    {resource.description && (
                      <p className="text-[11px] mt-0.5 opacity-60 leading-relaxed line-clamp-2">
                        {resource.description}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-50 transition-opacity mt-0.5" />
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-600 midnight:text-slate-600 flex items-center gap-1">
            <Search className="w-3 h-3" />
            Clicking opens a DuckDuckGo search in a new tab
          </p>
        </div>
      )}
    </div>
  );
};

export default ResourcesSection;
