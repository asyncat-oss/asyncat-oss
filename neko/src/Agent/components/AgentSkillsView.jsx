import { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Search, Loader2, AlertCircle, ChevronDown, ChevronRight,
  Brain, BookOpen, Shield, Cpu, Lightbulb, LayoutList, Tag,
} from 'lucide-react';
import { agentApi } from '../../CommandCenter/commandCenterApi';

const BRAIN_REGION_META = {
  prefrontal:    { label: 'Prefrontal',    icon: Brain,       color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20',  desc: 'Planning · decisions' },
  cerebellum:    { label: 'Cerebellum',    icon: BookOpen,    color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',      desc: 'Bundled skills' },
  hippocampus:   { label: 'Hippocampus',   icon: Cpu,         color: 'text-cyan-500',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',      desc: 'Memory' },
  amygdala:      { label: 'Amygdala',      icon: Shield,      color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-900/20',        desc: 'Safety · permissions' },
  basal_ganglia: { label: 'Basal Ganglia', icon: Lightbulb,   color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20',    desc: 'Auto-learned patterns' },
  limbic:        { label: 'Limbic',        icon: LayoutList,  color: 'text-pink-500',   bg: 'bg-pink-50 dark:bg-pink-900/20',      desc: 'Context · intuition' },
  unknown:       { label: 'Other',         icon: Tag,         color: 'text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-800',        desc: 'Uncategorized' },
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

  const flushList = () => {
    if (listItems.length) {
      elements.push(<ul key={elements.length} className="list-disc pl-4 space-y-0.5 mt-1">{listItems}</ul>);
      listItems = [];
    }
  };

  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) { flushList(); continue; }
    if (t.startsWith('# '))       { flushList(); elements.push(<p key={elements.length} className="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-2">{t.slice(2)}</p>); }
    else if (t.startsWith('## ')) { flushList(); elements.push(<p key={elements.length} className="text-xs font-semibold text-gray-600 dark:text-gray-300 mt-1.5">{t.slice(3)}</p>); }
    else if (t.startsWith('- ') || t.startsWith('* ')) { listItems.push(<li key={listItems.length} className="text-xs text-gray-500 dark:text-gray-400">{t.slice(2)}</li>); }
    else {
      flushList();
      const formatted = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">$1</code>');
      if (formatted.includes('<strong>') || formatted.includes('<code')) {
        elements.push(<span key={elements.length} className="text-xs text-gray-500 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: formatted }} />);
      } else {
        elements.push(<p key={elements.length} className="text-xs text-gray-500 dark:text-gray-400">{t}</p>);
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
    <div className="group">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 ${meta.bg}`}>
          <RegIcon className={`w-3 h-3 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{skill.name}</span>
            {skill.source === 'user' && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Custom</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1 leading-snug">{skill.description}</p>
          {skill.tags?.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {skill.tags.slice(0, 4).map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500">{tag}</span>
              ))}
            </div>
          )}
        </div>
        {expanded
          ? <ChevronDown className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          : <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </button>

      {expanded && (
        <div className="mx-3 mb-2 pl-4 border-l border-gray-100 dark:border-gray-800 space-y-2 py-1">
          {skill.when_to_use && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600 mb-1">When to use</p>
              <div className="leading-relaxed space-y-0.5">{renderMarkdown(skill.when_to_use)}</div>
            </div>
          )}
          {skill.body && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600 mb-1">Process</p>
              <div className="leading-relaxed space-y-0.5">{renderMarkdown(skill.body)}</div>
            </div>
          )}
          {skill.tags?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {skill.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

SkillCard.propTypes = {
  skill: PropTypes.shape({
    brain_region: PropTypes.string,
    name: PropTypes.string.isRequired,
    source: PropTypes.string,
    description: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
    when_to_use: PropTypes.string,
    body: PropTypes.string,
  }).isRequired,
};

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

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter skills…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-transparent text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="flex items-center gap-2 py-12 justify-center text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading skills…</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2.5 py-8 px-4 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Failed to load skills</p>
              <p className="text-xs mt-0.5 text-red-500">{error}</p>
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
            <div key={region} className="mb-5">
              <div className="flex items-center gap-2 px-3 mb-1">
                <RegIcon className={`w-3 h-3 ${meta.color}`} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{meta.label}</span>
                <span className="text-[10px] text-gray-300 dark:text-gray-700 ml-0.5">· {meta.desc}</span>
                <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-700">{regionSkills.length}</span>
              </div>
              {regionSkills.sort((a, b) => a.name.localeCompare(b.name)).map(skill => (
                <SkillCard key={skill.name} skill={skill} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex-shrink-0 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-center">
        <p className="text-[11px] text-gray-300 dark:text-gray-700">Skills are matched automatically based on your goal</p>
      </div>
    </div>
  );
}
