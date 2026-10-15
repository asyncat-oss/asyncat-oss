// Words for the Git views: a changed file's status letter, the confirm
// button for an action, a commit's ref chips and a diff's subtitle. Pure, so
// they are tested (gitLabels.test.js); the components pick the colours.

/**
 * The letter beside a changed file, its tooltip, and its tone: `added`,
 * `deleted` and `modified` take the status colours, `renamed` stays neutral.
 */
export function statusMeta(file = {}) {
  if (file.untracked) return { label: 'U', title: 'Untracked', tone: 'added' };
  if (file.renamed) return { label: 'R', title: 'Renamed', tone: 'renamed' };
  if (file.deleted) return { label: 'D', title: 'Deleted', tone: 'deleted' };
  if (file.staged && !file.unstaged) return { label: 'S', title: 'Staged', tone: 'added' };
  return { label: 'M', title: 'Modified', tone: 'modified' };
}

const CONFIRM_LABELS = {
  stage: 'Stage',
  unstage: 'Unstage',
  discard: 'Discard',
  commit: 'Commit',
  'commit-push': 'Commit and push',
  'commit-sync': 'Commit and sync',
  amend: 'Amend',
  'amend-push': 'Amend and push',
  'stage-commit': 'Commit',
  'stage-commit-push': 'Commit and push',
  'stage-commit-sync': 'Commit and sync',
  sync: 'Sync',
  pull: 'Pull',
  push: 'Push',
  'stash-save': 'Stash',
  'stash-pop': 'Pop',
  'branch-create': 'Create',
  'branch-switch': 'Switch',
};

/** The confirm dialog's button: the action's own verb. */
export function confirmLabel(action) {
  return CONFIRM_LABELS[action] || 'Confirm';
}

/**
 * A ref from `git log --decorate` as a chip: its name without "HEAD -> ",
 * "tag: ", "origin/" or "refs/" (the stash shows as "stash"), and its kind.
 * The checked-out branch is `current`.
 */
export function refChip(ref = '') {
  const text = String(ref);
  const kind = text.startsWith('HEAD -> ') ? 'current' : text.startsWith('tag: ') ? 'tag' : 'branch';
  const label = text.replace('HEAD -> ', '').replace('origin/', '').replace('tag: ', '').replace(/^refs\//, '');
  return { label, kind };
}

/**
 * A commit row's refs: the one chip it shows (the checked-out branch first)
 * and the rest, for a "+N" chip. Names that read the same once shortened
 * ("main" and "origin/main") count once.
 */
export function rowRefs(refs = []) {
  const chips = [];
  for (const ref of refs || []) {
    const chip = refChip(ref);
    if (!chip.label) continue;
    const same = chips.findIndex((seen) => seen.label === chip.label);
    if (same === -1) chips.push(chip);
    else if (chip.kind === 'current') chips[same] = chip;
  }
  const current = chips.findIndex((chip) => chip.kind === 'current');
  if (current > 0) chips.unshift(...chips.splice(current, 1));
  return { shown: chips[0] || null, rest: chips.slice(1) };
}

/** The diff dialog's subtitle: the file's folder, then which changes these are. */
export function diffDescription(filePath = '', { staged = false, compare = null } = {}) {
  const where = compare ? `In commit ${String(compare).slice(0, 7)}` : staged ? 'Staged changes' : 'Changes not staged yet';
  const parts = String(filePath || '').split('/');
  parts.pop();
  return parts.length ? `${parts.join('/')} · ${where}` : where;
}
