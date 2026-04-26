import { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Search, Wrench, Terminal, File, Globe, Database,
  Brain, Loader2, AlertCircle, ChevronDown, ChevronRight,
  BookOpen, Cpu, ShieldAlert, Monitor,
  Bot,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/commandCenterApi';

const PERM_META = {
  safe:      { label: 'Safe',      dot: 'bg-emerald-500' },
  moderate:  { label: 'Moderate',  dot: 'bg-amber-500'   },
  dangerous: { label: 'Dangerous', dot: 'bg-red-500'     },
};

const TOOL_CATEGORY_META = {
  file:      { icon: File,        color: 'text-blue-500'        },
  shell:     { icon: Terminal,    color: 'text-gray-500'        },
  git:       { icon: BookOpen,    color: 'text-orange-500'      },
  search:    { icon: Globe,       color: 'text-purple-500'      },
  memory:    { icon: Brain,       color: 'text-pink-500'        },
  workspace: { icon: Database,    color: 'text-cyan-500'        },
  agent:     { icon: Cpu,         color: 'text-indigo-500'      },
  system:    { icon: Wrench,      color: 'text-gray-400'        },
  os:        { icon: Terminal,    color: 'text-green-600'       },
  screen:    { icon: Monitor,     color: 'text-violet-500'     },
  data:      { icon: Database,    color: 'text-teal-500'        },
  plan:      { icon: Brain,       color: 'text-rose-500'        },
  askUser:   { icon: ShieldAlert, color: 'text-amber-500'      },
  browser:   { icon: Globe,       color: 'text-sky-500'         },
  docker:    { icon: Cpu,         color: 'text-blue-400'        },
  dev:       { icon: Terminal,    color: 'text-emerald-500'     },
  general:   { icon: Wrench,      color: 'text-gray-400'        },
};

const BRAIN_REGION_META = {
  prefrontal:    { label: 'Prefrontal',    icon: Brain,     color: 'text-violet-500' },
  cerebellum:    { label: 'Cerebellum',    icon: BookOpen,  color: 'text-blue-500'   },
  hippocampus:   { label: 'Hippocampus',   icon: Cpu,       color: 'text-cyan-500'   },
  amygdala:      { label: 'Amygdala',      icon: ShieldAlert, color: 'text-red-500'    },
  basal_ganglia: { label: 'Basal Ganglia', icon: Brain,    color: 'text-amber-500'  },
  limbic:        { label: 'Limbic',        icon: BookOpen, color: 'text-pink-500'   },
  unknown:       { label: 'Other',         icon: Wrench,    color: 'text-gray-400'   },
};

const REGION_ORDER = ['prefrontal', 'cerebellum', 'hippocampus', 'amygdala', 'basal_ganglia', 'limbic', 'unknown'];

function getToolCategoryMeta(cat) {
  return TOOL_CATEGORY_META[cat?.toLowerCase()] || TOOL_CATEGORY_META.general;
}

function getRegionMeta(region) {
  const key = (region || 'unknown').toLowerCase().replace(/[\s-]+/g, '_');
  return BRAIN_REGION_META[key] || BRAIN_REGION_META.unknown;
}

function ToolCard({ tool, isFirst }) {
  const [expanded, setExpanded] = useState(false);
  const perm = PERM_META[tool.permission] || PERM_META.moderate;

  return (
    <div className={isFirst ? '' : 'border-t border-gray-100 dark:border-gray-800'}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
      >
        <span className={'flex-shrink-0 w-2 h-2 rounded-full ' + perm.dot} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tool.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{perm.label}</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{tool.description || 'No description'}</p>
        </div>
        <div className="text-gray-300 dark:text-gray-600">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-9">
          <p className="text-sm text-gray-600 dark:text-gray-400">{tool.description || 'No description'}</p>
          {tool.parameters && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Parameters</p>
              <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono overflow-x-auto">{typeof tool.parameters === 'string' ? tool.parameters : JSON.stringify(tool.parameters, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

ToolCard.propTypes = {
  tool: PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    permission: PropTypes.string,
    category: PropTypes.string,
    parameters: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  }).isRequired,
  isFirst: PropTypes.bool,
};

function SkillCard({ skill, isFirst }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getRegionMeta(skill.brain_region);
  const RegIcon = meta.icon;

  return (
    <div className={isFirst ? '' : 'border-t border-gray-100 dark:border-gray-800'}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
      >
        <div className="flex-shrink-0 w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center mt-0.5">
          <RegIcon className={'w-3.5 h-3.5 ' + meta.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{skill.name}</span>
            {skill.source === 'user' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">Custom</span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{skill.description}</p>
          {skill.tags?.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {skill.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-gray-300 dark:text-gray-600 mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-9 space-y-2">
          {skill.when_to_use && (
            <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
              <p className="text-[10px] font-medium text-violet-600 dark:text-violet-400 uppercase mb-1">When to use</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{skill.when_to_use}</p>
            </div>
          )}
          {skill.body && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Process</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{skill.body}</p>
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
  isFirst: PropTypes.bool,
};

function ToolSection({ category, catTools }) {
  const catMeta = getToolCategoryMeta(category);
  const CatIcon = catMeta.icon || Wrench;

  return (
    <div className="mb-6">
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <CatIcon className={'w-3.5 h-3.5 ' + catMeta.color} />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{category}</span>
        <span className="text-[10px] text-gray-400 ml-auto">{catTools.length}</span>
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
        {catTools.sort((a, b) => a.name.localeCompare(b.name)).map((tool, idx) => (
          <ToolCard key={tool.name} tool={tool} isFirst={idx === 0} />
        ))}
      </div>
    </div>
  );
}

function SkillSection({ region, regionSkills }) {
  const meta = getRegionMeta(region);
  const RegIcon = meta.icon;

  return (
    <div className="mb-6">
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <RegIcon className={'w-3.5 h-3.5 ' + meta.color} />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{meta.label}</span>
        <span className="text-[10px] text-gray-400 ml-auto">{regionSkills.length}</span>
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
        {regionSkills.sort((a, b) => a.name.localeCompare(b.name)).map((skill, idx) => (
          <SkillCard key={skill.name} skill={skill} isFirst={idx === 0} />
        ))}
      </div>
    </div>
  );
}

export default function AgentToolsSkillsPage({ initialTab = 'tools' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [tools, setTools] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loadingTools, setLoadingTools] = useState(true);
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [errorTools, setErrorTools] = useState(null);
  const [errorSkills, setErrorSkills] = useState(null);
  const [toolSearch, setToolSearch] = useState('');
  const [skillSearch, setSkillSearch] = useState('');
  const toolsFetchedRef = useRef(false);
  const skillsFetchedRef = useRef(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (toolsFetchedRef.current) return;
    toolsFetchedRef.current = true;
    fetchTools();
  }, []);

  useEffect(() => {
    if (skillsFetchedRef.current) return;
    skillsFetchedRef.current = true;
    fetchSkills();
  }, []);

  async function fetchTools() {
    setLoadingTools(true);
    setErrorTools(null);
    try {
      const res = await agentApi.getTools();
      setTools(res.tools || []);
    } catch (err) {
      setErrorTools(err.message || 'Failed to load tools');
    } finally {
      setLoadingTools(false);
    }
  }

  async function fetchSkills() {
    setLoadingSkills(true);
    setErrorSkills(null);
    try {
      const res = await agentApi.getSkills();
      setSkills(res.skills || []);
    } catch (err) {
      setErrorSkills(err.message || 'Failed to load skills');
    } finally {
      setLoadingSkills(false);
    }
  }

  const filteredTools = useMemo(() => {
    if (!toolSearch.trim()) return tools;
    const q = toolSearch.toLowerCase();
    return tools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  }, [tools, toolSearch]);

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skills;
    const q = skillSearch.toLowerCase();
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.brain_region || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [skills, skillSearch]);

  const toolsByCategory = useMemo(() => {
    const groups = {};
    for (const tool of filteredTools) {
      const cat = tool.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tool);
    }
    return groups;
  }, [filteredTools]);

  const skillsByRegion = useMemo(() => {
    const groups = {};
    for (const s of filteredSkills) {
      const r = (s.brain_region || 'unknown').toLowerCase().replace(/[\s-]+/g, '_');
      if (!groups[r]) groups[r] = [];
      groups[r].push(s);
    }
    return groups;
  }, [filteredSkills]);

  const safeCount   = tools.filter(t => t.permission === 'safe').length;
  const modCount    = tools.filter(t => t.permission === 'moderate').length;
  const dangerCount = tools.filter(t => t.permission === 'dangerous').length;

  const toolsTabActive = activeTab === 'tools';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h1 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Agent Tools & Skills</h1>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{tools.length} tools</span>
            <span>{skills.length} skills</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-slate-950/50">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('tools')}
            className={toolsTabActive
              ? 'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 shadow-sm'
              : 'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}
          >
            <Wrench className="w-3.5 h-3.5" />
            Tools
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={!toolsTabActive
              ? 'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 shadow-sm'
              : 'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}
          >
            <Bot className="w-3.5 h-3.5" />
            Skills
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {toolsTabActive && (
          <>
            {/* Search + stats */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-slate-950/50">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={toolSearch}
                  onChange={e => setToolSearch(e.target.value)}
                  placeholder="Search tools..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 midnight:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                />
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Safe {safeCount}</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Moderate {modCount}</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Dangerous {dangerCount}</span>
              </div>
            </div>

            {/* Tools list */}
            {loadingTools && (
              <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading tools...</span>
              </div>
            )}
            {errorTools && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load tools</p>
                <button onClick={fetchTools} className="text-xs text-gray-500 hover:text-gray-700 underline">Try again</button>
              </div>
            )}
            {!loadingTools && !errorTools && Object.keys(toolsByCategory).length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                <Search className="w-6 h-6" />
                <p className="text-sm">{toolSearch ? 'No tools match your search' : 'No tools available'}</p>
              </div>
            )}
            {!loadingTools && !errorTools && Object.entries(toolsByCategory).map(([category, catTools]) => (
              <ToolSection key={category} category={category} catTools={catTools} />
            ))}
          </>
        )}

        {!toolsTabActive && (
          <>
            {/* Search */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-slate-950/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={skillSearch}
                  onChange={e => setSkillSearch(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 midnight:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                />
              </div>
            </div>

            {/* Skills list */}
            {loadingSkills && (
              <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading skills...</span>
              </div>
            )}
            {errorSkills && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load skills</p>
                <button onClick={fetchSkills} className="text-xs text-gray-500 hover:text-gray-700 underline">Try again</button>
              </div>
            )}
            {!loadingSkills && !errorSkills && Object.keys(skillsByRegion).length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                <Search className="w-6 h-6" />
                <p className="text-sm">{skillSearch ? 'No skills match your search' : 'No skills available'}</p>
              </div>
            )}
            {!loadingSkills && !errorSkills && REGION_ORDER.map(region => {
              const regionSkills = skillsByRegion[region];
              if (!regionSkills?.length) return null;
              return <SkillSection key={region} region={region} regionSkills={regionSkills} />;
            })}
          </>
        )}
      </div>
    </div>
  );
}

AgentToolsSkillsPage.propTypes = {
  initialTab: PropTypes.oneOf(['tools', 'skills']),
};