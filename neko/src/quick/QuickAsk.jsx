// quick/QuickAsk.jsx — The Quick ask popup (/quick). The desktop app shows it
// in its own small window (electron/quick.js): ask, and the answer streams in
// here with the chat's own renderer. Each answer is saved as a normal chat,
// which Ctrl/Cmd+Enter opens in the main window. The rules live in quickAsk.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowUp, ArrowUpRight, Check, Copy, Loader2, Square } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { chatApi } from '../CommandCenter/api/chatApi.js';
import { useActiveBrainStatus } from '../CommandCenter/hooks/useActiveBrainStatus.js';
import { BlockRenderer, parseAIResponseToBlocks } from '../CommandCenter/components/renderers/BlockBasedMessageRenderer.jsx';
import { FOLLOW_UP_EVENT } from '../CommandCenter/components/renderers/interactiveEvents.js';
import { extractReasoningFromText } from '../CommandCenter/utils/reasoningParser.js';
import { metadataWithRunModel } from '../CommandCenter/utils/chatModel.js';
import { isMacPlatform } from '../components/ui/shortcuts.js';
import { normalizeWebLink } from '../utils/openWebLink.js';
import {
  keyAction, pushHistory, loadHistory, saveHistory, stepHistory, canBrowseHistory, modelNotice,
  sendBlockReason, windowState, conversationHistory, chatMessages, handOffText, newTurnId, shouldStartFresh,
  modLabel,
} from './quickAsk.js';

const MAIN_URL = import.meta.env.VITE_MAIN_URL || 'http://127.0.0.1:8716';
const desktop = typeof window !== 'undefined' ? window.electronAPI || null : null;
const bridge = desktop?.quick || null;
const MOD = modLabel(isMacPlatform());

const refreshModelStatus = () => window.dispatchEvent(new CustomEvent('asyncat-model-runtime-updated'));

async function serverIsUp() {
  try {
    const res = await fetch(`${MAIN_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// The chat being built here: its saved id, the messages already saved, the
// save in flight (saves run one after another), and the model it first ran
// on, which it keeps when opened in the app (as chats there do).
const newSession = () => ({ conversationId: null, savedIds: new Set(), saving: Promise.resolve(), unsaved: false, model: null });

// Outside the desktop app (a browser tab), "open in the app" is this tab.
function openRoute(route) {
  if (bridge) bridge.openInApp(route);
  else window.location.assign(route || '/home');
}

function cleanAnswer(text) {
  return extractReasoningFromText(text).answer;
}

function Answer({ text, streaming }) {
  const answer = useMemo(() => cleanAnswer(text), [text]);
  const blocks = useMemo(() => {
    if (!answer) return [];
    try {
      return parseAIResponseToBlocks(answer, { streaming });
    } catch {
      return [{ type: 'text', content: answer, properties: {} }];
    }
  }, [answer, streaming]);
  // A model that thinks out loud first shows "Thinking" until it answers.
  if (!answer) return streaming ? <p className="shimmer-text text-[13px]">Thinking</p> : null;
  return (
    <div className="text-[14px]">
      {blocks.map((block, i) => <BlockRenderer key={`${block.type}-${i}`} block={block} />)}
    </div>
  );
}

Answer.propTypes = { text: PropTypes.string, streaming: PropTypes.bool };

const noticeButton = (primary) => (primary
  ? 'rounded-lg bg-fg px-2.5 py-1 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-45'
  : 'rounded-lg px-2.5 py-1 text-[12px] font-medium text-fg-muted transition-colors hover:bg-selected hover:text-fg');

export default function QuickAsk() {
  const brain = useActiveBrainStatus();
  const [text, setText] = useState('');
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState('checking'); // checking | ok | down | starting | start-failed
  const [history, setHistory] = useState(() => loadHistory(globalThis.localStorage));
  const [nav, setNav] = useState({ index: null, draft: '' });
  const [copied, setCopied] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [maxHeight, setMaxHeight] = useState(560);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const abortRef = useRef(null);
  const sessionRef = useRef(newSession());
  const threadRef = useRef(thread);
  const busyRef = useRef(busy);
  const hiddenAtRef = useRef(0);
  threadRef.current = thread;
  busyRef.current = busy;

  const notice = useMemo(() => {
    if (server === 'down') return { text: "Asyncat's local server isn't running.", actions: ['start', 'open'] };
    if (server === 'starting') return { text: 'Starting…', busy: true, actions: [] };
    if (server === 'start-failed') return { text: "Couldn't start it. Open Asyncat to see what went wrong.", actions: ['open'] };
    if (server === 'checking') return null;
    return modelNotice(brain);
  }, [server, brain]);

  const blockReason = sendBlockReason({ server, brain, notice });
  const canSend = Boolean(text.trim()) && !busy && !blockReason;
  const hasThread = thread.length > 0;
  const hasBody = Boolean(notice) || hasThread;

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const checkServer = useCallback(async () => {
    const up = await serverIsUp();
    setServer((current) => (current === 'starting' ? current : up ? 'ok' : 'down'));
  }, []);

  // ── Saving ──────────────────────────────────────────────────────────────
  const saveChat = useCallback((session, turns) => {
    const messages = chatMessages(turns);
    if (!messages.length) return session.saving;
    const run = async () => {
      try {
        const result = await chatApi.saveConversation({
          messages,
          mode: 'chat',
          clientId: 'quick',
          metadata: { source: 'quick-ask', experienceMode: 'chat', engine: 'asyncat', ...(session.model ? { model: session.model } : {}) },
          ...(session.conversationId
            ? { conversationId: session.conversationId, knownMessageIds: [...session.savedIds] }
            : {}),
        });
        if (result?.conversationId) session.conversationId = result.conversationId;
        messages.forEach((message) => session.savedIds.add(message.id));
        session.unsaved = false;
      } catch (error) {
        console.warn('Quick ask could not save the chat:', error);
        session.unsaved = true;
      }
      if (sessionRef.current === session) setSaveFailed(session.unsaved);
    };
    session.saving = session.saving.then(run);
    return session.saving;
  }, []);

  // ── Asking ──────────────────────────────────────────────────────────────
  const runTurn = useCallback(async (question, { replaceId = null } = {}) => {
    const session = sessionRef.current;
    const id = newTurnId();
    const before = threadRef.current.filter((turn) => turn.id !== replaceId);
    const turn = { id, question, answer: '', status: 'sending', askedAt: new Date().toISOString() };
    const withTurn = (list) => (replaceId ? list.map((item) => (item.id === replaceId ? turn : item)) : [...list, turn]);
    // Nothing else can be asked until this turn ends, so this is the chat then.
    const turns = withTurn(threadRef.current);
    setThread(withTurn);
    stickRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);

    const patch = (changes) => setThread((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    let answer = '';
    let error = null;
    try {
      const stream = chatApi.runStream(question, conversationHistory(before), controller.signal, { reasoningEffort: 'auto' });
      for await (const event of stream) {
        if (event.type === 'delta') {
          answer += event.data?.content || '';
          patch({ answer, status: 'streaming' });
        } else if (event.type === 'model_loading') {
          // The default is a model file that isn't loaded: it loads first.
          patch({ loadingModel: event.data?.name || brain.defaultName || 'the model' });
        } else if (event.type === 'model_ready') {
          patch({ loadingModel: null });
        } else if (event.type === 'chat_model') {
          patch({ loadingModel: null });
          if (!session.model) session.model = metadataWithRunModel({}, event.data).model || null;
        } else if (event.type === 'error') {
          error = event.data?.message || 'Something went wrong.';
        } else if (event.type === 'done') {
          break;
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) error = err?.message || 'Something went wrong.';
    }
    const stopped = controller.signal.aborted;
    if (!error && !stopped && !answer.trim()) error = 'The model sent back an empty answer.';
    if (abortRef.current === controller) abortRef.current = null;
    const final = {
      answer,
      answeredAt: new Date().toISOString(),
      status: error ? 'error' : stopped ? 'stopped' : 'done',
      error,
    };
    patch(final);
    if (sessionRef.current !== session) return; // a new chat started meanwhile
    setBusy(false);
    saveChat(session, turns.map((item) => (item.id === id ? { ...item, ...final } : item)));
  }, [brain.defaultName, saveChat]);

  const send = useCallback((value) => {
    const question = String(value ?? text).trim();
    if (!question || busyRef.current || blockReason) return;
    setHistory((current) => {
      const next = pushHistory(current, question);
      saveHistory(globalThis.localStorage, next);
      return next;
    });
    setNav({ index: null, draft: '' });
    if (value === undefined) setText('');
    runTurn(question);
  }, [blockReason, runTurn, text]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current = newSession();
    setThread([]);
    setBusy(false);
    setText('');
    setNav({ index: null, draft: '' });
    setCopied(false);
    setSaveFailed(false);
    focusInput();
  }, [focusInput]);

  const retry = useCallback((turn) => {
    if (busyRef.current || blockReason) return;
    runTurn(turn.question, { replaceId: turn.id });
  }, [blockReason, runTurn]);

  // Ctrl/Cmd+Enter: the chat, or the typed text (or a question that failed
  // here) in a new chat, or just the app.
  const openInApp = useCallback(async () => {
    if (busyRef.current) return;
    const session = sessionRef.current;
    if (threadRef.current.length) {
      await session.saving;
      if (session.unsaved || !session.conversationId) await saveChat(session, threadRef.current);
      if (session.conversationId) {
        openRoute(`/conversations/${session.conversationId}`);
        return;
      }
    }
    const value = handOffText({ text, thread: threadRef.current });
    if (value) {
      setHistory((current) => {
        const next = pushHistory(current, value);
        saveHistory(globalThis.localStorage, next);
        return next;
      });
      setText('');
      if (bridge) bridge.sendToApp(value);
      else openRoute('/home');
      return;
    }
    openRoute('');
  }, [saveChat, text]);

  const copyLast = useCallback(async () => {
    const last = [...threadRef.current].reverse().find((turn) => turn.answer?.trim());
    if (!last) return;
    try {
      await navigator.clipboard.writeText(cleanAnswer(last.answer));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, []);

  const startServer = useCallback(async () => {
    setServer('starting');
    try { await desktop?.restartBackend?.(); } catch { /* checked below */ }
    setServer((await serverIsUp()) ? 'ok' : 'start-failed');
    refreshModelStatus();
  }, []);


  // ── Keys ────────────────────────────────────────────────────────────────
  const onInputKeyDown = (event) => {
    const action = keyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.keyCode,
    });
    if (action === 'send') {
      // While an answer streams, Enter waits (as in the main composer).
      event.preventDefault();
      send();
      return;
    }
    if (action) return; // Shift+Enter types a line; Ctrl+Enter is handled on the window
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const field = event.currentTarget;
      const recalled = nav.index === null ? null : history[nav.index];
      if (!canBrowseHistory({ text, selectionStart: field.selectionStart, selectionEnd: field.selectionEnd, recalled })) return;
      const next = stepHistory({ history, index: nav.index, draft: nav.draft, text }, event.key === 'ArrowUp' ? -1 : 1);
      if (!next) return;
      event.preventDefault();
      setNav({ index: next.index, draft: next.draft });
      setText(next.text);
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.text.length, next.text.length));
    }
  };

  const keysRef = useRef({});
  keysRef.current = { busy, stop, newChat, openInApp };
  useEffect(() => {
    const onKey = (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      const keys = keysRef.current;
      const mod = event.ctrlKey || event.metaKey;
      const key = String(event.key || '').toLowerCase();
      if (event.key === 'Escape') {
        event.preventDefault();
        if (keys.busy) keys.stop();
        else bridge?.hide();
      } else if (mod && event.key === 'Enter') {
        event.preventDefault();
        keys.openInApp();
      } else if (mod && !event.shiftKey && key === 'n') {
        event.preventDefault();
        keys.newChat();
      } else if (mod && !event.shiftKey && key === 'w') {
        event.preventDefault();
        bridge?.hide();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Window ──────────────────────────────────────────────────────────────
  // Ready after the first paint, so the window never shows an empty frame.
  useEffect(() => {
    document.documentElement.dataset.platform = desktop?.platform || '';
    document.body.style.overflow = 'hidden';
    checkServer();
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => bridge?.ready()); });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [checkServer]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !bridge || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => bridge.resize(Math.ceil(root.getBoundingClientRect().height)));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!bridge) return undefined;
    const offShown = bridge.onShown((payload) => {
      if (Number(payload?.maxHeight) > 0) setMaxHeight(Number(payload.maxHeight));
      if (shouldStartFresh({ hiddenAt: hiddenAtRef.current, busy: busyRef.current })) keysRef.current.newChat();
      hiddenAtRef.current = 0;
      checkServer();
      refreshModelStatus();
      focusInput();
    });
    const offHidden = bridge.onHidden(() => { hiddenAtRef.current = Date.now(); });
    return () => {
      offShown?.();
      offHidden?.();
    };
  }, [checkServer, focusInput]);

  useEffect(() => {
    bridge?.setState(windowState({ busy, thread, text }));
  }, [busy, thread, text]);

  // Windows draws the window opaque, so it takes the card's colour.
  useEffect(() => {
    if (desktop?.platform !== 'win32' || !bridge) return undefined;
    const sync = () => bridge.setBackground(getComputedStyle(document.documentElement).getPropertyValue('--as-elevated').trim());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Links in answers open in the browser; follow-up buttons ask again.
  useEffect(() => {
    const onPreview = (event) => {
      const url = normalizeWebLink(event.detail?.url);
      if (!url) return;
      if (desktop?.openExternalUrl) desktop.openExternalUrl(url).catch(() => {});
      else window.open(url, '_blank', 'noopener,noreferrer');
    };
    const onFollowUp = (event) => {
      if (!rootRef.current?.contains(event.target)) return;
      const value = String(event.detail?.text || '').trim();
      if (value) send(value);
    };
    window.addEventListener('asyncat-open-preview', onPreview);
    document.addEventListener(FOLLOW_UP_EVENT, onFollowUp);
    return () => {
      window.removeEventListener('asyncat-open-preview', onPreview);
      document.removeEventListener(FOLLOW_UP_EVENT, onFollowUp);
    };
  }, [send]);

  // The input grows to six lines, then scrolls.
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 144)}px`;
  }, [text]);

  // Follow the answer as it streams, unless the reader scrolled up.
  useEffect(() => {
    const body = scrollRef.current;
    if (body && stickRef.current) body.scrollTop = body.scrollHeight;
  }, [thread, notice]);

  const onBodyScroll = (event) => {
    const body = event.currentTarget;
    stickRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
  };
  // Scrolling up stops following at once, before the next piece of the
  // answer can pull the view back down.
  const onBodyWheel = (event) => {
    if (event.deltaY < 0) stickRef.current = false;
  };

  const isWindows = desktop?.platform === 'win32';
  const lastTurn = thread[thread.length - 1];
  const hasAnswer = thread.some((turn) => turn.answer?.trim());

  return (
    <div
      id="quick"
      ref={rootRef}
      role="dialog"
      aria-label="Quick ask"
      data-state={windowState({ busy, thread, text })}
      style={{ maxHeight }}
      className={`flex w-full flex-col overflow-hidden bg-elevated text-fg ${isWindows ? '' : 'rounded-2xl border border-line-strong'}`}
    >
      <form
        onSubmit={(event) => { event.preventDefault(); send(); }}
        className="flex shrink-0 items-end gap-2 py-[11px] pl-[18px] pr-3"
      >
        <textarea
          ref={inputRef}
          rows={1}
          autoFocus
          aria-label="Message"
          value={text}
          placeholder={hasThread ? 'Ask a follow-up…' : 'Ask anything…'}
          onKeyDown={onInputKeyDown}
          onChange={(event) => {
            setText(event.target.value);
            if (nav.index !== null) setNav((current) => ({ ...current, index: null }));
          }}
          spellCheck
          className="max-h-36 min-h-8 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-fg caret-fg placeholder:text-fg-subtle focus:outline-none"
        />
        <span title={brain.loading ? '' : `Default model: ${brain.defaultName || brain.providerName}`} className="mb-1.5 max-w-40 truncate text-[12px] text-fg-muted">
          {brain.loading ? '' : brain.defaultName || brain.providerName}
        </span>
        {busy ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop"
            title="Stop"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-canvas hover:opacity-90"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            title={blockReason || 'Send'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${canSend ? 'bg-fg text-canvas hover:opacity-90' : 'cursor-not-allowed bg-hover text-fg-subtle'}`}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
          </button>
        )}
      </form>

      {hasBody && (
        <div ref={scrollRef} onScroll={onBodyScroll} onWheel={onBodyWheel} className="min-h-0 flex-1 overflow-y-auto border-t border-line px-[18px] pb-4 pt-3 [scrollbar-color:var(--as-line-strong)_transparent] [scrollbar-width:thin]">
          {notice && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-hover py-1.5 pl-3 pr-1.5 text-[13px] text-fg-muted last:mb-0">
              <span className="flex min-w-0 items-center gap-2">
                {notice.busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                <span className="min-w-0 truncate" title={notice.text}>{notice.text}</span>
              </span>
              {notice.actions.length > 0 && (
                <div className="flex shrink-0 gap-1">
                  {notice.actions.includes('start') && (
                    <button type="button" onClick={startServer} className={noticeButton(true)}>Start it</button>
                  )}
                  {notice.actions.includes('models') && (
                    <button type="button" onClick={() => openRoute('/models')} className={noticeButton(notice.actions.length === 1)}>
                      {notice.modelsLabel}
                    </button>
                  )}
                  {notice.actions.includes('open') && (
                    <button type="button" onClick={() => openRoute('')} className={noticeButton(notice.actions.length === 1)}>
                      Open Asyncat
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {thread.map((turn) => (
            <section key={turn.id} className="mb-5 last:mb-0">
              <p className="mb-2 whitespace-pre-wrap text-[13px] leading-5 text-fg-muted">{turn.question}</p>
              {turn.answer
                ? <Answer text={turn.answer} streaming={turn.status === 'streaming'} />
                : turn.status === 'sending' && <p className="shimmer-text text-[13px]">{turn.loadingModel ? `Loading ${turn.loadingModel}…` : 'Thinking'}</p>}
              {turn.status === 'stopped' && <p className="mt-2 text-[12px] text-fg-muted">Stopped</p>}
              {turn.status === 'error' && (
                <div role="alert" className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">
                  Couldn&apos;t get an answer. {turn.error}
                  {turn === lastTurn && !busy && !blockReason && (
                    <button type="button" onClick={() => retry(turn)} className="ml-1 font-medium underline underline-offset-2">
                      Try again
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {hasThread && !busy && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-t border-line px-2">
          {hasAnswer && (
            <Button variant="ghost" size="xs" icon={copied ? Check : Copy} onClick={copyLast}>{copied ? 'Copied' : 'Copy'}</Button>
          )}
          <Button variant="ghost" size="xs" icon={ArrowUpRight} onClick={openInApp}>Open in Asyncat</Button>
          {saveFailed && <span className="pl-1 text-[12px] text-red-700 dark:text-red-400">Not saved yet</span>}
          <span className="ml-auto pr-2 text-[12px] text-fg-muted">{MOD}+N new chat</span>
        </div>
      )}
    </div>
  );
}
