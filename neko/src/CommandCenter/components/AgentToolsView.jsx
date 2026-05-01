import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Wrench, Terminal, File, Globe, Database,
  Brain, Loader2, AlertCircle, ChevronDown, ChevronRight,
  BookOpen, Cpu, ShieldAlert, Monitor,
} from 'lucide-react';
import { agentApi } from '../../CommandCenter/commandCenterApi';

const PERM_META = {
  safe:      { label: 'Safe',      dot: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  moderate:  { label: 'Moderate',  dot: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400'   },
  dangerous: { label: 'Dangerous', dot: 'bg-red-400',     text: 'text-red-600 dark:text-red-400'       },
};

const CATEGORY_META = {
  file:      { icon: File,        color: 'text-blue-500' },
  shell:     { icon: Terminal,    color: 'text-gray-500 dark:text-gray-400' },
  git:       { icon: BookOpen,    color: 'text-orange-500' },
  search:    { icon: Globe,       color: 'text-purple-500' },
  memory:    { icon: Brain,       color: 'text-pink-500' },
  workspace: { icon: Database,    color: 'text-cyan-500' },
  agent:     { icon: Cpu,         color: 'text-indigo-500' },
  system:    { icon: Wrench,      color: 'text-gray-400 dark:text-gray-500' },
  os:        { icon: Terminal,    color: 'text-green-600' },
  screen:    { icon: Monitor,     color: 'text-violet-500' },
  data:      { icon: Database,    color: 'text-teal-500' },
  plan:      { icon: Brain,       color: 'text-rose-500' },
  askUser:   { icon: ShieldAlert, color: 'text-amber-500' },
  browser:   { icon: Globe,       color: 'text-sky-500' },
  docker:    { icon: Cpu,         color: 'text-blue-400' },
  dev:       { icon: Terminal,    color: 'text-emerald-500' },
  general:   { icon: Wrench,      color: 'text-gray-400 dark:text-gray-500' },
};

function getCategoryMeta(cat) {
  return CATEGORY_META[cat?.toLowerCase()] || CATEGORY_META.general;
}

function ToolCard({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const perm = PERM_META[tool.permission] || PERM_META.moderate;

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${perm.dot} mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{tool.name}</span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1 leading-snug">
            {tool.description || 'No description available'}
          </p>
        </div>
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          : <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </button>

      {expanded && (
        <div className="mx-3 mb-2 pl-4 border-l border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed py-1">
            {tool.description || 'No description available'}
          </p>
          <p className={`text-[10px] font-medium mt-1 ${perm.text}`}>
            Permission: {perm.label}
          </p>
          {tool.parameters && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Parameters</p>
              <pre className="text-[10px] text-gray-500 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900/40 rounded p-2 overflow-x-auto leading-relaxed">
                {typeof tool.parameters === 'string' ? tool.parameters : JSON.stringify(tool.parameters, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentToolsView() {
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

  const safeCount    = tools.filter(t => t.permission === 'safe').length;
  const modCount     = tools.filter(t => t.permission === 'moderate').length;
  const dangerCount  = tools.filter(t => t.permission === 'dangerous').length;

  return (
    <div className="flex flex-col h-full">
      {/* Search + stats row */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter tools…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600"
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-600 flex-shrink-0">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{safeCount}</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{modCount}</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{dangerCount}</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="flex items-center gap-2 py-12 justify-center text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading tools…</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2.5 py-8 px-4 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Failed to load tools</p>
              <p className="text-xs mt-0.5 text-red-500">{error}</p>
              <button onClick={fetchTools} className="mt-2 text-xs underline">Retry</button>
            </div>
          </div>
        )}
        {!loading && !error && Object.keys(byCategory).length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">
            {search ? 'No tools match your filter' : 'No tools available'}
          </div>
        )}
        {!loading && !error && Object.entries(byCategory).map(([category, catTools]) => {
          const catMeta = getCategoryMeta(category);
          const CatIcon = catMeta.icon || Wrench;
          return (
            <div key={category} className="mb-4">
              <div className="flex items-center gap-2 px-3 mb-1">
                <CatIcon className={`w-3 h-3 ${catMeta.color}`} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{category}</span>
                <span className="text-[10px] text-gray-300 dark:text-gray-700 ml-auto">{catTools.length}</span>
              </div>
              {catTools.sort((a, b) => a.name.localeCompare(b.name)).map(tool => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex-shrink-0 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-center">
        <p className="text-[11px] text-gray-300 dark:text-gray-700">Tools are called automatically during agent tasks</p>
      </div>
    </div>
  );
}
