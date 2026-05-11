/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, GitBranch,
  GitCommitHorizontal, GitPullRequestArrow, GitPullRequestDraft, Loader2,
  Paperclip, Plus, RefreshCw, Save, Upload, X,
} from 'lucide-react';
import { gitApi } from '../api';
import Portal from '../../components/Portal';
import { basename, fileIconMeta } from '../../files/fileUtils.js';
import GitGraph from './GitGraph';
import StashManager from './StashManager';

const COMMIT_ACTIONS = new Set([
  'commit',
  'commit-push',
  'commit-sync',
  'amend',
  'amend-push',
  'stage-commit',
  'stage-commit-push',
]);

const REQUIRED_MESSAGE_ACTIONS = new Set([
  'commit',
  'commit-push',
  'commit-sync',
  'stage-commit',
  'stage-commit-push',
  'stash-save',
]);

function compactPath(path = '') {
  const parts = String(path).split('/').filter(Boolean);
  if (parts.length <= 3) return path;
  return `${parts[0]}/.../${parts.slice(-2).join('/')}`;
}

function splitPath(filePath = '') {
  const parts = String(filePath || '').split('/');
  const name = parts.pop() || filePath;
  const dir = parts.join('/');
  return { name, dir };
}

function statusMeta(file = {}) {
  if (file.untracked) return { label: 'U', text: 'text-sky-500 dark:text-sky-300', title: 'Untracked' };
  if (file.renamed) return { label: 'R', text: 'text-violet-500 dark:text-violet-300', title: 'Renamed' };
  if (file.deleted) return { label: 'D', text: 'text-red-500 dark:text-red-300', title: 'Deleted' };
  if (file.staged && !file.unstaged) return { label: 'S', text: 'text-emerald-600 dark:text-emerald-300', title: 'Staged' };
  return { label: 'M', text: 'text-amber-600 dark:text-amber-300', title: 'Modified' };
}

function IconButton({ title, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {children}
    </button>
  );
}

function commandForAction(action, payload = {}) {
  switch (action) {
    case 'stage': return payload.files?.length ? `git add -- ${payload.files.join(' ')}` : 'git add -A';
    case 'unstage': return payload.files?.length ? `git restore --staged -- ${payload.files.join(' ')}` : 'git restore --staged .';
    case 'commit': return 'git commit -m <message>';
    case 'commit-push': return 'git commit -m <message> && git push origin';
    case 'commit-sync': return 'git commit -m <message> && git pull && git push origin';
    case 'amend': return payload.message?.trim() ? 'git commit --amend -m <message>' : 'git commit --amend --no-edit';
    case 'amend-push': return `${payload.message?.trim() ? 'git commit --amend -m <message>' : 'git commit --amend --no-edit'} && git push origin`;
    case 'stage-commit': return 'git add -A && git commit -m <message>';
    case 'stage-commit-push': return 'git add -A && git commit -m <message> && git push origin';
    case 'pull': return 'git pull';
    case 'push': return 'git push origin';
    case 'stash-save': return 'git stash push -u -m <message>';
    case 'stash-pop': return 'git stash pop';
    case 'branch-create': return `git branch ${payload.name || '<branch>'}`;
    case 'branch-switch': return `git switch ${payload.name || '<branch>'}`;
    default: return 'git';
  }
}

function actionCopy(action) {
  if (action === 'pull') return 'Pull can merge remote changes into your working tree.';
  if (action === 'push') return 'Push publishes local commits to the configured remote.';
  if (action === 'commit-push') return 'This records staged changes, then publishes the new commit.';
  if (action === 'commit-sync') return 'This commits, pulls remote changes, then pushes. Pull may merge or conflict.';
  if (action === 'amend') return 'Amend rewrites the latest local commit. Leave the message empty to keep it.';
  if (action === 'amend-push') return 'This amends the latest local commit, then pushes. It does not force push.';
  if (action === 'stage-commit') return 'This stages every current change, then creates a local commit.';
  if (action === 'stage-commit-push') return 'This stages every change, commits, then pushes the new commit.';
  if (action === 'stash-pop') return 'Stash pop reapplies saved changes and may create conflicts.';
  if (action?.startsWith('branch')) return 'Branch operations change the active repository context.';
  if (action === 'commit') return 'Commit records staged changes in local history.';
  return 'This changes Git state in your workspace.';
}

function ConfirmModal({ action, payload, busy, error, onClose, onConfirm, onPayloadChange }) {
  if (!action) return null;
  const needsMessage = REQUIRED_MESSAGE_ACTIONS.has(action);
  const optionalMessage = action === 'amend' || action === 'amend-push';
  const needsBranch = action === 'branch-create' || action === 'branch-switch';
  const title = {
    stage: 'Stage changes?',
    unstage: 'Unstage changes?',
    commit: 'Create commit?',
    'commit-push': 'Commit and push?',
    'commit-sync': 'Commit and sync?',
    amend: 'Amend latest commit?',
    'amend-push': 'Amend and push?',
    'stage-commit': 'Stage all and commit?',
    'stage-commit-push': 'Stage all, commit, and push?',
    pull: 'Pull from remote?',
    push: 'Push to remote?',
    'stash-save': 'Stash changes?',
    'stash-pop': 'Pop stash?',
    'branch-create': 'Create branch?',
    'branch-switch': 'Switch branch?',
  }[action] || 'Run Git action?';
  const disabled = busy
    || (needsMessage && !payload.message?.trim())
    || (needsBranch && !payload.name?.trim());

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800 midnight:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{actionCopy(action)}</p>
            </div>
            {!busy && (
              <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="space-y-3 px-4 py-3">
            <div className="rounded-lg bg-gray-950 px-3 py-2">
              <code className="break-all text-[11px] text-gray-100">{commandForAction(action, payload)}</code>
            </div>
            {(needsMessage || optionalMessage) && (
              <textarea
                value={payload.message || ''}
                onChange={event => onPayloadChange({ ...payload, message: event.target.value })}
                rows={3}
                placeholder={action === 'stash-save' ? 'Stash message' : optionalMessage ? 'New commit message, or leave empty to keep current' : 'Commit message'}
                className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            )}
            {needsBranch && (
              <input
                value={payload.name || ''}
                onChange={event => onPayloadChange({ ...payload, name: event.target.value })}
                placeholder="branch-name"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/60 midnight:border-slate-800">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirm
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function DiffViewer({ file, staged }) {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    gitApi.getDiff({ file: file.path, staged })
      .then(res => {
        if (!cancelled) setDiff(res);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Could not load diff');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [file, staged]);

  if (!file) return null;
  return (
    <div className="border-t border-gray-100 bg-gray-950 dark:border-gray-800">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-gray-300">{file.path}</span>
        {diff && (
          <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
            +{diff.additions || 0} -{diff.deletions || 0}
          </span>
        )}
      </div>
      {loading && (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading diff
        </div>
      )}
      {error && <div className="px-3 py-3 text-xs text-red-300">{error}</div>}
      {!loading && !error && (
        <pre className="max-h-72 overflow-auto px-3 pb-3 text-[10px] leading-relaxed text-gray-300">
          {(diff?.diff || 'No diff for this file.').split('\n').map((line, index) => (
            <div
              key={`${index}-${line.slice(0, 12)}`}
              className={
                line.startsWith('+') && !line.startsWith('+++') ? 'text-emerald-300'
                  : line.startsWith('-') && !line.startsWith('---') ? 'text-red-300'
                    : line.startsWith('@@') ? 'text-sky-300'
                      : ''
              }
            >
              {line || ' '}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

function ChangeRow({ file, onAction, onAttach }) {
  const [open, setOpen] = useState(false);
  const { name, dir } = splitPath(file.path || '');
  const ext = name.split('.').pop();
  const { Icon, color } = fileIconMeta(ext, 'file');
  const meta = statusMeta(file);
  return (
    <div className="group overflow-hidden">
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-100/80 dark:hover:bg-slate-800/70">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />}
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-slate-200" title={file.path}>
            <span className="font-medium">{name}</span>
            {dir && <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{compactPath(dir)}</span>}
          </span>
          <span className={`w-4 shrink-0 text-right text-xs font-semibold ${meta.text}`} title={meta.title}>
            {meta.label}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => onAttach(file)} className="rounded p-1 text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-slate-100" title="Attach to composer">
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onAction(file)} className="rounded p-1 text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-slate-100" title={file.staged && !file.unstaged ? 'Unstage' : 'Stage'}>
            {file.staged && !file.unstaged ? <Upload className="h-3.5 w-3.5 rotate-180" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mx-2 mb-2 overflow-hidden rounded-md border border-gray-200 dark:border-slate-800">
          <DiffViewer file={file} staged={file.staged && !file.unstaged} />
        </div>
      )}
    </div>
  );
}

export default function GitPanel({ state, loading, error, onRefresh, onChanged, onAttachFile }) {
  const [action, setAction] = useState(null);
  const [payload, setPayload] = useState({});
  const [commitMessage, setCommitMessage] = useState('');
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('working'); // 'working', 'history', 'stashes'
  const files = useMemo(() => state?.changes?.all || [], [state?.changes?.all]);
  const stagedFiles = useMemo(() => state?.changes?.staged || [], [state?.changes?.staged]);
  const workingFiles = useMemo(() => files.filter(file => !file.staged || file.unstaged), [files]);
  const hasCommitMessage = commitMessage.trim().length > 0;
  const commitMenuItems = useMemo(() => {
    const canCommit = stagedFiles.length > 0 && hasCommitMessage;
    const canAmend = stagedFiles.length > 0 || hasCommitMessage;
    const canStageCommit = files.length > 0 && hasCommitMessage;
    return [
      { action: 'commit', label: 'Commit', disabled: !canCommit },
      { action: 'commit-push', label: 'Commit and push', disabled: !canCommit },
      { action: 'commit-sync', label: 'Commit and sync', disabled: !canCommit },
      { action: 'amend', label: 'Commit (amend)', disabled: !canAmend },
      { action: 'amend-push', label: 'Amend and push', disabled: !canAmend },
      { action: 'stage-commit', label: 'Stage all and commit', disabled: !canStageCommit },
      { action: 'stage-commit-push', label: 'Stage all, commit, and push', disabled: !canStageCommit },
    ];
  }, [files.length, hasCommitMessage, stagedFiles.length]);

  const executeAction = useCallback(async (targetAction, targetPayload) => {
    setBusy(true);
    setActionError(null);
    try {
      let res;
      const assertSuccess = (result, label = 'Git action') => {
        if (!result?.success) {
          throw new Error(result?.error || result?.stderr || result?.stdout || `${label} failed`);
        }
        return result;
      };
      if (targetAction === 'stage') res = await gitApi.stage(targetPayload.files || []);
      if (targetAction === 'unstage') res = await gitApi.unstage(targetPayload.files || []);
      if (targetAction === 'commit') res = await gitApi.commit({ message: targetPayload.message, files: targetPayload.files || [] });
      if (targetAction === 'commit-push') {
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message, files: targetPayload.files || [] }), 'Commit');
        res = await gitApi.push();
      }
      if (targetAction === 'commit-sync') {
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message, files: targetPayload.files || [] }), 'Commit');
        res = assertSuccess(await gitApi.pull(), 'Pull');
        res = await gitApi.push();
      }
      if (targetAction === 'amend') {
        res = await gitApi.commit({ message: targetPayload.message || '', files: targetPayload.files || [], amend: true });
      }
      if (targetAction === 'amend-push') {
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message || '', files: targetPayload.files || [], amend: true }), 'Amend');
        res = await gitApi.push();
      }
      if (targetAction === 'stage-commit') {
        res = assertSuccess(await gitApi.stage([]), 'Stage all');
        res = await gitApi.commit({ message: targetPayload.message, files: [] });
      }
      if (targetAction === 'stage-commit-push') {
        res = assertSuccess(await gitApi.stage([]), 'Stage all');
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message, files: [] }), 'Commit');
        res = await gitApi.push();
      }
      if (targetAction === 'pull') res = await gitApi.pull();
      if (targetAction === 'push') res = await gitApi.push();
      if (targetAction === 'stash-save') res = await gitApi.stash({ action: 'save', message: targetPayload.message || 'Asyncat visual stash' });
      if (targetAction === 'stash-pop') res = await gitApi.stash({ action: 'pop' });
      if (targetAction === 'branch-create') res = await gitApi.branch({ action: 'create', name: targetPayload.name });
      if (targetAction === 'branch-switch') res = await gitApi.branch({ action: 'switch', name: targetPayload.name });
      if (!res?.success) throw new Error(res?.error || res?.stderr || 'Git action failed');
      
      setAction(null);
      setPayload({});
      if (COMMIT_ACTIONS.has(targetAction)) setCommitMessage('');
      onChanged?.(res);
    } catch (err) {
      setActionError(err.message || 'Git action failed');
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const openAction = useCallback((nextAction, nextPayload = {}) => {
    setCommitMenuOpen(false);
    if (nextAction === 'stage' || nextAction === 'unstage') {
      executeAction(nextAction, nextPayload);
      return;
    }
    setAction(nextAction);
    setPayload(nextPayload);
    setActionError(null);
  }, [executeAction]);

  const closeAction = useCallback(() => {
    if (busy) return;
    setAction(null);
    setPayload({});
    setActionError(null);
  }, [busy]);

  const runConfirmedAction = useCallback(() => {
    executeAction(action, payload);
  }, [action, payload, executeAction]);

  const attachFile = useCallback((file) => {
    const name = basename(file.path || '');
    const ext = name.includes('.') ? name.split('.').pop() : '';
    onAttachFile?.({ path: file.path, name, ext });
  }, [onAttachFile]);

  if (loading && !state) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Git state
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        <AlertCircle className="mb-2 h-5 w-5" />
        {error}
      </div>
    );
  }

  if (!state?.detected) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        No Git repository detected in this workspace.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-gray-800 dark:text-slate-200">
      <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-slate-800 midnight:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-orange-500" />
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{state.branch || 'Detached'}</span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-slate-500" title={state.root}>
              {state.upstream || 'No upstream'} · {state.clean ? 'Clean' : `${state.changedCount} changed`}
            </p>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Refresh Git state">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-slate-500">
          <span>{state.ahead || 0} ahead</span>
          <span>{state.behind || 0} behind</span>
          <span>{state.stashCount || 0} stash</span>
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            coding ready
          </span>
        </div>
      </div>

      {actionError && !action && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="rounded-md p-0.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className="shrink-0 border-b border-gray-200 px-3 py-3 dark:border-slate-800 midnight:border-slate-800">
        <textarea
          value={commitMessage}
          onChange={event => setCommitMessage(event.target.value)}
          rows={2}
          placeholder={`Message${state.branch ? ` for ${state.branch}` : ''}`}
          className="w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:bg-white dark:border-slate-800 dark:bg-[#0b1220] dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-slate-700 dark:focus:bg-[#0b1220]"
        />
        <div className="mt-2 flex items-center gap-1.5">
          <div className="relative flex flex-1">
            <button
              type="button"
              onClick={() => openAction('commit', { files: [], message: commitMessage })}
              disabled={!stagedFiles.length || !hasCommitMessage}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-l-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <GitCommitHorizontal className="h-4 w-4" />
              Commit
            </button>
            <button
              type="button"
              onClick={() => setCommitMenuOpen(open => !open)}
              disabled={commitMenuItems.every(item => item.disabled)}
              aria-expanded={commitMenuOpen}
              className="inline-flex w-9 items-center justify-center rounded-r-md border-l border-white/20 bg-gray-900 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-300/30 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
              title="More commit actions"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            {commitMenuOpen && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
                {commitMenuItems.map(item => (
                  <button
                    key={item.action}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => openAction(item.action, { files: [], message: commitMessage })}
                    className="flex w-full items-center px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton title="Stage all changes" onClick={() => openAction('stage', { files: [] })} disabled={!workingFiles.length}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton title="Unstage all" onClick={() => openAction('unstage', { files: [] })} disabled={!stagedFiles.length}>
            <Upload className="h-4 w-4 rotate-180" />
          </IconButton>
          <IconButton title="Pull" onClick={() => openAction('pull')}>
            <GitPullRequestArrow className="h-4 w-4" />
          </IconButton>
          <IconButton title="Push" onClick={() => openAction('push')}>
            <GitPullRequestDraft className="h-4 w-4" />
          </IconButton>
          <IconButton title="Stash" onClick={() => openAction('stash-save')} disabled={!files.length}>
            <Save className="h-4 w-4" />
          </IconButton>
          <IconButton title="Create branch" onClick={() => openAction('branch-create')}>
            <GitBranch className="h-4 w-4" />
          </IconButton>
          <IconButton title="Switch branch" onClick={() => openAction('branch-switch')}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-2 dark:border-slate-800 midnight:border-slate-800 shrink-0">
        <button
          onClick={() => setActiveTab('working')}
          className={`flex-1 border-b-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${activeTab === 'working' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300'}`}
        >
          Working Tree
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 border-b-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${activeTab === 'history' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300'}`}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab('stashes')}
          className={`flex-1 border-b-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${activeTab === 'stashes' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300'}`}
        >
          Stashes
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {activeTab === 'working' && (
          <>
            {files.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">Working tree clean.</div>
            )}
            
            {files.length > 0 && (
              <div className="space-y-3 mb-4">
                {stagedFiles.length > 0 && (
                  <section>
                    <button
                      type="button"
                      onClick={() => setStagedExpanded(v => !v)}
                      className="mb-1 flex w-full items-center gap-2 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300"
                    >
                      {stagedExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Staged
                      <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">{stagedFiles.length}</span>
                    </button>
                    {stagedExpanded && (
                      <div className="space-y-px">
                        {stagedFiles.map(file => (
                          <ChangeRow
                            key={`staged-${file.code}-${file.path}-${file.oldPath || ''}`}
                            file={file}
                            onAttach={attachFile}
                            onAction={(item) => openAction(item.staged && !item.unstaged ? 'unstage' : 'stage', { files: [item.path] })}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {workingFiles.length > 0 && (
                  <section>
                    <button
                      type="button"
                      onClick={() => setChangesExpanded(v => !v)}
                      className="mb-1 flex w-full items-center gap-2 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300"
                    >
                      {changesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Changes
                      <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">{workingFiles.length}</span>
                    </button>
                    {changesExpanded && (
                      <div className="space-y-px">
                        {workingFiles.map(file => (
                          <ChangeRow
                            key={`working-${file.code}-${file.path}-${file.oldPath || ''}`}
                            file={file}
                            onAttach={attachFile}
                            onAction={(item) => openAction(item.staged && !item.unstaged ? 'unstage' : 'stage', { files: [item.path] })}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}
        
        {activeTab === 'history' && (
          <div className="h-full flex flex-col pt-1">
             <GitGraph />
          </div>
        )}
        
        {activeTab === 'stashes' && (
          <div className="h-full flex flex-col pt-1">
             <StashManager onRefresh={onRefresh} />
          </div>
        )}
      </div>

      <ConfirmModal
        action={action}
        payload={payload}
        busy={busy}
        error={actionError}
        onClose={closeAction}
        onConfirm={runConfirmedAction}
        onPayloadChange={setPayload}
      />
    </div>
  );
}
