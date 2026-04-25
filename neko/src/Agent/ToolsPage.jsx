import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Search, Wrench, Terminal, File, Globe, Database,
  Brain, Loader2, AlertCircle, ChevronDown, ChevronRight,
  BookOpen, Cpu, ShieldAlert, Monitor, ArrowLeft
} from 'lucide-react';
import { agentApi } from '../CommandCenter/commandCenterApi';

const PERM_META = {
  safe:       { label: 'Safe',       dot: 'bg-emerald-500',   text: 'text-emerald-600 dark:text-emerald-400',   bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  moderate:   { label: 'Moderate',   dot: 'bg-amber-500',     text: 'text-amber-600 dark:text-amber-400',       bg: 'bg-amber-50 dark:bg-amber-900/20' },
  dangerous:  { label: 'Dangerous',  dot: 'bg-red-500',       text: 'text-red-600 dark:text-red-400',           bg: 'bg-red-50 dark:bg-red-900/20' },
};

const CATEGORY_META = {
  file:       { icon: File,         color: 'text-blue-500' },
  shell:      { icon: Terminal,    color: 'text-gray-600 dark:text-gray-400' },
  git:        { icon: BookOpen,    color: 'text-orange-500' },
  search:     { icon: Globe,       color: 'text-purple-500' },
  memory:     { icon: Brain,       color: 'text-pink-500' },
  workspace:  { icon: Database,    color: 'text-cyan-500' },
  agent:      { icon: Cpu,         color: 'text-indigo-500' },
  system:     { icon: Wrench,      color: 'text-gray-500 dark:text-gray-400' },
  os:         { icon: Terminal,    color: 'text-green-600' },
  screen:     { icon: Monitor,    color: 'text-violet-500' },
  data:       { icon: Database,    color: 'text-teal-500' },
  plan:       { icon: Brain,       color: 'text-rose-500' },
  askUser:    { icon: ShieldAlert, color: 'text-amber-500' },
  browser:    { icon: Globe,       color: 'text-sky-500' },
  docker:     { icon: Cpu,         color: 'text-blue-400' },
  dev:        { icon: Terminal,    color: 'text-emerald-500' },
  general:    { icon: Wrench,      color: 'text-gray-400 dark:text-gray-500' },
};

function getCategoryMeta(category) {
  return CATEGORY_META[category?.toLowerCase()] || CATEGORY_META.general;
}

function ToolCard({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const perm = PERM_META[tool.permission] || PERM_META.moderate;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden mb-1.5">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left bg-white dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
      >
        <div className={`flex-shrink-0 w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center`}>
          <Wrench className={`w-3.5 h-3.5 ${perm.dot.replace('bg-', 'text-')}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {tool.name}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${perm.bg} ${perm.text} border-transparent`}>
              <span className={`w-1.5 h-1.5 rounded-full ${perm.dot}`} />
              {perm.label}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
            {tool.description || 'No description available'}
          </p>
        </div>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/50 px-3 py-3 bg-gray-50/50 dark:bg-gray-800/20">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {tool.description || 'No description available'}
          </p>
          {tool.parameters && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Parameters</p>
              <pre className="text-[10px] text-gray-500 dark:text-gray-400 font-mono bg-white dark:bg-gray-900/50 rounded p-2 overflow-x-auto">
                {typeof tool.parameters === 'string'
                  ? tool.parameters
                  : JSON.stringify(tool.parameters, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolsPage() {
  const navigate = useNavigate();
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchTools();
  }, []);

  async function fetchTools() {
    setLoading(true);
    setError(null);
    try {
      const res = await agentApi.getTools();
      setTools(res.tools || []);
    } catch (err) {
      setError(err.message || 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  }

  const filteredTools = useMemo(() => {
    if (!search.trim()) return tools;
    const q = search.toLowerCase();
    return tools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  }, [tools, search]);

  const byCategory = useMemo(() => {
    const groups = {};
    for (const tool of filteredTools) {
      const cat = tool.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tool);
    }
    return groups;
  }, [filteredTools]);

  const safeCount = tools.filter(t => t.permission === 'safe').length;
  const modCount  = tools.filter(t => t.permission === 'moderate').length;
  const dangerCount = tools.filter(t => t.permission === 'dangerous').length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/agents')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors"
          title="Back to Agents"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 flex items-center justify-center">
          <Wrench className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
            Agent Tools
          </h1>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {tools.length} tools registered
          </p>
        </div>
      </div>

      {/* Permission legend */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-2 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/50 dark:bg-gray-800/30 midnight:bg-slate-800/30">
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Safe ({safeCount})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Moderate ({modCount})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Dangerous ({dangerCount})
        </span>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter tools by name, description, or category…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 midnight:border-slate-600 rounded-lg bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading && (
          <div className="flex items-center gap-3 py-12 justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading tools…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 py-8 px-4 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Failed to load tools</p>
              <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{error}</p>
              <button
                onClick={fetchTools}
                className="mt-2 text-xs underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && Object.entries(byCategory).length === 0 && (
          <div className="py-12 text-center text-gray-400 dark:text-gray-600 text-sm">
            {search ? 'No tools match your filter' : 'No tools available'}
          </div>
        )}

        {!loading && !error && Object.entries(byCategory).map(([category, catTools]) => {
          const catMeta = getCategoryMeta(category);
          const CatIcon = catMeta.icon || Wrench;
          return (
            <div key={category} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <CatIcon className={`w-4 h-4 ${catMeta.color}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {category}
                </span>
                <span className="text-xs text-gray-300 dark:text-gray-600 ml-auto">
                  {catTools.length}
                </span>
              </div>
              {catTools
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(tool => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 text-center">
        <p className="text-[11px] text-gray-400 dark:text-gray-600">
          Tools are called automatically by the agent during tasks
        </p>
      </div>
    </div>
  );
}