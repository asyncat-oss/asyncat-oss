// neko/src/Profiles/ProfilesPage.jsx
// ─── Agent Profiles UI ────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Layers, Plus, Trash2, Edit2, Loader2, AlertCircle,
  Check, X, Star, StarOff, ChevronDown, ChevronRight,
  Zap, RefreshCw, Search, ShieldCheck, ShieldAlert, Wrench,
  FolderOpen, Sparkles, SlidersHorizontal,
} from 'lucide-react';
import { profilesApi, agentApi } from '../CommandCenter/commandCenterApi';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROFILE_ICONS = ['🤖', '🧠', '🔍', '⚡', '🛠️', '🎯', '🔐', '📦', '🌐', '🧪', '🗂️', '✍️', '🔬', '🛡️', '🚀'];

const PROFILE_COLORS = [
  { key: 'indigo',  bg: 'bg-indigo-100 dark:bg-indigo-900/30',  text: 'text-indigo-700 dark:text-indigo-300',  dot: 'bg-indigo-500'  },
  { key: 'blue',    bg: 'bg-blue-100 dark:bg-blue-900/30',      text: 'text-blue-700 dark:text-blue-300',      dot: 'bg-blue-500'    },
  { key: 'violet',  bg: 'bg-violet-100 dark:bg-violet-900/30',  text: 'text-violet-700 dark:text-violet-300',  dot: 'bg-violet-500'  },
  { key: 'emerald', bg: 'bg-emerald-100 dark:bg-emerald-900/30',text: 'text-emerald-700 dark:text-emerald-300',dot: 'bg-emerald-500' },
  { key: 'amber',   bg: 'bg-amber-100 dark:bg-amber-900/30',    text: 'text-amber-700 dark:text-amber-300',    dot: 'bg-amber-500'   },
  { key: 'rose',    bg: 'bg-rose-100 dark:bg-rose-900/30',      text: 'text-rose-700 dark:text-rose-300',      dot: 'bg-rose-500'    },
  { key: 'cyan',    bg: 'bg-cyan-100 dark:bg-cyan-900/30',      text: 'text-cyan-700 dark:text-cyan-300',      dot: 'bg-cyan-500'    },
  { key: 'gray',    bg: 'bg-gray-100 dark:bg-gray-800',         text: 'text-gray-700 dark:text-gray-300',      dot: 'bg-gray-400'    },
];

const DEFAULT_PROFILES = [
  { name: 'General Agent',   icon: '🤖', color: 'indigo',  description: 'Default all-purpose agent. Balanced permissions and default soul.', soulName: 'default', maxRounds: 25, autoApprove: false },
  { name: 'Dev Agent',       icon: '🛠️', color: 'blue',   description: 'Optimised for coding tasks. Auto-approves file and shell tools.', soulName: 'default', maxRounds: 30, autoApprove: false, alwaysAllowedTools: ['read_file', 'list_directory', 'run_command', 'edit_file', 'write_file'] },
  { name: 'Research Agent',  icon: '🔍', color: 'violet',  description: 'Web search and summarisation focused. Safe tools only.', soulName: 'default', maxRounds: 20, autoApprove: false, alwaysAllowedTools: ['web_search', 'fetch_url', 'save_memory'] },
  { name: 'Turbo Agent',     icon: '⚡', color: 'amber',   description: 'Auto-approves all tools. Maximum speed, minimal friction.', soulName: 'default', maxRounds: 40, autoApprove: true },
];

const TOOL_PERMISSION_META = {
  safe:      { label: 'Safe',      dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 midnight:bg-emerald-950/30 midnight:text-emerald-300' },
  moderate:  { label: 'Moderate',  dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 midnight:bg-amber-950/30 midnight:text-amber-300' },
  dangerous: { label: 'Dangerous', dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 midnight:bg-red-950/30 midnight:text-red-300' },
};

const TOOL_PRESETS = [
  { key: 'safe', label: 'Safe only', description: 'Low-risk lookup and read actions.', filter: tool => tool.permission === 'safe' },
  { key: 'files', label: 'File work', description: 'Common read, write, and edit tools.', names: ['read_file', 'list_directory', 'write_file', 'edit_file', 'create_file', 'create_directory'] },
  { key: 'research', label: 'Research', description: 'Search, fetch, and memory helpers.', names: ['web_search', 'fetch_url', 'save_memory', 'search_memory'] },
];

function getColorMeta(key) {
  return PROFILE_COLORS.find(c => c.key === key) || PROFILE_COLORS[0];
}

function formatToolCategory(value) {
  return (value || 'general')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getPermissionMeta(permission) {
  return TOOL_PERMISSION_META[permission] || TOOL_PERMISSION_META.moderate;
}

function compactToolDescription(tool) {
  return tool?.description ? tool.description.replace(/\s+/g, ' ').trim() : 'No description';
}

const profileInputShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _isTemplate: PropTypes.bool,
  name: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.string,
  color: PropTypes.string,
  soul_name: PropTypes.string,
  soulName: PropTypes.string,
  soul_override: PropTypes.string,
  soulOverride: PropTypes.string,
  working_dir: PropTypes.string,
  workingDir: PropTypes.string,
  max_rounds: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  maxRounds: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  auto_approve: PropTypes.bool,
  autoApprove: PropTypes.bool,
  always_allowed_tools: PropTypes.arrayOf(PropTypes.string),
  alwaysAllowedTools: PropTypes.arrayOf(PropTypes.string),
  is_default: PropTypes.bool,
  isDefault: PropTypes.bool,
});

const toolShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  category: PropTypes.string,
  permission: PropTypes.string,
});

const profileShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  icon: PropTypes.string,
  color: PropTypes.string,
  soul_name: PropTypes.string,
  soul_override: PropTypes.string,
  working_dir: PropTypes.string,
  max_rounds: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  auto_approve: PropTypes.bool,
  always_allowed_tools: PropTypes.arrayOf(PropTypes.string),
  is_default: PropTypes.bool,
});

// ── Profile Form ──────────────────────────────────────────────────────────────

function ProfileForm({ initial, souls = [], tools = [], onSave, onCancel, saving }) {
  const initialSoulName = initial?.soul_name ?? initial?.soulName ?? 'default';
  const initialSoulOverride = initial?.soul_override ?? initial?.soulOverride ?? '';
  const initialWorkingDir = initial?.working_dir ?? initial?.workingDir ?? '';
  const initialMaxRounds = initial?.max_rounds ?? initial?.maxRounds ?? 25;
  const initialAutoApprove = initial?.auto_approve ?? initial?.autoApprove ?? false;
  const initialAllowedTools = initial?.always_allowed_tools ?? initial?.alwaysAllowedTools ?? [];
  const initialIsDefault = initial?.is_default ?? initial?.isDefault ?? false;

  const [name, setName]             = useState(initial?.name || '');
  const [description, setDesc]      = useState(initial?.description || '');
  const [icon, setIcon]             = useState(initial?.icon || '🤖');
  const [color, setColor]           = useState(initial?.color || 'indigo');
  const [soulName, setSoulName]     = useState(initialSoulName);
  const [soulOverride, setSoulOverride] = useState(initialSoulOverride);
  const [useSoulOverride, setUseSoulOverride] = useState(!!initialSoulOverride);
  const [workingDir, setWorkingDir] = useState(initialWorkingDir);
  const [maxRounds, setMaxRounds]   = useState(initialMaxRounds);
  const [autoApprove, setAutoApprove] = useState(!!initialAutoApprove);
  const [alwaysAllowedTools, setAlwaysAllowedTools] = useState(
    Array.isArray(initialAllowedTools) ? initialAllowedTools : []
  );
  const [isDefault, setIsDefault]   = useState(!!initialIsDefault);
  const [toolSearch, setToolSearch] = useState('');
  const [showToolPicker, setShowToolPicker] = useState(false);

  const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-gray-950 midnight:bg-slate-950 border border-gray-200 dark:border-gray-800 midnight:border-slate-800 rounded-lg text-gray-800 dark:text-gray-100 midnight:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-700';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400 mb-1.5';
  const selectedColor = getColorMeta(color);

  const normalizedTools = useMemo(() => (
    tools
      .filter(t => t?.name)
      .map(t => ({ ...t, category: t.category || 'general', permission: t.permission || 'moderate' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [tools]);

  const selectedTools = useMemo(() => (
    alwaysAllowedTools
      .map(toolName => normalizedTools.find(t => t.name === toolName) || { name: toolName, category: 'custom', permission: 'moderate' })
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [alwaysAllowedTools, normalizedTools]);

  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    if (!query) return normalizedTools;
    return normalizedTools.filter(t =>
      t.name.toLowerCase().includes(query) ||
      compactToolDescription(t).toLowerCase().includes(query) ||
      formatToolCategory(t.category).toLowerCase().includes(query)
    );
  }, [normalizedTools, toolSearch]);

  const toolStats = useMemo(() => {
    const selectedSet = new Set(alwaysAllowedTools);
    return {
      total: normalizedTools.length,
      selected: alwaysAllowedTools.length,
      safe: normalizedTools.filter(t => selectedSet.has(t.name) && t.permission === 'safe').length,
      moderate: normalizedTools.filter(t => selectedSet.has(t.name) && t.permission === 'moderate').length,
      dangerous: normalizedTools.filter(t => selectedSet.has(t.name) && t.permission === 'dangerous').length,
    };
  }, [alwaysAllowedTools, normalizedTools]);

  function toggleTool(toolName) {
    setAlwaysAllowedTools(prev =>
      prev.includes(toolName) ? prev.filter(t => t !== toolName) : [...prev, toolName]
    );
  }

  function applyPreset(preset) {
    const presetNames = preset.filter
      ? normalizedTools.filter(preset.filter).map(t => t.name)
      : normalizedTools.filter(t => preset.names.includes(t.name)).map(t => t.name);

    if (!presetNames.length) return;
    setAlwaysAllowedTools(prev => [...new Set([...prev, ...presetNames])]);
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      description: description.trim(),
      icon,
      color,
      soulName: useSoulOverride ? 'default' : soulName,
      soulOverride: useSoulOverride ? soulOverride : null,
      workingDir: workingDir.trim() || null,
      maxRounds: Number(maxRounds) || 25,
      autoApprove,
      alwaysAllowedTools,
      isDefault,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Identity</h3>
          </div>

          <div className="flex gap-3">
            <div>
              <label className={labelCls}>Icon</label>
              <select
                value={icon}
                onChange={e => setIcon(e.target.value)}
                className={`h-11 w-14 rounded-lg border border-gray-200 bg-white text-center text-xl outline-none focus:ring-2 focus:ring-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:focus:ring-gray-700 midnight:border-slate-800 midnight:bg-slate-950 ${selectedColor.text}`}
                aria-label="Profile icon"
              >
                {PROFILE_ICONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="min-w-0 flex-1">
              <label className={labelCls}>Profile Name <span className="text-red-400">*</span></label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Dev Agent" className={inputCls} required />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <input type="text" value={description} onChange={e => setDesc(e.target.value)} placeholder="What should this agent be good at?" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Accent</label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                    color === c.key
                      ? 'border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white midnight:border-slate-700 midnight:bg-slate-900'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/60 midnight:border-slate-800 midnight:hover:bg-slate-900'
                  }`}
                  title={c.key}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                  {c.key}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/50 midnight:border-slate-800 midnight:bg-slate-900/35">
          <p className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">Preview</p>
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-lg text-xl ${selectedColor.bg}`}>{icon}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">{name.trim() || 'New profile'}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{description.trim() || 'A reusable agent setup.'}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
              <span className="block text-[10px] uppercase tracking-wide text-gray-400">Rounds</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">{maxRounds || 25}</span>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
              <span className="block text-[10px] uppercase tracking-wide text-gray-400">Tools</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">{autoApprove ? 'all' : toolStats.selected}</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Behavior</h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className={labelCls}>Soul</label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUseSoulOverride(false)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${!useSoulOverride ? 'border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/60'}`}
              >
                <span className="font-medium">Soul file</span>
                <span className="mt-0.5 block text-[11px] text-gray-400">Use a saved prompt</span>
              </button>
              <button
                type="button"
                onClick={() => setUseSoulOverride(true)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${useSoulOverride ? 'border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/60'}`}
              >
                <span className="font-medium">Custom text</span>
                <span className="mt-0.5 block text-[11px] text-gray-400">Override just here</span>
              </button>
            </div>
            {!useSoulOverride ? (
              <select value={soulName} onChange={e => setSoulName(e.target.value)} className={inputCls}>
                {souls.length === 0 && <option value="default">default</option>}
                {souls.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <textarea
                value={soulOverride}
                onChange={e => setSoulOverride(e.target.value)}
                placeholder="Paste or write a custom soul for this profile..."
                rows={5}
                className={`${inputCls} resize-none font-mono text-xs leading-relaxed`}
              />
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelCls}>Working Directory <span className="font-normal text-gray-400">(optional)</span></label>
              <div className="relative">
                <FolderOpen className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input type="text" value={workingDir} onChange={e => setWorkingDir(e.target.value)} placeholder="Defaults to server cwd" className={`${inputCls} pl-9`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Max Rounds</label>
                <input type="number" min="1" max="100" value={maxRounds} onChange={e => setMaxRounds(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Default</label>
                <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 midnight:border-slate-800 midnight:bg-slate-950">
                  <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded text-gray-900" />
                  New runs
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-gray-400" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Tool Access</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{autoApprove ? 'All tools can run without asking.' : `${toolStats.selected} of ${toolStats.total} tools pre-approved.`}</p>
            </div>
          </div>
          <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            autoApprove
              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-300'
              : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:bg-slate-950'
          }`}>
            <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="rounded text-amber-600" />
            <Zap className="h-4 w-4" />
            Auto-approve all
          </label>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {TOOL_PRESETS.map(preset => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950"
            >
              <span className="block text-xs font-semibold text-gray-800 dark:text-gray-100 midnight:text-slate-100">{preset.label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300 midnight:bg-slate-900 midnight:text-slate-300">
            <ShieldCheck className="h-3 w-3 text-emerald-500" /> {toolStats.safe} safe
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300 midnight:bg-slate-900 midnight:text-slate-300">
            <ShieldAlert className="h-3 w-3 text-amber-500" /> {toolStats.moderate} moderate
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300 midnight:bg-slate-900 midnight:text-slate-300">
            <ShieldAlert className="h-3 w-3 text-red-500" /> {toolStats.dangerous} dangerous
          </span>
          {selectedTools.length > 0 && (
            <button type="button" onClick={() => setAlwaysAllowedTools([])} className="ml-auto text-xs text-gray-400 hover:text-red-500">
              Clear selected
            </button>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-800 midnight:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-2 dark:border-gray-800 midnight:border-slate-800">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={toolSearch}
                onFocus={() => setShowToolPicker(true)}
                onChange={e => {
                  setToolSearch(e.target.value);
                  setShowToolPicker(true);
                }}
                placeholder="Search tools"
                className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-700 outline-none focus:bg-white focus:ring-2 focus:ring-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:focus:ring-gray-700 midnight:border-slate-800 midnight:bg-slate-950 midnight:text-slate-200"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowToolPicker(v => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:bg-slate-950"
            >
              {showToolPicker ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Browse
            </button>
          </div>

          {selectedTools.length > 0 && (
            <div className="border-b border-gray-100 p-3 dark:border-gray-800 midnight:border-slate-800">
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {selectedTools.map(t => {
                  const perm = getPermissionMeta(t.permission);
                  return (
                    <span key={t.name} className="inline-flex min-w-0 items-center gap-1.5 rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300 midnight:bg-slate-900 midnight:text-slate-300">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${perm.dot}`} />
                      <span className="max-w-[180px] truncate font-mono">{t.name}</span>
                      <button type="button" onClick={() => toggleTool(t.name)} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${t.name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {showToolPicker && (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
              {filteredTools.map(t => {
                const perm = getPermissionMeta(t.permission);
                const checked = alwaysAllowedTools.includes(t.name);
                return (
                  <label key={t.name} className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors ${checked ? 'bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/60' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40 midnight:hover:bg-slate-900/45'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTool(t.name)} className="mt-1 rounded text-gray-900" />
                    <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${perm.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate font-mono text-xs font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">{t.name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${perm.badge}`}>{perm.label}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400 midnight:bg-slate-900 midnight:text-slate-400">{formatToolCategory(t.category)}</span>
                      </span>
                      <span className="mt-1 block line-clamp-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{compactToolDescription(t)}</span>
                    </span>
                  </label>
                );
              })}
              {filteredTools.length === 0 && <p className="px-3 py-5 text-center text-xs text-gray-400">No tools found</p>}
            </div>
          )}
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white dark:text-gray-900 transition-colors font-medium"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {initial ? 'Save changes' : 'Create profile'}
        </button>
      </div>
    </form>
  );
}

ProfileForm.propTypes = {
  initial: profileInputShape,
  souls: PropTypes.arrayOf(PropTypes.string),
  tools: PropTypes.arrayOf(toolShape),
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  saving: PropTypes.bool,
};

// ── Profile Card ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, onEdit, onDelete, onSetDefault, deleting, settingDefault }) {
  const [expanded, setExpanded] = useState(false);
  const cm = getColorMeta(profile.color);

  return (
    <div className={`border transition-colors ${
      profile.is_default
        ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40'
        : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900'
    }`}>
      <div className="flex items-start gap-3 p-4">
        {/* Icon badge */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${cm.bg}`}>
          {profile.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{profile.name}</span>
            {profile.is_default && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">Default</span>
            )}
            {profile.auto_approve && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" />Auto-approve
              </span>
            )}
          </div>
          {profile.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{profile.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 flex-wrap">
            <span>Soul: {profile.soul_override ? 'custom' : profile.soul_name}</span>
            <span>{profile.max_rounds} rounds</span>
            {profile.always_allowed_tools?.length > 0 && (
              <span>{profile.always_allowed_tools.length} pre-approved tool{profile.always_allowed_tools.length !== 1 ? 's' : ''}</span>
            )}
            {profile.working_dir && <span className="truncate max-w-[120px]" title={profile.working_dir}>{profile.working_dir}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(v => !v)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Details">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onSetDefault(profile.id, profile.is_default)}
            disabled={settingDefault === profile.id || profile.is_default}
            className={`p-1.5 rounded-lg transition-colors ${
              profile.is_default
                ? 'text-gray-500 cursor-default'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title={profile.is_default ? 'Default profile' : 'Set as default'}
          >
            {settingDefault === profile.id ? <Loader2 className="w-4 h-4 animate-spin" /> : profile.is_default ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4" />}
          </button>
          <button onClick={() => onEdit(profile)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Edit">
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(profile.id)}
            disabled={deleting === profile.id}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            title="Delete"
          >
            {deleting === profile.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-50 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-gray-400 block mb-0.5">Description</span>
              <span className="text-gray-600 dark:text-gray-300">{profile.description || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400 block mb-0.5">Soul</span>
              <span className="text-gray-600 dark:text-gray-300">{profile.soul_override ? 'Custom (inline)' : profile.soul_name}</span>
            </div>
            {profile.always_allowed_tools?.length > 0 && (
              <div className="col-span-2">
                <span className="text-gray-400 block mb-1">Always-allowed tools</span>
                <div className="flex flex-wrap gap-1">
                  {profile.always_allowed_tools.map(t => (
                    <code key={t} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-mono">{t}</code>
                  ))}
                </div>
              </div>
            )}
            <div>
              <span className="text-gray-400 block mb-0.5">Profile ID</span>
              <code className="text-gray-400 dark:text-gray-600 font-mono text-[10px]">{profile.id}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ProfileCard.propTypes = {
  profile: profileShape.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onSetDefault: PropTypes.func.isRequired,
  deleting: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  settingDefault: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

// ── Starter Templates ─────────────────────────────────────────────────────────

function StarterTemplates({ onCreate }) {
  return (
    <div className="mt-6">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Start from a template</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {DEFAULT_PROFILES.map(p => {
          const cm = getColorMeta(p.color);
          return (
            <button
              key={p.name}
              onClick={() => onCreate(p)}
              className="flex items-start gap-3 p-3 border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left"
            >
              <span className={`w-8 h-8 rounded flex items-center justify-center text-base flex-shrink-0 ${cm.bg}`}>{p.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 dark:text-white">{p.name}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5 line-clamp-2">{p.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

StarterTemplates.propTypes = {
  onCreate: PropTypes.func.isRequired,
};

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Layers className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-2">No agent profiles yet</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-6">
        Profiles are named configurations — each one bundles a soul, working directory, permission rules, and pre-approved tools.
      </p>
      <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors">
        <Plus className="w-4 h-4" />Create your first profile
      </button>
    </div>
  );
}

EmptyState.propTypes = {
  onAdd: PropTypes.func.isRequired,
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [tools, setTools]       = useState([]);
  const [souls, setSouls]       = useState(['default']);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [settingDefault, setSettingDefault] = useState(null);

  const fetchProfiles = useCallback(async () => {
    setError(null);
    try {
      const [pRes, tRes, sRes] = await Promise.all([
        profilesApi.listProfiles(),
        agentApi.getTools().catch(() => ({ tools: [] })),
        agentApi.listSouls().catch(() => ({ souls: ['default'] })),
      ]);
      setProfiles(pRes.profiles || []);
      setTools(tRes.tools || []);
      setSouls(sRes.souls || ['default']);
    } catch (err) {
      setError(err.message || 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  async function handleSave(data) {
    setSaving(true);
    setSaveError(null);
    try {
      if (editTarget && !editTarget._isTemplate) {
        await profilesApi.updateProfile(editTarget.id, data);
      } else {
        await profilesApi.createProfile(data);
      }
      await fetchProfiles();
      setShowForm(false);
      setEditTarget(null);
    } catch (err) {
      setSaveError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(profile) {
    setEditTarget(profile);
    setShowForm(true);
    setSaveError(null);
  }

  function handleAddFromTemplate(template) {
    setEditTarget(null);
    setShowForm(true);
    setSaveError(null);
    // Pre-populate form via editTarget trick: use a special marker
    setEditTarget({ ...template, _isTemplate: true, id: null });
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await profilesApi.deleteProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete profile');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSetDefault(id, isAlreadyDefault) {
    if (isAlreadyDefault) return;
    setSettingDefault(id);
    try {
      await profilesApi.updateProfile(id, { isDefault: true });
      await fetchProfiles();
    } catch (err) {
      setError(err.message || 'Failed to update default');
    } finally {
      setSettingDefault(null);
    }
  }

  const formInitial = editTarget?._isTemplate
    ? { ...editTarget, id: undefined }
    : editTarget;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">Agent Profiles</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</span>
            <button onClick={fetchProfiles} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            {!showForm && (
              <button
                onClick={() => { setEditTarget(null); setShowForm(true); setSaveError(null); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />New Profile
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 justify-center py-24 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading profiles…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button onClick={fetchProfiles} className="text-xs text-gray-400 hover:text-gray-600 underline">Try again</button>
          </div>
        )}

        {!loading && !error && (
          <div className="px-6 py-5">
            {/* Create/Edit form */}
            {showForm && (
              <div className="mb-6 p-5 bg-gray-50/70 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">
                  {editTarget && !editTarget._isTemplate ? 'Edit Profile' : 'New Profile'}
                </h2>
                {saveError && (
                  <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{saveError}
                  </div>
                )}
                <ProfileForm
                  initial={formInitial}
                  souls={souls}
                  tools={tools}
                  onSave={handleSave}
                  onCancel={() => { setShowForm(false); setEditTarget(null); setSaveError(null); }}
                  saving={saving}
                />
              </div>
            )}

            {/* Profiles list */}
            {profiles.length === 0 && !showForm ? (
              <>
                <EmptyState onAdd={() => { setEditTarget(null); setShowForm(true); setSaveError(null); }} />
                <StarterTemplates onCreate={handleAddFromTemplate} />
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {profiles.map(p => (
                    <ProfileCard
                      key={p.id}
                      profile={p}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onSetDefault={handleSetDefault}
                      deleting={deletingId}
                      settingDefault={settingDefault}
                    />
                  ))}
                </div>
                {!showForm && profiles.length > 0 && (
                  <StarterTemplates onCreate={handleAddFromTemplate} />
                )}
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
