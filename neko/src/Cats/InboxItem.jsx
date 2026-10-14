// One item in a Cat's inbox: a step waiting for your OK, a question, a
// result to look over (👍 / 👎 and "next time…"), or a notice.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
  Check, CheckCircle2, ChevronDown, HelpCircle, MessageSquare, ShieldAlert, ThumbsDown, ThumbsUp, TriangleAlert, X, XCircle,
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Field.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import { CatAvatar } from './CatParts.jsx';
import { ago } from './catFormat.js';

const KIND_ICON = {
  approval: { icon: ShieldAlert, className: 'text-amber-600 dark:text-amber-400' },
  question: { icon: HelpCircle, className: 'text-accent' },
  result: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400' },
  notice: { icon: TriangleAlert, className: 'text-fg-subtle' },
};

function ApprovalActions({ item, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');
  const [noting, setNoting] = useState(false);
  const answer = async (decision) => {
    setBusy(decision);
    try {
      await catsApi.answer(item.id, { decision, note: note.trim() || null });
      onDone?.();
    } catch (err) {
      toast.error("Couldn't send your answer", { detail: errorDetail(err) });
      setBusy(null);
    }
  };
  return (
    <div className="mt-2.5 space-y-2">
      {item.data?.args && item.data.args !== '{}' ? (
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-hover px-2.5 py-1.5 font-mono text-[11px] leading-4 text-fg-muted">{item.data.args}</pre>
      ) : null}
      {item.data?.diff ? (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] text-fg-muted">Show the change</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre px-2.5 pb-2 font-mono text-[11px] leading-4 text-fg-muted">{item.data.diff}</pre>
        </details>
      ) : null}
      {noting ? (
        <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why not, or what to do instead (optional)" className="h-8" autoFocus />
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="xs" variant="primary" icon={Check} loading={busy === 'allow_once'} disabled={Boolean(busy)} onClick={() => answer('allow_once')}>Allow once</Button>
        {!item.data?.sensitive && !item.data?.unsandboxed ? (
          <Button size="xs" icon={CheckCircle2} loading={busy === 'allow_always'} disabled={Boolean(busy)} onClick={() => answer('allow_always')}>Always allow</Button>
        ) : null}
        <Button
          size="xs"
          variant="danger"
          icon={X}
          loading={busy === 'deny'}
          disabled={Boolean(busy)}
          onClick={() => (noting ? answer('deny') : setNoting(true))}
        >
          {noting ? 'Send no' : "Don't allow"}
        </Button>
        {item.expiresAt ? <span className="text-[11px] text-fg-subtle">Waits until {new Date(item.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span> : null}
      </div>
    </div>
  );
}

ApprovalActions.propTypes = { item: PropTypes.object.isRequired, onDone: PropTypes.func };

function QuestionActions({ item, onDone }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (value) => {
    const answer = String(value ?? text).trim();
    if (!answer) return;
    setBusy(true);
    try {
      await catsApi.answer(item.id, { answer });
      onDone?.();
    } catch (err) {
      toast.error("Couldn't send your answer", { detail: errorDetail(err) });
      setBusy(false);
    }
  };
  const choices = Array.isArray(item.data?.choices) ? item.data.choices : [];
  return (
    <div className="mt-2.5 space-y-2">
      {choices.length ? (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((choice) => (
            <Button key={choice} size="xs" disabled={busy} onClick={() => send(choice)}>{choice}</Button>
          ))}
        </div>
      ) : null}
      <form className="flex gap-1.5" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Your answer" className="h-8" />
        <Button size="sm" variant="primary" type="submit" loading={busy} disabled={!text.trim()}>Send</Button>
      </form>
    </div>
  );
}

QuestionActions.propTypes = { item: PropTypes.object.isRequired, onDone: PropTypes.func };

function ResultActions({ item, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [rating, setRating] = useState(null);
  const [note, setNote] = useState('');
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const send = async (nextRating = rating) => {
    if (!item.runId) return;
    setBusy(true);
    try {
      await catsApi.feedback(item.runId, { rating: nextRating, note: note.trim() });
      onDone?.();
    } catch (err) {
      toast.error("Couldn't save your feedback", { detail: errorDetail(err) });
      setBusy(false);
    }
  };
  const markRead = async () => {
    try {
      await catsApi.dismiss(item.id);
      onDone?.();
    } catch (err) {
      toast.error("Couldn't mark it read", { detail: errorDetail(err) });
    }
  };
  return (
    <div className="mt-2 space-y-2">
      {item.body && item.body !== item.title ? (
        <div>
          <p className={`whitespace-pre-wrap text-[12px] leading-5 text-fg-muted ${open ? '' : 'line-clamp-3'}`}>{item.body}</p>
          {item.body.length > 220 ? (
            <button type="button" onClick={() => setOpen((value) => !value)} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle hover:text-fg">
              {open ? 'Less' : 'More'} <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {item.runId ? (
          <>
            <button
              type="button"
              aria-label="Good result"
              aria-pressed={rating === 'up'}
              onClick={() => setRating(rating === 'up' ? null : 'up')}
              className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${rating === 'up' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' : 'border-line text-fg-subtle hover:bg-hover hover:text-fg'}`}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Not what I wanted"
              aria-pressed={rating === 'down'}
              onClick={() => setRating(rating === 'down' ? null : 'down')}
              className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${rating === 'down' ? 'border-red-500/40 bg-red-500/10 text-red-600' : 'border-line text-fg-subtle hover:bg-hover hover:text-fg'}`}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
        {item.data?.conversationId ? (
          <Button size="xs" variant="ghost" icon={MessageSquare} onClick={() => navigate(`/conversations/${item.data.conversationId}`)}>Open chat</Button>
        ) : null}
        <Button size="xs" variant="ghost" onClick={markRead}>Mark read</Button>
      </div>
      {item.runId && (rating || writing) ? (
        <form className="flex gap-1.5" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Next time… (optional; it remembers)" className="h-8" autoFocus={writing} />
          <Button size="sm" variant="primary" type="submit" loading={busy} disabled={!rating && !note.trim()}>Save</Button>
        </form>
      ) : item.runId ? (
        <button type="button" onClick={() => setWriting(true)} className="text-[11px] text-fg-subtle hover:text-fg">Next time…</button>
      ) : null}
    </div>
  );
}

ResultActions.propTypes = { item: PropTypes.object.isRequired, onDone: PropTypes.func };

export default function InboxItem({ item, cat = null, showCat = false, onDone }) {
  const navigate = useNavigate();
  const meta = KIND_ICON[item.kind] || KIND_ICON.notice;
  const Icon = item.data?.status === 'failed' ? XCircle : meta.icon;
  const iconClass = item.data?.status === 'failed' ? 'text-red-600 dark:text-red-400' : meta.className;
  const open = item.status === 'open';
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${item.kind === 'approval' || item.kind === 'question' ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-line bg-surface'}`} data-inbox-item={item.kind}>
      <div className="flex items-start gap-2.5">
        {showCat ? (
          <button type="button" onClick={() => navigate(`/cats/${item.catId}`)} className="shrink-0" aria-label={`Open ${item.catName || 'the Cat'}`}>
            <CatAvatar cat={cat || { avatar: item.catAvatar }} size="sm" />
          </button>
        ) : (
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-fg-subtle">
            {showCat ? <span className="font-medium text-fg-muted">{item.catName || 'A Cat'}</span> : null}
            <span>{item.kind === 'approval' ? 'Wants your OK' : item.kind === 'question' ? 'Asks' : item.kind === 'result' ? (item.data?.reason || 'Result') : 'Notice'}</span>
            <span>· {ago(item.createdAt)}</span>
          </div>
          <p className="mt-0.5 text-[13px] font-medium leading-5 text-fg">{item.title}</p>
          {item.kind === 'notice' && item.body ? <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">{item.body}</p> : null}
          {item.kind === 'approval' && item.body ? <p className="mt-0.5 text-[12px] text-fg-muted">{item.body}</p> : null}
          {item.kind === 'question' && item.body ? <p className="mt-0.5 text-[12px] text-fg-muted">{item.body}</p> : null}
          {!open ? (
            <p className="mt-1 text-[11px] text-fg-subtle">
              {item.status === 'expired' ? 'Nobody answered in time.' : item.status === 'dismissed' ? 'Dismissed.' : item.answer?.decision ? `You answered: ${item.answer.decision.replace('_', ' ')}` : item.answer?.answer ? `You answered: ${item.answer.answer}` : 'Done.'}
            </p>
          ) : item.kind === 'approval' ? <ApprovalActions item={item} onDone={onDone} />
            : item.kind === 'question' ? <QuestionActions item={item} onDone={onDone} />
              : item.kind === 'result' ? <ResultActions item={item} onDone={onDone} />
                : (
                  <div className="mt-2">
                    <Button size="xs" variant="ghost" onClick={async () => { await catsApi.dismiss(item.id).catch(() => {}); onDone?.(); }}>Dismiss</Button>
                  </div>
                )}
        </div>
      </div>
    </div>
  );
}

InboxItem.propTypes = {
  item: PropTypes.object.isRequired,
  cat: PropTypes.object,
  showCat: PropTypes.bool,
  onDone: PropTypes.func,
};
