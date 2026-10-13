// neko/src/Scheduled/ScheduledPage.jsx
// ─── Scheduled ────────────────────────────────────────────────────────────────
// Prompts Asyncat runs on its own on a schedule ("Weekdays at 8:00, summarise
// my unread email"). Each task owns a chat where its answers land. The clock
// that runs them lives in the backend (den/src/agent/Scheduler.js).

import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarClock, CheckCircle2, ChevronRight, CircleSlash, Loader2, MessageSquare, MoreHorizontal,
  Pencil, Play, Plus, RefreshCw, SkipForward, Square, Trash2, XCircle,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu.jsx';
import { Badge, Panel } from '../Models/modelPageShared.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { agentApi, profilesApi, projectsApi } from '../CommandCenter/api';
import { scheduledTasksApi } from '../CommandCenter/api/scheduledTasksApi.js';
import { aiProviderApi } from '../Settings/settingApi.js';
import { useCommandCenter } from '../CommandCenter/context/CommandCenterContextEnhanced';
import TaskEditor from './TaskEditor.jsx';
import { EXAMPLE_TASKS, firstLine, formatDuration, formatRunTime, localTimeZone } from './scheduleForm.js';

const RUN_STATUS = {
  running: { label: 'Running', icon: Loader2, className: 'animate-spin text-accent' },
  succeeded: { label: 'Done', icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-red-600 dark:text-red-400' },
  cancelled: { label: 'Cancelled', icon: CircleSlash, className: 'text-fg-subtle' },
  skipped: { label: 'Skipped', icon: SkipForward, className: 'text-fg-subtle' },
};

const TRIGGER_TEXT = {
  manual: 'Run now',
  catch_up: 'Made up after a missed run',
  schedule: 'On schedule',
};

function RunStatusIcon({ status }) {
  const meta = RUN_STATUS[status] || RUN_STATUS.skipped;
  const Icon = meta.icon;
  return <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.className}`} aria-label={meta.label} />;
}

RunStatusIcon.propTypes = { status: PropTypes.string };

function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? 'On' : 'Off'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-line-strong'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

Switch.propTypes = { checked: PropTypes.bool, onChange: PropTypes.func.isRequired, label: PropTypes.string, disabled: PropTypes.bool };

function nextRunText(task) {
  if (task.running) return 'Running now';
  if (task.stopping) return 'Stopping…';
  if (task.state === 'done') return 'Done';
  if (task.state === 'paused') return 'Paused';
  // In the task's own time zone, so it matches "Weekdays at 8:00".
  return task.nextRunAt ? `Next: ${formatRunTime(task.nextRunAt, { timeZone: task.timezone || undefined })}` : '';
}

function lastRunText(run) {
  if (!run) return null;
  if (run.status === 'running') return 'Running…';
  const text = firstLine(run.status === 'succeeded' ? run.answer : run.error);
  return text || RUN_STATUS[run.status]?.label || run.status;
}

function RunHistory({ task, runs, loading, onOpenChat, onCancel }) {
  return (
    <div className="ml-9 mt-3 space-y-3">
      <div className="rounded-lg bg-hover/60 px-3 py-2.5">
        <div className="mb-1 text-[11px] font-medium text-fg-subtle">Prompt</div>
        <p className="line-clamp-6 whitespace-pre-wrap text-[13px] leading-5 text-fg">{task.prompt}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
          {task.profileName ? <span>Agent: {task.profileName}</span> : null}
          {task.model?.model ? <span>Model: {task.model.model}</span> : null}
          {task.allowedTools?.length ? <span>Pre-approved: {task.allowedTools.join(', ')}</span> : null}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[12px] font-medium text-fg-muted">Runs</span>
          {task.conversationId ? (
            <Button size="xs" variant="ghost" icon={MessageSquare} onClick={() => onOpenChat(task.conversationId)}>Open chat</Button>
          ) : null}
        </div>
        {loading && !runs ? (
          <div className="flex items-center gap-2 py-2 text-[12px] text-fg-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
        ) : !runs?.length ? (
          <p className="py-2 text-[12px] text-fg-subtle">No runs yet. Use Run now to try it.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {runs.map((run) => (
              <li key={run.id} className="flex items-start gap-2.5 px-3 py-2">
                <span className="mt-0.5"><RunStatusIcon status={run.status} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-fg-muted">
                    <span className="font-medium text-fg">{RUN_STATUS[run.status]?.label || run.status}</span>
                    <span>{formatRunTime(run.startedAt)}</span>
                    {run.finishedAt && run.status !== 'skipped' ? <span>· {formatDuration(run.startedAt, run.finishedAt)}</span> : null}
                    <span className="text-fg-subtle">· {TRIGGER_TEXT[run.trigger] || run.trigger}</span>
                  </div>
                  {run.status !== 'running' && !(run.status === 'cancelled' && /^cancelled\.?$/i.test(run.error || '')) ? (
                    <p className={`mt-0.5 line-clamp-2 text-[12px] leading-5 ${run.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-fg-subtle'}`}>
                      {firstLine(run.status === 'succeeded' ? run.answer : run.error, 240)}
                    </p>
                  ) : null}
                </div>
                {run.status === 'running' ? (
                  <Button size="xs" variant="secondary" icon={Square} onClick={onCancel}>Cancel</Button>
                ) : run.conversationId ? (
                  <Button size="xs" variant="ghost" onClick={() => onOpenChat(run.conversationId)}>Open chat</Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

RunHistory.propTypes = {
  task: PropTypes.object.isRequired,
  runs: PropTypes.array,
  loading: PropTypes.bool,
  onOpenChat: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

function TaskRow({ task, expanded, runs, runsLoading, busy, onToggleExpand, onToggleEnabled, onRunNow, onCancel, onEdit, onDelete, onOpenChat }) {
  const menuAnchor = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const last = task.lastRun;
  const lastText = lastRunText(last);

  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide runs' : 'Show runs'}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggleExpand}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{task.name}</span>
            {task.running ? <Badge color="blue"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge> : null}
            {task.state === 'paused' && !task.running ? <Badge>Paused</Badge> : null}
            {task.state === 'done' && !task.running ? <Badge>Done</Badge> : null}
            {task.projectName ? <Badge color="purple">{task.projectName}</Badge> : null}
          </div>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {task.scheduleText}
            {task.timezone && task.timezone !== localTimeZone() ? <span className="text-fg-subtle"> ({task.timezone})</span> : null}
            {nextRunText(task) ? <span className="text-fg-subtle"> · {nextRunText(task)}</span> : null}
          </p>
          {last ? (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-subtle">
              <RunStatusIcon status={last.status} />
              <span className="shrink-0">{formatRunTime(last.startedAt)}</span>
              {lastText ? <span className={`truncate ${last.status === 'failed' ? 'text-red-600 dark:text-red-400' : ''}`}>· {lastText}</span> : null}
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-fg-subtle">Hasn&apos;t run yet</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {task.running || task.stopping ? (
            <Button size="sm" variant="secondary" icon={Square} loading={busy === 'cancel' || task.stopping} onClick={onCancel}>
              {task.stopping ? 'Stopping' : 'Cancel'}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" icon={Play} loading={busy === 'run'} onClick={onRunNow}>Run now</Button>
          )}
          {task.state !== 'done' ? (
            <Switch
              checked={task.enabled}
              disabled={busy === 'toggle'}
              onChange={onToggleEnabled}
              label={task.enabled ? `Pause ${task.name}` : `Turn on ${task.name}`}
            />
          ) : null}
          <button
            ref={menuAnchor}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={`More for ${task.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <Menu anchorRef={menuAnchor} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end" width={200} label={`${task.name} actions`}>
            <MenuItem icon={Pencil} label="Edit" onSelect={onEdit} />
            <MenuItem icon={MessageSquare} label="Open chat" disabled={!task.conversationId} onSelect={() => onOpenChat(task.conversationId)} />
            <MenuSeparator />
            <MenuItem icon={Trash2} label="Delete" danger onSelect={onDelete} />
          </Menu>
        </div>
      </div>
      {expanded ? (
        <RunHistory task={task} runs={runs} loading={runsLoading} onOpenChat={onOpenChat} onCancel={onCancel} />
      ) : null}
    </div>
  );
}

TaskRow.propTypes = {
  task: PropTypes.object.isRequired,
  expanded: PropTypes.bool,
  runs: PropTypes.array,
  runsLoading: PropTypes.bool,
  busy: PropTypes.string,
  onToggleExpand: PropTypes.func.isRequired,
  onToggleEnabled: PropTypes.func.isRequired,
  onRunNow: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onOpenChat: PropTypes.func.isRequired,
};

function EmptyState({ onPick, onNew }) {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-surface text-fg-muted">
        <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-fg">Nothing scheduled yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-fg-muted">
        Tell Asyncat what to do and when. It runs on its own and puts the answer in a chat, with a notification when it&apos;s done.
      </p>
      <div className="mt-6 space-y-2 text-left">
        {EXAMPLE_TASKS.map((example) => (
          <button
            key={example.title}
            type="button"
            onClick={() => onPick(example)}
            className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <CalendarClock className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
            <span className="flex-1 text-left">{example.title}</span>
            <Plus className="h-4 w-4 shrink-0 text-fg-subtle" />
          </button>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Button variant="primary" icon={Plus} onClick={onNew}>New task</Button>
      </div>
      <p className="mt-4 text-[12px] text-fg-subtle">You can also ask in any chat, e.g. “every weekday at 8, summarise my email”.</p>
    </div>
  );
}

EmptyState.propTypes = { onPick: PropTypes.func.isRequired, onNew: PropTypes.func.isRequired };

export default function ScheduledPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { triggerConversationRefresh } = useCommandCenter();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editor, setEditor] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [runs, setRuns] = useState({});
  const [busy, setBusy] = useState({});
  const [options, setOptions] = useState({ projects: [], profiles: [], models: [], activeModel: null, tools: [] });
  const runningRef = useRef(new Set());

  const loadRuns = useCallback(async (id) => {
    try {
      const result = await scheduledTasksApi.runs(id, 20);
      setRuns((current) => ({ ...current, [id]: result.runs || [] }));
    } catch {
      setRuns((current) => ({ ...current, [id]: current[id] || [] }));
    }
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await scheduledTasksApi.list();
      const list = result.tasks || [];
      setTasks(list);
      setLoadError('');
      // A run just finished: its chat may be new, so refresh the sidebar.
      const nowRunning = new Set(list.filter((task) => task.running || task.stopping).map((task) => task.id));
      if ([...runningRef.current].some((id) => !nowRunning.has(id))) triggerConversationRefresh?.();
      runningRef.current = nowRunning;
    } catch (err) {
      if (!quiet) setLoadError(errorDetail(err) || "Couldn't load scheduled tasks.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [triggerConversationRefresh]);

  useEffect(() => { load(); }, [load]);

  // Things the editor offers: projects, agents, saved models, tools.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      projectsApi.getProjects(),
      profilesApi.listProfiles(),
      aiProviderApi.listProfiles(),
      aiProviderApi.getConfig(),
      agentApi.getTools(),
    ]).then(([projects, profiles, models, config, tools]) => {
      if (cancelled) return;
      const value = (result) => (result.status === 'fulfilled' ? result.value : null);
      setOptions({
        projects: value(projects)?.data || value(projects)?.projects || [],
        profiles: value(profiles)?.profiles || [],
        models: value(models)?.profiles || [],
        activeModel: value(config)?.model ? value(config) : null,
        tools: (value(tools)?.tools || []).filter((tool) => tool.permission !== 'safe' && tool.category !== 'schedule'),
      });
    });
    return () => { cancelled = true; };
  }, []);

  // Open the editor from Cmd+K ("New scheduled task" → /scheduled?new=1).
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setEditor({ task: null, initial: null });
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const anyRunning = tasks.some((task) => task.running || task.stopping);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      load({ quiet: true });
      expanded.forEach((id) => loadRuns(id));
    };
    const timer = setInterval(refresh, anyRunning ? 3000 : 30000);
    return () => clearInterval(timer);
  }, [anyRunning, expanded, load, loadRuns]);

  const replaceTask = (task) => {
    if (!task) return;
    setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
  };

  const withBusy = async (id, action, fn) => {
    setBusy((current) => ({ ...current, [id]: action }));
    try {
      await fn();
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const toggleExpand = (id) => {
    const opening = !expanded.has(id);
    setExpanded((current) => {
      const next = new Set(current);
      if (opening) next.add(id);
      else next.delete(id);
      return next;
    });
    if (opening) loadRuns(id);
  };

  const toggleEnabled = (task, enabled) => withBusy(task.id, 'toggle', async () => {
    try {
      const result = await scheduledTasksApi.setEnabled(task.id, enabled);
      replaceTask(result.task);
    } catch (err) {
      toast.error(enabled ? "Couldn't turn the task on" : "Couldn't pause the task", { detail: errorDetail(err) });
    }
  });

  const runNow = (task) => withBusy(task.id, 'run', async () => {
    try {
      const result = await scheduledTasksApi.runNow(task.id);
      replaceTask(result.task);
      runningRef.current.add(task.id);
      if (expanded.has(task.id)) loadRuns(task.id);
      toast.success(`Started "${task.name}"`, { detail: 'The answer will appear in its chat.' });
    } catch (err) {
      toast.error("Couldn't start the task", { detail: errorDetail(err) });
    }
  });

  const cancel = (task) => withBusy(task.id, 'cancel', async () => {
    try {
      await scheduledTasksApi.cancel(task.id);
      await load({ quiet: true });
      if (expanded.has(task.id)) loadRuns(task.id);
    } catch (err) {
      toast.error("Couldn't cancel the run", { detail: errorDetail(err) });
    }
  });

  const remove = async (task) => {
    const ok = await confirm({
      title: 'Delete scheduled task?',
      message: `"${task.name}" and its run history will be deleted. Its chat stays in your chats.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await scheduledTasksApi.remove(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (err) {
      toast.error("Couldn't delete the task", { detail: errorDetail(err) });
    }
  };

  const openChat = (conversationId) => {
    if (conversationId) navigate(`/conversations/${conversationId}`);
  };

  const onSaved = (task) => {
    setEditor(null);
    if (!task) return;
    setTasks((current) => (current.some((item) => item.id === task.id)
      ? current.map((item) => (item.id === task.id ? task : item))
      : [task, ...current]));
    load({ quiet: true });
  };

  const isDesktop = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <PageHeader
        title="Scheduled"
        description="Prompts that run on their own: once, daily, on weekdays or every few hours. Each answer lands in the task's chat and a notification."
        actions={tasks.length ? (
          <>
            <Button variant="ghost" size="icon" icon={RefreshCw} aria-label="Refresh" title="Refresh" onClick={() => load({ quiet: true })} />
            <Button variant="primary" icon={Plus} onClick={() => setEditor({ task: null, initial: null })}>New task</Button>
          </>
        ) : null}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-6 lg:px-8">
          {loadError ? (
            <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">
              {loadError}
              <Button size="xs" variant="ghost" onClick={() => load()}>Try again</Button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : !tasks.length && !loadError ? (
            <EmptyState
              onPick={(example) => setEditor({ task: null, initial: example })}
              onNew={() => setEditor({ task: null, initial: null })}
            />
          ) : tasks.length ? (
            <Panel className="divide-y divide-line">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expanded.has(task.id)}
                  runs={runs[task.id]}
                  runsLoading={!runs[task.id]}
                  busy={busy[task.id]}
                  onToggleExpand={() => toggleExpand(task.id)}
                  onToggleEnabled={(enabled) => toggleEnabled(task, enabled)}
                  onRunNow={() => runNow(task)}
                  onCancel={() => cancel(task)}
                  onEdit={() => setEditor({ task, initial: null })}
                  onDelete={() => remove(task)}
                  onOpenChat={openChat}
                />
              ))}
            </Panel>
          ) : null}

          {!loading ? (
            <p className="mt-5 text-[12px] leading-5 text-fg-subtle">
              {isDesktop ? (
                <>
                  Tasks run while Asyncat is open. After you close the window it keeps running in the tray while a task is on,
                  and a run missed while the computer slept is made up once if it&apos;s less than 12 hours late.{' '}
                  <button type="button" onClick={() => navigate('/settings/background')} className="font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
                    Background settings
                  </button>
                </>
              ) : (
                'Tasks run while Asyncat is running. A run missed while it was off is made up once if it is less than 12 hours late.'
              )}
            </p>
          ) : null}
        </div>
      </div>

      {editor ? (
        <TaskEditor
          task={editor.task}
          initial={editor.initial}
          projects={options.projects}
          profiles={options.profiles}
          models={options.models}
          activeModel={options.activeModel}
          tools={options.tools}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}
