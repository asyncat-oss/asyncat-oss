/* eslint-disable react/prop-types */
// neko/src/Scheduler/SchedulerPage.jsx
// ─── Agent Scheduler UI ───────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Plus, Trash2, Play, Pause, Loader2, AlertCircle,
  Calendar, RefreshCw, CheckCircle2, XCircle, ChevronDown,
  ChevronRight, Zap, Timer, Repeat, Layers, Cloud, RotateCcw,
  Workflow, ExternalLink, Pencil,
} from 'lucide-react';
import { agentApi, schedulerApi, profilesApi } from '../CommandCenter/api';
import { aiProviderApi } from '../Settings/settingApi.js';
import WorkflowScheduleControls from './ScheduleControls';
import { describeCron, getAvailableTimeZones, getLocalTimeZone } from './scheduleUtils';

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

function providerLabel(provider) {
  if (!provider) return 'Uses active provider';
  const name = provider.name || provider.provider_id || provider.providerId || 'AI provider';
  const model = provider.model ? ` · ${provider.model}` : '';
  return `${name}${model}`;
}

function runStatusMeta(status) {
  if (status === 'completed') return { label: 'Completed', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' };
  if (status === 'failed') return { label: 'Failed', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' };
  if (status === 'running') return { label: 'Running', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' };
  return { label: 'No runs', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' };
}

function cleanRunText(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactRunText(text, max = 220) {
  const cleaned = cleanRunText(text).replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trim()}…` : cleaned;
}

function runDisplayText(run) {
  if (!run) return '';
  if (run.error) return cleanRunText(run.error);
  if (run.answer) return cleanRunText(run.answer);
  if (run.status === 'running') return 'Still running…';
  return 'No result text recorded.';
}

function CreateJobModal({ onClose, onCreate, profiles = [], providerProfiles = [], activeProvider = null, workflows = [], initialJob = null }) {
  const editing = Boolean(initialJob);
  const initialSchedule = initialJob?.schedule || 'interval:3600000';
  const initialScheduleType = (() => {
    if (initialSchedule.startsWith('daily:')) return '__daily__';
    if (initialSchedule.startsWith('once:')) return '__once__';
    if (initialSchedule.startsWith('at:')) return '__at__';
    if (SCHEDULE_PRESETS.some(preset => preset.value === initialSchedule)) return initialSchedule;
    if (initialSchedule.startsWith('interval:')) return '__custom__';
    return initialSchedule;
  })();
  const initialAt = initialSchedule.startsWith('at:') ? new Date(initialSchedule.slice(3)) : null;
  const initialOnceMs = initialSchedule.startsWith('once:') ? Number(initialSchedule.slice(5)) : 1800000;
  const initialCustomMs = initialSchedule.startsWith('interval:') ? Number(initialSchedule.slice(9)) : 3600000;
  const initialCustomUnit = initialCustomMs % 86400000 === 0 ? 'days' : initialCustomMs % 3600000 === 0 ? 'hours' : 'minutes';
  const initialCustomDivisor = { minutes: 60000, hours: 3600000, days: 86400000 }[initialCustomUnit];
  const [targetType, setTargetType] = useState('agent');
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id || '');
  const [workflowSchedule, setWorkflowSchedule] = useState(workflows[0]?.schedule || '0 9 * * *');
  const [timezone, setTimezone] = useState(initialJob?.timezone || workflows[0]?.timezone || getLocalTimeZone());
  const [name, setName]           = useState(initialJob?.name || '');
  const [goal, setGoal]           = useState(initialJob?.goal || '');
  const [profileId, setProfileId] = useState(initialJob?.profile_id || '');
  const [providerProfileId, setProviderProfileId] = useState(initialJob?.provider_profile_id || (activeProvider ? (activeProvider.profile_id || '') : (providerProfiles[0]?.id || '')));
  const [scheduleType, setScheduleType] = useState(initialScheduleType);
  const [dailyTime, setDailyTime] = useState(initialSchedule.startsWith('daily:') ? initialSchedule.slice(6) : '09:00');
  const [onceDelay, setOnceDelay] = useState(String(Math.max(1, Math.round(initialOnceMs / 60000))));
  const [onceUnit, setOnceUnit]   = useState('minutes');
  const [atDate, setAtDate]       = useState(initialAt && !Number.isNaN(initialAt.getTime()) ? `${initialAt.getFullYear()}-${String(initialAt.getMonth() + 1).padStart(2, '0')}-${String(initialAt.getDate()).padStart(2, '0')}` : '');
  const [atTime, setAtTime]       = useState(initialAt && !Number.isNaN(initialAt.getTime()) ? `${String(initialAt.getHours()).padStart(2, '0')}:${String(initialAt.getMinutes()).padStart(2, '0')}` : '');
  const [customInterval, setCustomInterval] = useState(String(Math.max(1, Math.round(initialCustomMs / initialCustomDivisor))));
  const [customUnit, setCustomUnit] = useState(initialCustomUnit);
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
      const multipliers = { minutes: 60000, hours: 3600000, days: 86400000 };
      const ms = parseInt(customInterval, 10) * multipliers[customUnit];
      if (isNaN(ms) || ms < 1000) return null;
      return `interval:${ms}`;
    }
    return scheduleType;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const schedule = targetType === 'workflow' ? workflowSchedule.trim() : buildScheduleString();
    if (targetType === 'workflow') {
      if (!workflowId) { setError('Choose a workflow to schedule'); return; }
      if (!schedule) { setError('Please complete the schedule configuration'); return; }
      setSaving(true);
      try {
        await onCreate({ targetType, workflowId, schedule, timezone });
        onClose();
      } catch (err) {
        setError(err.message || 'Failed to schedule workflow');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!name.trim()) { setError('Name is required'); return; }
    if (!goal.trim()) { setError('Goal is required'); return; }
    if (!schedule)    { setError('Please complete the schedule configuration'); return; }
    if (!providerProfileId && !activeProvider) { setError('Choose an AI provider on the Models page first'); return; }

    setSaving(true);
    try {
      await onCreate({ targetType, name: name.trim(), goal: goal.trim(), schedule, timezone, profileId: profileId || null, providerProfileId: providerProfileId || null });
      onClose();
    } catch (err) {
      setError(err.message || (editing ? 'Failed to update job' : 'Failed to create job'));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-gray-700 dark:text-gray-200 midnight:text-slate-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-2xl border border-gray-100 dark:border-gray-800 midnight:border-slate-800 rounded-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-slate-850 flex items-center justify-center">
              <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400 midnight:text-slate-300" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">{editing ? 'Edit Agent Schedule' : 'New Schedule'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:text-slate-400 midnight:hover:text-slate-200 midnight:hover:bg-slate-900 transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {!editing ? <div>
            <label className={labelCls}>What should run?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setTargetType('agent'); setTimezone(initialJob?.timezone || getLocalTimeZone()); }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${targetType === 'agent' ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'}`}
              >
                <Zap className="h-4 w-4" />
                <span><strong className="block font-medium">Agent instruction</strong><span className="mt-0.5 block text-[10px] opacity-75">Run one saved goal</span></span>
              </button>
              <button
                type="button"
                onClick={() => { setTargetType('workflow'); setTimezone(workflows.find(workflow => workflow.id === workflowId)?.timezone || getLocalTimeZone()); }}
                disabled={workflows.length === 0}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${targetType === 'workflow' ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'}`}
              >
                <Workflow className="h-4 w-4" />
                <span><strong className="block font-medium">Workflow</strong><span className="mt-0.5 block text-[10px] opacity-75">Run reusable steps</span></span>
              </button>
            </div>
            {workflows.length === 0 ? <p className="mt-1.5 text-[10px] text-gray-400">Create a workflow first to schedule reusable multi-step work.</p> : null}
          </div> : null}

          {targetType === 'workflow' ? (
            <div>
              <label className={labelCls}>Workflow</label>
              <select
                value={workflowId}
                onChange={event => {
                  const nextId = event.target.value;
                  const workflow = workflows.find(item => item.id === nextId);
                  setWorkflowId(nextId);
                  setWorkflowSchedule(workflow?.schedule || '0 9 * * *');
                  setTimezone(workflow?.timezone || getLocalTimeZone());
                }}
                className={inputCls}
              >
                {workflows.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
              </select>
            </div>
          ) : (
            <>
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
            <p className="mt-1.5 text-[10px] text-gray-400 midnight:text-slate-500">This is the exact goal the agent will run on each execution.</p>
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
              <p className="mt-1.5 text-[10px] text-gray-400 midnight:text-slate-500">Scheduled runs use the selected profile for working dir, soul, rounds, and pre-approved tools. Tools that need live approval are blocked unless the profile pre-approves them or auto-approve is enabled.</p>
            </div>
          )}

          <div>
            <label className={labelCls}>AI Model / Provider</label>
            <select value={providerProfileId} onChange={e => setProviderProfileId(e.target.value)} className={inputCls}>
              {activeProvider && (
                <option value="">
                  Current active: {providerLabel(activeProvider)}
                </option>
              )}
              {providerProfiles.map(provider => (
                <option key={provider.id} value={provider.id}>
                  {providerLabel(provider)}{activeProvider?.profile_id === provider.id ? ' (active)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] text-gray-400 midnight:text-slate-500">This model is saved with the job, so future active-model changes will not silently change scheduled runs.</p>
          </div>
            </>
          )}

          <div>
            <label className={labelCls}>Schedule</label>
            {targetType === 'workflow' ? (
              <WorkflowScheduleControls value={workflowSchedule} onChange={setWorkflowSchedule} timezone={timezone} onTimezoneChange={setTimezone} inputClassName={inputCls} />
            ) : (
              <>
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
                        ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:border-slate-500 midnight:bg-slate-800 midnight:text-slate-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:text-slate-400 midnight:hover:border-slate-700 midnight:hover:bg-slate-900'
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
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                <label className={labelCls}>Time of day</label>
                <input type="time" value={dailyTime} onChange={e => setDailyTime(e.target.value)} className={inputCls} />
              </div>
            )}
            {scheduleType === '__once__' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
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
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                <label className={labelCls}>Exact date &amp; time</label>
                <div className="flex gap-2">
                  <input type="date" value={atDate} onChange={e => setAtDate(e.target.value)} className={`${inputCls} flex-1`} />
                  <input type="time" value={atTime} onChange={e => setAtTime(e.target.value)} className={`${inputCls} w-32`} />
                </div>
              </div>
            )}
            {scheduleType === '__custom__' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                <label className={labelCls}>Repeat every</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={customInterval}
                    onChange={e => setCustomInterval(e.target.value)}
                    className={`${inputCls} flex-1`}
                    placeholder="2"
                  />
                  <select value={customUnit} onChange={e => setCustomUnit(e.target.value)} className={`${inputCls} w-32`}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              </div>
            )}
              </>
            )}
            {targetType === 'agent' ? (
              <label className="mt-3 block">
                <span className={labelCls}>Timezone</span>
                <select value={timezone} onChange={event => setTimezone(event.target.value)} className={inputCls}>
                  {getAvailableTimeZones().map(zone => <option key={zone} value={zone}>{zone === getLocalTimeZone() ? `${zone} (local)` : zone}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors midnight:border-slate-800 midnight:text-slate-350 midnight:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white dark:text-gray-900 transition-colors font-medium midnight:bg-slate-100 midnight:hover:bg-white midnight:text-slate-950 midnight:disabled:bg-slate-800 midnight:disabled:text-slate-550"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {editing ? 'Save Changes' : targetType === 'workflow' ? 'Schedule Workflow' : 'Schedule Agent Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({ job, profile, onDelete, onToggle, onRunNow, onEdit, deletingId, togglingId, runningNowId }) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState(null);
  const ScheduleIcon = getScheduleIcon(job.schedule);
  const isEnabled = !!job.enabled;
  const isDeleting = deletingId === job.id;
  const isToggling = togglingId === job.id;
  const isRunningNow = runningNowId === job.id;
  const latestRun = job.latest_run;
  const latestStatus = runStatusMeta(latestRun?.status);
  const provider = job.provider || job.provider_snapshot;
  const latestPreview = latestRun
    ? compactRunText(latestRun.error || latestRun.answer || (latestRun.status === 'running' ? 'Run is currently in progress.' : 'Run completed.'))
    : '';

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setRunsLoading(true);
    setRunsError(null);
    schedulerApi.listRuns(job.id).then(res => {
      if (!cancelled) setRuns(res.runs || []);
    }).catch(err => {
      if (!cancelled) setRunsError(err.message || 'Failed to load runs');
    }).finally(() => {
      if (!cancelled) setRunsLoading(false);
    });
    return () => { cancelled = true; };
  }, [expanded, job.id, latestRun?.id]);

  const typeLabel = (() => {
    if (job.schedule === 'hourly' || job.schedule?.startsWith('interval:')) return 'Repeating';
    if (job.schedule?.startsWith('daily:')) return 'Daily';
    return 'One-shot';
  })();

  const typeColor = (() => {
    if (typeLabel === 'Repeating') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 midnight:bg-blue-950/40 midnight:text-blue-400/80';
    if (typeLabel === 'Daily')     return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 midnight:bg-indigo-950/40 midnight:text-indigo-400/80';
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 midnight:bg-amber-950/40 midnight:text-amber-400/80';
  })();

  return (
    <div className={`border transition-colors ${
      isEnabled
        ? 'border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white dark:bg-gray-900 midnight:bg-slate-950'
        : 'border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/50 dark:bg-gray-900/30 midnight:bg-slate-950/50 opacity-60'
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
            <span className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-200 truncate">{job.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor}`}>{typeLabel}</span>
            {!isEnabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 midnight:bg-slate-900 midnight:text-slate-400">Paused</span>
            )}
            {latestRun && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${latestStatus.cls}`}>{latestStatus.label}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-0.5 truncate">{job.goal}</p>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-450 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {parseScheduleLabel(job.schedule)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {job.timezone || 'Server local time'}
            </span>
            {job.next_run_at && isEnabled && (
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 midnight:text-slate-350 font-medium">
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
            {provider && (
              <span className="flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                {providerLabel(provider)}
              </span>
            )}
            {job.last_run_at && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 midnight:text-emerald-500/80" />
                Last: {formatRelative(job.last_run_at)}
              </span>
            )}
            {job.run_count > 0 && (
              <span>{job.run_count} run{job.run_count !== 1 ? 's' : ''}</span>
            )}
          </div>
          {latestRun && (
            <div className={`mt-2 max-w-4xl text-xs leading-5 ${latestRun.status === 'failed' ? 'text-red-600 dark:text-red-400 midnight:text-red-400/80' : 'text-gray-500 dark:text-gray-400 midnight:text-slate-450'}`}>
              <span className="font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">Latest: </span>
              <span>{latestPreview || (latestRun.status === 'failed' ? 'Run failed.' : 'Run completed.')}</span>
            </div>
          )}
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
            onClick={() => onRunNow(job.id)}
            disabled={isRunningNow}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
            title="Run now"
          >
            {isRunningNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </button>

          <button
            onClick={() => onEdit(job)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Edit schedule"
          >
            <Pencil className="w-4 h-4" />
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
        <div className="px-4 pb-4 border-t border-gray-50 dark:border-gray-800 midnight:border-slate-800 pt-3">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] gap-x-8 gap-y-4 text-xs">
            <div className="min-w-0">
              <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-550 block mb-0.5">Goal</span>
              <p className="text-gray-700 dark:text-gray-300 midnight:text-slate-300 leading-relaxed break-words">{job.goal}</p>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-550 block mb-0.5">Schedule string</span>
                <code className="text-gray-600 dark:text-gray-400 midnight:text-slate-400 font-mono">{job.schedule}</code>
              </div>
              <div>
                <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-550 block mb-0.5">Job ID</span>
                <code className="text-gray-400 dark:text-gray-600 midnight:text-slate-550 font-mono text-[10px]">{job.id}</code>
              </div>
              {job.working_dir && (
                <div>
                  <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-550 block mb-0.5">Working dir</span>
                  <code className="text-gray-600 dark:text-gray-400 midnight:text-slate-400 font-mono">{job.working_dir}</code>
                </div>
              )}
              {profile && (
                <div>
                  <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-550 block mb-0.5">Agent profile</span>
                  <span className="text-gray-600 dark:text-gray-400 midnight:text-slate-400">{profile.name}</span>
                </div>
              )}
              {provider && (
                <div>
                  <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-550 block mb-0.5">AI provider</span>
                  <span className="text-gray-600 dark:text-gray-400 midnight:text-slate-400">{providerLabel(provider)}</span>
                </div>
              )}
              <div>
                <span className="text-gray-400 dark:text-gray-500 midnight:text-slate-550 block mb-0.5">Created</span>
                <span className="text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                  {job.created_at ? new Date(job.created_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 midnight:text-slate-400">Run history</span>
              <button onClick={() => onRunNow(job.id)} disabled={isRunningNow} className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 midnight:border-slate-800 midnight:text-slate-300 midnight:hover:bg-slate-900">
                {isRunningNow ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Run now
              </button>
            </div>
            {runsLoading && <div className="text-xs text-gray-400 midnight:text-slate-500">Loading runs…</div>}
            {runsError && <div className="text-xs text-red-500 midnight:text-red-400/80">{runsError}</div>}
            {!runsLoading && !runsError && runs.length === 0 && (
              <div className="text-xs text-gray-400 midnight:text-slate-500">No runs recorded yet.</div>
            )}
            {!runsLoading && !runsError && runs.length > 0 && (
              <div className="space-y-2">
                {runs.map(run => {
                  const meta = runStatusMeta(run.status);
                  const displayText = runDisplayText(run);
                  return (
                    <div key={run.id} className="rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.cls}`}>{meta.label}</span>
                        <span className="text-[10px] text-gray-400 midnight:text-slate-500">{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</span>
                      </div>
                      <p className={`mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 ${run.status === 'failed' ? 'text-red-600 dark:text-red-400 midnight:text-red-400/80' : 'text-gray-600 dark:text-gray-400 midnight:text-slate-350'}`}>
                        {displayText}
                      </p>
                      {run.agent_session_id && (
                        <code className="mt-1 block text-[10px] text-gray-400 dark:text-gray-600 midnight:text-slate-500 font-mono">Session: {run.agent_session_id}</code>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function WorkflowScheduleCard({ workflow, profile, onToggle, onRunNow, onRemove, busyAction, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const isEnabled = Boolean(workflow.enabled);
  const isBusy = busyAction?.endsWith(`:${workflow.id}`);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setRunsLoading(true);
    agentApi.getWorkflowRuns(workflow.id)
      .then(result => { if (!cancelled) setRuns(result.runs || []); })
      .catch(() => { if (!cancelled) setRuns([]); })
      .finally(() => { if (!cancelled) setRunsLoading(false); });
    return () => { cancelled = true; };
  }, [expanded, workflow.id, workflow.lastRunAt]);

  return (
    <div className={`border transition-colors ${isEnabled ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-950' : 'border-gray-100 bg-gray-50/50 opacity-60 dark:border-gray-800 dark:bg-gray-900/30 midnight:border-slate-800 midnight:bg-slate-950/50'}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-indigo-50 dark:bg-indigo-950/30">
          <Workflow className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-200">{workflow.name}</span>
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">Workflow</span>
            {!isEnabled ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800">Paused</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{workflow.description || `${workflow.steps?.length || 0} agent steps`}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-slate-450">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{describeCron(workflow.schedule)}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{workflow.timezone || 'Server local time'}</span>
            {profile ? <span className="flex items-center gap-1"><Layers className="h-3 w-3" />{profile.name}</span> : null}
            {workflow.lastRunAt ? <span>Last: {formatRelative(workflow.lastRunAt)}</span> : null}
            {workflow.runCount > 0 ? <span>{workflow.runCount} run{workflow.runCount === 1 ? '' : 's'}</span> : null}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button onClick={() => setExpanded(value => !value)} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300" title="View run history">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <button onClick={() => onEdit(workflow.id)} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200" title="Edit workflow">
            <ExternalLink className="h-4 w-4" />
          </button>
          <button onClick={() => onRunNow(workflow.id)} disabled={isBusy} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-300" title="Run workflow now">
            {busyAction === `run:${workflow.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          </button>
          <button onClick={() => onToggle(workflow.id, isEnabled)} disabled={isBusy} className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${isEnabled ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20' : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20'}`} title={isEnabled ? 'Pause workflow schedule' : 'Resume workflow schedule'}>
            {busyAction === `toggle:${workflow.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : isEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={() => onRemove(workflow.id)} disabled={isBusy} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400" title="Remove schedule; keep workflow manual">
            {busyAction === `remove:${workflow.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-800 midnight:border-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Workflow run history</span>
            <code className="text-[10px] text-gray-400">{workflow.schedule}</code>
          </div>
          {runsLoading ? <div className="text-xs text-gray-400">Loading runs…</div> : null}
          {!runsLoading && runs.length === 0 ? <div className="text-xs text-gray-400">No workflow runs recorded yet.</div> : null}
          {!runsLoading && runs.length > 0 ? (
            <div className="space-y-2">
              {runs.slice(0, 8).map(run => {
                const meta = runStatusMeta(run.status);
                return (
                  <div key={run.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-xs dark:border-gray-800 midnight:border-slate-800">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>{meta.label}</span>
                    <span className="flex-1 text-gray-500 dark:text-gray-400">{run.stepsCompleted}/{run.stepsTotal} steps · {run.trigger}</span>
                    <span className="text-[10px] text-gray-400">{run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 flex items-center justify-center mb-4">
        <Clock className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white midnight:text-slate-200 mb-2">No schedules yet</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 max-w-xs leading-relaxed mb-6">
        Schedule an agent instruction or an existing workflow to run automatically.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 midnight:bg-slate-100 midnight:hover:bg-white midnight:text-slate-950 rounded-lg text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create your first job
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SchedulerPage({ embedded = false }) {
  const navigate = useNavigate();
  const [jobs, setJobs]           = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [profiles, setProfiles]   = useState([]);
  const [providerProfiles, setProviderProfiles] = useState([]);
  const [activeProvider, setActiveProvider] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [runningNowId, setRunningNowId] = useState(null);
  const [workflowAction, setWorkflowAction] = useState(null);

  const fetchJobs = useCallback(async () => {
    setError(null);
    try {
      const [res, workflowRes, profileRes, providerProfilesRes, activeProviderRes] = await Promise.all([
        schedulerApi.listJobs(),
        agentApi.listWorkflows(),
        profilesApi.listProfiles().catch(() => ({ profiles: [] })),
        aiProviderApi.listProfiles().catch(() => ({ profiles: [], active: null })),
        aiProviderApi.getConfig().catch(() => null),
      ]);
      setJobs(res.jobs || []);
      setWorkflows(workflowRes.workflows || []);
      setProfiles(profileRes.profiles || []);
      setProviderProfiles(providerProfilesRes.profiles || []);
      setActiveProvider(activeProviderRes?.model ? activeProviderRes : null);
    } catch (err) {
      setError(err.message || 'Failed to load schedules');
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
    if (data.targetType === 'workflow') {
      const res = await agentApi.updateWorkflow(data.workflowId, {
        triggerType: 'schedule',
        schedule: data.schedule,
        timezone: data.timezone,
        enabled: true,
      });
      if (!res.success) throw new Error(res.error || 'Failed to schedule workflow');
      await fetchJobs();
      return;
    }
    const res = editingJob
      ? await schedulerApi.updateJob(editingJob.id, data)
      : await schedulerApi.createJob(data);
    if (!res.success) throw new Error(res.error || (editingJob ? 'Failed to update job' : 'Failed to create job'));
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

  async function handleRunNow(id) {
    setRunningNowId(id);
    try {
      await schedulerApi.runNow(id);
      await fetchJobs();
    } catch (err) {
      setError(err.message || 'Failed to run job');
    } finally {
      setRunningNowId(null);
    }
  }

  async function handleWorkflowToggle(id, isEnabled) {
    setWorkflowAction(`toggle:${id}`);
    try {
      await agentApi.updateWorkflow(id, { enabled: !isEnabled });
      await fetchJobs();
    } catch (err) {
      setError(err.message || 'Failed to update workflow schedule');
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleWorkflowRunNow(id) {
    setWorkflowAction(`run:${id}`);
    try {
      await agentApi.runWorkflow(id);
      await fetchJobs();
    } catch (err) {
      setError(err.message || 'Failed to run workflow');
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleWorkflowRemoveSchedule(id) {
    setWorkflowAction(`remove:${id}`);
    try {
      await agentApi.updateWorkflow(id, { triggerType: 'manual', schedule: null });
      await fetchJobs();
    } catch (err) {
      setError(err.message || 'Failed to remove workflow schedule');
    } finally {
      setWorkflowAction(null);
    }
  }

  const activeJobs  = jobs.filter(j => j.enabled);
  const pausedJobs  = jobs.filter(j => !j.enabled);
  const scheduledWorkflows = workflows.filter(workflow => workflow.triggerType === 'schedule' && workflow.schedule);
  const activeWorkflowSchedules = scheduledWorkflows.filter(workflow => workflow.enabled);
  const pausedWorkflowSchedules = scheduledWorkflows.filter(workflow => !workflow.enabled);
  const activeScheduleCount = activeJobs.length + activeWorkflowSchedules.length;
  const pausedScheduleCount = pausedJobs.length + pausedWorkflowSchedules.length;
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header */}
      {embedded ? (
        <div className="flex items-center justify-end gap-3 px-6 py-2 flex-shrink-0">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {activeScheduleCount} active
            </span>
            {pausedScheduleCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                {pausedScheduleCount} paused
              </span>
            )}
          </div>
          <button onClick={fetchJobs} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => { setEditingJob(null); setShowModal(true); }} className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />New Schedule
          </button>
        </div>
      ) : (
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <h1 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Schedules</h1>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Manage when agent instructions and workflows run.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-xs text-gray-400 midnight:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 midnight:bg-emerald-600/70" />
                  {activeScheduleCount} active
                </span>
                {pausedScheduleCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-slate-700" />
                    {pausedScheduleCount} paused
                  </span>
                )}
              </div>
              <button onClick={fetchJobs} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:text-slate-400 midnight:hover:text-slate-200 midnight:hover:bg-slate-900 transition-colors" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => { setEditingJob(null); setShowModal(true); }} className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 midnight:bg-slate-100 midnight:hover:bg-white midnight:text-slate-950 rounded-lg text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" />New Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading schedules…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button onClick={fetchJobs} className="text-xs text-gray-400 hover:text-gray-600 underline">Try again</button>
          </div>
        )}

        {!loading && !error && jobs.length === 0 && scheduledWorkflows.length === 0 && (
          <EmptyState onAdd={() => { setEditingJob(null); setShowModal(true); }} />
        )}

        {!loading && !error && (jobs.length > 0 || scheduledWorkflows.length > 0) && (
          <div className="px-6 py-5 space-y-6">
            {scheduledWorkflows.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Workflow className="h-3.5 w-3.5 text-indigo-500" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Scheduled workflows</h2>
                  <span className="ml-1 text-[10px] text-gray-400">{scheduledWorkflows.length}</span>
                </div>
                <div className="space-y-3">
                  {scheduledWorkflows.map(workflow => (
                    <WorkflowScheduleCard
                      key={workflow.id}
                      workflow={workflow}
                      profile={profilesById.get(workflow.profileId)}
                      onToggle={handleWorkflowToggle}
                      onRunNow={handleWorkflowRunNow}
                      onRemove={handleWorkflowRemoveSchedule}
                      busyAction={workflowAction}
                      onEdit={id => navigate(`/workflows?workflow=${encodeURIComponent(id)}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Active jobs */}
            {activeJobs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active agent jobs</h2>
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
                      onRunNow={handleRunNow}
                      onEdit={job => { setEditingJob(job); setShowModal(true); }}
                      deletingId={deletingId}
                      togglingId={togglingId}
                      runningNowId={runningNowId}
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
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paused agent jobs</h2>
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
                      onRunNow={handleRunNow}
                      onEdit={job => { setEditingJob(job); setShowModal(true); }}
                      deletingId={deletingId}
                      togglingId={togglingId}
                      runningNowId={runningNowId}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <CreateJobModal
          onClose={() => { setShowModal(false); setEditingJob(null); }}
          onCreate={handleCreate}
          profiles={profiles}
          providerProfiles={providerProfiles}
          activeProvider={activeProvider}
          workflows={workflows}
          initialJob={editingJob}
        />
      )}
    </div>
  );
}
