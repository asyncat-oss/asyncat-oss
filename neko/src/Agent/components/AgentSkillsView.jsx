import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Loader2, AlertCircle, ChevronDown, ChevronRight,
  Brain, BookOpen, Shield, Cpu, Lightbulb, LayoutList, Tag,
} from 'lucide-react';
import { agentApi } from '../../CommandCenter/commandCenterApi';

const BRAIN_REGION_META = {
  prefrontal:    { label: 'Prefrontal',    icon: Brain,       color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20',  desc: 'Planning, code review, decisions' },
  cerebellum:    { label: 'Cerebellum',    icon: BookOpen,    color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',      desc: 'Bundled skills (muscle memory)' },
  hippocampus:   { label: 'Hippocampus',   icon: Cpu,         color: 'text-cyan-500',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',      desc: 'Memory — semantic + episodic' },
  amygdala:      { label: 'Amygdala',      icon: Shield,      color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/20',        desc: 'Safety, permissions, errors' },
  basal_ganglia: { label: 'Basal Ganglia', icon: Lightbulb,   color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20',    desc: 'Auto-learns patterns from usage' },
  limbic:        { label: 'Limbic',        icon: LayoutList,  color: 'text-pink-500',   bg: 'bg-pink-50 dark:bg-pink-900/20',      desc: 'Emotions, context, intuition' },
  unknown:       { label: 'Unknown',       icon: Tag,         color: 'text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-800',        desc: 'Uncategorized' },
};

const REGION_ORDER = ['prefrontal', 'cerebellum', 'hippocampus', 'amygdala', 'basal_ganglia', 'limbic', 'unknown'];

function getRegionMeta(region) {
  const key = (region || 'unknown').toLowerCase().replace(/[\s-]+/g, '_');
  return BRAIN_REGION_META[key] || BRAIN_REGION_META.unknown;
}

function renderMarkdown(text) {
  if (!text) return null;
  const elements = [];
  let listItems = [];
  let _inList = false;

  const flushList = () => {
    if (listItems.length) {
      elements.push(<ul key={elements.length} className="list-disc pl-5 space-y-0.5 mt-1">{listItems}</ul>);
      listItems = [];
    }
    _inList = false;
  };

  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) { flushList(); continue; }
    if (t.startsWith('# ')) { flushList(); elements.push(<h3 key={elements.length} className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-3 mb-1">{t.slice(2)}</h3>); }
    else if (t.startsWith('## ')) { flushList(); elements.push(<h4 key={elements.length} className="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-2 mb-0.5">{t.slice(3)}</h4>); }
    else if (t.startsWith('- ') || t.startsWith('* ')) { _inList = true; listItems.push(<li key={listItems.length} className="text-xs text-gray-600 dark:text-gray-300">{t.slice(2)}</li>); }
    else {
      flushList();
      const formatted = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">$1</code>');
      if (formatted.includes('<strong>') || formatted.includes('<code')) {
        elements.push(<span key={elements.length} className="text-xs text-gray-600 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: formatted }} />);
      } else {
        elements.push(<p key={elements.length} className="text-xs text-gray-600 dark:text-gray-300">{t}</p>);
      }
    }
  }
  flushList();
  return elements;
}

function SkillCard({ skill }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getRegionMeta(skill.brain_region);
  const RegIcon = meta.icon;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left bg-white dark:bg-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
          <RegIcon className={`w-4 h-4 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{skill.name}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} border-transparent`}>
              <RegIcon className="w-3 h-3" />{meta.label}
            </span>
            {skill.source === 'user' && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Custom</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{skill.description}</p>
          {skill.tags?.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {skill.tags.slice(0, 5).map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />}
      </button>
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-4 bg-gray-50/50 dark:bg-gray-800/20 space-y-3">
          {skill.when_to_use && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">When to use</p>
              <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{renderMarkdown(skill.when_to_use)}</div>
            </div>
          )}
          {skill.tags?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Tags</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {skill.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{tag}</span>
                ))}
              </div>
            </div>
          )}
          {skill.body && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Process</p>
              <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed space-y-1">{renderMarkdown(skill.body)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentSkillsView() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchSkills();
  }, []);

  async function fetchSkills() {
    setLoading(true);
    setError(null);
    try {
      const res = await agentApi.getSkills();
      setSkills(res.skills || []);
    } catch (err) {
      setError(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.brain_region || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [skills, search]);

  const byRegion = useMemo(() => {
    const groups = {};
    for (const s of filteredSkills) {
      const r = (s.brain_region || 'unknown').toLowerCase().replace(/[\s-]+/g, '_');
      if (!groups[r]) groups[r] = [];
      groups[r].push(s);
    }
    return groups;
  }, [filteredSkills]);

  const totalByRegion = {};
  for (const r of REGION_ORDER) totalByRegion[r] = skills.filter(s => (s.brain_region || 'unknown').toLowerCase().replace(/[\s-]+/g, '_') === r).length;

  return (
    <div className="flex flex-col h-full">
      {/* Region legend */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto bg-gray-50/50 dark:bg-gray-800/30">
        {REGION_ORDER.map(region => {
          const meta = getRegionMeta(region);
          const RegIcon = meta.icon;
          const count = totalByRegion[region] || 0;
          if (count === 0 && region !== 'unknown') return null;
          return (
            <div key={region} className="flex items-center gap-1.5 flex-shrink-0">
              <RegIcon className={`w-3.5 h-3.5 ${meta.color}`} />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{meta.label}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-600">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name, tag, or description…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 midnight:border-slate-600 rounded-lg bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading && (
          <div className="flex items-center gap-3 py-12 justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading skills…</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 py-8 px-4 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Failed to load skills</p>
              <p className="text-xs mt-0.5">{error}</p>
              <button onClick={fetchSkills} className="mt-2 text-xs underline">Retry</button>
            </div>
          </div>
        )}
        {!loading && !error && Object.keys(byRegion).length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">
            {search ? 'No skills match your filter' : 'No skills available'}
          </div>
        )}
        {!loading && !error && REGION_ORDER.map(region => {
          const regionSkills = byRegion[region];
          if (!regionSkills?.length) return null;
          const meta = getRegionMeta(region);
          const RegIcon = meta.icon;
          return (
            <div key={region} className="mb-6">
              <div className="flex items-center gap-2 mb-2.5">
                <RegIcon className={`w-4 h-4 ${meta.color}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{meta.label}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-1">{meta.desc}</span>
                <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-600">{regionSkills.length}</span>
              </div>
              {regionSkills.sort((a, b) => a.name.localeCompare(b.name)).map(skill => (
                <SkillCard key={skill.name} skill={skill} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
        <p className="text-[11px] text-gray-400 dark:text-gray-600">Skills are matched automatically by the agent based on your goal</p>
      </div>
    </div>
  );
}
