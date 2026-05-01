import { useState, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Search, Wrench, File,
  Brain, Loader2, AlertCircle, ChevronDown, ChevronRight,
  BookOpen, Cpu, ShieldAlert,
  Bot, Save, Edit2, X, Check, BookMarked, Trash2,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/commandCenterApi';

const PERM_META = {
  safe:      { label: 'Safe',      dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' },
  moderate:  { label: 'Moderate',  dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  dangerous: { label: 'Dangerous', dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
};

const BRAIN_REGION_META = {
  prefrontal:    { label: 'Planning',      icon: Brain,       color: 'text-violet-500', desc: 'Goal shaping and step-by-step reasoning' },
  cerebellum:    { label: 'Workflow',      icon: BookOpen,    color: 'text-blue-500',   desc: 'Procedures, craft patterns, and repeatable execution' },
  hippocampus:   { label: 'Recall',        icon: Cpu,         color: 'text-cyan-500',   desc: 'Context retrieval and learned project knowledge' },
  amygdala:      { label: 'Risk Checks',   icon: ShieldAlert, color: 'text-red-500',    desc: 'Safety, permissions, and high-impact cautions' },
  basal_ganglia: { label: 'Habits',        icon: Brain,       color: 'text-amber-500',  desc: 'Default behaviors and operating preferences' },
  limbic:        { label: 'Tone',          icon: BookOpen,    color: 'text-pink-500',   desc: 'Style, empathy, and user-facing expression' },
  unknown:       { label: 'Other',         icon: Wrench,      color: 'text-gray-400',   desc: 'Uncategorized skills' },
};

const REGION_ORDER = ['prefrontal', 'cerebellum', 'hippocampus', 'amygdala', 'basal_ganglia', 'limbic', 'unknown'];

function getRegionMeta(region) {
  const key = (region || 'unknown').toLowerCase().replace(/[\s-]+/g, '_');
  return BRAIN_REGION_META[key] || BRAIN_REGION_META.unknown;
}

function formatLabel(value) {
  return (value || 'general')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function renderInlineMarkdown(text, keyPrefix) {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${parts.length}`;
    if (token.startsWith('`')) {
      parts.push(
        <code key={key} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.92em] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<strong key={key} className="font-semibold text-gray-900 dark:text-gray-100">{token.slice(2, -2)}</strong>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : text;
}

function parseSoulMarkdown(content) {
  if (!content?.trim()) return [];

  const withoutFrontmatter = content.replace(/^---[\s\S]*?\n---\s*/, '');
  const lines = withoutFrontmatter.split(/\r\n|\r|\n/);
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  lines.forEach(line => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', depth: heading[1].length, text: heading[2] });
      return;
    }

    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      blocks.push({ type: 'numbered', number: numbered[1], text: numbered[2] });
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      blocks.push({ type: 'bullet', text: bullet[1] });
      return;
    }

    paragraph.push(trimmed);
  });

  flushParagraph();
  return blocks;
}

function SoulPreview({ content }) {
  const blocks = useMemo(() => parseSoulMarkdown(content), [content]);

  return (
    <article className="min-h-[52vh] bg-white px-7 py-8 text-sm leading-7 text-gray-700 dark:bg-gray-900 dark:text-gray-300 midnight:bg-slate-950 midnight:text-slate-300 sm:px-10">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const HeadingTag = block.depth === 1 ? 'h1' : block.depth === 2 ? 'h2' : 'h3';
          const headingClass = block.depth === 1
            ? 'mb-5 text-xl font-semibold text-gray-950 dark:text-white'
            : 'mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-100';
          return (
            <HeadingTag key={`heading-${idx}`} className={headingClass}>
              {renderInlineMarkdown(block.text, `heading-${idx}`)}
            </HeadingTag>
          );
        }

        if (block.type === 'numbered') {
          return (
            <div key={`numbered-${idx}`} className="my-4 flex gap-3">
              <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {block.number}
              </span>
              <p className="min-w-0">{renderInlineMarkdown(block.text, `numbered-${idx}`)}</p>
            </div>
          );
        }

        if (block.type === 'bullet') {
          return (
            <div key={`bullet-${idx}`} className="my-2 flex gap-3">
              <span className="mt-3 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
              <p className="min-w-0">{renderInlineMarkdown(block.text, `bullet-${idx}`)}</p>
            </div>
          );
        }

        return (
          <p key={`paragraph-${idx}`} className="mb-5 max-w-4xl">
            {renderInlineMarkdown(block.text, `paragraph-${idx}`)}
          </p>
        );
      })}
    </article>
  );
}

SoulPreview.propTypes = {
  content: PropTypes.string.isRequired,
};

function MarkdownPanel({ content, emptyText = 'No description' }) {
  const blocks = useMemo(() => parseSoulMarkdown(content || ''), [content]);

  if (!blocks.length) {
    return <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{emptyText}</p>;
  }

  return (
    <div className="space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300 midnight:text-slate-300">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const HeadingTag = block.depth === 1 ? 'h3' : 'h4';
          const headingClass = block.depth === 1
            ? 'pt-1 text-base font-semibold text-gray-950 dark:text-white'
            : 'pt-3 text-xs font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200';
          return (
            <HeadingTag key={`md-heading-${idx}`} className={headingClass}>
              {renderInlineMarkdown(block.text, `md-heading-${idx}`)}
            </HeadingTag>
          );
        }

        if (block.type === 'numbered') {
          return (
            <div key={`md-numbered-${idx}`} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {block.number}
              </span>
              <p className="min-w-0">{renderInlineMarkdown(block.text, `md-numbered-${idx}`)}</p>
            </div>
          );
        }

        if (block.type === 'bullet') {
          return (
            <div key={`md-bullet-${idx}`} className="flex gap-3">
              <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
              <p className="min-w-0">{renderInlineMarkdown(block.text, `md-bullet-${idx}`)}</p>
            </div>
          );
        }

        return (
          <p key={`md-paragraph-${idx}`} className="min-w-0">
            {renderInlineMarkdown(block.text, `md-paragraph-${idx}`)}
          </p>
        );
      })}
    </div>
  );
}

MarkdownPanel.propTypes = {
  content: PropTypes.string,
  emptyText: PropTypes.string,
};

function ToolCard({ tool, isFirst, selected, onSelect }) {
  const perm = PERM_META[tool.permission] || PERM_META.moderate;

  return (
    <div className={isFirst ? '' : 'border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800'}>
      <button
        onClick={onSelect}
        className={`group w-full px-4 py-3 text-left transition-colors ${
          selected
            ? 'bg-gray-100/80 dark:bg-gray-800/70 midnight:bg-slate-900'
            : 'hover:bg-gray-50/70 dark:hover:bg-gray-800/45 midnight:hover:bg-slate-900/55'
        }`}
      >
        <div className="flex items-start gap-3">
          <span className={'mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full ' + perm.dot} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">{tool.name}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${perm.badge}`}>{perm.label}</span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{tool.description || 'No description'}</p>
          </div>
          <div className="mt-0.5 text-gray-300 transition-colors group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </button>
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
  selected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
};

function SkillCard({ skill, isFirst, selected, onSelect }) {
  const meta = getRegionMeta(skill.brain_region);

  return (
    <div className={isFirst ? '' : 'border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800'}>
      <button
        onClick={onSelect}
        className={`group w-full px-4 py-3 text-left transition-colors ${
          selected
            ? 'bg-gray-100/80 dark:bg-gray-800/70 midnight:bg-slate-900'
            : 'hover:bg-gray-50/70 dark:hover:bg-gray-800/45 midnight:hover:bg-slate-900/55'
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">{skill.name}</span>
              {skill.source === 'user' && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Custom</span>
              )}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">{meta.label}</span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{skill.description || 'No description'}</p>
            {skill.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {skill.tags.slice(0, 4).map(tag => (
                  <span key={tag} className="rounded border border-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:border-gray-800 dark:text-gray-500">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="mt-0.5 text-gray-300 transition-colors group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </button>
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
  selected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
};

function ToolSection({ category, catTools, selectedToolName, onSelectTool }) {
  const sortedTools = useMemo(() => [...catTools].sort((a, b) => a.name.localeCompare(b.name)), [catTools]);

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/35 midnight:border-slate-800 midnight:bg-slate-900/35">
        <div className="min-w-0">
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">{formatLabel(category)}</h2>
        </div>
        <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] text-gray-500 ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">{catTools.length}</span>
      </div>
      <div>
        {sortedTools.map((tool, idx) => (
          <ToolCard key={tool.name} tool={tool} isFirst={idx === 0} selected={tool.name === selectedToolName} onSelect={() => onSelectTool(tool)} />
        ))}
      </div>
    </section>
  );
}

ToolSection.propTypes = {
  category: PropTypes.string.isRequired,
  catTools: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    permission: PropTypes.string,
    category: PropTypes.string,
    parameters: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  })).isRequired,
  selectedToolName: PropTypes.string,
  onSelectTool: PropTypes.func.isRequired,
};

function SkillSection({ region, regionSkills, selectedSkillName, onSelectSkill }) {
  const meta = getRegionMeta(region);
  const sortedSkills = useMemo(() => [...regionSkills].sort((a, b) => a.name.localeCompare(b.name)), [regionSkills]);

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/35 midnight:border-slate-800 midnight:bg-slate-900/35">
        <div className="min-w-0">
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">{meta.label}</h2>
          <p className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">{meta.desc}</p>
        </div>
        <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] text-gray-500 ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">{regionSkills.length}</span>
      </div>
      <div>
        {sortedSkills.map((skill, idx) => (
          <SkillCard key={skill.name} skill={skill} isFirst={idx === 0} selected={skill.name === selectedSkillName} onSelect={() => onSelectSkill(skill)} />
        ))}
      </div>
    </section>
  );
}

SkillSection.propTypes = {
  region: PropTypes.string.isRequired,
  regionSkills: PropTypes.arrayOf(PropTypes.shape({
    brain_region: PropTypes.string,
    name: PropTypes.string.isRequired,
    source: PropTypes.string,
    description: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
    when_to_use: PropTypes.string,
    body: PropTypes.string,
  })).isRequired,
  selectedSkillName: PropTypes.string,
  onSelectSkill: PropTypes.func.isRequired,
};

function ToolInspector({ tool }) {
  if (!tool) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-gray-400">
        Select a tool to inspect its description and parameters.
      </div>
    );
  }

  const perm = PERM_META[tool.permission] || PERM_META.moderate;

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className={'mt-2 h-2 w-2 flex-shrink-0 rounded-full ' + perm.dot} />
        <div className="min-w-0">
          <h3 className="break-words font-mono text-base font-semibold text-gray-950 dark:text-white midnight:text-slate-100">{tool.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${perm.badge}`}>{perm.label}</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {formatLabel(tool.category)}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5 dark:border-gray-800 midnight:border-slate-800">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
        <MarkdownPanel content={tool.description} />
      </div>

      {tool.parameters && (
        <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800 midnight:border-slate-800">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Parameters</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-gray-100 bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-300 midnight:border-slate-800 midnight:bg-slate-950/60">
            {typeof tool.parameters === 'string' ? tool.parameters : JSON.stringify(tool.parameters, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

ToolInspector.propTypes = {
  tool: PropTypes.shape({
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    permission: PropTypes.string,
    category: PropTypes.string,
    parameters: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  }),
};

function SkillInspector({ skill }) {
  if (!skill) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-gray-400">
        Select a skill to read its description and process.
      </div>
    );
  }

  const meta = getRegionMeta(skill.brain_region);

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h3 className="break-words text-base font-semibold text-gray-950 dark:text-white midnight:text-slate-100">{skill.name}</h3>
          {skill.source === 'user' && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Custom</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">{meta.label}</span>
          {skill.tags?.map(tag => (
            <span key={tag} className="rounded border border-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:border-gray-800 dark:text-gray-500">{tag}</span>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5 dark:border-gray-800 midnight:border-slate-800">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
        <MarkdownPanel content={skill.description} />
      </div>

      {skill.when_to_use && (
        <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800 midnight:border-slate-800">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">When to use</p>
          <MarkdownPanel content={skill.when_to_use} />
        </div>
      )}

      {skill.body && (
        <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800 midnight:border-slate-800">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Process</p>
          <MarkdownPanel content={skill.body} emptyText="No process notes" />
        </div>
      )}
    </div>
  );
}

SkillInspector.propTypes = {
  skill: PropTypes.shape({
    brain_region: PropTypes.string,
    name: PropTypes.string.isRequired,
    source: PropTypes.string,
    description: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
    when_to_use: PropTypes.string,
    body: PropTypes.string,
  }),
};

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
  const [selectedToolName, setSelectedToolName] = useState(null);
  const [selectedSkillName, setSelectedSkillName] = useState(null);
  const toolsFetchedRef = useRef(false);
  const skillsFetchedRef = useRef(false);

  const [soulContent, setSoulContent] = useState('');
  const [soulEdited, setSoulEdited] = useState('');
  const [loadingSoul, setLoadingSoul] = useState(false);
  const [errorSoul, setErrorSoul] = useState(null);
  const [editingSoul, setEditingSoul] = useState(false);
  const [savingSoul, setSavingSoul] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const soulFetchedRef = useRef(false);

  const [memories, setMemories] = useState([]);
  const [memorySearch, setMemorySearch] = useState('');
  const [memoryKind, setMemoryKind] = useState('all');
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [errorMemory, setErrorMemory] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);

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

  useEffect(() => {
    if (activeTab !== 'soul' || soulFetchedRef.current) return;
    soulFetchedRef.current = true;
    fetchSoul();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'memory') return;
    fetchMemories();
  }, [activeTab, memorySearch, memoryKind]);

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

  async function fetchSoul() {
    setLoadingSoul(true);
    setErrorSoul(null);
    try {
      const res = await agentApi.getSoul();
      setSoulContent(res.content || '');
      setSoulEdited(res.content || '');
    } catch (err) {
      setErrorSoul(err.message || 'Failed to load soul');
    } finally {
      setLoadingSoul(false);
    }
  }

  async function saveSoul() {
    setSavingSoul(true);
    setSaveSuccess(false);
    try {
      await agentApi.updateSoul(soulEdited);
      setSoulContent(soulEdited);
      setEditingSoul(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setErrorSoul(err.message || 'Failed to save soul');
    } finally {
      setSavingSoul(false);
    }
  }

  function cancelEdit() {
    setSoulEdited(soulContent);
    setEditingSoul(false);
  }

  async function fetchMemories() {
    setLoadingMemory(true);
    setErrorMemory(null);
    try {
      const res = await agentApi.getMemories({ q: memorySearch.trim(), kind: memoryKind });
      setMemories(res.memories || []);
    } catch (err) {
      setErrorMemory(err.message || 'Failed to load memories');
    } finally {
      setLoadingMemory(false);
    }
  }

  async function deleteMemory(key) {
    setDeletingKey(key);
    try {
      await agentApi.deleteMemory(key);
      setMemories(prev => prev.filter(m => m.key !== key));
    } catch (err) {
      setErrorMemory(err.message || 'Failed to delete memory');
    } finally {
      setDeletingKey(null);
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

  const selectedTool = useMemo(
    () => filteredTools.find(tool => tool.name === selectedToolName) || filteredTools[0] || null,
    [filteredTools, selectedToolName]
  );
  const activeToolName = selectedTool?.name || null;
  const selectedSkill = useMemo(
    () => filteredSkills.find(skill => skill.name === selectedSkillName) || filteredSkills[0] || null,
    [filteredSkills, selectedSkillName]
  );
  const activeSkillName = selectedSkill?.name || null;

  const safeCount   = tools.filter(t => t.permission === 'safe').length;
  const modCount    = tools.filter(t => t.permission === 'moderate').length;
  const dangerCount = tools.filter(t => t.permission === 'dangerous').length;
  const toolCategoryCount = Object.keys(toolsByCategory).length;
  const skillRegionCount = Object.values(skillsByRegion).filter(group => group.length > 0).length;
  const customSkillCount = skills.filter(s => s.source === 'user').length;
  const soulStats = useMemo(() => {
    const source = editingSoul ? soulEdited : soulContent;
    const trimmed = source.trim();
    return {
      lines: source ? source.split(/\r\n|\r|\n/).length : 0,
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      chars: source.length,
    };
  }, [editingSoul, soulContent, soulEdited]);
  const soulDirty = soulEdited !== soulContent;

  const toolsTabActive   = activeTab === 'tools';
  const skillsTabActive  = activeTab === 'skills';
  const soulTabActive    = activeTab === 'soul';
  const memoryTabActive  = activeTab === 'memory';

  function tabClass(isActive) {
    return isActive
      ? 'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 shadow-sm'
      : 'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300';
  }

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
            {saveSuccess && <span className="text-emerald-500 flex items-center gap-1"><Check className="w-3 h-3" />Soul saved</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-slate-950/50">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 rounded-lg w-fit">
          <button onClick={() => setActiveTab('tools')} className={tabClass(toolsTabActive)}>
            <Wrench className="w-3.5 h-3.5" />
            Tools
          </button>
          <button onClick={() => setActiveTab('skills')} className={tabClass(skillsTabActive)}>
            <Bot className="w-3.5 h-3.5" />
            Skills
          </button>
          <button onClick={() => setActiveTab('soul')} className={tabClass(soulTabActive)}>
            <File className="w-3.5 h-3.5" />
            Soul
          </button>
          <button onClick={() => setActiveTab('memory')} className={tabClass(memoryTabActive)}>
            <BookMarked className="w-3.5 h-3.5" />
            Memory
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {toolsTabActive && (
          <div className="grid h-full overflow-hidden bg-gray-50/40 dark:bg-gray-950/20 midnight:bg-slate-950 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b border-gray-100 bg-white px-6 py-5 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">What this shows</p>
                  <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                    Tools are the actions the agent can request while working, from reading files to running shell commands and using workspace services.
                  </p>
                </div>
                <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Permission levels</p>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Safe</span><span className="font-mono text-gray-800 dark:text-gray-200">{safeCount}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Moderate</span><span className="font-mono text-gray-800 dark:text-gray-200">{modCount}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Dangerous</span><span className="font-mono text-gray-800 dark:text-gray-200">{dangerCount}</span></div>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Catalog</p>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3"><span className="text-gray-500 dark:text-gray-400">Visible tools</span><span className="font-mono text-gray-800 dark:text-gray-200">{filteredTools.length}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-gray-500 dark:text-gray-400">Groups</span><span className="font-mono text-gray-800 dark:text-gray-200">{toolCategoryCount}</span></div>
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-h-0 min-w-0 overflow-hidden px-4 py-5 sm:px-6">
              <div className="mx-auto grid h-full max-w-7xl grid-rows-[minmax(0,1fr)_minmax(280px,42vh)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-none">
                <section className="flex min-h-0 min-w-0 flex-col">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Tool Catalog</h2>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Search by name, description, or group. Select a row to inspect parameters.</p>
                    </div>
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={toolSearch}
                        onChange={e => setToolSearch(e.target.value)}
                        placeholder="Search tools"
                        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-gray-600 dark:focus:ring-gray-800 midnight:border-slate-800 midnight:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {loadingTools && (
                    <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading tools...</span>
                    </div>
                  )}
                  {errorTools && (
                    <div className="flex flex-col items-center justify-center gap-3 py-20">
                    <AlertCircle className="h-6 w-6 text-red-500" />
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load tools</p>
                    <button onClick={fetchTools} className="text-xs text-gray-500 underline hover:text-gray-700">Try again</button>
                    </div>
                  )}
                  {!loadingTools && !errorTools && Object.keys(toolsByCategory).length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white py-20 text-gray-400 dark:border-gray-800 dark:bg-gray-900">
                    <Search className="h-6 w-6" />
                    <p className="text-sm">{toolSearch ? 'No tools match your search' : 'No tools available'}</p>
                    </div>
                  )}
                  {!loadingTools && !errorTools && Object.entries(toolsByCategory).length > 0 && (
                    <div className="space-y-4 pb-4">
                      {Object.entries(toolsByCategory).map(([category, catTools]) => (
                        <ToolSection key={category} category={category} catTools={catTools} selectedToolName={activeToolName} onSelectTool={tool => setSelectedToolName(tool.name)} />
                      ))}
                    </div>
                  )}
                  </div>
                </section>

                <aside className="min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <ToolInspector tool={selectedTool} />
                </aside>
              </div>
            </main>
          </div>
        )}

        {skillsTabActive && (
          <div className="grid h-full overflow-hidden bg-gray-50/40 dark:bg-gray-950/20 midnight:bg-slate-950 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b border-gray-100 bg-white px-6 py-5 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">What this shows</p>
                  <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                    Skills are reusable instruction packs the agent can load automatically when a task matches their purpose.
                  </p>
                </div>
                <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Catalog</p>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3"><span className="text-gray-500 dark:text-gray-400">Visible skills</span><span className="font-mono text-gray-800 dark:text-gray-200">{filteredSkills.length}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-gray-500 dark:text-gray-400">Groups</span><span className="font-mono text-gray-800 dark:text-gray-200">{skillRegionCount}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-gray-500 dark:text-gray-400">Custom</span><span className="font-mono text-gray-800 dark:text-gray-200">{customSkillCount}</span></div>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">How they run</p>
                  <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                    The agent chooses relevant skills in context. Opening a row shows when it applies and what process it adds.
                  </p>
                </div>
              </div>
            </aside>

            <main className="min-h-0 min-w-0 overflow-hidden px-4 py-5 sm:px-6">
              <div className="mx-auto grid h-full max-w-7xl grid-rows-[minmax(0,1fr)_minmax(280px,42vh)] gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-none">
                <section className="flex min-h-0 min-w-0 flex-col">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Skill Library</h2>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Search by name, description, group, or tag. Select a row to read its instructions.</p>
                    </div>
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={skillSearch}
                        onChange={e => setSkillSearch(e.target.value)}
                        placeholder="Search skills"
                        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-gray-600 dark:focus:ring-gray-800 midnight:border-slate-800 midnight:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {loadingSkills && (
                    <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading skills...</span>
                    </div>
                  )}
                  {errorSkills && (
                    <div className="flex flex-col items-center justify-center gap-3 py-20">
                    <AlertCircle className="h-6 w-6 text-red-500" />
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load skills</p>
                    <button onClick={fetchSkills} className="text-xs text-gray-500 underline hover:text-gray-700">Try again</button>
                    </div>
                  )}
                  {!loadingSkills && !errorSkills && Object.keys(skillsByRegion).length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white py-20 text-gray-400 dark:border-gray-800 dark:bg-gray-900">
                    <Search className="h-6 w-6" />
                    <p className="text-sm">{skillSearch ? 'No skills match your search' : 'No skills available'}</p>
                    </div>
                  )}
                  {!loadingSkills && !errorSkills && Object.keys(skillsByRegion).length > 0 && (
                    <div className="space-y-4 pb-4">
                      {REGION_ORDER.map(region => {
                        const regionSkills = skillsByRegion[region];
                        if (!regionSkills?.length) return null;
                        return <SkillSection key={region} region={region} regionSkills={regionSkills} selectedSkillName={activeSkillName} onSelectSkill={skill => setSelectedSkillName(skill.name)} />;
                      })}
                    </div>
                  )}
                  </div>
                </section>

                <aside className="min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                  <SkillInspector skill={selectedSkill} />
                </aside>
              </div>
            </main>
          </div>
        )}

        {soulTabActive && (
          <div className="flex h-full flex-col bg-gray-50/40 dark:bg-gray-950/20 midnight:bg-slate-950">
            <div className="flex flex-col gap-3 border-b border-gray-100 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">default.md</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    editingSoul
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                  }`}>
                    {editingSoul ? (soulDirty ? 'Editing' : 'No changes') : 'Active'}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                  Agent persona &amp; operating rules
                </p>
              </div>

              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="hidden items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 sm:flex">
                    <Check className="h-3.5 w-3.5" />
                    Saved
                  </span>
                )}
                {!editingSoul && !loadingSoul && !errorSoul && (
                  <button
                    onClick={() => setEditingSoul(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                {editingSoul && (
                  <>
                    <button
                      onClick={cancelEdit}
                      disabled={savingSoul}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      onClick={saveSoul}
                      disabled={savingSoul || !soulDirty}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                    >
                      {savingSoul ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </>
                )}
              </div>
            </div>

            {loadingSoul && (
              <div className="flex flex-1 items-center justify-center gap-2 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading soul...</span>
              </div>
            )}

            {errorSoul && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertCircle className="h-6 w-6 text-red-500" />
                <p className="text-sm font-medium text-red-600 dark:text-red-400">{errorSoul}</p>
                <button
                  onClick={() => { soulFetchedRef.current = false; fetchSoul(); }}
                  className="text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Retry
                </button>
              </div>
            )}

            {!loadingSoul && !errorSoul && (
              <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)]">
                <aside className="border-b border-gray-100 bg-white px-6 py-5 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950 lg:border-b-0 lg:border-r">
                  <div className="space-y-5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">What this controls</p>
                      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                        The soul is the default instruction file for the local agent: its identity, working style, and rules before a task starts.
                      </p>
                    </div>

                    <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">How to edit</p>
                      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                        Preview renders the Markdown for reading. Edit shows the raw file so headings, lists, and front matter stay exactly as saved.
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Document</p>
                      <div className="mt-2 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-500 dark:text-gray-400">Lines</span>
                          <span className="font-mono text-gray-800 dark:text-gray-200">{soulStats.lines}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-500 dark:text-gray-400">Words</span>
                          <span className="font-mono text-gray-800 dark:text-gray-200">{soulStats.words}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-500 dark:text-gray-400">Characters</span>
                          <span className="font-mono text-gray-800 dark:text-gray-200">{soulStats.chars}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">State</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <span className={`h-1.5 w-1.5 rounded-full ${soulDirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {editingSoul ? (soulDirty ? 'Unsaved changes' : 'Ready to edit') : 'Loaded from profile'}
                      </div>
                    </div>
                  </div>
                </aside>

                <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
                  <div className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2 dark:border-gray-800 dark:bg-gray-800/40 midnight:border-slate-800 midnight:bg-slate-900/40">
                      <span className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">souls/default.md</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {editingSoul ? 'Edit mode' : 'Preview'}
                      </span>
                    </div>

                    {!editingSoul && soulContent && (
                      <SoulPreview content={soulContent} />
                    )}

                    {editingSoul && (
                      <textarea
                        value={soulEdited}
                        onChange={e => setSoulEdited(e.target.value)}
                        className="h-[60vh] w-full resize-none bg-white p-5 font-mono text-xs leading-6 text-gray-800 outline-none focus:ring-2 focus:ring-inset focus:ring-gray-300 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-gray-700 midnight:bg-slate-950 midnight:text-slate-100 sm:p-6"
                        spellCheck={false}
                      />
                    )}

                    {!editingSoul && !soulContent && (
                      <div className="flex min-h-[52vh] items-center justify-center px-6 text-sm text-gray-400">
                        No soul file found.
                      </div>
                    )}
                  </div>
                </main>
              </div>
            )}
          </div>
        )}

        {memoryTabActive && (
          <div className="flex flex-col h-full">
            {/* Search + filter bar */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={memorySearch}
                  onChange={e => setMemorySearch(e.target.value)}
                  placeholder="Search memories…"
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                />
              </div>
              <select
                value={memoryKind}
                onChange={e => setMemoryKind(e.target.value)}
                className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-gray-600 dark:text-gray-300 focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="user">user</option>
                <option value="feedback">feedback</option>
                <option value="project">project</option>
                <option value="reference">reference</option>
                <option value="fact">fact</option>
                <option value="preference">preference</option>
                <option value="context">context</option>
                <option value="task_state">task_state</option>
              </select>
              <span className="text-xs text-gray-400 whitespace-nowrap">{memories.length} entries</span>
            </div>

            {/* Memory list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/60">
              {loadingMemory && (
                <div className="flex items-center gap-2 py-16 justify-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading memories…</span>
                </div>
              )}
              {errorMemory && (
                <div className="flex flex-col items-center gap-2 py-16 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-sm">{errorMemory}</p>
                  <button onClick={fetchMemories} className="text-xs text-gray-400 hover:text-gray-600 underline mt-1">Retry</button>
                </div>
              )}
              {!loadingMemory && !errorMemory && memories.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                  <BookMarked className="w-6 h-6" />
                  <p className="text-sm">{memorySearch ? 'No memories match your search' : 'No memories stored yet'}</p>
                </div>
              )}
              {!loadingMemory && !errorMemory && memories.map(mem => (
                <MemoryRow key={mem.key} mem={mem} onDelete={deleteMemory} deleting={deletingKey === mem.key} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const KIND_COLORS = {
  user:       'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  feedback:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  project:    'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  reference:  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  fact:       'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  preference: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  context:    'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  task_state: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
};

function MemoryRow({ mem, onDelete, deleting }) {
  const [expanded, setExpanded] = useState(false);
  const kindColor = KIND_COLORS[mem.kind || mem.memory_type] || KIND_COLORS.fact;
  const tags = Array.isArray(mem.tags) ? mem.tags : (typeof mem.tags === 'string' ? mem.tags.replaceAll('[', '').replaceAll(']', '').split(',').map(t => t.trim()).filter(Boolean) : []);
  const importance = Number(mem.importance ?? 0.5);
  const importanceDots = Math.round(importance * 5);

  return (
    <div className="px-6 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group">
      <div className="flex items-start gap-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 mt-0.5 text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-500"
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200 font-mono">{mem.key}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${kindColor}`}>
              {mem.kind || mem.memory_type || 'fact'}
            </span>
            {tags.map(tag => (
              <span key={tag} className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500">{tag}</span>
            ))}
            <span className="text-[10px] text-gray-300 dark:text-gray-700 ml-auto flex items-center gap-0.5" title={`Importance: ${importance.toFixed(1)}`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`w-1 h-1 rounded-full ${i < importanceDots ? 'bg-indigo-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
              ))}
            </span>
          </div>
          <p className={`text-xs text-gray-500 dark:text-gray-400 mt-0.5 ${expanded ? '' : 'truncate'}`}>
            {mem.content}
          </p>
          {expanded && (
            <div className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-600 flex gap-3 flex-wrap">
              {mem.last_accessed_at && <span>Last used: {new Date(mem.last_accessed_at).toLocaleDateString()}</span>}
              {mem.access_count > 0 && <span>Used {mem.access_count}×</span>}
              {mem.created_at && <span>Created: {new Date(mem.created_at).toLocaleDateString()}</span>}
            </div>
          )}
        </div>

        <button
          onClick={() => onDelete(mem.key)}
          disabled={deleting}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          title="Delete memory"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

MemoryRow.propTypes = {
  mem: PropTypes.shape({
    key: PropTypes.string.isRequired,
    kind: PropTypes.string,
    memory_type: PropTypes.string,
    tags: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.string), PropTypes.string]),
    importance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    content: PropTypes.string,
    last_accessed_at: PropTypes.string,
    access_count: PropTypes.number,
    created_at: PropTypes.string,
  }).isRequired,
  onDelete: PropTypes.func.isRequired,
  deleting: PropTypes.bool,
};

AgentToolsSkillsPage.propTypes = {
  initialTab: PropTypes.oneOf(['tools', 'skills', 'soul', 'memory']),
};
