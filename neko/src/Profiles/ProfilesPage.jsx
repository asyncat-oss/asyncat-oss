// neko/src/Profiles/ProfilesPage.jsx
// ─── Agent Profiles UI ────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  Layers, Plus, Trash2, Edit2, Loader2, AlertCircle,
  Check, X, Star, StarOff, ChevronDown, ChevronRight,
  Zap, RefreshCw,
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

function getColorMeta(key) {
  return PROFILE_COLORS.find(c => c.key === key) || PROFILE_COLORS[0];
}

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

  const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 midnight:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5';

  const filteredTools = tools.filter(t =>
    !toolSearch || t.name.toLowerCase().includes(toolSearch.toLowerCase())
  );

  function toggleTool(toolName) {
    setAlwaysAllowedTools(prev =>
      prev.includes(toolName) ? prev.filter(t => t !== toolName) : [...prev, toolName]
    );
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
      {/* Name + icon */}
      <div className="flex gap-3 items-end">
        <div>
          <label className={labelCls}>Icon</label>
          <div className="relative">
            <select
              value={icon}
              onChange={e => setIcon(e.target.value)}
              className="w-16 px-2 py-2 text-lg bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 appearance-none text-center"
            >
              {PROFILE_ICONS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1">
          <label className={labelCls}>Profile Name <span className="text-red-400">*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dev Agent" className={inputCls} required />
        </div>
      </div>

      {/* Color */}
      <div>
        <label className={labelCls}>Color</label>
        <div className="flex gap-2 flex-wrap">
          {PROFILE_COLORS.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setColor(c.key)}
              className={`w-7 h-7 rounded-full ${c.dot} transition-all ${color === c.key ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-600 scale-110' : 'opacity-60 hover:opacity-100'}`}
              title={c.key}
            />
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <input type="text" value={description} onChange={e => setDesc(e.target.value)} placeholder="What is this profile for?" className={inputCls} />
      </div>

      {/* Soul */}
      <div>
        <label className={labelCls}>Soul</label>
        <div className="flex items-center gap-3 mb-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="radio" checked={!useSoulOverride} onChange={() => setUseSoulOverride(false)} className="text-indigo-500" />
            Use soul file
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="radio" checked={useSoulOverride} onChange={() => setUseSoulOverride(true)} className="text-indigo-500" />
            Custom soul text
          </label>
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
            placeholder="Paste or write a custom soul for this profile…"
            rows={5}
            className={`${inputCls} resize-none leading-relaxed font-mono text-xs`}
          />
        )}
      </div>

      {/* Working dir */}
      <div>
        <label className={labelCls}>Working Directory <span className="text-gray-400 font-normal">(optional)</span></label>
        <input type="text" value={workingDir} onChange={e => setWorkingDir(e.target.value)} placeholder="Defaults to server cwd" className={inputCls} />
      </div>

      {/* Max rounds + auto-approve */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className={labelCls}>Max Rounds</label>
          <input type="number" min="1" max="100" value={maxRounds} onChange={e => setMaxRounds(e.target.value)} className={inputCls} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Permissions</label>
          <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="text-indigo-500 rounded" />
            Auto-approve all tools
          </label>
        </div>
      </div>

      {/* Always-allowed tools */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className={labelCls + ' mb-0'}>Always-Allowed Tools <span className="text-gray-400 font-normal">({alwaysAllowedTools.length} selected)</span></label>
          <button type="button" onClick={() => setShowToolPicker(v => !v)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            {showToolPicker ? 'Hide' : 'Pick tools'}
          </button>
        </div>
        {alwaysAllowedTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {alwaysAllowedTools.map(t => (
              <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[11px] font-medium">
                {t}
                <button type="button" onClick={() => toggleTool(t)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
          </div>
        )}
        {showToolPicker && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <input
                type="text"
                value={toolSearch}
                onChange={e => setToolSearch(e.target.value)}
                placeholder="Search tools…"
                className="w-full text-xs bg-transparent text-gray-600 dark:text-gray-300 placeholder-gray-400 focus:outline-none"
              />
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {filteredTools.slice(0, 50).map(t => (
                <label key={t.name} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-xs text-gray-600 dark:text-gray-300">
                  <input type="checkbox" checked={alwaysAllowedTools.includes(t.name)} onChange={() => toggleTool(t.name)} className="text-gray-600 rounded" />
                  <span className="font-mono">{t.name}</span>
                  <span className="text-gray-400 truncate">{t.description?.slice(0, 50)}</span>
                </label>
              ))}
              {filteredTools.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">No tools found</p>}
            </div>
          </div>
        )}
      </div>

      {/* Set as default */}
      <label className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
        <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="text-indigo-500 rounded" />
        Set as default profile for new runs
      </label>

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
