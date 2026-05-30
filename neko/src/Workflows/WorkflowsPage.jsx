/* eslint-disable react/prop-types */
// neko/src/Workflows/WorkflowsPage.jsx
// Visual automation builder. A workflow = trigger (manual / cron schedule) + an
// ordered list of natural-language steps the agent runs in sequence, optionally
// passing each step's output forward as context. Backed by /api/agent/workflows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Workflow, Plus, Play, Trash2, Save, Clock, Hand, ChevronUp, ChevronDown,
  Loader2, CheckCircle2, XCircle, RefreshCw, Zap, GitBranch, AlertCircle, X,
} from 'lucide-react';
import { agentApi, profilesApi } from '../CommandCenter/api';

let STEP_SEQ = 1;
const newStep = () => ({ id: `s-${Date.now()}-${STEP_SEQ++}`, prompt: '', useContext: false, continueOnError: false });
const blankDraft = () => ({
  id: null, name: 'New workflow', description: '',
  triggerType: 'manual', schedule: '0 9 * * *', enabled: true,
  profileId: null,
  steps: [newStep()],
});

const CRON_EXAMPLES = [
  { label: 'Every day 9am', value: '0 9 * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Weekdays 8am', value: '0 8 * * 1-5' },
  { label: 'Every 15 min', value: '*/15 * * * *' },
];

function when(v) {
  if (!v) return 'never';
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v)); }
  catch { return v; }
}

const RUN_STATUS = {
  running:   { cls: 'text-sky-600 dark:text-sky-300', icon: Loader2, spin: true },
  completed: { cls: 'text-emerald-600 dark:text-emerald-300', icon: CheckCircle2 },
  failed:    { cls: 'text-red-600 dark:text-red-300', icon: XCircle },
};

// ── Run history ───────────────────────────────────────────────────────────────
function RunRow({ run }) {
  const [open, setOpen] = useState(false);
  const meta = RUN_STATUS[run.status] || RUN_STATUS.running;
  const Icon = meta.icon;
  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-gray-800/70 midnight:border-slate-800">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/70 dark:hover:bg-white/[0.03]">
        <Icon className={`h-3.5 w-3.5 flex-none ${meta.cls} ${meta.spin ? 'animate-spin' : ''}`} />
        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200 capitalize">{run.status}</span>
        <span className="text-[11px] text-gray-400">{run.stepsCompleted}/{run.stepsTotal} · {run.trigger}</span>
        <span className="text-[10px] text-gray-400">{when(run.startedAt)}</span>
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-2">
          {run.error && <div className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-600 dark:bg-red-950/30 dark:text-red-300">{run.error}</div>}
          {(run.results || []).map((r, i) => (
            <div key={i} className="rounded border border-gray-100 px-2 py-1.5 text-[11px] dark:border-gray-800 midnight:border-slate-800">
              <div className="flex items-center gap-1.5">
                {r.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                <span className="font-medium text-gray-600 dark:text-gray-300">Step {i + 1}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-gray-500 dark:text-gray-400 line-clamp-6">{r.ok ? (r.output || '(no output)') : r.error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step editor ───────────────────────────────────────────────────────────────
function StepCard({ step, index, total, onChange, onMove, onRemove }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-900">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">{index + 1}</span>
        <span className="flex-1 text-xs font-medium text-gray-500 dark:text-gray-400">Agent step</span>
        <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800" title="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800" title="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => onRemove(index)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" title="Remove step"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <textarea
        value={step.prompt}
        onChange={e => onChange(index, { prompt: e.target.value })}
        rows={3}
        placeholder="What should the agent do in this step? e.g. 'Fetch the latest 5 RSS items and draft a summary email.'"
        className="w-full resize-y rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 midnight:border-slate-700 midnight:bg-slate-950"
      />
      <div className="mt-2 flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <input type="checkbox" checked={step.useContext} onChange={e => onChange(index, { useContext: e.target.checked })} className="h-3 w-3 rounded" />
          Use output from previous steps as context
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <input type="checkbox" checked={step.continueOnError} onChange={e => onChange(index, { continueOnError: e.target.checked })} className="h-3 w-3 rounded" />
          Continue if this step fails
        </label>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pollRef = useRef(null);

  const loadWorkflows = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await agentApi.listWorkflows();
      setWorkflows(res.workflows || []);
    } catch (err) { setError(err.message || 'Failed to load workflows.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadWorkflows(); }, [loadWorkflows]);
  useEffect(() => { profilesApi.list().then(r => setProfiles(r.profiles || [])).catch(() => {}); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const loadRuns = useCallback(async (id) => {
    if (!id) return;
    try { const res = await agentApi.getWorkflowRuns(id); setRuns(res.runs || []); }
    catch { setRuns([]); }
  }, []);

  const selectWorkflow = useCallback((wf) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setSelectedId(wf.id);
    setDraft(JSON.parse(JSON.stringify(wf)));
    setDirty(false);
    setConfirmDelete(false);
    loadRuns(wf.id);
  }, [loadRuns]);

  const startNew = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setSelectedId(null);
    setDraft(blankDraft());
    setDirty(true);
    setRuns([]);
    setConfirmDelete(false);
  }, []);

  const patchDraft = (patch) => { setDraft(d => ({ ...d, ...patch })); setDirty(true); };
  const patchStep = (i, patch) => setDraft(d => { const steps = d.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s); setDirty(true); return { ...d, steps }; });
  const addStep = () => { setDraft(d => ({ ...d, steps: [...d.steps, newStep()] })); setDirty(true); };
  const removeStep = (i) => setDraft(d => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) })) || setDirty(true);
  const moveStep = (i, dir) => setDraft(d => {
    const steps = [...d.steps]; const j = i + dir;
    if (j < 0 || j >= steps.length) return d;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setDirty(true); return { ...d, steps };
  });

  const save = useCallback(async () => {
    if (!draft?.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        name: draft.name, description: draft.description,
        triggerType: draft.triggerType, schedule: draft.triggerType === 'schedule' ? draft.schedule : null,
        enabled: draft.enabled, steps: draft.steps, profileId: draft.profileId || null,
      };
      const res = draft.id ? await agentApi.updateWorkflow(draft.id, body) : await agentApi.createWorkflow(body);
      const saved = res.workflow;
      await loadWorkflows();
      setSelectedId(saved.id);
      setDraft(JSON.parse(JSON.stringify(saved)));
      setDirty(false);
    } catch (err) { setError(err.message || 'Failed to save workflow.'); }
    finally { setSaving(false); }
  }, [draft, loadWorkflows]);

  const run = useCallback(async () => {
    if (!draft?.id) return;
    setRunning(true); setError('');
    try {
      await agentApi.runWorkflow(draft.id);
      await loadRuns(draft.id);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const res = await agentApi.getWorkflowRuns(draft.id).catch(() => null);
        if (res?.runs) {
          setRuns(res.runs);
          if (!res.runs.some(r => r.status === 'running')) { clearInterval(pollRef.current); pollRef.current = null; setRunning(false); }
        }
      }, 2500);
    } catch (err) { setError(err.message || 'Failed to start workflow.'); setRunning(false); }
  }, [draft, loadRuns]);

  const remove = useCallback(async () => {
    if (!draft?.id) { setDraft(null); setSelectedId(null); return; }
    try {
      await agentApi.deleteWorkflow(draft.id);
      setDraft(null); setSelectedId(null); setConfirmDelete(false);
      await loadWorkflows();
    } catch (err) { setError(err.message || 'Failed to delete workflow.'); }
  }, [draft, loadWorkflows]);

  const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 midnight:border-slate-700 midnight:bg-slate-950';
  const hasRunningRun = useMemo(() => runs.some(r => r.status === 'running'), [runs]);

  return (
    <div className="flex h-full w-full flex-col bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100 font-sans">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200/80 px-5 py-4 dark:border-gray-800/80 midnight:border-slate-800/80">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h1 className="text-lg font-semibold tracking-tight">Workflows</h1>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">{workflows.length}</span>
        </div>
        <button type="button" onClick={startNew} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white">
          <Plus className="h-4 w-4" /> New workflow
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-4 w-4" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* List */}
        <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200/80 dark:border-gray-800/80 midnight:border-slate-800/80">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : workflows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No workflows yet. Create one to automate the agent.</div>
          ) : workflows.map(wf => (
            <button
              key={wf.id}
              type="button"
              onClick={() => selectWorkflow(wf)}
              className={`flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left transition-colors dark:border-gray-800/70 midnight:border-slate-800 ${selectedId === wf.id ? 'bg-gray-100/80 dark:bg-gray-800/60' : 'hover:bg-gray-50/70 dark:hover:bg-white/[0.03]'}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">{wf.name}</span>
                {!wf.enabled && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-gray-400 dark:bg-gray-800">off</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                {wf.triggerType === 'schedule' ? <Clock className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                <span>{wf.triggerType === 'schedule' ? wf.schedule : 'Manual'}</span>
                <span>· {wf.steps.length} step{wf.steps.length === 1 ? '' : 's'}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {!draft ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
              <Workflow className="h-10 w-10 opacity-40" />
              <p className="text-sm">Select a workflow or create a new one.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
              {/* Title + actions */}
              <div className="flex items-start gap-3">
                <input value={draft.name} onChange={e => patchDraft({ name: e.target.value })} className="flex-1 bg-transparent text-xl font-semibold text-gray-900 outline-none dark:text-gray-100" placeholder="Workflow name" />
                <div className="flex items-center gap-2">
                  {draft.id && (
                    <button type="button" onClick={run} disabled={running || hasRunningRun} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                      {(running || hasRunningRun) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run
                    </button>
                  )}
                  <button type="button" onClick={save} disabled={saving || !dirty} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {draft.id ? 'Save' : 'Create'}
                  </button>
                </div>
              </div>

              <input value={draft.description} onChange={e => patchDraft({ description: e.target.value })} className={inputCls} placeholder="Description (optional)" />

              {/* Run as (agent profile) */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">Run as</label>
                <select
                  value={draft.profileId || ''}
                  onChange={e => patchDraft({ profileId: e.target.value || null })}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 midnight:border-slate-700 midnight:bg-slate-950"
                >
                  <option value="">Default agent</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span className="text-[11px] text-gray-400">agent profile used for every step</span>
              </div>

              {/* Trigger */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400"><Zap className="h-3.5 w-3.5" /> Trigger</div>
                <div className="flex gap-2">
                  {[{ k: 'manual', label: 'Manual', icon: Hand }, { k: 'schedule', label: 'Schedule', icon: Clock }].map(({ k, label, icon: Icon }) => (
                    <button key={k} type="button" onClick={() => patchDraft({ triggerType: k })} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${draft.triggerType === k ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <input type="checkbox" checked={draft.enabled} onChange={e => patchDraft({ enabled: e.target.checked })} className="h-3.5 w-3.5 rounded" /> Enabled
                  </label>
                </div>
                {draft.triggerType === 'schedule' && (
                  <div className="mt-3">
                    <input value={draft.schedule || ''} onChange={e => patchDraft({ schedule: e.target.value })} className={`${inputCls} font-mono`} placeholder="Cron expression e.g. 0 9 * * *" spellCheck={false} />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CRON_EXAMPLES.map(ex => (
                        <button key={ex.value} type="button" onClick={() => patchDraft({ schedule: ex.value })} className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">{ex.label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400"><GitBranch className="h-3.5 w-3.5" /> Steps ({draft.steps.length})</div>
                <div className="space-y-2">
                  {draft.steps.map((step, i) => (
                    <StepCard key={step.id} step={step} index={i} total={draft.steps.length} onChange={patchStep} onMove={moveStep} onRemove={removeStep} />
                  ))}
                </div>
                <button type="button" onClick={addStep} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-500 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                  <Plus className="h-4 w-4" /> Add step
                </button>
              </div>

              {/* Run history */}
              {draft.id && (
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 midnight:border-slate-800">
                  <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-800/70 midnight:border-slate-800">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Run history</span>
                    <button type="button" onClick={() => loadRuns(draft.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
                  </div>
                  {runs.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-400">No runs yet. Hit Run to execute the workflow.</div>
                  ) : runs.map(r => <RunRow key={r.id} run={r} />)}
                </div>
              )}

              {/* Delete */}
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800/70">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Delete this workflow?</span>
                    <button type="button" onClick={remove} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">Delete</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => (draft.id ? setConfirmDelete(true) : startNew())} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" /> {draft.id ? 'Delete workflow' : 'Discard'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
