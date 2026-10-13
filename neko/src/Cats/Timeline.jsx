// What a Cat did, run by run: what woke it, each step (pages it visited,
// files it changed, what it asked), and how the run ended. File changes can
// be undone through the run's checkpoint.

import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  AlarmClock, Brain, CheckCircle2, CircleSlash, Eye, FileText, Globe, HelpCircle, Loader2, MessageSquare, RotateCcw,
  SkipForward, Sparkles, ThumbsUp, Wrench, XCircle,
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { agentApi } from '../CommandCenter/api/agentApi.js';
import { ago, groupTimeline } from './catFormat.js';

const ICONS = {
  woke: { icon: AlarmClock, className: 'text-accent' },
  page: { icon: Globe, className: 'text-fg-subtle' },
  file: { icon: FileText, className: 'text-fg-subtle' },
  tool: { icon: Wrench, className: 'text-fg-subtle' },
  memory: { icon: Brain, className: 'text-fg-subtle' },
  asked: { icon: HelpCircle, className: 'text-amber-600 dark:text-amber-400' },
  answered: { icon: MessageSquare, className: 'text-fg-subtle' },
  finished: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  failed: { icon: XCircle, className: 'text-red-600 dark:text-red-400' },
  cancelled: { icon: CircleSlash, className: 'text-fg-subtle' },
  skipped: { icon: SkipForward, className: 'text-fg-subtle' },
  feedback: { icon: ThumbsUp, className: 'text-fg-subtle' },
  watching: { icon: Eye, className: 'text-fg-subtle' },
  created: { icon: Sparkles, className: 'text-accent' },
};

function UndoFiles({ sessionId }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState('idle');
  const undo = async () => {
    const ok = await confirm({
      title: 'Undo this run\'s file changes?',
      message: 'Files in the Cat\'s folder go back to how they were before this run. Changes made since then are lost too.',
      confirmLabel: 'Undo changes',
      destructive: true,
    });
    if (!ok) return;
    setState('busy');
    try {
      await agentApi.revertSession(sessionId);
      setState('done');
      toast.success('The files are back as they were');
    } catch (err) {
      setState('idle');
      toast.error("Couldn't undo the changes", { detail: errorDetail(err) });
    }
  };
  if (state === 'done') return <span className="text-[11px] text-fg-subtle">Undone</span>;
  return <Button size="xs" variant="ghost" icon={RotateCcw} loading={state === 'busy'} onClick={undo}>Undo file changes</Button>;
}

UndoFiles.propTypes = { sessionId: PropTypes.string.isRequired };

export default function Timeline({ events }) {
  if (events === null) {
    return <div className="flex items-center gap-2 py-6 text-[13px] text-fg-subtle"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!events.length) {
    return <p className="py-6 text-center text-[13px] text-fg-muted">Nothing yet. What it does shows up here, step by step.</p>;
  }
  return (
    <ol className="space-y-3">
      {groupTimeline(events).map((group) => {
        const sessionId = group.events.find((event) => event.kind === 'file' && event.detail?.sessionId)?.detail.sessionId
          || null;
        const changedFiles = group.events.some((event) => event.kind === 'file');
        return (
          <li key={group.key} className={group.runId ? 'rounded-xl border border-line bg-surface px-3.5 py-2.5' : 'px-3.5'}>
            <ol className="space-y-1.5">
              {group.events.map((event) => {
                const meta = ICONS[event.kind] || ICONS.tool;
                const Icon = event.detail?.ok === false ? XCircle : meta.icon;
                return (
                  <li key={event.id} className="flex items-start gap-2.5 text-[12px] leading-5">
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${event.detail?.ok === false ? 'text-red-600 dark:text-red-400' : meta.className}`} />
                    <span className={`min-w-0 flex-1 ${event.kind === 'woke' || event.kind === 'finished' || event.kind === 'failed' ? 'font-medium text-fg' : 'text-fg-muted'}`}>
                      <span className="break-words">{event.title}</span>
                      {event.detail?.ok === false && event.detail?.error ? <span className="block text-red-600 dark:text-red-400">{event.detail.error}</span> : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-subtle" title={new Date(event.createdAt).toLocaleString()}>{ago(event.createdAt)}</span>
                  </li>
                );
              })}
            </ol>
            {changedFiles && sessionId ? (
              <div className="mt-1.5 flex justify-end border-t border-line pt-1.5"><UndoFiles sessionId={sessionId} /></div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

Timeline.propTypes = { events: PropTypes.array };
