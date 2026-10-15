import { useState, useEffect, useCallback } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import {
  Search, Wrench,
  Loader2, AlertCircle,
  Bot, Edit2, BookMarked, Trash2, RefreshCw, Plus,
} from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import { AddMemoryForm, MemoryEditor, MemoryOwnerSelect } from './memoryParts.jsx';
import { MEMORY_KIND_OPTIONS } from './memoryKinds.js';
import Select from '../components/ui/Select.jsx';
import { useMemoryOwners } from './useMemoryOwners.js';
import ToolsTab from './ToolsTab.jsx';
import SkillsTab from './SkillsTab.jsx';
import { useSkillCatalog, useToolCatalog } from './useCatalogs.js';

const MEMORY_KIND_FILTER = [{ value: 'all', label: 'All kinds' }, ...MEMORY_KIND_OPTIONS];

// The instructions file was the Soul tab here; it lives in Settings now.
export default function AgentToolsSkillsPage(props) {
  const [searchParams] = useSearchParams();
  if (searchParams.get('tab') === 'soul') return <Navigate to="/settings/personalization#instructions" replace />;
  return <ToolsSkillsTabs {...props} />;
}

function ToolsSkillsTabs({ initialTab = 'tools' }) {
  // `?tab=memory` (or skills/tools) opens a specific tab, e.g. from ⌘K.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const startTab = ['tools', 'skills', 'memory'].includes(requestedTab) ? requestedTab : initialTab;
  const [activeTab, setActiveTab] = useState(startTab);
  const toolCatalog = useToolCatalog();
  const skillCatalog = useSkillCatalog();

  const [memories, setMemories] = useState([]);
  const [memorySearch, setMemorySearch] = useState('');
  const [memoryKind, setMemoryKind] = useState('all');
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [errorMemory, setErrorMemory] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [memoryStats, setMemoryStats] = useState(null);
  const [consolidating, setConsolidating] = useState(false);
  // ?scope=project:<id> | agent:<id> | cat:<id> | shared — one owner's memories.
  const [memoryScope, setMemoryScope] = useState(() => searchParams.get('scope') || 'all');
  const [addingMemory, setAddingMemory] = useState(false);
  const memoryOwners = useMemoryOwners(activeTab === 'memory');

  useEffect(() => {
    setActiveTab(startTab);
  }, [startTab]);

  // A link such as "See its memories" on a Cat's page picks the owner.
  const linkedScope = searchParams.get('scope');
  useEffect(() => {
    if (linkedScope) setMemoryScope(linkedScope);
  }, [linkedScope]);

  const fetchMemories = useCallback(async () => {
    setLoadingMemory(true);
    setErrorMemory(null);
    try {
      const res = await agentApi.getMemories({ q: memorySearch.trim(), kind: memoryKind, scope: memoryScope, limit: 200 });
      setMemories(res.memories || []);
    } catch (err) {
      setErrorMemory(err.message || 'Failed to load memories');
    } finally {
      setLoadingMemory(false);
    }
  }, [memorySearch, memoryKind, memoryScope]);

  useEffect(() => {
    if (activeTab !== 'memory') return;
    fetchMemories();
    agentApi.getMemoryStats().then(res => { if (res?.success) setMemoryStats(res); }).catch(() => {});
  }, [activeTab, fetchMemories]);

  async function deleteMemory(mem) {
    setDeletingKey(mem.id);
    try {
      await agentApi.deleteMemory(mem.key, mem.id);
      setMemories(prev => prev.filter(m => m.id !== mem.id));
    } catch (err) {
      setErrorMemory(err.message || 'Failed to delete memory');
    } finally {
      setDeletingKey(null);
    }
  }

  async function handleConsolidate() {
    setConsolidating(true);
    try {
      await agentApi.consolidateMemory();
      const statsRes = await agentApi.getMemoryStats();
      if (statsRes?.success) setMemoryStats(statsRes);
      await fetchMemories();
    } catch (err) {
      setErrorMemory(err.message || 'Consolidation failed');
    } finally {
      setConsolidating(false);
    }
  }

  const toolsTabActive   = activeTab === 'tools';
  const skillsTabActive  = activeTab === 'skills';
  const memoryTabActive  = activeTab === 'memory';

  return (
    <div className="flex flex-col h-full bg-canvas">
      <PageHeader
        title="Tools & Skills"
        description="What the agent can do: actions it can take, skills it can follow and what it remembers."
      >
        <Tabs
          className="mt-4"
          label="Tools and skills sections"
          value={toolsTabActive ? 'tools' : skillsTabActive ? 'skills' : 'memory'}
          onChange={setActiveTab}
          items={[
            { value: 'tools', label: 'Tools', icon: Wrench, meta: toolCatalog.tools.length ? String(toolCatalog.tools.length) : null },
            { value: 'skills', label: 'Skills', icon: Bot, meta: skillCatalog.skills.length ? String(skillCatalog.skills.length) : null },
            { value: 'memory', label: 'Memory', icon: BookMarked },
          ]}
        />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {toolsTabActive && <ToolsTab catalog={toolCatalog} />}

        {skillsTabActive && <SkillsTab catalog={skillCatalog} />}

        {memoryTabActive && (
          <div className="flex flex-col h-full">
            {/* Memory stats banner */}
            {memoryStats && (
              <div className={`px-6 py-2.5 border-b flex flex-wrap items-center gap-3 text-xs ${
                memoryStats.pctUsed >= 80
                  ? 'bg-amber-50 dark:bg-amber-950/20 midnight:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 midnight:border-amber-800/40'
                  : 'bg-gray-50 dark:bg-gray-900/40 midnight:bg-slate-900/40 border-gray-100 dark:border-gray-800 midnight:border-slate-800'
              }`}>
                <div className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                  <BookMarked className="w-3.5 h-3.5" />
                  <span>{memoryStats.total} / {memoryStats.cap}</span>
                  {memoryStats.pctUsed >= 80 && (
                    <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-3 h-3" />
                      {memoryStats.pctUsed}% full
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(memoryStats.byType || {}).map(([type, cnt]) => (
                    <span key={type} className={`px-1.5 py-0.5 rounded text-[10px] ${KIND_COLORS[type] || KIND_COLORS.fact}`}>
                      {type}: {cnt}
                    </span>
                  ))}
                </div>
                <button
                  onClick={handleConsolidate}
                  disabled={consolidating}
                  title="Merge low-importance memories of the same type into compact summaries using AI, then evict any over-cap or expired entries. Keeps memory lean without losing important facts."
                  className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 text-gray-600 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${consolidating ? 'animate-spin' : ''}`} />
                  {consolidating ? 'Consolidating…' : 'Consolidate Now'}
                </button>
              </div>
            )}

            {/* Search + filter bar */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex flex-wrap gap-2 items-center">
              <div className="relative min-w-0 grow basis-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={memorySearch}
                  onChange={e => setMemorySearch(e.target.value)}
                  placeholder="Search memories…"
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 midnight:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                />
              </div>
              <MemoryOwnerSelect value={memoryScope} onChange={setMemoryScope} owners={memoryOwners} />
              <Select size="sm" fullWidth={false} value={memoryKind} onChange={setMemoryKind} options={MEMORY_KIND_FILTER} aria-label="Kind" />
              <span className="text-xs text-gray-400 whitespace-nowrap">{memories.length} entries</span>
              <button
                type="button"
                onClick={() => setAddingMemory(true)}
                className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            {addingMemory && (
              <AddMemoryForm
                owners={memoryOwners}
                defaultScope={memoryScope}
                onAdded={() => {
                  setAddingMemory(false);
                  fetchMemories();
                  agentApi.getMemoryStats().then(res => { if (res?.success) setMemoryStats(res); }).catch(() => {});
                }}
                onCancel={() => setAddingMemory(false)}
              />
            )}

            {/* Memory list */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/60 midnight:divide-slate-800/60">
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
                <MemoryRow
                  key={mem.id || mem.key}
                  mem={mem}
                  onDelete={deleteMemory}
                  deleting={deletingKey === mem.id}
                  onSaved={(updated) => setMemories(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)))}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const KIND_COLORS = {
  user:       'bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-950/30 text-blue-700 dark:text-blue-300 midnight:text-blue-300',
  feedback:   'bg-amber-100 dark:bg-amber-900/30 midnight:bg-amber-950/30 text-amber-700 dark:text-amber-300 midnight:text-amber-300',
  project:    'bg-indigo-100 dark:bg-indigo-900/30 midnight:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 midnight:text-indigo-300',
  reference:  'bg-emerald-100 dark:bg-emerald-900/30 midnight:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 midnight:text-emerald-300',
  fact:       'bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 text-gray-600 dark:text-gray-400 midnight:text-slate-400',
  preference: 'bg-purple-100 dark:bg-purple-900/30 midnight:bg-purple-950/30 text-purple-700 dark:text-purple-300 midnight:text-purple-300',
  context:    'bg-teal-100 dark:bg-teal-900/30 midnight:bg-teal-950/30 text-teal-700 dark:text-teal-300 midnight:text-teal-300',
  task_state: 'bg-rose-100 dark:bg-rose-900/30 midnight:bg-rose-950/30 text-rose-700 dark:text-rose-300 midnight:text-rose-300',
};

// SQLite's datetime('now') is UTC without a zone; read it as UTC.
function sqliteDate(value) {
  const text = String(value || '');
  return new Date(/Z$|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
}

function MemoryRow({ mem, onDelete, deleting, onSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const kindColor = KIND_COLORS[mem.kind || mem.memory_type] || KIND_COLORS.fact;
  const tags = Array.isArray(mem.tags) ? mem.tags : (typeof mem.tags === 'string' ? mem.tags.replaceAll('[', '').replaceAll(']', '').split(',').map(t => t.trim()).filter(Boolean) : []);
  const importance = Number(mem.importance ?? 0.5);
  const importanceDots = Math.round(importance * 5);
  const content = mem.content || '';
  const isLong = content.length > 120;

  return (
    <div className="px-6 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 midnight:hover:bg-slate-800/30 transition-colors group">
      {/* Header row: kind badge + key + source + importance dots + delete */}
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${kindColor}`}>
          {mem.kind || mem.memory_type || 'fact'}
        </span>
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 midnight:text-slate-300 font-mono truncate flex-1">{mem.key}</span>
        {mem.project_id && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-fg-muted" title="Only chats in this project see this memory">
            {mem.project_name || 'Project'}
          </span>
        )}
        {mem.profile_id && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300" title="Only this agent sees this memory">
            {mem.agent_name || 'Agent'}
          </span>
        )}
        {mem.cat_id && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400" title="This Cat's own memory">
            {mem.cat_name || 'Cat'}
          </span>
        )}
        {mem.source && mem.source !== 'agent' && (
          <span className={`text-[9px] px-1 py-0.5 rounded flex-shrink-0 ${
            mem.source === 'correction'
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
          }`} title={mem.source === 'correction' ? 'Auto-detected correction' : mem.source === 'user' ? 'Written by you' : 'Auto-extracted from conversation'}>
            {mem.source === 'correction' ? 'correction' : mem.source === 'user' ? 'you' : 'auto'}
          </span>
        )}
        {tags.map(tag => (
          <span key={tag} className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 text-gray-500 dark:text-gray-500 midnight:text-slate-500">{tag}</span>
        ))}
        <span className="flex items-center gap-0.5 flex-shrink-0" title={`Importance: ${importance.toFixed(1)}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < importanceDots ? 'bg-indigo-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
          ))}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-fg hover:bg-hover"
          title="Edit memory"
          aria-label="Edit memory"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(mem)}
          disabled={deleting}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 midnight:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 disabled:opacity-50"
          title="Delete memory"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Content — always visible, full text on expand; or the editor */}
      {editing ? (
        <MemoryEditor mem={mem} onCancel={() => setEditing(false)} onSaved={(updated) => { setEditing(false); onSaved(updated); }} />
      ) : (
      <div
        className="text-sm text-gray-700 dark:text-gray-200 midnight:text-slate-200 leading-relaxed bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-800/50 rounded-md px-3 py-2 cursor-pointer select-text"
        onClick={() => isLong && setExpanded(v => !v)}
      >
        <p className={!expanded && isLong ? 'line-clamp-3' : ''}>
          {content}
        </p>
        {isLong && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            className="mt-1 text-[10px] text-indigo-500 dark:text-indigo-400 hover:underline"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      )}

      {/* Meta row */}
      <div className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-600 flex gap-3 flex-wrap">
        {mem.last_accessed_at && <span>Last used: {sqliteDate(mem.last_accessed_at).toLocaleDateString()}</span>}
        {mem.access_count > 0 && <span>Used {mem.access_count}×</span>}
        {mem.created_at && <span>Created: {sqliteDate(mem.created_at).toLocaleDateString()}</span>}
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
  onSaved: PropTypes.func.isRequired,
};

AgentToolsSkillsPage.propTypes = {
  initialTab: PropTypes.oneOf(['tools', 'skills', 'memory']),
};

ToolsSkillsTabs.propTypes = AgentToolsSkillsPage.propTypes;
