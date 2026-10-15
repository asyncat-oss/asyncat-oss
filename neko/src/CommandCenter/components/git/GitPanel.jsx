// Code panel → Git: the branch, a commit box, and the working tree, history
// and stashes. Staging runs at once; everything else asks first.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDown, ArrowDownUp, ArrowUp, ChevronDown, ChevronRight, File, GitBranch, GitCommitHorizontal, Loader2,
  Minus, Paperclip, PenLine, Plus, RefreshCw, Trash2, X,
} from 'lucide-react';
import { gitApi } from '../../api';
import { basename } from '../../../files/fileUtils.js';
import Dialog from '../../../components/ui/Dialog.jsx';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import Checkbox from '../../../components/ui/Checkbox.jsx';
import Notice from '../../../components/ui/Notice.jsx';
import { Menu, MenuItem } from '../../../components/ui/Menu.jsx';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import { CONTROL_CLASS, Input } from '../../../components/ui/Field.jsx';
import GitGraph from './GitGraph';
import StashManager from './StashManager';
import BranchManager from './BranchManager';
import DiffModal from './DiffModal';
import { confirmLabel, statusMeta } from './gitLabels.js';

const COMMIT_ACTIONS = new Set([
  'commit',
  'commit-push',
  'commit-sync',
  'amend',
  'amend-push',
  'stage-commit',
  'stage-commit-push',
  'stage-commit-sync',
]);

const REQUIRED_MESSAGE_ACTIONS = new Set([
  'commit',
  'commit-push',
  'commit-sync',
  'stage-commit',
  'stage-commit-push',
  'stage-commit-sync',
  'stash-save',
]);

const COMMIT_MESSAGE_MIN_HEIGHT = 40;
const COMMIT_MESSAGE_MAX_HEIGHT = 176;

function resizeCommitMessageTextarea(element) {
  if (!element) return;
  element.style.height = `${COMMIT_MESSAGE_MIN_HEIGHT}px`;
  const nextHeight = Math.min(
    Math.max(element.scrollHeight, COMMIT_MESSAGE_MIN_HEIGHT),
    COMMIT_MESSAGE_MAX_HEIGHT,
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = element.scrollHeight > COMMIT_MESSAGE_MAX_HEIGHT ? 'auto' : 'hidden';
}

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

// The status letter's colour: status hues only, renames stay neutral.
const STATUS_TEXT = {
  added: 'text-emerald-600 dark:text-emerald-400',
  deleted: 'text-red-600 dark:text-red-400',
  modified: 'text-amber-600 dark:text-amber-400',
  renamed: 'text-fg-muted',
};

function canDiscard(file = {}) {
  return !file.staged && !file.untracked && (file.unstaged || file.deleted);
}

function normalizeGeneratedCommitMessage(value = '') {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '\n')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '\n')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '\n')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/<analysis>[\s\S]*$/i, '')
    .replace(/<reasoning>[\s\S]*$/i, '')
    .trim();
}

function commandForAction(action, payload = {}) {
  switch (action) {
    case 'stage': return payload.files?.length ? `git add -- ${payload.files.join(' ')}` : 'git add -A';
    case 'unstage': return payload.files?.length ? `git restore --staged -- ${payload.files.join(' ')}` : 'git restore --staged .';
    case 'discard': return payload.files?.length ? `git checkout -- ${payload.files.join(' ')}` : 'git checkout -- .';
    case 'commit': return 'git commit -m <message>';
    case 'commit-push': return 'git commit -m <message> && git push origin';
    case 'commit-sync': return 'git commit -m <message> && git pull && git push origin';
    case 'amend': return payload.message?.trim() ? 'git commit --amend -m <message>' : 'git commit --amend --no-edit';
    case 'amend-push': return `${payload.message?.trim() ? 'git commit --amend -m <message>' : 'git commit --amend --no-edit'} && git push origin`;
    case 'stage-commit': return 'git add -A && git commit -m <message>';
    case 'stage-commit-push': return 'git add -A && git commit -m <message> && git push origin';
    case 'stage-commit-sync': return 'git add -A && git commit -m <message> && git pull && git push origin';
    case 'sync': return 'git pull && git push origin';
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
  if (action === 'stage-commit-sync') return 'This stages every change, commits, pulls remote changes, then pushes. Pull may merge or conflict.';
  if (action === 'sync') return 'Sync pulls remote commits, then pushes local commits to the configured remote.';
  if (action === 'stash-pop') return 'Stash pop reapplies saved changes and may create conflicts.';
  if (action?.startsWith('branch')) return 'Branch operations change the active repository context.';
  if (action === 'commit') return 'Commit records staged changes in local history.';
  if (action === 'discard') return 'This permanently discards the selected unstaged changes. This cannot be undone.';
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
    discard: 'Discard changes?',
    commit: 'Create commit?',
    'commit-push': 'Commit and push?',
    'commit-sync': 'Commit and sync?',
    amend: 'Amend latest commit?',
    'amend-push': 'Amend and push?',
    'stage-commit': 'Stage all and commit?',
    'stage-commit-push': 'Stage all, commit, and push?',
    'stage-commit-sync': 'Stage all, commit, and sync?',
    sync: 'Sync changes?',
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
    <Dialog
      open
      size="sm"
      title={title}
      description={actionCopy(action)}
      // While it runs, Escape and the backdrop don't cancel. No close
      // button, so focus starts in the message field (or on Cancel).
      onClose={busy ? undefined : onClose}
      closeButton={false}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={action === 'discard' ? 'destructive' : 'primary'} onClick={onConfirm} disabled={disabled} loading={busy}>
            {busy ? 'Working…' : confirmLabel(action)}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <code className="block break-all rounded-lg bg-hover px-3 py-2 font-mono text-[12px] leading-5 text-fg-muted">
          {commandForAction(action, payload)}
        </code>
        {(needsMessage || optionalMessage) && (
          <textarea
            value={payload.message || ''}
            onChange={event => onPayloadChange({ ...payload, message: event.target.value })}
            rows={3}
            aria-label={action === 'stash-save' ? 'Stash message' : 'Commit message'}
            placeholder={action === 'stash-save' ? 'Stash message' : optionalMessage ? 'New commit message, or leave empty to keep current' : 'Commit message'}
            className={`${CONTROL_CLASS} resize-none py-2 leading-5`}
          />
        )}
        {needsBranch && (
          <Input
            value={payload.name || ''}
            onChange={event => onPayloadChange({ ...payload, name: event.target.value })}
            placeholder="branch-name"
            aria-label="Branch name"
            spellCheck={false}
            className="font-mono"
          />
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function ChangeRow({ file, checked, onToggleCheck, onSelect, onAction, onAttach, onDiscard }) {
  const { name, dir } = splitPath(file.path || '');
  const meta = statusMeta(file);
  const staged = file.staged && !file.unstaged;
  return (
    <div className="group flex items-center gap-2 rounded-lg py-0.5 pl-2 pr-1.5 transition-colors hover:bg-hover">
      <Checkbox checked={checked} onChange={() => onToggleCheck()} aria-label={checked ? `Deselect ${name}` : `Select ${name}`} />
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        title={`Show the changes in ${file.path}`}
      >
        <File className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg" title={file.path}>
          {name}
          {dir && <span className="ml-1.5 text-[12px] text-fg-subtle">{compactPath(dir)}</span>}
        </span>
      </button>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <IconButton size="sm" icon={Paperclip} label="Attach to the message" onClick={() => onAttach(file)} />
        {onDiscard && (
          <IconButton size="sm" icon={Trash2} label="Discard changes" onClick={() => onDiscard(file)} className="hover:!text-red-600 dark:hover:!text-red-400" />
        )}
        <IconButton size="sm" icon={staged ? Minus : Plus} label={staged ? 'Unstage' : 'Stage'} onClick={() => onAction(file)} />
      </div>
      <span className={`w-4 shrink-0 text-center font-mono text-[11px] font-semibold ${STATUS_TEXT[meta.tone]}`} title={meta.title}>
        {meta.label}
      </span>
    </div>
  );
}

function SectionHeader({ label, count, expanded, onToggle, allChecked, onCheckAll, checkAllLabel, action }) {
  return (
    <div className="mb-0.5 flex items-center gap-2 pl-1 pr-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-[12px] font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" /> : <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />}
        {label}
        <span className="font-normal tabular-nums text-fg-subtle">{count}</span>
      </button>
      <Checkbox checked={allChecked} onChange={onCheckAll} aria-label={checkAllLabel} />
      {action}
    </div>
  );
}

function SelectionBar({ count, children, onClear }) {
  return (
    <div className="mx-1 mb-1 flex items-center gap-1 rounded-lg bg-hover py-0.5 pl-2.5 pr-1">
      <span className="text-[12px] tabular-nums text-fg-muted">{count} selected</span>
      <div className="ml-auto flex items-center gap-0.5">
        {children}
        <Button variant="ghost" size="xs" onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}

export default function GitPanel({ state, loading, error, onRefresh, onChanged, onAttachFile, workingDir = null }) {
  const [action, setAction] = useState(null);
  const [payload, setPayload] = useState({});
  const [commitMessage, setCommitMessage] = useState('');
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [generatingCommitMessage, setGeneratingCommitMessage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('working');
  const [diffFile, setDiffFile] = useState(null);
  const [checkedStaged, setCheckedStaged] = useState(new Set());
  const [checkedChanges, setCheckedChanges] = useState(new Set());
  const commitMessageTextareaRef = useRef(null);
  const commitMenuRef = useRef(null);
  const files = useMemo(() => state?.changes?.all || [], [state?.changes?.all]);
  const stagedFiles = useMemo(() => state?.changes?.staged || [], [state?.changes?.staged]);
  const workingFiles = useMemo(() => files.filter(file => !file.staged || file.unstaged), [files]);
  const hasCommitMessage = commitMessage.trim().length > 0;
  const canGenerateCommitMessage = files.length > 0 && !generatingCommitMessage && !busy;
  const aheadCount = state?.ahead || 0;
  const behindCount = state?.behind || 0;
  const syncNeeded = aheadCount > 0 || behindCount > 0;
  const syncTitle = !state?.upstream
    ? 'No upstream configured'
    : syncNeeded
      ? `Sync changes (${aheadCount} ahead, ${behindCount} behind)`
      : 'Sync changes';
  const mainCommitAction = stagedFiles.length > 0 ? 'commit' : 'stage-commit';
  const canMainCommit = hasCommitMessage && (stagedFiles.length > 0 || files.length > 0);
  const commitMenuItems = useMemo(() => {
    const hasStagedFiles = stagedFiles.length > 0;
    const canCommit = (hasStagedFiles || files.length > 0) && hasCommitMessage;
    const canAmend = stagedFiles.length > 0 || hasCommitMessage;
    const canStageCommit = files.length > 0 && hasCommitMessage;
    return [
      { action: hasStagedFiles ? 'commit' : 'stage-commit', label: 'Commit', disabled: !canCommit },
      { action: hasStagedFiles ? 'commit-push' : 'stage-commit-push', label: 'Commit and push', disabled: !canCommit },
      { action: hasStagedFiles ? 'commit-sync' : 'stage-commit-sync', label: 'Commit and sync', disabled: !canCommit },
      { action: 'amend', label: 'Commit (amend)', disabled: !canAmend },
      { action: 'amend-push', label: 'Amend and push', disabled: !canAmend },
      { action: 'stage-commit', label: 'Stage all and commit', disabled: !canStageCommit },
      { action: 'stage-commit-push', label: 'Stage all, commit, and push', disabled: !canStageCommit },
      { action: 'stage-commit-sync', label: 'Stage all, commit, and sync', disabled: !canStageCommit },
    ];
  }, [files.length, hasCommitMessage, stagedFiles.length]);

  useEffect(() => {
    resizeCommitMessageTextarea(commitMessageTextareaRef.current);
  }, [commitMessage]);

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
      if (targetAction === 'stage') res = await gitApi.stage(targetPayload.files || [], workingDir);
      if (targetAction === 'unstage') res = await gitApi.unstage(targetPayload.files || [], workingDir);
      if (targetAction === 'discard') res = await gitApi.discard(targetPayload.files || [], workingDir);
      if (targetAction === 'commit') res = await gitApi.commit({ message: targetPayload.message, files: targetPayload.files || [], path: workingDir });
      if (targetAction === 'commit-push') {
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message, files: targetPayload.files || [], path: workingDir }), 'Commit');
        res = await gitApi.push({ path: workingDir });
      }
      if (targetAction === 'commit-sync') {
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message, files: targetPayload.files || [], path: workingDir }), 'Commit');
        res = assertSuccess(await gitApi.pull({ path: workingDir }), 'Pull');
        res = await gitApi.push({ path: workingDir });
      }
      if (targetAction === 'amend') {
        res = await gitApi.commit({ message: targetPayload.message || '', files: targetPayload.files || [], amend: true, path: workingDir });
      }
      if (targetAction === 'amend-push') {
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message || '', files: targetPayload.files || [], amend: true, path: workingDir }), 'Amend');
        res = await gitApi.push({ path: workingDir });
      }
      if (targetAction === 'stage-commit') {
        res = assertSuccess(await gitApi.stage([], workingDir), 'Stage all');
        res = await gitApi.commit({ message: targetPayload.message, files: [], path: workingDir });
      }
      if (targetAction === 'stage-commit-push') {
        res = assertSuccess(await gitApi.stage([], workingDir), 'Stage all');
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message, files: [], path: workingDir }), 'Commit');
        res = await gitApi.push({ path: workingDir });
      }
      if (targetAction === 'stage-commit-sync') {
        res = assertSuccess(await gitApi.stage([], workingDir), 'Stage all');
        res = assertSuccess(await gitApi.commit({ message: targetPayload.message, files: [], path: workingDir }), 'Commit');
        res = assertSuccess(await gitApi.pull({ path: workingDir }), 'Pull');
        res = await gitApi.push({ path: workingDir });
      }
      if (targetAction === 'sync') {
        res = assertSuccess(await gitApi.pull({ path: workingDir }), 'Pull');
        res = await gitApi.push({ path: workingDir });
      }
      if (targetAction === 'pull') res = await gitApi.pull({ path: workingDir });
      if (targetAction === 'push') res = await gitApi.push({ path: workingDir });
      if (targetAction === 'stash-save') res = await gitApi.stash({ action: 'save', message: targetPayload.message || 'Asyncat visual stash', path: workingDir });
      if (targetAction === 'stash-pop') res = await gitApi.stash({ action: 'pop', path: workingDir });
      if (targetAction === 'branch-create') res = await gitApi.branch({ action: 'create', name: targetPayload.name, path: workingDir });
      if (targetAction === 'branch-switch') res = await gitApi.branch({ action: 'switch', name: targetPayload.name, path: workingDir });
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
  }, [onChanged, workingDir]);

  const openAction = useCallback((nextAction, nextPayload = {}) => {
    setCommitMenuOpen(false);
    // Staging is reversible, so it runs straight away. Discard is not: it
    // goes through the confirm dialog like every other destructive action.
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

  const generateCommitMessage = useCallback(async () => {
    if (!files.length) return;
    setGeneratingCommitMessage(true);
    setActionError(null);
    try {
      const result = await gitApi.generateCommitMessage({ scope: 'auto', path: workingDir });
      if (!result?.success || !result?.message) {
        throw new Error(result?.error || 'Could not generate a commit message');
      }
      const message = normalizeGeneratedCommitMessage(result.message);
      if (!message || /<\/?(think|analysis|reasoning)>/i.test(message)) {
        throw new Error('The AI provider returned reasoning instead of a commit message');
      }
      setCommitMessage(message);
    } catch (err) {
      setActionError(err.message || 'Could not generate a commit message');
    } finally {
      setGeneratingCommitMessage(false);
    }
  }, [files.length, workingDir]);

  const handleCommitMessageChange = useCallback((event) => {
    setCommitMessage(event.target.value);
    resizeCommitMessageTextarea(event.target);
  }, []);

  const attachFile = useCallback((file) => {
    const name = basename(file.path || '');
    const ext = name.includes('.') ? name.split('.').pop() : '';
    onAttachFile?.({ path: file.path, name, ext });
  }, [onAttachFile]);

  // Selection helpers
  const toggleStagedCheck = useCallback((path) => {
    setCheckedStaged(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleChangesCheck = useCallback((path) => {
    setCheckedChanges(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAllStaged = useCallback(() => {
    if (checkedStaged.size === stagedFiles.length) setCheckedStaged(new Set());
    else setCheckedStaged(new Set(stagedFiles.map(f => f.path)));
  }, [checkedStaged.size, stagedFiles]);

  const selectAllChanges = useCallback(() => {
    if (checkedChanges.size === workingFiles.length) setCheckedChanges(new Set());
    else setCheckedChanges(new Set(workingFiles.map(f => f.path)));
  }, [checkedChanges.size, workingFiles]);

  const clearSelections = useCallback(() => {
    setCheckedStaged(new Set());
    setCheckedChanges(new Set());
  }, []);

  // Reset diff/selections when tab changes or state refreshes
  useEffect(() => {
    setDiffFile(null);
    clearSelections();
  }, [activeTab, state, clearSelections]);

  if (loading && !state) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-subtle">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (error) {
    return <Notice tone="error" className="m-3">{error}</Notice>;
  }

  if (!state?.detected) {
    return (
      <p className="p-4 text-[13px] text-fg-muted">
        No Git repository in this folder.
      </p>
    );
  }

  const hasStagedChecked = checkedStaged.size > 0;
  const hasChangesChecked = checkedChanges.size > 0;
  const stashCount = state.stashCount || 0;

  return (
    <div className="flex h-full min-h-0 flex-col text-fg">
      <div className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
              <span className="truncate text-[14px] font-semibold text-fg">{state.branch || 'Detached'}</span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-fg-subtle" title={state.root}>
              {state.upstream || 'No upstream'} · {state.clean ? 'Clean' : `${state.changedCount} changed`}
            </p>
          </div>
          <IconButton size="sm" icon={RefreshCw} label="Refresh Git state" onClick={onRefresh} loading={loading} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
          <span className={syncNeeded ? 'inline-flex items-center gap-1.5 text-fg-muted' : ''}>
            {syncNeeded && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
            {aheadCount} ahead · {behindCount} behind
          </span>
          <span>{stashCount} {stashCount === 1 ? 'stash' : 'stashes'}</span>
        </div>
      </div>

      {actionError && !action && (
        <div className="shrink-0 px-3 pt-3">
          <Notice tone="error" action={<IconButton size="sm" icon={X} label="Dismiss" onClick={() => setActionError(null)} className="-my-1 !text-current hover:!bg-red-500/10" />}>
            {actionError}
          </Notice>
        </div>
      )}

      <div className="shrink-0 border-b border-line px-3 py-3">
        <div className="relative">
          <textarea
            ref={commitMessageTextareaRef}
            value={commitMessage}
            onChange={handleCommitMessageChange}
            rows={1}
            aria-label="Commit message"
            placeholder={`Message${state.branch ? ` for ${state.branch}` : ''}`}
            className={`${CONTROL_CLASS} resize-none py-2 pr-10 leading-5`}
          />
          <div className="absolute right-1.5 top-1.5">
            <IconButton
              size="sm"
              icon={PenLine}
              loading={generatingCommitMessage}
              onClick={generateCommitMessage}
              disabled={!canGenerateCommitMessage}
              label={stagedFiles.length ? 'Write a message from the staged changes' : 'Write a message from the changes'}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-0.5">
          <div className="mr-1 flex min-w-0 flex-1">
            <Button
              variant="primary"
              icon={GitCommitHorizontal}
              onClick={() => openAction(mainCommitAction, { files: [], message: commitMessage })}
              disabled={!canMainCommit}
              title={stagedFiles.length ? 'Commit staged changes' : 'Stage all changes and commit'}
              className="min-w-0 flex-1 !rounded-r-none"
            >
              Commit
            </Button>
            <Button
              ref={commitMenuRef}
              variant="primary"
              size="icon"
              icon={ChevronDown}
              onClick={() => setCommitMenuOpen(open => !open)}
              disabled={commitMenuItems.every(item => item.disabled)}
              aria-expanded={commitMenuOpen}
              aria-haspopup="menu"
              aria-label="More commit actions"
              title="More commit actions"
              className="!rounded-l-none border-l border-canvas/20"
            />
            <Menu anchorRef={commitMenuRef} open={commitMenuOpen} onClose={() => setCommitMenuOpen(false)} placement="bottom-end" width={232} label="Commit actions">
              {commitMenuItems.map(item => (
                <MenuItem
                  key={`${item.action}-${item.label}`}
                  label={item.label}
                  disabled={item.disabled}
                  onSelect={() => openAction(item.action, { files: [], message: commitMessage })}
                />
              ))}
            </Menu>
          </div>
          <IconButton size="sm" icon={ArrowDownUp} label={syncTitle} onClick={() => openAction('sync')} disabled={!state.upstream} />
          <IconButton size="sm" icon={ArrowDown} label="Pull" onClick={() => openAction('pull')} />
          <IconButton size="sm" icon={ArrowUp} label="Push" onClick={() => openAction('push')} />
          <IconButton size="sm" icon={Archive} label="Stash" onClick={() => openAction('stash-save')} disabled={!files.length} />
          <BranchManager currentBranch={state.branch} onSwitch={() => onChanged?.()} workingDir={workingDir} />
        </div>
      </div>

      <div className="shrink-0 border-b border-line px-2">
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          label="Git views"
          items={[
            { value: 'working', label: 'Working tree', meta: files.length ? String(files.length) : null },
            { value: 'history', label: 'History' },
            { value: 'stashes', label: 'Stashes', meta: stashCount ? String(stashCount) : null },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'working' && (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
              {files.length === 0 && (
                <p className="py-8 text-center text-[13px] text-fg-subtle">Working tree clean.</p>
              )}

              {files.length > 0 && (
                <div className="mb-4 space-y-3">
                  {stagedFiles.length > 0 && (
                    <section>
                      <SectionHeader
                        label="Staged"
                        count={stagedFiles.length}
                        expanded={stagedExpanded}
                        onToggle={() => setStagedExpanded(v => !v)}
                        allChecked={checkedStaged.size === stagedFiles.length}
                        onCheckAll={selectAllStaged}
                        checkAllLabel={checkedStaged.size === stagedFiles.length ? 'Deselect all staged' : 'Select all staged'}
                        action={<IconButton size="sm" icon={Minus} label="Unstage all" onClick={() => openAction('unstage', { files: [] })} disabled={!stagedFiles.length} />}
                      />
                      {hasStagedChecked && (
                        <SelectionBar count={checkedStaged.size} onClear={() => setCheckedStaged(new Set())}>
                          <Button variant="ghost" size="xs" onClick={() => { openAction('unstage', { files: Array.from(checkedStaged) }); setCheckedStaged(new Set()); }}>
                            Unstage
                          </Button>
                        </SelectionBar>
                      )}
                      {stagedExpanded && (
                        <div className="space-y-px">
                          {stagedFiles.map(file => (
                            <ChangeRow
                              key={`staged-${file.code}-${file.path}-${file.oldPath || ''}`}
                              file={file}
                              workingDir={workingDir}
                              checked={checkedStaged.has(file.path)}
                              onToggleCheck={() => toggleStagedCheck(file.path)}
                              onSelect={() => setDiffFile({ file, staged: true })}
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
                      <SectionHeader
                        label="Changes"
                        count={workingFiles.length}
                        expanded={changesExpanded}
                        onToggle={() => setChangesExpanded(v => !v)}
                        allChecked={checkedChanges.size === workingFiles.length}
                        onCheckAll={selectAllChanges}
                        checkAllLabel={checkedChanges.size === workingFiles.length ? 'Deselect all changes' : 'Select all changes'}
                        action={<IconButton size="sm" icon={Plus} label="Stage all changes" onClick={() => openAction('stage', { files: [] })} disabled={!workingFiles.length} />}
                      />
                      {hasChangesChecked && (
                        <SelectionBar count={checkedChanges.size} onClear={() => setCheckedChanges(new Set())}>
                          <Button variant="ghost" size="xs" onClick={() => { openAction('stage', { files: Array.from(checkedChanges) }); setCheckedChanges(new Set()); }}>
                            Stage
                          </Button>
                          <Button variant="danger" size="xs" onClick={() => { openAction('discard', { files: Array.from(checkedChanges) }); setCheckedChanges(new Set()); }}>
                            Discard
                          </Button>
                        </SelectionBar>
                      )}
                      {changesExpanded && (
                        <div className="space-y-px">
                          {workingFiles.map(file => (
                            <ChangeRow
                              key={`working-${file.code}-${file.path}-${file.oldPath || ''}`}
                              file={file}
                              workingDir={workingDir}
                              checked={checkedChanges.has(file.path)}
                              onToggleCheck={() => toggleChangesCheck(file.path)}
                              onSelect={() => setDiffFile({ file, staged: false })}
                              onAttach={attachFile}
                              onAction={(item) => openAction(item.staged && !item.unstaged ? 'unstage' : 'stage', { files: [item.path] })}
                              onDiscard={canDiscard(file) ? ((item) => openAction('discard', { files: [item.path] })) : null}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex h-full flex-col overflow-y-auto pt-2">
            <GitGraph workingDir={workingDir} />
          </div>
        )}

        {activeTab === 'stashes' && (
          <div className="flex h-full flex-col pt-1">
            <StashManager onRefresh={onRefresh} workingDir={workingDir} />
          </div>
        )}
      </div>

      {diffFile && (
        <DiffModal
          file={diffFile.file}
          staged={diffFile.staged}
          workingDir={workingDir}
          onClose={() => setDiffFile(null)}
        />
      )}

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
