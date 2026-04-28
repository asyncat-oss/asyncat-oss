// neko/src/Agent/SchedulerPage.jsx
// ─── Agent Scheduler UI ───────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Plus, Trash2, Play, Pause, Loader2, AlertCircle,
  Calendar, RefreshCw, CheckCircle2, XCircle, ChevronDown,
  ChevronRight, Zap, Timer, Repeat, Layers,
} from 'lucide-react';
import { schedulerApi, profilesApi } from '../CommandCenter/commandCenterApi';

// ── Schedule type helpers ─────────────────────────────────────────────────────

const SCHEDULE_PRESETS = [
  { label: 'Every 15 minutes', value: 'interval:900000',    icon: Timer,    color: 'text-violet-500' },
  { label: 'Every 30 minutes', value: 'interval:1800000',   icon: Timer,    color: 'text-violet-500' },
  { label: 'Every hour',       value: 'hourly',             icon: Repeat,   color: 'text-blue-500'   },
  { label: 'Every 6 hours',    value: 'interval:21600000',  icon: Repeat,   color: 'text-blue-500'   },
  { label: 'Every 12 hours',   value: 'interval:43200000',  icon: Repeat,   color: 'text-blue-500'   },
  { label: 'Once a day',       value: 'interval:86400000',  icon: Calendar, color: 'text-indigo-500' },
  { label: 'Custom daily time','value': '__daily__',         icon: Calendar, color: 'text-indigo-500' },
  { label: 'Run once (delay)', value: '__once__',            icon: Zap,      color: 'text-amber-500'  },
  { label: 'Run at exact time','value': '__at__',            icon: Zap,      color: 'text-amber-500'  },
  { label: 'Custom interval',  value: '__custom__',          icon: RefreshCw,color: 'text-gray-400'   },
];

function parseScheduleLabel(schedule) {
  if (!schedule) return '—';
  if (schedule === 'hourly') return 'Every hour';
  if (schedule.startsWith('interval:')) {
    const ms = parseInt(schedule.slice(9), 10);
    if (isNaN(ms)) return schedule;
    if (ms < 60000)   return `Every ${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `Every ${Math.round(ms / 60000)}m`;
    if (ms < 86400000)return `Every ${Math.round(ms / 3600000)}h`;
    return `Every ${Math.round(ms / 86400000)}d`;
  }
  if (schedule.startsWith('daily:')) return `Daily at ${schedule.slice(6)}`;
  if (schedule.startsWith('once:')) {
    const ms = parseInt(schedule.slice(5), 10);
    if (isNaN(ms)) return 'Run once';
    if (ms < 60000)   return `Once in ${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `Once in ${Math.round(ms / 60000)}m`;
    if (ms < 86400000)return `Once in ${Math.round(ms / 3600000)}h`;
    return `Once in ${Math.round(ms / 86400000)}d`;
  }
  if (schedule.startsWith('at:')) {
    try { return `At ${new Date(schedule.slice(3)).toLocaleString()}`; } catch { return schedule; }
  }
  return schedule;
}

function formatRelative(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    const diff = d - Date.now();
    const abs = Math.abs(diff);
    const past = diff < 0;
    if (abs < 60000)   return past ? 'just now' : 'in <1m';
    if (abs < 3600000) return past ? `${Math.round(abs/60000)}m ago` : `in ${Math.round(abs/60000)}m`;
    if (abs < 86400000)return past ? `${Math.round(abs/3600000)}h ago` : `in ${Math.round(abs/3600000)}h`;
    return past ? `${Math.round(abs/86400000)}d ago` : `in ${Math.round(abs/86400000)}d`;
  } catch { return '—'; }
}

function getScheduleIcon(schedule) {
  if (schedule === 'hourly' || schedule?.startsWith('interval:')) return Repeat;
  if (schedule?.startsWith('daily:')) return Calendar;
  if (schedule?.startsWith('once:') || schedule?.startsWith('at:')) return Zap;
  return Clock;
}

// ── Create Job Modal ──────────────────────────────────────────────────────────

function CreateJobModal({ onClose, onCreate, profiles = [] }) {
  const [name, setName]           = useState('');
  const [goal, setGoal]           = useState('');
  const [profileId, setProfileId] = useState('');
  const [scheduleType, setScheduleType] = useState('interval:3600000');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [onceDelay, setOnceDelay] = useState('30');
  const [onceUnit, setOnceUnit]   = useState('minutes');
  const [atDate, setAtDate]       = useState('');
  const [atTime, setAtTime]       = useState('');
  const [customMs, setCustomMs]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  function buildScheduleString() {
    if (scheduleType === '__daily__') return `daily:${dailyTime}`;
    if (scheduleType === '__once__') {
      const multipliers = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
      const ms = parseInt(onceDelay, 10) * (multipliers[onceUnit] || 60000);
      return `once:${ms}`;
    }
    if (scheduleType === '__at__') {
      if (!atDate || !atTime) return null;
      return `at:${new Date(`${atDate}T${atTime}`).toISOString()}`;
    }
    if (scheduleType === '__custom__') {
      const ms = parseInt(customMs, 10);
      if (isNaN(ms) || ms < 1000) return null;
      return `interval:${ms}`;
    }
    return scheduleType;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const schedule = buildScheduleString();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!goal.trim()) { setError('Goal is required'); return; }
    if (!schedule)    { setError('Please complete the schedule configuration'); return; }

    setSaving(true);
    try {
      await onCreate({ name: name.trim(), goal: goal.trim(), schedule, profileId: profileId || null });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 midnight:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">New Scheduled Job</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Job Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Daily standup summary"
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>Agent Goal</label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="What should the agent do? e.g. Check git status and summarize any uncommitted changes, then save a memory with today's work summary."
              rows={4}
              className={`${inputCls} resize-none leading-relaxed`}
            />
            <p className="mt-1.5 text-[10px] text-gray-400">This is the exact goal the agent will run on each execution.</p>
          </div>

          {profiles.length > 0 && (
            <div>
              <label className={labelCls}>Agent Profile</label>
              <select value={profileId} onChange={e => setProfileId(e.target.value)} className={inputCls}>
                <option value="">Default profile</option>
                {profiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}{profile.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Schedule</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SCHEDULE_PRESETS.map(p => {
                const Icon = p.icon;
                const isSelected = scheduleType === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setScheduleType(p.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors text-left
                      ${isSelected
                        ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                  >
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-gray-600 dark:text-gray-300' : p.color}`} />
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom schedule sub-fields */}
            {scheduleType === '__daily__' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                <label className={labelCls}>Time of day</label>
                <input type="time" value={dailyTime} onChange={e => setDailyTime(e.target.value)} className={inputCls} />
              </div>
            )}
            {scheduleType === '__once__' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                <label className={labelCls}>Run once after…</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={onceDelay}
                    onChange={e => setOnceDelay(e.target.value)}
                    className={`${inputCls} flex-1`}
                    placeholder="30"
                  />
                  <select value={onceUnit} onChange={e => setOnceUnit(e.target.value)} className={`${inputCls} w-32`}>
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </div>
            )}
            {scheduleType === '__at__' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                <label className={labelCls}>Exact date &amp; time</label>
                <div className="flex gap-2">
                  <input type="date" value={atDate} onChange={e => setAtDate(e.target.value)} className={`${inputCls} flex-1`} />
                  <input type="time" value={atTime} onChange={e => setAtTime(e.target.value)} className={`${inputCls} w-32`} />
                </div>
              </div>
            )}
            {scheduleType === '__custom__' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                <label className={labelCls}>Interval in milliseconds</label>
                <input
                  type="number"
                  min="1000"
                  value={customMs}
                  onChange={e => setCustomMs(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 3600000 = 1 hour"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white dark:text-gray-900 transition-colors font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Schedule Job
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({ job, profile, onDelete, onToggle, deletingId, togglingId }) {
  const [expanded, setExpanded] = useState(false);
  const ScheduleIcon = getScheduleIcon(job.schedule);
  const isEnabled = !!job.enabled;
  const isDeleting = deletingId === job.id;
  const isToggling = togglingId === job.id;

  const typeLabel = (() => {
    if (job.schedule === 'hourly' || job.schedule?.startsWith('interval:')) return 'Repeating';
    if (job.schedule?.startsWith('daily:')) return 'Daily';
    return 'One-shot';
  })();

  const typeColor = (() => {
    if (typeLabel === 'Repeating') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
    if (typeLabel === 'Daily')     return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300';
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
  })();

  return (
    <div className={`border transition-colors ${
      isEnabled
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
        : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 opacity-60'
    }`}>
      {/* Main row */}
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isEnabled ? 'bg-gray-100 dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-800'
        }`}>
          <ScheduleIcon className={`w-4 h-4 ${isEnabled ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400'}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{job.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor}`}>{typeLabel}</span>
            {!isEnabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500">Paused</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{job.goal}</p>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400 dark:text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {parseScheduleLabel(job.schedule)}
            </span>
            {job.next_run_at && isEnabled && (
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 font-medium">
                <Zap className="w-3 h-3" />
                Next: {formatRelative(job.next_run_at)}
              </span>
            )}
            {profile && (
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {profile.name}
              </span>
            )}
            {job.last_run_at && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Last: {formatRelative(job.last_run_at)}
              </span>
            )}
            {job.run_count > 0 && (
              <span>{job.run_count} run{job.run_count !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="View details"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <button
            onClick={() => onToggle(job.id, isEnabled)}
            disabled={isToggling}
            className={`p-1.5 rounded-lg transition-colors ${
              isToggling
                ? 'text-gray-300 dark:text-gray-600'
                : isEnabled
                  ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                  : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
            }`}
            title={isEnabled ? 'Pause job' : 'Resume job'}
          >
            {isToggling
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : isEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />
            }
          </button>

          <button
            onClick={() => onDelete(job.id)}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            title="Delete job"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50 dark:border-gray-800 pt-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-gray-400 dark:text-gray-500 block mb-0.5">Goal</span>
              <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{job.goal}</span>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-gray-400 dark:text-gray-500 block mb-0.5">Schedule string</span>
                <code className="text-gray-600 dark:text-gray-400 font-mono">{job.schedule}</code>
              </div>
              <div>
                <span className="text-gray-400 dark:text-gray-500 block mb-0.5">Job ID</span>
                <code className="text-gray-400 dark:text-gray-600 font-mono text-[10px]">{job.id}</code>
              </div>
              {job.working_dir && (
                <div>
                  <span className="text-gray-400 dark:text-gray-500 block mb-0.5">Working dir</span>
                  <code className="text-gray-600 dark:text-gray-400 font-mono">{job.working_dir}</code>
                </div>
              )}
              {profile && (
                <div>
                  <span className="text-gray-400 dark:text-gray-500 block mb-0.5">Agent profile</span>
                  <span className="text-gray-600 dark:text-gray-400">{profile.name}</span>
                </div>
              )}
              <div>
                <span className="text-gray-400 dark:text-gray-500 block mb-0.5">Created</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Clock className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-2">No scheduled jobs yet</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-6">
        Schedule the agent to run goals automatically — on a repeating interval, at a specific time, or once after a delay.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create your first job
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [profiles, setProfiles]   = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const fetchJobs = useCallback(async () => {
    setError(null);
    try {
      const [res, profileRes] = await Promise.all([
        schedulerApi.listJobs(),
        profilesApi.listProfiles().catch(() => ({ profiles: [] })),
      ]);
      setJobs(res.jobs || []);
      setProfiles(profileRes.profiles || []);
    } catch (err) {
      setError(err.message || 'Failed to load scheduled jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Auto-refresh next-run countdown every 30s
  useEffect(() => {
    const id = setInterval(fetchJobs, 30000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  async function handleCreate(data) {
    const res = await schedulerApi.createJob(data);
    if (!res.success) throw new Error(res.error || 'Failed to create job');
    await fetchJobs();
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await schedulerApi.deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete job');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(id, isEnabled) {
    setTogglingId(id);
    try {
      if (isEnabled) {
        await schedulerApi.disableJob(id);
      } else {
        await schedulerApi.enableJob(id);
      }
      await fetchJobs();
    } catch (err) {
      setError(err.message || 'Failed to update job');
    } finally {
      setTogglingId(null);
    }
  }

  const activeJobs  = jobs.filter(j => j.enabled);
  const pausedJobs  = jobs.filter(j => !j.enabled);
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">Agent Scheduler</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {activeJobs.length} active
              </span>
              {pausedJobs.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                  {pausedJobs.length} paused
                </span>
              )}
            </div>
            <button
              onClick={fetchJobs}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Job
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading scheduled jobs…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button onClick={fetchJobs} className="text-xs text-gray-400 hover:text-gray-600 underline">Try again</button>
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <EmptyState onAdd={() => setShowModal(true)} />
        )}

        {!loading && !error && jobs.length > 0 && (
          <div className="px-6 py-5 space-y-6">
            {/* Active jobs */}
            {activeJobs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active</h2>
                  <span className="text-[10px] text-gray-400 ml-1">{activeJobs.length}</span>
                </div>
                <div className="space-y-3">
                  {activeJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      profile={profilesById.get(job.profile_id)}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                      deletingId={deletingId}
                      togglingId={togglingId}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Paused jobs */}
            {pausedJobs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paused</h2>
                  <span className="text-[10px] text-gray-400 ml-1">{pausedJobs.length}</span>
                </div>
                <div className="space-y-3">
                  {pausedJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      profile={profilesById.get(job.profile_id)}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                      deletingId={deletingId}
                      togglingId={togglingId}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <CreateJobModal onClose={() => setShowModal(false)} onCreate={handleCreate} profiles={profiles} />
      )}
    </div>
  );
}
