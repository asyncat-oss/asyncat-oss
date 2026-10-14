// quick/quickAsk.js — Rules behind the Quick ask popup (QuickAsk.jsx): keys,
// prompt history, notices, and the chat it saves. No React, so node:test can
// cover it.

import { modelBlockReason } from '../CommandCenter/utils/chatModel.js';

export const HISTORY_KEY = 'asyncat.quickAsk.history';
export const HISTORY_LIMIT = 50;
// Reopening after this long starts a new chat.
export const KEEP_CHAT_MS = 10 * 60 * 1000;

/** What a key press in the input does: 'send', 'open-in-app', 'newline' or null. */
export function keyAction({ key, shiftKey = false, ctrlKey = false, metaKey = false, isComposing = false, keyCode = 0 } = {}) {
  if (key !== 'Enter') return null;
  // Enter that picks an IME candidate isn't a send.
  if (isComposing || keyCode === 229) return null;
  if (ctrlKey || metaKey) return 'open-in-app';
  if (shiftKey) return 'newline';
  return 'send';
}

/** Prompt history, newest last, without repeats, capped at 50. */
export function pushHistory(history, text) {
  const entry = String(text || '').trim();
  const list = Array.isArray(history) ? history.filter((item) => typeof item === 'string' && item !== entry) : [];
  if (entry) list.push(entry);
  return list.slice(-HISTORY_LIMIT);
}

export function loadHistory(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string').slice(-HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveHistory(storage, history) {
  try { storage?.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT))); } catch { /* storage full or off */ }
}

/**
 * Step through earlier prompts with ↑ (dir -1) and ↓ (dir +1). `index` is the
 * entry on show, or null for the draft, which comes back after the newest.
 * Returns the next { index, text, draft }, or null when there is nowhere to go.
 */
export function stepHistory({ history = [], index = null, draft = '', text = '' }, dir) {
  if (!history.length) return null;
  if (dir < 0) {
    if (index === null) return { index: history.length - 1, text: history[history.length - 1], draft: text };
    if (index === 0) return null;
    return { index: index - 1, text: history[index - 1], draft };
  }
  if (index === null) return null;
  if (index >= history.length - 1) return { index: null, text: draft, draft: '' };
  return { index: index + 1, text: history[index + 1], draft };
}

/** ↑/↓ browse history only from an empty input, the very start, or a recalled prompt. */
export function canBrowseHistory({ text = '', selectionStart = 0, selectionEnd = 0, recalled = null } = {}) {
  if (!text) return true;
  if (recalled !== null && text === recalled) return true;
  return selectionStart === 0 && selectionEnd === 0;
}

/**
 * Why sending is blocked by the model, with the composer's wording, or null.
 * `actions` are the buttons the notice offers ('models'). Quick ask uses the
 * default model, and a model file loads when you ask, so only a default
 * without one (MLX, nothing set up) can block.
 */
export function modelNotice(brain) {
  if (!brain || !brain.isBuiltin || brain.loading) return null;
  if (brain.defaultRef || (brain.providerId === 'llamacpp-builtin' && brain.rawModel)) return null;
  const text = modelBlockReason({ model: { ref: null }, brain });
  if (!text) return null;
  if (brain.isLoadingModel) return { text, busy: true, actions: [] };
  return { text, actions: ['models'], modelsLabel: brain.rawModel && brain.status !== 'error' ? 'Change model' : 'Choose a model' };
}

/** The tooltip on a disabled Send button, or '' when sending is possible. */
export function sendBlockReason({ server, brain, notice }) {
  if (server === 'down' || server === 'start-failed') return "Asyncat's local server isn't running.";
  if (server === 'starting') return 'Starting…';
  if (brain?.loading && brain?.isBuiltin) return 'Checking which model is ready…';
  return notice?.text || '';
}

/** What the window manager needs to know: 'busy', 'thread' or 'empty'. */
export function windowState({ busy = false, thread = [], text = '' }) {
  if (busy) return 'busy';
  return thread.length || String(text).trim() ? 'thread' : 'empty';
}

/** Turns that count as part of the chat: those with an answer. */
const answered = (turn) => Boolean(turn?.answer?.trim()) && turn.status !== 'error';

/** The chat so far, as the model sees it. */
export function conversationHistory(thread = []) {
  return thread.filter(answered).flatMap((turn) => [
    { role: 'user', content: turn.question },
    { role: 'assistant', content: turn.answer },
  ]);
}

/** The chat as saved: a question and its answer per turn, in the app's message shape. */
export function chatMessages(thread = []) {
  return thread.filter(answered).flatMap((turn) => [
    { id: `${turn.id}_user`, type: 'user', content: turn.question, timestamp: turn.askedAt, branchId: 'main' },
    { id: `${turn.id}_assistant`, type: 'assistant', content: turn.answer, timestamp: turn.answeredAt || turn.askedAt, branchId: 'main' },
  ]);
}

/**
 * What Ctrl/Cmd+Enter hands to a new chat in the app when there is no saved
 * chat to open: the typed text, or else a question that failed here, so it
 * can be tried there. '' when there is nothing to hand over.
 */
export function handOffText({ text = '', thread = [] } = {}) {
  const typed = String(text).trim();
  if (typed) return typed;
  const last = thread[thread.length - 1];
  return last?.status === 'error' ? String(last.question || '').trim() : '';
}

/** A new turn's id; its messages are `<id>_user` and `<id>_assistant`. */
export function newTurnId(now = Date.now(), random = Math.random) {
  return `msg_${now}_${random().toString(36).slice(2, 8)}`;
}

/** Start a new chat when the popup comes back after a long time away. */
export function shouldStartFresh({ hiddenAt, now = Date.now(), busy = false }) {
  return !busy && Number.isFinite(hiddenAt) && hiddenAt > 0 && now - hiddenAt > KEEP_CHAT_MS;
}

/** "Cmd" on macOS, "Ctrl" elsewhere, for the hints. */
export function modLabel(isMac) {
  return isMac ? 'Cmd' : 'Ctrl';
}
